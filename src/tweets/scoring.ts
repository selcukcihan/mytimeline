import type { Tweet } from '../types';

export function parseEngagementCount(label: string): number {
	if (!label) {
		return 0;
	}

	const normalized = label.toLowerCase().replace(/,/g, '');
	const match = normalized.match(/(\d+(?:\.\d+)?)([kmb])?/);
	if (!match) {
		return 0;
	}

	const base = Number.parseFloat(match[1]);
	const suffix = match[2];
	if (!Number.isFinite(base)) {
		return 0;
	}

	if (suffix === 'k') {
		return Math.round(base * 1_000);
	}
	if (suffix === 'm') {
		return Math.round(base * 1_000_000);
	}
	if (suffix === 'b') {
		return Math.round(base * 1_000_000_000);
	}
	return Math.round(base);
}

export function scoreTweets(tweets: Tweet[], topics: string[]): Tweet[] {
	return tweets
		.map((tweet) => {
			const text = tweet.text.toLowerCase();
			const topicMatches = topics.filter((topic) => text.includes(topic)).length;
			const engagementScore =
				tweet.likes * 2 + tweet.reposts * 2.5 + tweet.replies * 1.5 + tweet.views * 0.25;
			const topicalBoost = topicMatches > 0 ? topicMatches * 1_000 : 0;
			return {
				...tweet,
				score: Math.round(engagementScore + topicalBoost),
			};
		})
		.sort((left, right) => right.score - left.score);
}
