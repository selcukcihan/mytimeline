# MyTimeline

A Cloudflare Workers application that:

- Crawls your X/Twitter **Following** timeline with a real browser session
- Stores raw tweets and LLM decisions in D1 (SQLite)
- Generates day-based digests using OpenAI (`gpt-5-nano`)
- Serves a web UI (Astro + Tailwind) with:
  - **Filtered mode** (LLM-selected highlights)
  - **Unfiltered mode** (all crawled tweets)

The project is optimized for **local execution against real resources** first, then deployable to Cloudflare.

## Quick Start

### First-time setup

```bash
npm install
npm --prefix web install
cp .env.example .env # or create .env manually if no example exists
npm run bootstrap:x-cookies
npm run db:migrate:local
npm run dev
```

Then open `http://localhost:8787`.

### Daily local development

```bash
# Terminal 1: worker + web assets
npm run dev

# Terminal 2: run unit tests / coverage
npm run test:unit
npm run test:coverage

# Optional: run web-only dev server
npm run web:dev
```

### Useful local operations

```bash
# Run a one-day digest
curl -X POST \"http://localhost:8787/run\" -H \"x-admin-token: $ADMIN_TOKEN\"

# Backfill up to last 7 days
curl -X POST \"http://localhost:8787/backfill?days=7\" -H \"x-admin-token: $ADMIN_TOKEN\"
```

## High-Level Architecture

- Worker entry: `src/index.ts`
- HTTP routing: `src/handlers/fetchHandler.ts`
- Scheduled trigger: `src/handlers/scheduledHandler.ts`
- Orchestration: `src/digest/executeDigest.ts`
- Crawl engine: `src/twitter/scrapeTimeline.ts` (Cloudflare Browser via `@cloudflare/puppeteer`)
- LLM step: `src/ai/openaiDayDigest.ts`
- Persistence: `src/db/persistDigest.ts`, `src/db/readDigests.ts`, `src/db/readUnfiltered.ts`
- Coordination lock/state: `src/durable-objects/DigestCoordinator.ts`
- Frontend (static assets): `web/` (Astro)

### Runtime Bindings (from `wrangler.jsonc`)

- `TIMELINE_DB` (D1)
- `BROWSER` (Cloudflare Browser binding)
- `DIGEST_COORDINATOR` (Durable Object)
- `DIGEST_EMAIL` (Send Email binding)
- `ASSETS` (static web assets)

## Data Flow

1. `POST /run` or `POST /backfill?days=N` hits the Worker.
2. Durable Object (`DigestCoordinator`) applies run lock to avoid overlap.
3. Scraper loads `https://x.com/home?f=following`, applies session cookies, scrolls timeline, extracts tweets/media.
4. Tweets are bucketed by day (timezone-aware).
5. For each day, LLM evaluates relevance + creates day summary.
6. Data is persisted:
   - all crawled tweets
   - per-tweet LLM decisions
   - highlighted tweets
   - article links
   - canonical daily digest row
7. UI pages fetch `/api/day/:day` or `/api/unfiltered/day/:day`.

## Database Schema

Defined in `db/schema.sql`.

Core tables:

- `raw_tweets`: latest normalized raw tweet JSON by `tweet_id`
- `daily_crawled_tweets`: all tweets seen for a day (unfiltered source)
- `daily_tweet_decisions`: LLM decision for each tweet/day
- `daily_digests`: canonical digest metadata and summary per day
- `daily_highlight_tweets`: selected tweet cards for filtered view
- `daily_articles`: selected links
- `digest_runs`: optional run history

Tweet payloads are intentionally stored as JSON blobs to keep schema flexible.

## Web UI

Single-page app served as Worker assets.

Routes:

- `/` -> filtered mode, today
- `/:YYYY-MM-DD` -> filtered mode, specific day
- `/unfiltered` -> unfiltered mode, today
- `/unfiltered/:YYYY-MM-DD` -> unfiltered mode, specific day

Behavior:

- Date picker for navigation
- Mode switch (Filtered/Unfiltered)
- Responsive tweet tiles (up to 4 columns on large screens)
- Tweet media rendering (external URLs only, no media hosting)

## API Endpoints

Public read endpoints:

- `GET /health`
- `GET /api/days`
- `GET /api/day/:day`
- `GET /api/unfiltered/days`
- `GET /api/unfiltered/day/:day`

Protected endpoints (require `x-admin-token`):

- `GET /last-run`
- `POST /run?dryRun=1`
- `POST /backfill?days=3&dryRun=1`

## Local Setup

### 1. Install dependencies

```bash
npm install
npm --prefix web install
```

### 2. Prepare secrets

Create `.env` (local only, gitignored):

```bash
OPENAI_API_KEY=...
ADMIN_TOKEN=...
```

Bootstrap X cookies (interactive browser):

```bash
npm run bootstrap:x-cookies
```

This writes `.secrets/x-session-cookies.json`.

### 3. Initialize local DB

```bash
npm run db:migrate:local
```

(Optional wipe)

```bash
npm run db:wipe:local
npm run db:migrate:local
```

### 4. Run locally

```bash
npm run dev
```

Worker starts locally and serves API + web UI.

## Running Digests Locally

### Backfill recent days

```bash
curl -X POST "http://localhost:8787/backfill?days=7" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

`executeBackfill()` caps `days` to `1..7`.

### Single daily run

```bash
curl -X POST "http://localhost:8787/run" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### Dry-run mode

Use query param `dryRun=1`. Persistence of dry-runs is controlled by `PERSIST_DRY_RUN`.

## Configuration

Main config is in `wrangler.jsonc`.

Notable vars:

- `DIGEST_TOPICS`
- `OPENAI_MODEL` (current: `gpt-5-nano`)
- `DIGEST_TIMEZONE`
- `TARGET_TWEET_COUNT`, `SCROLL_PASSES`
- `BACKFILL_TARGET_TWEET_COUNT`, `BACKFILL_SCROLL_PASSES`
- `PERSIST_DRY_RUN`, `SCHEDULED_DRY_RUN`

## Testing

### Unit tests (mirrors `src/` hierarchy)

```bash
npm run test:unit
```

Test location:

- `test/src/...`

### Coverage

```bash
npm run test:coverage
```

Outputs:

- `coverage/index.html`
- `coverage/coverage-summary.json`

### E2E (real-resource oriented)

```bash
npm run test:e2e
npm run test:e2e:business
npm run test:e2e:backfill
npm run test:e2e:scheduler
```

Artifacts are written under `artifacts/` for inspection.

## Deployment

Build web assets and deploy Worker:

```bash
npm run deploy
```

## Security Notes

- Do **not** commit `.env`, `.secrets/`, `.dev.vars*`, `.wrangler/` (already gitignored).
- Treat X session cookies as sensitive credentials.
- Rotate `OPENAI_API_KEY`, `ADMIN_TOKEN`, and X cookies if they are exposed.

## Operational Notes

- Scraping is best-effort and depends on X dynamic timeline behavior.
- The scraper includes adaptive settle logic after scrolls to reduce missed tweets.
- Durable Object lock prevents concurrent digest runs (`RUN_LOCK_TTL_MS`).

## Project Structure

```text
src/
  ai/
  agents/
  db/
  digest/
  durable-objects/
  handlers/
  twitter/
  email/
web/
  src/pages/index.astro
db/
  schema.sql
test/
  src/... (unit)
  e2e.*.spec.ts
```
