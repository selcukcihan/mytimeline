import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker, { buildDigestEmail, parseEngagementCount, scoreTweets, type OpenAIDigestResponse } from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('unit', () => {
	it('parses engagement labels with suffixes', () => {
		expect(parseEngagementCount('1.2K Likes')).toBe(1200);
		expect(parseEngagementCount('2M Views')).toBe(2_000_000);
		expect(parseEngagementCount('884 Reposts')).toBe(884);
		expect(parseEngagementCount('')).toBe(0);
	});

	it('scores topical tweets higher', () => {
		const scored = scoreTweets(
			[
				{
					id: '1',
					url: 'https://x.com/a/status/1',
					text: 'Cloudflare announced new Durable Objects patterns',
					author: 'A',
					handle: '@a',
					postedAt: null,
					replies: 2,
					reposts: 7,
					likes: 22,
					views: 200,
					score: 0,
				},
				{
					id: '2',
					url: 'https://x.com/b/status/2',
					text: 'random lifestyle post',
					author: 'B',
					handle: '@b',
					postedAt: null,
					replies: 1,
					reposts: 1,
					likes: 8,
					views: 90,
					score: 0,
				},
			],
			['cloudflare', 'durable objects'],
		);

		expect(scored[0]?.id).toBe('1');
		expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score ?? 0);
	});

	it('builds digest email content', () => {
		const digest: OpenAIDigestResponse = {
			subject: 'Daily digest',
			summary: 'Two useful updates today.',
			highlights: [{ tweet_id: '1', why_relevant: 'Cloudflare topic', main_takeaway: 'Worth reading' }],
			article_links: [{ url: 'https://example.com/article', why_relevant: 'Deep dive' }],
		};

		const email = buildDigestEmail(
			{ source: 'manual', dryRun: true },
			['cloudflare'],
			[
				{
					id: '1',
					url: 'https://x.com/a/status/1',
					text: 'Cloudflare update',
					author: 'A',
					handle: '@a',
					postedAt: null,
					replies: 1,
					reposts: 2,
					likes: 3,
					views: 4,
					score: 100,
				},
			],
			digest,
		);

		expect(email.subject).toBe('Daily digest');
		expect(email.plain).toContain('Summary');
		expect(email.html).toContain('<h2>Daily Timeline Digest</h2>');
	});

	it('exposes worker health endpoint', async () => {
		const request = new IncomingRequest('https://example.com/health');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});
});
