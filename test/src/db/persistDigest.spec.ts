import { describe, expect, it, vi } from 'vitest';
import { persistDayIfConfigured, resolveDayFromPostedAt, resolveDigestDay } from '../../../src/db/persistDigest';
import type { OpenAIDayDigestResponse, RunOptions, RunResult, Tweet } from '../../../src/types';

interface QueryCall {
	sql: string;
	args: unknown[];
}

function createMockDb(calls: QueryCall[]) {
	return {
		prepare(sql: string) {
			return {
				bind: (...args: unknown[]) => ({
					run: async () => {
						calls.push({ sql, args });
						return { success: true };
					},
				}),
			};
		},
	};
}

function buildTweet(overrides: Partial<Tweet>): Tweet {
	return {
		id: '1',
		url: 'https://x.com/user/status/1',
		text: 'tweet',
		author: 'Author',
		handle: '@author',
		postedAt: '2026-02-24T00:00:00.000Z',
		replies: 1,
		reposts: 1,
		likes: 1,
		views: 1,
		score: 0,
		...overrides,
	};
}

function buildParams(overrides: Partial<{ dayDigest: OpenAIDayDigestResponse; allTweets: Tweet[]; options: RunOptions; runResult: RunResult }>) {
	const allTweets = overrides.allTweets ?? [buildTweet({ id: '1' }), buildTweet({ id: '2' })];
	return {
		day: '2026-02-24',
		options: overrides.options ?? ({ source: 'manual', dryRun: false } as RunOptions),
		runResult: overrides.runResult ?? ({ status: 'sent' } as RunResult),
		dayDigest:
			overrides.dayDigest ??
			({
				subject: 'Digest subject',
				summary: 'Digest summary',
				decisions: [
					{
						tweet_id: '1',
						relevant: true,
						why_relevant: 'topic match',
						main_takeaway: 'key point',
						relevance_score: 91,
					},
				],
				article_links: [{ url: 'https://example.com', why_relevant: 'context' }],
			} as OpenAIDayDigestResponse),
		allTweets,
		model: 'gpt-5-nano',
	};
}

describe('persistDayIfConfigured', () => {
	it('returns without writes when TIMELINE_DB is not configured', async () => {
		await persistDayIfConfigured({} as Env, buildParams({}));
	});

	it('skips writes for dry-run unless PERSIST_DRY_RUN is enabled', async () => {
		const calls: QueryCall[] = [];
		const db = createMockDb(calls);

		await persistDayIfConfigured(
			{ TIMELINE_DB: db, PERSIST_DRY_RUN: '0' } as Env,
			buildParams({ options: { source: 'manual', dryRun: true } as RunOptions }),
		);

		expect(calls).toHaveLength(0);
	});

	it('writes digest, crawled tweets, decisions, highlights, and articles', async () => {
		const calls: QueryCall[] = [];
		const db = createMockDb(calls);

		await persistDayIfConfigured({ TIMELINE_DB: db } as Env, buildParams({}));

		expect(calls.some((call) => call.sql.includes('INSERT INTO daily_digests'))).toBe(true);
		expect(calls.some((call) => call.sql.includes('DELETE FROM daily_highlight_tweets'))).toBe(true);
		expect(calls.filter((call) => call.sql.includes('INSERT INTO daily_crawled_tweets'))).toHaveLength(2);
		expect(calls.filter((call) => call.sql.includes('INSERT INTO daily_tweet_decisions'))).toHaveLength(2);
		expect(calls.filter((call) => call.sql.includes('INSERT INTO daily_highlight_tweets'))).toHaveLength(1);
		expect(calls.filter((call) => call.sql.includes('INSERT INTO daily_articles'))).toHaveLength(1);

		const fallbackDecisionInsert = calls.find(
			(call) => call.sql.includes('INSERT INTO daily_tweet_decisions') && call.args[1] === '2',
		);
		expect(fallbackDecisionInsert).toBeTruthy();
		expect(fallbackDecisionInsert?.args[4]).toBe('No LLM decision returned for this tweet.');
	});
});

describe('date helpers', () => {
	it('resolveDigestDay returns YYYY-MM-DD for configured timezone', () => {
		const day = resolveDigestDay(new Date('2026-02-24T23:30:00.000Z'), 'UTC');
		expect(day).toBe('2026-02-24');
	});

	it('resolveDayFromPostedAt handles null/invalid timestamps', () => {
		expect(resolveDayFromPostedAt(null, 'UTC')).toBeNull();
		expect(resolveDayFromPostedAt('invalid', 'UTC')).toBeNull();
		expect(resolveDayFromPostedAt('2026-02-24T10:00:00.000Z', 'UTC')).toBe('2026-02-24');
	});
});
