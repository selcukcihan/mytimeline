import type { RuntimeEnv } from '../types';

interface DbRow {
	[key: string]: unknown;
}

export async function listDigestDays(env: RuntimeEnv, limit = 30): Promise<string[]> {
	const db = env.TIMELINE_DB;
	if (!db) {
		return [];
	}

	const result = await db
		.prepare('SELECT day FROM daily_digests ORDER BY day DESC LIMIT ?')
		.bind(limit)
		.all<{ day: string }>();
	return (result.results ?? []).map((row) => row.day);
}

export async function getDailyDigest(env: RuntimeEnv, day: string): Promise<DbRow | null> {
	const db = env.TIMELINE_DB;
	if (!db) {
		return null;
	}

	const digest = await db.prepare('SELECT * FROM daily_digests WHERE day = ?').bind(day).first<DbRow>();
	if (!digest) {
		return null;
	}

	const highlights = await db
		.prepare('SELECT rank, tweet_json FROM daily_highlight_tweets WHERE day = ? ORDER BY rank ASC')
		.bind(day)
		.all<{ rank: number; tweet_json: string }>();
	const articles = await db
		.prepare('SELECT rank, article_json FROM daily_articles WHERE day = ? ORDER BY rank ASC')
		.bind(day)
		.all<{ rank: number; article_json: string }>();

	return {
		...digest,
		highlights: (highlights.results ?? []).map((row) => ({
			rank: row.rank,
			data: safeJsonParse(row.tweet_json),
		})),
		articles: (articles.results ?? []).map((row) => ({
			rank: row.rank,
			data: safeJsonParse(row.article_json),
		})),
	};
}

function safeJsonParse(jsonText: string): unknown {
	try {
		return JSON.parse(jsonText);
	} catch {
		return null;
	}
}
