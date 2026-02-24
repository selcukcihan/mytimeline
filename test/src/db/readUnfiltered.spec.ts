import { describe, expect, it } from 'vitest';
import { getUnfilteredDay, listUnfilteredDays } from '../../../src/db/readUnfiltered';

type QueryResult = {
	all?: { results?: unknown[] };
	first?: unknown;
};

function createMockDb(resultsBySql: Record<string, QueryResult>) {
	return {
		prepare(sql: string) {
			return {
				bind: () => ({
					all: async () => resultsBySql[sql]?.all ?? { results: [] },
					first: async () => resultsBySql[sql]?.first ?? null,
				}),
			};
		},
	};
}

describe('listUnfilteredDays', () => {
	it('returns distinct day list from crawled tweets', async () => {
		const db = createMockDb({
			'SELECT day FROM daily_crawled_tweets GROUP BY day ORDER BY day DESC LIMIT ?': {
				all: { results: [{ day: '2026-02-24' }, { day: '2026-02-23' }] },
			},
		});

		const days = await listUnfilteredDays({ TIMELINE_DB: db } as Env, 90);
		expect(days).toEqual(['2026-02-24', '2026-02-23']);
	});
});

describe('getUnfilteredDay', () => {
	it('returns tweets sorted by postedAt and merges takeaways', async () => {
		const db = createMockDb({
			'SELECT tweet_json FROM daily_crawled_tweets WHERE day = ?': {
				all: {
					results: [
						{
							tweet_json:
								'{"id":"a","url":"https://x.com/a/status/1","text":"older","author":"A","handle":"@a","postedAt":"2026-02-24T10:00:00.000Z","replies":1,"reposts":1,"likes":1,"views":1,"score":0}',
						},
						{
							tweet_json:
								'{"id":"b","url":"https://x.com/b/status/2","text":"newer","author":"B","handle":"@b","postedAt":"2026-02-24T12:00:00.000Z","replies":1,"reposts":1,"likes":1,"views":1,"score":0}',
						},
					],
				},
			},
			'SELECT tweet_id, main_takeaway FROM daily_tweet_decisions WHERE day = ?': {
				all: { results: [{ tweet_id: 'b', main_takeaway: 'Most relevant' }] },
			},
			'SELECT subject, summary, generated_at, model FROM daily_digests WHERE day = ?': {
				first: {
					subject: 'Digest subject',
					summary: 'Digest summary',
					generated_at: '2026-02-24T13:00:00.000Z',
					model: 'gpt-5-nano',
				},
			},
			'SELECT rank, article_json FROM daily_articles WHERE day = ? ORDER BY rank ASC': {
				all: { results: [{ rank: 1, article_json: '{"url":"https://example.com"}' }] },
			},
		});

		const record = await getUnfilteredDay({ TIMELINE_DB: db } as Env, '2026-02-24');
		expect(record).toMatchObject({ day: '2026-02-24', subject: 'Digest subject' });
		expect(record?.highlights?.[0]?.data?.tweet?.id).toBe('b');
		expect(record?.highlights?.[0]?.data?.mainTakeaway).toBe('Most relevant');
		expect(record?.highlights?.[1]?.data?.tweet?.id).toBe('a');
		expect(record?.articles).toEqual([{ rank: 1, data: { url: 'https://example.com' } }]);
	});

	it('returns null when no crawled tweets exist for the day', async () => {
		const db = createMockDb({
			'SELECT tweet_json FROM daily_crawled_tweets WHERE day = ?': {
				all: { results: [] },
			},
		});

		const record = await getUnfilteredDay({ TIMELINE_DB: db } as Env, '2026-02-24');
		expect(record).toBeNull();
	});
});
