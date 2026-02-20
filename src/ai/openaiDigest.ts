import type { OpenAIDigestResponse, RuntimeEnv, Tweet } from '../types';

export async function buildDigestWithOpenAI(
	env: RuntimeEnv,
	tweets: Tweet[],
	topics: string[],
): Promise<OpenAIDigestResponse> {
	const key = env.OPENAI_API_KEY;
	if (!key) {
		throw new Error('OPENAI_API_KEY is missing.');
	}

	const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
	const payload = {
		model,
		messages: [
			{
				role: 'system',
				content:
					'You produce concise daily intelligence digests from timeline posts. Focus on signal, not noise.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					topics,
					max_items: 10,
					tweets: tweets.map((tweet) => ({
						id: tweet.id,
						url: tweet.url,
						text: tweet.text,
						author: tweet.author,
						handle: tweet.handle,
						likes: tweet.likes,
						reposts: tweet.reposts,
						replies: tweet.replies,
						views: tweet.views,
						score: tweet.score,
					})),
					instructions: [
						'Select only tweets relevant to the requested topics.',
						'Use engagement and content quality as signal.',
						'Summarize what matters for a daily brief.',
						'If no relevant tweets exist, return empty highlights and explain why.',
						'Identify links that look like articles/posts worth opening separately.',
					],
				}),
			},
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'digest',
				strict: true,
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['subject', 'summary', 'highlights', 'article_links'],
					properties: {
						subject: { type: 'string' },
						summary: { type: 'string' },
						highlights: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['tweet_id', 'why_relevant', 'main_takeaway'],
								properties: {
									tweet_id: { type: 'string' },
									why_relevant: { type: 'string' },
									main_takeaway: { type: 'string' },
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

	const parsed = JSON.parse(content) as OpenAIDigestResponse;
	if (!parsed.subject || !parsed.summary) {
		throw new Error('OpenAI response is missing required digest fields.');
	}
	return parsed;
}

export function selectHighlightedTweets(
	tweets: Tweet[],
	highlights: OpenAIDigestResponse['highlights'],
): Tweet[] {
	const byId = new Map(tweets.map((tweet) => [tweet.id, tweet]));
	const selected: Tweet[] = [];
	for (const highlight of highlights) {
		const tweet = byId.get(highlight.tweet_id);
		if (tweet) {
			selected.push(tweet);
		}
	}
	return selected;
}
