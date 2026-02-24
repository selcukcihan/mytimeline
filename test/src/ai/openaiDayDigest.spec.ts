import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDayDigestWithOpenAI } from '../../../src/ai/openaiDayDigest';
import type { Tweet } from '../../../src/types';

function buildTweet(overrides: Partial<Tweet>): Tweet {
	return {
		id: '1',
		url: 'https://x.com/user/status/1',
		text: 'Example',
		author: 'Author',
		handle: '@author',
		postedAt: '2026-02-24T00:00:00.000Z',
		replies: 1,
		reposts: 1,
		likes: 1,
		views: 1,
		score: 10,
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('buildDayDigestWithOpenAI', () => {
	it('throws when OPENAI_API_KEY is missing', async () => {
		await expect(
			buildDayDigestWithOpenAI({} as Env, '2026-02-24', [buildTweet({})], ['devtools']),
		).rejects.toThrow('OPENAI_API_KEY is missing.');
	});

	it('sends request and parses JSON response payload', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									subject: 'Daily digest',
									summary: 'Key updates',
									decisions: [
										{
											tweet_id: '1',
											relevant: true,
											why_relevant: 'topic match',
											main_takeaway: 'important',
											relevance_score: 92,
										},
									],
									article_links: [{ url: 'https://example.com', why_relevant: 'context' }],
								}),
							},
						},
					],
				}),
				{ status: 200 },
			),
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await buildDayDigestWithOpenAI(
			{ OPENAI_API_KEY: 'key', OPENAI_MODEL: 'gpt-5-nano' } as Env,
			'2026-02-24',
			[buildTweet({ id: '1' })],
			['devtools'],
		);

		expect(result.subject).toBe('Daily digest');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(requestInit.body)) as { model: string };
		expect(body.model).toBe('gpt-5-nano');
	});

	it('throws descriptive error when API returns non-200 status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));

		await expect(
			buildDayDigestWithOpenAI({ OPENAI_API_KEY: 'key' } as Env, '2026-02-24', [buildTweet({})], ['devtools']),
		).rejects.toThrow('OpenAI request failed: 429 rate limited');
	});

	it('throws when API response has no assistant content', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })));

		await expect(
			buildDayDigestWithOpenAI({ OPENAI_API_KEY: 'key' } as Env, '2026-02-24', [buildTweet({})], ['devtools']),
		).rejects.toThrow('OpenAI response did not include JSON content.');
	});
});
