import { describe, expect, it } from 'vitest';
import { getDailyDigest, listDigestDays } from '../../../src/db/readDigests';

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

describe('listDigestDays', () => {
	it('returns ordered day strings from daily_digests', async () => {
		const db = createMockDb({
			'SELECT day FROM daily_digests ORDER BY day DESC LIMIT ?': {
				all: { results: [{ day: '2026-02-24' }, { day: '2026-02-23' }] },
			},
		});

		const days = await listDigestDays({ TIMELINE_DB: db } as Env, 90);
		expect(days).toEqual(['2026-02-24', '2026-02-23']);
	});

	it('returns empty list when DB binding is absent', async () => {
		const days = await listDigestDays({} as Env, 90);
		expect(days).toEqual([]);
	});
});

describe('getDailyDigest', () => {
	it('returns digest with parsed highlights and articles', async () => {
		const db = createMockDb({
			'SELECT * FROM daily_digests WHERE day = ?': {
				first: { day: '2026-02-24', subject: 'Digest subject', summary: 'Digest summary' },
			},
			'SELECT rank, tweet_json FROM daily_highlight_tweets WHERE day = ? ORDER BY rank ASC': {
				all: { results: [{ rank: 1, tweet_json: '{"tweetId":"1"}' }, { rank: 2, tweet_json: 'not-json' }] },
			},
			'SELECT rank, article_json FROM daily_articles WHERE day = ? ORDER BY rank ASC': {
				all: { results: [{ rank: 1, article_json: '{"url":"https://example.com"}' }] },
			},
		});

		const record = await getDailyDigest({ TIMELINE_DB: db } as Env, '2026-02-24');
		expect(record).toMatchObject({ day: '2026-02-24', subject: 'Digest subject' });
		expect(record?.highlights).toEqual([
			{ rank: 1, data: { tweetId: '1' } },
			{ rank: 2, data: null },
		]);
		expect(record?.articles).toEqual([{ rank: 1, data: { url: 'https://example.com' } }]);
	});

	it('returns null when digest row does not exist', async () => {
		const db = createMockDb({
			'SELECT * FROM daily_digests WHERE day = ?': { first: null },
		});

		const record = await getDailyDigest({ TIMELINE_DB: db } as Env, '2026-02-24');
		expect(record).toBeNull();
	});
});
