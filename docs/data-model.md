# Data Model

## Goal
Render daily timeline pages (`/YYYY-MM-DD`) without relationally modeling tweet internals.

Each highlighted tweet is persisted as one JSON blob in SQLite (`tweet_json`), so schema changes in tweet shape do not require database migrations.

## Tables

### `daily_digests`
- One row per day.
- Stores day-level metadata and a full digest payload snapshot (`digest_json`).

Key fields:
- `day` (`YYYY-MM-DD`) primary key
- `subject`, `summary`
- `generated_at`, `run_source`, `model`
- `inspected_tweet_count`, `included_tweet_count`
- `digest_json` (`json_valid` constrained)

### `daily_highlight_tweets`
- One row per highlighted tweet per day.
- Stores tweet content and highlight metadata in a single JSON column.

Key fields:
- `(day, rank)` primary key
- `tweet_json` (`json_valid` constrained)

Expected JSON shape example:
```json
{
  "tweetId": "123",
  "url": "https://x.com/u/status/123",
  "author": "User",
  "handle": "@user",
  "text": "tweet text...",
  "engagement": { "likes": 10, "reposts": 3, "replies": 1, "views": 500 },
  "whyRelevant": "Relevant because ...",
  "mainTakeaway": "Takeaway ..."
}
```

### `daily_articles`
- One row per article/link chosen for that day.
- `article_json` stores full link payload.

### `digest_runs`
- Optional run history/audit trail for troubleshooting.
- `result_json` stores full run result payload (including debug details).

## Read Patterns

### Daily page (`/:day`)
1. Fetch `daily_digests` by `day`
2. Fetch `daily_highlight_tweets` by `day ORDER BY rank`
3. Fetch `daily_articles` by `day ORDER BY rank`

### Archive page (`/`)
1. Fetch recent rows from `daily_digests ORDER BY day DESC LIMIT N`

## Why JSON Columns
- Tweet shape evolves quickly.
- No need for dimension-style tweet queries.
- Reduces migration churn and integration surface.
