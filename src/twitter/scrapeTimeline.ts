import puppeteer from '@cloudflare/puppeteer';
import { DEFAULT_TIMELINE_URL } from '../constants';
import { parseCookieList, parsePositiveInt } from '../parsers';
import { parseEngagementCount } from '../tweets/scoring';
import type { RuntimeEnv, ScrapeDiagnostics, Tweet } from '../types';
import { sleep } from '../utils/time';

export class ScrapeTimelineError extends Error {
	constructor(
		message: string,
		public readonly diagnostics: ScrapeDiagnostics,
	) {
		super(message);
	}
}

export async function scrapeTimelineWithBrowser(env: RuntimeEnv): Promise<Tweet[]> {
	return scrapeTimelineForDays(env, 1);
}

export async function scrapeTimelineForDays(env: RuntimeEnv, daysBack: number): Promise<Tweet[]> {
	if (!env.BROWSER) {
		throw new Error('BROWSER binding is not configured.');
	}

	const timelineUrl = env.TIMELINE_URL || DEFAULT_TIMELINE_URL;
	const isBackfill = daysBack > 1;
	const targetTweets = isBackfill
		? parsePositiveInt(env.BACKFILL_TARGET_TWEET_COUNT, 700)
		: parsePositiveInt(env.TARGET_TWEET_COUNT, 120);
	const scrollPasses = isBackfill
		? Math.max(parsePositiveInt(env.BACKFILL_SCROLL_PASSES, 140), 20)
		: Math.max(parsePositiveInt(env.SCROLL_PASSES, 20), 8);
	const rawCookies = env.X_SESSION_COOKIES ?? process.env.X_SESSION_COOKIES;
	const cookieList = parseCookieList(rawCookies);
	const cutoffMs = Date.now() - Math.max(daysBack, 1) * 24 * 60 * 60 * 1000;

	const browser = await puppeteer.launch(env.BROWSER);
	try {
		const page = await browser.newPage();

		if (cookieList.length > 0) {
			await page.setCookie(...cookieList);
		}

		try {
			await page.goto(timelineUrl, { waitUntil: 'networkidle2' });
			await forceFollowingTab(page);
			await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30_000 });
		} catch (error) {
			const diagnostics = await collectDiagnostics(page, rawCookies, cookieList);
			throw new ScrapeTimelineError(
				`Failed to load timeline tweets: ${error instanceof Error ? error.message : String(error)}`,
				diagnostics,
			);
		}

		const byId = new Map<string, Tweet>();
		let reachedCutoff = false;
		let noNewTweetPasses = 0;
		for (let i = 0; i < scrollPasses; i += 1) {
			const beforeSize = byId.size;
			const batch = await extractTweetsFromPage(page);
			for (const tweet of batch) {
				byId.set(tweet.id, tweet);
				if (tweet.postedAt) {
					const timestamp = Date.parse(tweet.postedAt);
					if (Number.isFinite(timestamp) && timestamp < cutoffMs) {
						reachedCutoff = true;
					}
				}
			}
			if (byId.size === beforeSize) {
				noNewTweetPasses += 1;
			} else {
				noNewTweetPasses = 0;
			}

			if (byId.size >= targetTweets) {
				break;
			}
			if (reachedCutoff && noNewTweetPasses >= 3) {
				break;
			}

			const beforeMetrics = await getTimelineMetrics(page);
			await page.evaluate(() => {
				window.scrollBy(0, document.body.scrollHeight * 0.75);
			});
			await settleAfterScroll(page, beforeMetrics);
		}

		return Array.from(byId.values()).filter((tweet) => {
			if (!tweet.postedAt) {
				return false;
			}
			const timestamp = Date.parse(tweet.postedAt);
			return Number.isFinite(timestamp) && timestamp >= cutoffMs;
		});
	} finally {
		await browser.close();
	}
}

async function forceFollowingTab(page: puppeteer.Page): Promise<void> {
	await page.evaluate(() => {
		const tabs = Array.from(document.querySelectorAll('[role="tab"], a'));
		for (const tab of tabs) {
			const text = (tab.textContent || '').trim().toLowerCase();
			if (text === 'following') {
				(tab as HTMLElement).click();
				return;
			}
		}
	});
	await sleep(700);
}

interface TimelineMetrics {
	articleCount: number;
	scrollHeight: number;
}

async function getTimelineMetrics(page: puppeteer.Page): Promise<TimelineMetrics> {
	return page.evaluate(() => ({
		articleCount: document.querySelectorAll('article[data-testid="tweet"]').length,
		scrollHeight: document.body?.scrollHeight ?? 0,
	}));
}

