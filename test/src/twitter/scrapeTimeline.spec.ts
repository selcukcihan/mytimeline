import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	launch: vi.fn(),
	sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@cloudflare/puppeteer', () => ({
	default: {
		launch: mocks.launch,
	},
}));

vi.mock('../../../src/utils/time', () => ({
	sleep: mocks.sleep,
}));

import { ScrapeTimelineError, scrapeTimelineForDays, scrapeTimelineWithBrowser } from '../../../src/twitter/scrapeTimeline';

describe('scrapeTimelineForDays', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws when BROWSER binding is missing', async () => {
		await expect(scrapeTimelineForDays({} as Env, 1)).rejects.toThrow('BROWSER binding is not configured.');
	});

	it('throws ScrapeTimelineError with diagnostics when timeline does not load', async () => {
		const page = {
			setCookie: vi.fn(),
			goto: vi.fn().mockResolvedValue(undefined),
			waitForSelector: vi.fn().mockRejectedValue(new Error('selector timeout')),
			title: vi.fn().mockResolvedValue('X. It’s what’s happening / X'),
			url: vi.fn().mockReturnValue('https://x.com/?logout=1'),
			evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
				const source = fn.toString();
				if (source.includes('const tabs = Array.from')) {
					return undefined;
				}
				if (source.includes('document.body?.innerText')) {
					return 'Happening now Join today';
				}
				return undefined;
			}),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
		};
		mocks.launch.mockResolvedValue(browser);

		await expect(
			scrapeTimelineForDays(
				{ BROWSER: {}, X_SESSION_COOKIES: JSON.stringify([{ name: 'auth_token', value: 'x' }]) } as Env,
				1,
			),
		).rejects.toBeInstanceOf(ScrapeTimelineError);

		try {
			await scrapeTimelineForDays(
				{ BROWSER: {}, X_SESSION_COOKIES: JSON.stringify([{ name: 'auth_token', value: 'x' }]) } as Env,
				1,
			);
		} catch (error) {
			const scrapeError = error as ScrapeTimelineError;
			expect(scrapeError.diagnostics.currentUrl).toContain('x.com');
			expect(scrapeError.diagnostics.injectedCookieCount).toBe(1);
		}
	});

	it('returns only tweets within cutoff window', async () => {
		const metrics = { articleCount: 2, scrollHeight: 1000 };
		const rawRows = [
			{
				id: 'recent',
				url: 'https://x.com/a/status/recent',
				text: 'recent tweet',
				userNameText: 'Alice @alice',
				handle: '@alice',
				postedAt: '2026-02-24T10:00:00.000Z',
				media: [],
				repliesLabel: '1 reply',
				repostsLabel: '2 reposts',
				likesLabel: '3 likes',
				viewsLabel: '4 views',
			},
			{
				id: 'old',
				url: 'https://x.com/a/status/old',
				text: 'old tweet',
				userNameText: 'Bob @bob',
				handle: '@bob',
				postedAt: '2026-02-20T10:00:00.000Z',
				media: [],
				repliesLabel: '1 reply',
				repostsLabel: '2 reposts',
				likesLabel: '3 likes',
				viewsLabel: '4 views',
			},
		];

		const page = {
			setCookie: vi.fn(),
			goto: vi.fn().mockResolvedValue(undefined),
			waitForSelector: vi.fn().mockResolvedValue(undefined),
			title: vi.fn().mockResolvedValue('X'),
			url: vi.fn().mockReturnValue('https://x.com/home?f=following'),
			evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
				const source = fn.toString();
				if (source.includes('const tabs = Array.from')) {
					return undefined;
				}
				if (source.includes('const extractMedia')) {
					return rawRows;
				}
				if (source.includes('articleCount') && source.includes('scrollHeight')) {
					return metrics;
				}
				if (source.includes('window.scrollBy')) {
					return undefined;
				}
				return undefined;
			}),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
		};
		mocks.launch.mockResolvedValue(browser);

		const tweets = await scrapeTimelineForDays(
			{ BROWSER: {}, TARGET_TWEET_COUNT: '999', SCROLL_PASSES: '1' } as Env,
			1,
		);

		expect(tweets).toHaveLength(1);
		expect(tweets[0]?.id).toBe('recent');
		expect(tweets[0]?.likes).toBe(3);
	});

	it('scrapeTimelineWithBrowser delegates to 1 day scrape', async () => {
		const page = {
			setCookie: vi.fn(),
			goto: vi.fn().mockResolvedValue(undefined),
			waitForSelector: vi.fn().mockResolvedValue(undefined),
			title: vi.fn().mockResolvedValue('X'),
			url: vi.fn().mockReturnValue('https://x.com/home?f=following'),
			evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
				const source = fn.toString();
				if (source.includes('const tabs = Array.from')) return undefined;
				if (source.includes('const extractMedia')) return [];
				if (source.includes('articleCount') && source.includes('scrollHeight')) return { articleCount: 0, scrollHeight: 0 };
				if (source.includes('window.scrollBy')) return undefined;
				return undefined;
			}),
		};
		mocks.launch.mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page), close: vi.fn() });

		const tweets = await scrapeTimelineWithBrowser({ BROWSER: {}, SCROLL_PASSES: '1' } as Env);
		expect(Array.isArray(tweets)).toBe(true);
	});
});
