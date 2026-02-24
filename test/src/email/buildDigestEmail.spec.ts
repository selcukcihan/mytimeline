import { describe, expect, it } from 'vitest';
import type { OpenAIDigestResponse, Tweet } from '../../../src/types';
import { buildDigestEmail } from '../../../src/email/buildDigestEmail';

function buildTweet(overrides: Partial<Tweet>): Tweet {
	return {
		id: '1',
		url: 'https://x.com/user/status/1',
		text: 'Example tweet',
		author: 'Alice',
		handle: '@alice',
		postedAt: '2026-02-24T00:00:00.000Z',
		replies: 1,
		reposts: 2,
		likes: 3,
		views: 4,
		score: 100,
		...overrides,
	};
}

describe('buildDigestEmail', () => {
	it('renders plain and html variants with highlighted tweets and articles', () => {
		const digest: OpenAIDigestResponse = {
			subject: 'Daily digest',
			summary: 'A concise summary',
			highlights: [],
			article_links: [{ url: 'https://example.com/article', why_relevant: 'Relevant context' }],
		};

		const email = buildDigestEmail(
			{ source: 'manual', dryRun: true },
			['software development'],
			[buildTweet({ text: 'Cloudflare update & status' })],
			digest,
		);

		expect(email.subject).toBe('Daily digest');
		expect(email.plain).toContain('Summary');
		expect(email.plain).toContain('Cloudflare update & status');
		expect(email.html).toContain('<h2>Daily Timeline Digest</h2>');
		expect(email.html).toContain('https://example.com/article');
		expect(email.html).toContain('Cloudflare update &amp; status');
	});

	it('renders fallback content when no tweets or articles are selected', () => {
		const digest: OpenAIDigestResponse = {
			subject: 'Daily digest',
			summary: 'No signal',
			highlights: [],
			article_links: [],
		};

		const email = buildDigestEmail({ source: 'scheduled', dryRun: false }, ['devtools'], [], digest);
		expect(email.plain).toContain('No high-signal tweets matched your topics.');
		expect(email.plain).toContain('No article links were identified today.');
		expect(email.html).toContain('<p>No high-signal tweets matched your topics.</p>');
		expect(email.html).toContain('<p>No article links were identified today.</p>');
	});
});
