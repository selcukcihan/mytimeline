import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tweet } from '../../../src/types';

const mocks = vi.hoisted(() => ({
	buildDayDigestWithOpenAI: vi.fn(),
	persistDayIfConfigured: vi.fn(),
	resolveDayFromPostedAt: vi.fn(),
	resolveDigestDay: vi.fn(),
	scoreTweets: vi.fn(),
	scrapeTimelineForDays: vi.fn(),
	parseTopics: vi.fn(),
	parsePositiveInt: vi.fn(),
	ScrapeTimelineError: class extends Error {
		diagnostics: Record<string, unknown>;
		constructor(message: string, diagnostics: Record<string, unknown>) {
			super(message);
			this.diagnostics = diagnostics;
		}
	},
}));

vi.mock('../../../src/ai/openaiDayDigest', () => ({
	buildDayDigestWithOpenAI: mocks.buildDayDigestWithOpenAI,
}));
vi.mock('../../../src/db/persistDigest', () => ({
	persistDayIfConfigured: mocks.persistDayIfConfigured,
	resolveDayFromPostedAt: mocks.resolveDayFromPostedAt,
	resolveDigestDay: mocks.resolveDigestDay,
}));
vi.mock('../../../src/tweets/scoring', () => ({
	scoreTweets: mocks.scoreTweets,
}));
vi.mock('../../../src/twitter/scrapeTimeline', () => ({
	scrapeTimelineForDays: mocks.scrapeTimelineForDays,
	ScrapeTimelineError: mocks.ScrapeTimelineError,
}));
vi.mock('../../../src/parsers', async () => {
	const actual = await vi.importActual('../../../src/parsers');
	return {
		...actual,
		parseTopics: mocks.parseTopics,
		parsePositiveInt: mocks.parsePositiveInt,
	};
});

import { executeBackfill, executeDigest } from '../../../src/digest/executeDigest';

describe('executeBackfill', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));

		mocks.parseTopics.mockReturnValue(['software development']);
		mocks.parsePositiveInt.mockReturnValue(35);
		mocks.scoreTweets.mockImplementation((tweets: Tweet[]) => tweets);
		mocks.resolveDayFromPostedAt.mockImplementation((postedAt: string | null) =>
			postedAt ? postedAt.slice(0, 10) : null,
		);
		mocks.resolveDigestDay.mockImplementation((date: Date) => date.toISOString().slice(0, 10));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws when DIGEST_TOPICS is empty', async () => {
		mocks.parseTopics.mockReturnValue([]);

		await expect(executeBackfill({ DIGEST_TOPICS: '' } as Env, { source: 'manual', dryRun: true }, 3)).rejects.toThrow(
			'DIGEST_TOPICS is empty',
		);
	});

	it('returns failed result with diagnostics for scrape timeline errors', async () => {
		mocks.scrapeTimelineForDays.mockRejectedValue(
			new mocks.ScrapeTimelineError('timeline failed', { currentUrl: 'https://x.com' }),
		);

		const result = await executeBackfill(
			{ DIGEST_TOPICS: 'software development' } as Env,
			{ source: 'manual', dryRun: true },
			2,
		);

		expect(result).toEqual({
			status: 'failed',
			error: 'timeline failed',
			debug: { currentUrl: 'https://x.com' },
		});
	});

	it('returns skipped when scraper captures no tweets', async () => {
		mocks.scrapeTimelineForDays.mockResolvedValue([]);

		const result = await executeBackfill(
			{ DIGEST_TOPICS: 'software development' } as Env,
			{ source: 'manual', dryRun: false },
			2,
		);

		expect(result).toEqual({ status: 'skipped', reason: 'no tweets captured' });
	});

	it('processes days, persists results, and reports aggregated counters', async () => {
		const tweets: Tweet[] = [
			{
				id: 'd24',
				url: 'https://x.com/a/status/1',
				text: 'tweet day 24',
				author: 'A',
				handle: '@a',
				postedAt: '2026-02-24T10:00:00.000Z',
				replies: 1,
				reposts: 1,
				likes: 1,
				views: 1,
				score: 10,
			},
			{
				id: 'd23',
				url: 'https://x.com/b/status/2',
				text: 'tweet day 23',
				author: 'B',
				handle: '@b',
				postedAt: '2026-02-23T10:00:00.000Z',
				replies: 1,
				reposts: 1,
				likes: 1,
				views: 1,
				score: 9,
			},
		];
		mocks.scrapeTimelineForDays.mockResolvedValue(tweets);

		mocks.buildDayDigestWithOpenAI.mockImplementation(async (_env: Env, day: string) => ({
			subject: `Digest ${day}`,
			summary: `Summary ${day}`,
			decisions: [
				{
					tweet_id: day === '2026-02-24' ? 'd24' : 'd23',
					relevant: true,
					why_relevant: 'topic match',
					main_takeaway: 'key point',
					relevance_score: 90,
				},
			],
			article_links: [{ url: 'https://example.com', why_relevant: 'read more' }],
		}));

		const result = await executeBackfill(
			{ DIGEST_TOPICS: 'software development' } as Env,
			{ source: 'manual', dryRun: false },
			2,
		);

		expect(result.status).toBe('sent');
		expect(result.daysProcessed).toBe(2);
		expect(result.totalTweetsFetched).toBe(2);
		expect(mocks.persistDayIfConfigured).toHaveBeenCalledTimes(2);
		expect(mocks.buildDayDigestWithOpenAI).toHaveBeenCalledWith(
			expect.anything(),
			'2026-02-24',
			expect.any(Array),
			expect.arrayContaining(['software development']),
		);
	});

	it('executeDigest delegates to executeBackfill for one day', async () => {
		mocks.scrapeTimelineForDays.mockResolvedValue([]);
		const result = await executeDigest(
			{ DIGEST_TOPICS: 'software development' } as Env,
			{ source: 'manual', dryRun: true },
		);
		expect(result).toEqual({ status: 'skipped', reason: 'no tweets captured' });
		expect(mocks.scrapeTimelineForDays).toHaveBeenCalledWith(expect.anything(), 1);
	});
});
