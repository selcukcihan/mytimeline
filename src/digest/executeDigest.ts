import { buildDayDigestWithOpenAI } from '../ai/openaiDayDigest';
import { MAX_TWEETS_FOR_MODEL } from '../constants';
import { persistDayIfConfigured, resolveDayFromPostedAt, resolveDigestDay } from '../db/persistDigest';
import { parsePositiveInt, parseTopics } from '../parsers';
import { scoreTweets } from '../tweets/scoring';
import { ScrapeTimelineError, scrapeTimelineForDays } from '../twitter/scrapeTimeline';
import type { RunOptions, RunResult, RuntimeEnv, Tweet } from '../types';

export async function executeDigest(env: RuntimeEnv, options: RunOptions): Promise<RunResult> {
	return executeBackfill(env, options, 1);
}

export async function executeBackfill(
	env: RuntimeEnv,
	options: RunOptions,
	requestedDays: number,
): Promise<RunResult> {
	const topics = parseTopics(env.DIGEST_TOPICS);
	if (topics.length === 0) {
		throw new Error('DIGEST_TOPICS is empty. Set at least one topic in wrangler vars.');
	}

	const days = Math.max(1, Math.min(requestedDays, 7));
	let tweets: Tweet[];
	try {
		tweets = await scrapeTimelineForDays(env, days);
	} catch (error) {
		if (error instanceof ScrapeTimelineError) {
			return {
				status: 'failed',
				error: error.message,
				debug: error.diagnostics,
			};
		}
		throw error;
	}

	if (tweets.length === 0) {
		return { status: 'skipped', reason: 'no tweets captured' };
	}

	const timezone = env.DIGEST_TIMEZONE || 'UTC';
	const today = resolveDigestDay(new Date(), timezone);
	const lowerBound = resolveDigestDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000), timezone);
	const byDay = bucketTweetsByDay(tweets, timezone);
	const orderedDays = Array.from(byDay.keys())
		.filter((day) => day >= lowerBound && day <= today)
		.sort((a, b) => b.localeCompare(a));

	if (orderedDays.length === 0) {
		return { status: 'skipped', reason: 'no tweets inside day window' };
	}

	let latestResult: RunResult | null = null;
	const model = env.OPENAI_MODEL || 'gpt-5-nano';
	const maxLlmTweetsPerDay = parsePositiveInt(env.TARGET_TWEET_COUNT, MAX_TWEETS_FOR_MODEL * 3);

	for (const day of orderedDays) {
		const dayTweets = byDay.get(day) ?? [];
		const scored = scoreTweets(dayTweets, topics);
		const llmInput = scored.slice(0, maxLlmTweetsPerDay);
		const dayDigest = await buildDayDigestWithOpenAI(env, day, llmInput, topics);
		const relevant = dayDigest.decisions
			.filter((decision) => decision.relevant)
			.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
		const tweetById = new Map(scored.map((tweet) => [tweet.id, tweet]));

		const resultForDay: RunResult = {
			status: options.dryRun ? 'dry-run' : 'sent',
			subject: dayDigest.subject,
			inspectedTweets: dayTweets.length,
			includedTweets: relevant.length,
			preview: {
				day,
				summary: dayDigest.summary,
				highlights: relevant.slice(0, 12).map((decision) => ({
					tweetId: decision.tweet_id,
					url: tweetById.get(decision.tweet_id)?.url ?? '',
					whyRelevant: decision.why_relevant,
					mainTakeaway: decision.main_takeaway,
					tweet: tweetById.get(decision.tweet_id) ?? null,
				})),
				articleLinks: dayDigest.article_links.map((item) => ({
					url: item.url,
					whyRelevant: item.why_relevant,
				})),
				emailPlain: buildPlainPreview(day, dayDigest.summary, relevant, tweetById),
			},
		};

		await persistDayIfConfigured(env, {
			day,
			options,
			runResult: resultForDay,
			dayDigest,
			allTweets: dayTweets,
			model,
		});

		latestResult = resultForDay;
	}

	return {
		...(latestResult ?? { status: 'skipped', reason: 'no processed days' }),
		daysProcessed: orderedDays.length,
		totalTweetsFetched: tweets.length,
	};
}

function bucketTweetsByDay(tweets: Tweet[], timezone: string): Map<string, Tweet[]> {
	const map = new Map<string, Tweet[]>();
	for (const tweet of tweets) {
		const day = resolveDayFromPostedAt(tweet.postedAt, timezone);
		if (!day) {
			continue;
		}
		const bucket = map.get(day);
		if (bucket) {
			bucket.push(tweet);
		} else {
			map.set(day, [tweet]);
		}
	}
	return map;
}

function buildPlainPreview(
	day: string,
	summary: string,
	relevant: Array<{ tweet_id: string; why_relevant: string; main_takeaway: string }>,
	tweetById: Map<string, Tweet>,
): string {
	const lines = [`Day: ${day}`, '', 'Summary', summary, '', 'Relevant Tweets'];
	for (const [index, item] of relevant.slice(0, 12).entries()) {
		const tweet = tweetById.get(item.tweet_id);
		lines.push(`${index + 1}. ${tweet?.author ?? 'Unknown'} (${tweet?.handle ?? ''})`);
		lines.push(tweet?.text ?? '');
		lines.push(tweet?.url ?? '');
		lines.push(`Why: ${item.why_relevant}`);
		lines.push(`Takeaway: ${item.main_takeaway}`);
		lines.push('');
	}
	return lines.join('\n');
}
