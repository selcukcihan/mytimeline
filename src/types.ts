export type RuntimeEnv = Env & {
	ADMIN_TOKEN?: string;
	OPENAI_API_KEY?: string;
	X_SESSION_COOKIES?: string;
	SCHEDULED_DRY_RUN?: string;
	PERSIST_DRY_RUN?: string;
	DIGEST_TIMEZONE?: string;
	BACKFILL_TARGET_TWEET_COUNT?: string;
	BACKFILL_SCROLL_PASSES?: string;
	TIMELINE_DB?: D1Database;
	ASSETS?: Fetcher;
};

export type TriggerSource = 'scheduled' | 'manual';

export interface Tweet {
	id: string;
	url: string;
	text: string;
	author: string;
	handle: string;
	postedAt: string | null;
	replies: number;
	reposts: number;
	likes: number;
	views: number;
	score: number;
	media?: TweetMedia[];
}

export interface TweetMedia {
	type: 'photo' | 'video';
	url?: string;
	poster?: string;
	alt?: string;
}

export interface DigestEmail {
	subject: string;
	plain: string;
	html: string;
}

export interface OpenAIDigestResponse {
	subject: string;
	summary: string;
	highlights: Array<{
		tweet_id: string;
		why_relevant: string;
		main_takeaway: string;
	}>;
	article_links: Array<{
		url: string;
		why_relevant: string;
	}>;
}

export interface RunOptions {
	source: TriggerSource;
	dryRun: boolean;
}

export interface RunResult {
	status: 'sent' | 'dry-run' | 'skipped' | 'failed';
	reason?: string;
	inspectedTweets?: number;
	includedTweets?: number;
	subject?: string;
	error?: string;
	debug?: ScrapeDiagnostics;
	preview?: RunPreview;
	daysProcessed?: number;
	totalTweetsFetched?: number;
}

export interface LastRunSnapshot {
	at: string;
	result: RunResult;
}

export interface DigestCoordinatorState {
	runLockUntil: number | null;
	lastResult: LastRunSnapshot | null;
}

export interface RunPreview {
	day: string;
	summary: string;
	highlights: Array<{
		tweetId: string;
		url: string;
		whyRelevant: string;
		mainTakeaway: string;
		tweet: Tweet | null;
	}>;
	articleLinks: Array<{
		url: string;
		whyRelevant: string;
	}>;
	emailPlain: string;
}

export interface LlmTweetDecision {
	tweet_id: string;
	relevant: boolean;
	why_relevant: string;
	main_takeaway: string;
	relevance_score: number;
}

export interface OpenAIDayDigestResponse {
	subject: string;
	summary: string;
	decisions: LlmTweetDecision[];
	article_links: Array<{
		url: string;
		why_relevant: string;
	}>;
}

export interface ScrapeDiagnostics {
	currentUrl: string;
	pageTitle: string;
	bodySnippet: string;
	rawCookiePresent: boolean;
	rawCookieLength: number;
	injectedCookieCount: number;
	injectedCookieNames: string[];
}