async function settleAfterScroll(page: puppeteer.Page, before: TimelineMetrics): Promise<void> {
	let stableChecks = 0;
	let previous: TimelineMetrics = before;

	for (let i = 0; i < 8; i += 1) {
		await sleep(350);
		const current = await getTimelineMetrics(page);
		const changed =
			current.articleCount !== previous.articleCount || current.scrollHeight !== previous.scrollHeight;

		if (changed) {
			stableChecks = 0;
			previous = current;
			continue;
		}

		stableChecks += 1;
		if (stableChecks >= 3) {
			break;
		}
	}

	// Allow tweet internals (counts/media/time nodes) to hydrate after list stabilization.
	await sleep(500);
}

async function collectDiagnostics(
	page: puppeteer.Page,
	rawCookies: string | undefined,
	injectedCookies: Array<Record<string, unknown>>,
): Promise<ScrapeDiagnostics> {
	let pageTitle = '';
	let bodySnippet = '';

	try {
		pageTitle = await page.title();
	} catch {
		pageTitle = '';
	}

	try {
		bodySnippet = await page.evaluate(() => {
			const text = document.body?.innerText ?? '';
			return text.replace(/\s+/g, ' ').slice(0, 2000);
		});
	} catch {
		bodySnippet = '';
	}

	const injectedCookieNames = injectedCookies
		.map((cookie) => (typeof cookie.name === 'string' ? cookie.name : ''))
		.filter(Boolean);

	return {
		currentUrl: page.url(),
		pageTitle,
		bodySnippet,
		rawCookiePresent: Boolean(rawCookies),
		rawCookieLength: rawCookies?.length ?? 0,
		injectedCookieCount: injectedCookieNames.length,
		injectedCookieNames,
	};
}

async function extractTweetsFromPage(page: puppeteer.Page): Promise<Tweet[]> {
	const raw = await page.evaluate(() => {
		const extractMedia = (
			article: Element,
		): Array<{ type: 'photo' | 'video'; url?: string; poster?: string; alt?: string }> => {
			const media: Array<{ type: 'photo' | 'video'; url?: string; poster?: string; alt?: string }> =
				[];

			const images = Array.from(article.querySelectorAll<HTMLImageElement>('img[src]'));
			for (const image of images) {
				const src = image.src || '';
				const alt = image.alt || '';
				const isTweetPhoto = src.includes('pbs.twimg.com/media/');
				const isAvatar = src.includes('profile_images') || alt.toLowerCase().includes('avatar');
				if (isTweetPhoto && !isAvatar) {
					media.push({ type: 'photo', url: src, alt });
				}
			}

			const videos = Array.from(article.querySelectorAll<HTMLVideoElement>('video'));
			for (const video of videos) {
				const poster = video.getAttribute('poster') || '';
				const source = video.querySelector('source')?.getAttribute('src') || undefined;
				if (poster || source) {
					media.push({ type: 'video', poster: poster || undefined, url: source });
				}
			}

			const seen = new Set<string>();
			return media.filter((item) => {
				const key = `${item.type}:${item.url || ''}:${item.poster || ''}`;
				if (seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			});
		};

		const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
		return articles
			.map((article) => {
				const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
				const url = statusLink?.href ?? '';
				const id = url.split('/status/')[1]?.split('?')[0] ?? '';
				const text = article.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText ?? '';
				const userNameText =
					article.querySelector<HTMLElement>('[data-testid="User-Name"]')?.innerText ?? '';
				const handle = userNameText
					.split(/\s+/)
					.find((token) => token.startsWith('@'))
					?.trim() ?? '';
				const postedAt =
					article.querySelector<HTMLTimeElement>('time')?.getAttribute('datetime') ?? null;
				const media = extractMedia(article);

				const getAriaLabel = (testId: string): string => {
					const control = article.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
					const candidate =
						control?.querySelector<HTMLElement>('[aria-label]') ?? control?.closest('[aria-label]');
					return candidate?.getAttribute('aria-label') ?? '';
				};

				return {
					id,
					url,
					text,
					userNameText,
					handle,
					postedAt,
					media,
					repliesLabel: getAriaLabel('reply'),
					repostsLabel: getAriaLabel('retweet'),
					likesLabel: getAriaLabel('like'),
					viewsLabel: getAriaLabel('analytics'),
				};
			})
			.filter((row) => row.id && row.text);
	});

	return raw.map((row) => ({
		id: row.id,
		url: row.url,
		text: row.text,
		author: row.userNameText,
		handle: row.handle,
		postedAt: row.postedAt,
		media: row.media,
		replies: parseEngagementCount(row.repliesLabel),
		reposts: parseEngagementCount(row.repostsLabel),
		likes: parseEngagementCount(row.likesLabel),
		views: parseEngagementCount(row.viewsLabel),
		score: 0,
	}));
}
