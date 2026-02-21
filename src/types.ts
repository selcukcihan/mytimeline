export type RuntimeEnv = Env & {
	ADMIN_TOKEN?: string;
	OPENAI_API_KEY?: string;
	X_SESSION_COOKIES?: string;
	SCHEDULED_DRY_RUN?: string;
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
	summary: string;
	highlights: Array<{
		tweetId: string;
		url: string;
		whyRelevant: string;
		mainTakeaway: string;
	}>;
	articleLinks: Array<{
		url: string;
		whyRelevant: string;
	}>;
	emailPlain: string;
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
