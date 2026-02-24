# Local Workflow (Single Worker + Astro UI)

## 1. Prepare Local D1

From repository root:

```bash
npm run db:migrate:local
npm run db:wipe:local
```

This creates schema and clears any old/synthetic rows.

It maintains only:
- `daily_digests`
- `daily_highlight_tweets` (each tweet in `tweet_json`)
- `daily_articles`
- `daily_crawled_tweets`
- `daily_tweet_decisions`
- `raw_tweets`

## 2. Run Real 3-Day Backfill (Following timeline only)

From repository root:

```bash
npm run test:e2e:backfill
```

This performs:
- Crawl from **Following** tab
- Backfill up to 3 days
- Persist all crawled tweets
- Persist LLM decisions for every crawled tweet
- Persist day summaries/highlights for frontend pages

No synthetic seed data is used.

## 3. Build Astro UI Assets

From repository root:

```bash
npm run web:build
```

This writes static frontend files to `web/dist`, served by the same Worker through the `ASSETS` binding.

## 4. Run Single Worker Locally

From repository root:

```bash
npm run dev
```

To persist dry-run outputs into D1, set:

```bash
PERSIST_DRY_RUN=1
```

and trigger:

```bash
curl -X POST http://localhost:8787/run?dryRun=1 -H "x-admin-token: $ADMIN_TOKEN"
```

Routes served by the same worker:
- `/` list of indexed days
- `/:day` daily digest page (example `/2026-02-20`)
- `/api/days` and `/api/day/:day`

## 5. Deploy Single Worker

Deploy from root:

```bash
npm run deploy
```
