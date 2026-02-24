import type {
	LlmTweetDecision,
	OpenAIDayDigestResponse,
	RuntimeEnv,
	RunOptions,
	RunResult,
	Tweet,
} from '../types';

interface PersistDayParams {
	day: string;
	options: RunOptions;
	runResult: RunResult;
	dayDigest: OpenAIDayDigestResponse;
	allTweets: Tweet[];
	model: string;
}

export async function persistDayIfConfigured(
	env: RuntimeEnv,
	params: PersistDayParams,
): Promise<void> {
	const db = env.TIMELINE_DB;
	if (!db) {
		return;
	}

	if (params.options.dryRun && env.PERSIST_DRY_RUN !== '1') {
		return;
	}

	const generatedAt = new Date().toISOString();
	const subject = params.dayDigest.subject;
	const summary = params.dayDigest.summary;
	const decisionsById = new Map(params.dayDigest.decisions.map((d) => [d.tweet_id, d]));
	const relevantDecisions = params.dayDigest.decisions
		.filter((decision) => decision.relevant)
		.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

	await db
		.prepare(
			`INSERT INTO daily_digests (
				day, subject, summary, generated_at, run_source, model,
				inspected_tweet_count, included_tweet_count, digest_json
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(day) DO UPDATE SET
				subject = excluded.subject,
				summary = excluded.summary,
				generated_at = excluded.generated_at,
				run_source = excluded.run_source,
				model = excluded.model,
				inspected_tweet_count = excluded.inspected_tweet_count,
				included_tweet_count = excluded.included_tweet_count,
				digest_json = excluded.digest_json`,
		)
		.bind(
			params.day,
			subject,
			summary,
			generatedAt,
			params.options.source,
			params.model,
			params.allTweets.length,
			relevantDecisions.length,
			JSON.stringify({
				subject,
				summary,
				articleLinks: params.dayDigest.article_links,
			}),
		)
		.run();

	await db.prepare('DELETE FROM daily_highlight_tweets WHERE day = ?').bind(params.day).run();
	await db.prepare('DELETE FROM daily_articles WHERE day = ?').bind(params.day).run();
	await db.prepare('DELETE FROM daily_tweet_decisions WHERE day = ?').bind(params.day).run();
	await db.prepare('DELETE FROM daily_crawled_tweets WHERE day = ?').bind(params.day).run();

	for (const tweet of params.allTweets) {
		await upsertRawTweet(db, tweet);
		await db
			.prepare(
				'INSERT INTO daily_crawled_tweets (day, tweet_id, tweet_json) VALUES (?, ?, ?)',
			)
			.bind(params.day, tweet.id, JSON.stringify(tweet))
			.run();

		const decision =
			decisionsById.get(tweet.id) ?? fallbackDecision(tweet.id);
		await db
			.prepare(
				`INSERT INTO daily_tweet_decisions (
					day, tweet_id, relevant, relevance_score, why_relevant, main_takeaway, decision_json
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				params.day,
				tweet.id,
				decision.relevant ? 1 : 0,
				decision.relevance_score || 0,
				decision.why_relevant,
				decision.main_takeaway,
				JSON.stringify(decision),
			)
			.run();
	}

	for (let i = 0; i < relevantDecisions.length; i += 1) {
		const decision = relevantDecisions[i];
		const tweet = params.allTweets.find((item) => item.id === decision.tweet_id);
		if (!tweet) {
			continue;
		}

		await db
			.prepare(
				'INSERT INTO daily_highlight_tweets (day, rank, tweet_json) VALUES (?, ?, ?)',
			)
			.bind(
				params.day,
				i + 1,
				JSON.stringify({
					tweetId: tweet.id,
					tweet,
					whyRelevant: decision.why_relevant,
					mainTakeaway: decision.main_takeaway,
					relevanceScore: decision.relevance_score || 0,
				}),
			)
			.run();
	}

	for (let i = 0; i < params.dayDigest.article_links.length; i += 1) {
		const article = params.dayDigest.article_links[i];
		await db
			.prepare('INSERT INTO daily_articles (day, rank, article_json) VALUES (?, ?, ?)')
			.bind(params.day, i + 1, JSON.stringify(article))
			.run();
	}
}

async function upsertRawTweet(db: D1Database, tweet: Tweet): Promise<void> {
	await db
		.prepare(
			`INSERT INTO raw_tweets (tweet_id, posted_at, last_seen_at, tweet_json)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(tweet_id) DO UPDATE SET
			   posted_at = excluded.posted_at,
			   last_seen_at = excluded.last_seen_at,
			   tweet_json = excluded.tweet_json`,
		)
		.bind(tweet.id, tweet.postedAt, new Date().toISOString(), JSON.stringify(tweet))
		.run();
}

function fallbackDecision(tweetId: string): LlmTweetDecision {
	return {
		tweet_id: tweetId,
		relevant: false,
		why_relevant: 'No LLM decision returned for this tweet.',
		main_takeaway: 'No takeaway available.',
		relevance_score: 0,
	};
}

export function resolveDigestDay(now: Date, timezone: string | undefined): string {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone || 'UTC',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	return formatter.format(now);
}

export function resolveDayFromPostedAt(postedAt: string | null, timezone: string | undefined): string | null {
	if (!postedAt) {
		return null;
	}

	const date = new Date(postedAt);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return resolveDigestDay(date, timezone);
}
