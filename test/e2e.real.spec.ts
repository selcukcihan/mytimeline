import { describe, it, expect } from 'vitest';

const apiKey = process.env.OPENAI_API_KEY;
const maybeDescribe = apiKey ? describe : describe.skip;

maybeDescribe('e2e (real resources)', () => {
	it(
		'calls OpenAI API with a real request',
		{ timeout: 30_000 },
		async () => {
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'gpt-4.1-mini',
					messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
					temperature: 0,
				}),
			});

			expect(response.ok).toBe(true);
			const data = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const content = data.choices?.[0]?.message?.content?.toLowerCase() ?? '';
			expect(content).toContain('ok');
		},
	);
});
