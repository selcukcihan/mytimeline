import { describe, expect, it } from 'vitest';
import type { Tweet } from '../../../src/types';
import { parseEngagementCount, scoreTweets } from '../../../src/tweets/scoring';

function buildTweet(overrides: Partial<Tweet>): Tweet {
	return {
		id: '1',
		url: 'https://x.com/user/status/1',
		text: 'placeholder',
		author: 'Author',
		handle: '@author',
		postedAt: '2026-02-24T00:00:00.000Z',
		replies: 0,
		reposts: 0,
		likes: 0,
		views: 0,
		score: 0,
		...overrides,
	};
}

describe('parseEngagementCount', () => {
	it('parses values with k/m/b suffixes', () => {
		expect(parseEngagementCount('1.2K Likes')).toBe(1200);
		expect(parseEngagementCount('2M Views')).toBe(2_000_000);
		expect(parseEngagementCount('3.1B')).toBe(3_100_000_000);
	});

	it('parses whole numbers and invalid labels', () => {
		expect(parseEngagementCount('884 reposts')).toBe(884);
		expect(parseEngagementCount('')).toBe(0);
		expect(parseEngagementCount('no numbers')).toBe(0);
	});
});

describe('scoreTweets', () => {
	it('boosts topical tweets over similar engagement', () => {
		const topical = buildTweet({
			id: 'topical',
			text: 'Great updates about distributed systems and cloud services',
			likes: 5,
			reposts: 1,
			replies: 1,
			views: 10,
		});
		const nonTopical = buildTweet({
			id: 'non-topical',
			text: 'Weekend coffee photo',
			likes: 5,
			reposts: 1,
			replies: 1,
			views: 10,
		});

		const scored = scoreTweets([nonTopical, topical], ['distributed systems', 'cloud services']);
		expect(scored[0]?.id).toBe('topical');
		expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score ?? 0);
	});

	it('sorts by calculated score descending', () => {
		const highEngagement = buildTweet({ id: 'high', text: 'devtools', likes: 20, reposts: 3, replies: 2, views: 400 });
		const lowEngagement = buildTweet({ id: 'low', text: 'devtools', likes: 1, reposts: 0, replies: 0, views: 10 });

		const scored = scoreTweets([lowEngagement, highEngagement], ['devtools']);
		expect(scored.map((tweet) => tweet.id)).toEqual(['high', 'low']);
	});
});
