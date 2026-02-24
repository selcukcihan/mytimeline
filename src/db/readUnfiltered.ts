import type { RuntimeEnv, Tweet } from '../types';

interface DbRow {
	[key: string]: unknown;
}

export async function listUnfilteredDays(env: RuntimeEnv, limit = 30): Promise<string[]> {
	const db = env.TIMELINE_DB;
	if (!db) {
		return [];
	}

	const result = await db
		.prepare('SELECT day FROM daily_crawled_tweets GROUP BY day ORDER BY day DESC LIMIT ?')
		.bind(limit)
		.all<{ day: string }>();
	return (result.results ?? []).map((row) => row.day);
}

export async function getUnfilteredDay(env: RuntimeEnv, day: string): Promise<DbRow | null> {
	const db = env.TIMELINE_DB;
	if (!db) {
		return null;
	}

	const crawled = await db
		.prepare('SELECT tweet_json FROM daily_crawled_tweets WHERE day = ?')
		.bind(day)
		.all<{ tweet_json: string }>();
	const tweets = (crawled.results ?? [])
		.map((row) => safeJsonParse(row.tweet_json) as Tweet | null)
		.filter((row): row is Tweet => Boolean(row && row.id));
	if (tweets.length === 0) {
		return null;
	}

	tweets.sort((a, b) => {
		const aTs = Date.parse(a.postedAt ?? '');
		const bTs = Date.parse(b.postedAt ?? '');
		if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
			return bTs - aTs;
		}
		if (Number.isFinite(aTs)) {
			return -1;
		}
		if (Number.isFinite(bTs)) {
			return 1;
		}
		return b.id.localeCompare(a.id);
	});

	const decisions = await db
		.prepare('SELECT tweet_id, main_takeaway FROM daily_tweet_decisions WHERE day = ?')
		.bind(day)
		.all<{ tweet_id: string; main_takeaway: string }>();
	const takeawayById = new Map((decisions.results ?? []).map((row) => [row.tweet_id, row.main_takeaway]));

	const digest = await db
		.prepare('SELECT subject, summary, generated_at, model FROM daily_digests WHERE day = ?')
		.bind(day)
		.first<{
			subject: string;
			summary: string;
			generated_at: string;
			model: string;
		}>();

	const articles = await db
		.prepare('SELECT rank, article_json FROM daily_articles WHERE day = ? ORDER BY rank ASC')
		.bind(day)
		.all<{ rank: number; article_json: string }>();

	return {
		day,
		subject: digest?.subject ?? `Unfiltered timeline for ${day}`,
		summary:
			digest?.summary ?? `All crawled tweets from your Following timeline for ${day}. No LLM filtering.`,
		generated_at: digest?.generated_at ?? '',
		model: digest?.model ?? '',
		highlights: tweets.map((tweet, index) => ({
			rank: index + 1,
			data: {
				tweetId: tweet.id,
				url: tweet.url,
				mainTakeaway: takeawayById.get(tweet.id) ?? '',
				tweet,
			},
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
