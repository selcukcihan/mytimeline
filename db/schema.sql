PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raw_tweets (
	tweet_id TEXT PRIMARY KEY,
	posted_at TEXT,
	last_seen_at TEXT NOT NULL,
	tweet_json TEXT NOT NULL CHECK (json_valid(tweet_json))
);

-- All crawled tweets for a day (including non-relevant ones).
CREATE TABLE IF NOT EXISTS daily_crawled_tweets (
	day TEXT NOT NULL,
	tweet_id TEXT NOT NULL,
	tweet_json TEXT NOT NULL CHECK (json_valid(tweet_json)),
	PRIMARY KEY (day, tweet_id),
	FOREIGN KEY (tweet_id) REFERENCES raw_tweets(tweet_id) ON DELETE CASCADE
);

-- LLM decision per crawled tweet for a day.
CREATE TABLE IF NOT EXISTS daily_tweet_decisions (
	day TEXT NOT NULL,
	tweet_id TEXT NOT NULL,
	relevant INTEGER NOT NULL,
	relevance_score REAL NOT NULL DEFAULT 0,
	why_relevant TEXT NOT NULL,
	main_takeaway TEXT NOT NULL,
	decision_json TEXT NOT NULL CHECK (json_valid(decision_json)),
	PRIMARY KEY (day, tweet_id),
	FOREIGN KEY (tweet_id) REFERENCES raw_tweets(tweet_id) ON DELETE CASCADE
);

-- One canonical digest document per day (used to render /YYYY-MM-DD pages quickly).
CREATE TABLE IF NOT EXISTS daily_digests (
	day TEXT PRIMARY KEY, -- YYYY-MM-DD
	subject TEXT NOT NULL,
	summary TEXT NOT NULL,
	generated_at TEXT NOT NULL, -- ISO timestamp
	run_source TEXT NOT NULL, -- manual | scheduled
	model TEXT NOT NULL,
	inspected_tweet_count INTEGER NOT NULL DEFAULT 0,
	included_tweet_count INTEGER NOT NULL DEFAULT 0,
	digest_json TEXT NOT NULL CHECK (json_valid(digest_json))
);

-- Highlighted tweets for a given day.
-- Each row stores the complete tweet payload as a single JSON document.
CREATE TABLE IF NOT EXISTS daily_highlight_tweets (
	day TEXT NOT NULL,
	rank INTEGER NOT NULL,
	tweet_json TEXT NOT NULL CHECK (json_valid(tweet_json)),
	PRIMARY KEY (day, rank),
	FOREIGN KEY (day) REFERENCES daily_digests(day) ON DELETE CASCADE
);

-- Links/articles selected for a given day.
CREATE TABLE IF NOT EXISTS daily_articles (
	day TEXT NOT NULL,
	rank INTEGER NOT NULL,
	article_json TEXT NOT NULL CHECK (json_valid(article_json)),
	PRIMARY KEY (day, rank),
	FOREIGN KEY (day) REFERENCES daily_digests(day) ON DELETE CASCADE
);

-- Optional run history for observability and retries.
CREATE TABLE IF NOT EXISTS digest_runs (
	run_id TEXT PRIMARY KEY,
	day TEXT NOT NULL,
	started_at TEXT NOT NULL,
	completed_at TEXT,
	status TEXT NOT NULL, -- success | failed | skipped
	error_message TEXT,
	result_json TEXT NOT NULL CHECK (json_valid(result_json)),
	FOREIGN KEY (day) REFERENCES daily_digests(day) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_digests_day_desc ON daily_digests(day DESC);
CREATE INDEX IF NOT EXISTS idx_daily_tweet_decisions_day_relevant ON daily_tweet_decisions(day, relevant);
CREATE INDEX IF NOT EXISTS idx_digest_runs_day_status ON digest_runs(day, status);
