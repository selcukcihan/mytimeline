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
	if (!env.BROWSER) {
		throw new Error('BROWSER binding is not configured.');
	}

	const timelineUrl = env.TIMELINE_URL || DEFAULT_TIMELINE_URL;
	const targetTweets = parsePositiveInt(env.TARGET_TWEET_COUNT, 70);
	const scrollPasses = parsePositiveInt(env.SCROLL_PASSES, 7);
	const rawCookies = env.X_SESSION_COOKIES ?? process.env.X_SESSION_COOKIES;
	const cookieList = parseCookieList(rawCookies);

	const browser = await puppeteer.launch(env.BROWSER);
	try {
		const page = await browser.newPage();

		if (cookieList.length > 0) {
			await page.setCookie(...cookieList);
		}

		try {
			await page.goto(timelineUrl, { waitUntil: 'networkidle2' });
			await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30_000 });
		} catch (error) {
			const diagnostics = await collectDiagnostics(page, rawCookies, cookieList);
			throw new ScrapeTimelineError(
				`Failed to load timeline tweets: ${error instanceof Error ? error.message : String(error)}`,
				diagnostics,
			);
		}

		const byId = new Map<string, Tweet>();
		for (let i = 0; i < scrollPasses; i += 1) {
			const batch = await extractTweetsFromPage(page);
			for (const tweet of batch) {
				byId.set(tweet.id, tweet);
			}
			if (byId.size >= targetTweets) {
				break;
			}

			await page.evaluate(() => {
				window.scrollBy(0, document.body.scrollHeight * 0.75);
			});
			await sleep(1200);
		}

		return Array.from(byId.values());
	} finally {
		await browser.close();
	}
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
		replies: parseEngagementCount(row.repliesLabel),
		reposts: parseEngagementCount(row.repostsLabel),
		likes: parseEngagementCount(row.likesLabel),
		views: parseEngagementCount(row.viewsLabel),
		score: 0,
	}));
}
