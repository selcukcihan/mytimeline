# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

# Project Guidelines

* You will build this project with a mindset of testing locally against real resources like the LLM API or any other APIs or databases we'll consume.
* We are going to host it on cloudflare workers. Make sure to use these skills: cloudflare, agents-sdk, workers-best-practices and durable-objects. You can use more skills if needed.
* Always iterate by testing. Have two separate test suites: one for unit tests and one for end to end testing consuming real resources instead of mocks.
* Cloudflare workers supports local development, more details are in https://developers.cloudflare.com/workers/development-testing/
* When testing end to end, we should still run the test locally, but it should execute against real resources.
* Those resources can be local resources: for example a sqlite database. Cloudflare provides a "wrangler" CLI tool which you can use to set up a local database and run the worker locally against that database.
