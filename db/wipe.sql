PRAGMA foreign_keys = OFF;

DELETE FROM daily_articles;
DELETE FROM daily_highlight_tweets;
DELETE FROM daily_tweet_decisions;
DELETE FROM daily_crawled_tweets;
DELETE FROM digest_runs;
DELETE FROM daily_digests;
DELETE FROM raw_tweets;

PRAGMA foreign_keys = ON;
