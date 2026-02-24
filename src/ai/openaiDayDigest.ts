import type { OpenAIDayDigestResponse, RuntimeEnv, Tweet } from '../types';

export async function buildDayDigestWithOpenAI(
	env: RuntimeEnv,
	day: string,
	tweets: Tweet[],
	topics: string[],
): Promise<OpenAIDayDigestResponse> {
	const key = env.OPENAI_API_KEY;
	if (!key) {
		throw new Error('OPENAI_API_KEY is missing.');
	}

	const model = env.OPENAI_MODEL || 'gpt-5-nano';
	const payload = {
		model,
		messages: [
			{
				role: 'system',
				content:
					'You evaluate tweets for topic relevance and produce a concise daily digest. Return valid JSON only.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					day,
					topics,
					tweets: tweets.map((tweet) => ({
						id: tweet.id,
						url: tweet.url,
						text: tweet.text,
						author: tweet.author,
						handle: tweet.handle,
						posted_at: tweet.postedAt,
						likes: tweet.likes,
						reposts: tweet.reposts,
						replies: tweet.replies,
						views: tweet.views,
						score: tweet.score,
					})),
					instructions: [
						'For every tweet, emit one decision object in decisions.',
						'Set relevant true only when useful for topics.',
						'Use relevance_score from 0 to 100.',
						'For irrelevant tweets, keep concise why_relevant and main_takeaway.',
						'Write subject and summary for this day based on relevant tweets.',
						'If no relevant tweets, still return decisions and a short summary explaining low-signal day.',
					],
				}),
			},
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'day_digest',
				strict: true,
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['subject', 'summary', 'decisions', 'article_links'],
					properties: {
						subject: { type: 'string' },
						summary: { type: 'string' },
						decisions: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: [
									'tweet_id',
									'relevant',
									'why_relevant',
									'main_takeaway',
									'relevance_score',
								],
								properties: {
									tweet_id: { type: 'string' },
									relevant: { type: 'boolean' },
									why_relevant: { type: 'string' },
									main_takeaway: { type: 'string' },
									relevance_score: { type: 'number' },
								},
							},
						},
						article_links: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['url', 'why_relevant'],
								properties: {
									url: { type: 'string' },
									why_relevant: { type: 'string' },
								},
							},
						},
					},
				},
			},
		},
	};

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${key}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
	}

	const data = (await response.json()) as {
		choices?: Array<{
			message?: {
				content?: string;
			};
		}>;
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('OpenAI response did not include JSON content.');
	}

	const parsed = JSON.parse(content) as OpenAIDayDigestResponse;
	if (!parsed.subject || !parsed.summary || !Array.isArray(parsed.decisions)) {
		throw new Error('OpenAI day digest response is missing required fields.');
	}
	return parsed;
}
