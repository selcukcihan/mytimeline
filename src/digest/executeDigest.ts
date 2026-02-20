import { buildDigestWithOpenAI, selectHighlightedTweets } from '../ai/openaiDigest';
import { MAX_TWEETS_FOR_MODEL } from '../constants';
import { buildDigestEmail } from '../email/buildDigestEmail';
import { sendDigestEmail } from '../email/sendDigestEmail';
import { parseTopics } from '../parsers';
import { scoreTweets } from '../tweets/scoring';
import { scrapeTimelineWithBrowser } from '../twitter/scrapeTimeline';
import type { RunOptions, RunResult, RuntimeEnv } from '../types';

export async function executeDigest(env: RuntimeEnv, options: RunOptions): Promise<RunResult> {
	const topics = parseTopics(env.DIGEST_TOPICS);
	if (topics.length === 0) {
		throw new Error('DIGEST_TOPICS is empty. Set at least one topic in wrangler vars.');
	}

	const tweets = await scrapeTimelineWithBrowser(env);
	if (tweets.length === 0) {
		return { status: 'skipped', reason: 'no tweets captured' };
	}

	const candidates = scoreTweets(tweets, topics).slice(0, MAX_TWEETS_FOR_MODEL);
	const digest = await buildDigestWithOpenAI(env, candidates, topics);
	const selected = selectHighlightedTweets(candidates, digest.highlights);
	const email = buildDigestEmail(options, topics, selected, digest);

	if (options.dryRun) {
		return {
			status: 'dry-run',
			subject: email.subject,
			inspectedTweets: tweets.length,
			includedTweets: selected.length,
		};
	}

	await sendDigestEmail(env, email);
	return {
		status: 'sent',
		subject: email.subject,
		inspectedTweets: tweets.length,
		includedTweets: selected.length,
	};
}
