import type { DigestEmail, OpenAIDigestResponse, RunOptions, Tweet } from '../types';
import { escapeHtml } from '../utils/html';

export function buildDigestEmail(
	options: RunOptions,
	topics: string[],
	selectedTweets: Tweet[],
	digest: OpenAIDigestResponse,
): DigestEmail {
	const header = `Topics: ${topics.join(', ')}\nRun source: ${options.source}\nGenerated at: ${new Date().toISOString()}`;

	const highlightsPlain = selectedTweets.length
		? selectedTweets
				.map(
					(tweet, index) =>
						`${index + 1}. ${tweet.author} (${tweet.handle || 'unknown'})\n` +
						`${tweet.text}\n${tweet.url}\nLikes ${tweet.likes} | Reposts ${tweet.reposts} | Replies ${tweet.replies} | Views ${tweet.views}`,
				)
				.join('\n\n')
		: 'No high-signal tweets matched your topics.';

	const articlesPlain = digest.article_links.length
		? digest.article_links.map((item, index) => `${index + 1}. ${item.url}\nWhy: ${item.why_relevant}`).join('\n\n')
		: 'No article links were identified today.';

	const plain = `${header}\n\nSummary\n${digest.summary}\n\nHighlights\n${highlightsPlain}\n\nArticles\n${articlesPlain}`;
	const highlightsHtml = selectedTweets.length
		? `<ol>${selectedTweets
				.map(
					(tweet) =>
						`<li><p><strong>${escapeHtml(tweet.author)}</strong> (${escapeHtml(tweet.handle || 'unknown')})</p><p>${escapeHtml(tweet.text)}</p><p><a href="${escapeHtml(tweet.url)}">${escapeHtml(tweet.url)}</a></p><p>Likes ${tweet.likes} | Reposts ${tweet.reposts} | Replies ${tweet.replies} | Views ${tweet.views}</p></li>`,
				)
				.join('')}</ol>`
		: '<p>No high-signal tweets matched your topics.</p>';

	const articlesHtml = digest.article_links.length
		? `<ol>${digest.article_links
				.map(
					(item) =>
						`<li><p><a href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a></p><p>${escapeHtml(item.why_relevant)}</p></li>`,
				)
				.join('')}</ol>`
		: '<p>No article links were identified today.</p>';

	const html =
		`<h2>Daily Timeline Digest</h2>` +
		`<p><strong>Topics:</strong> ${escapeHtml(topics.join(', '))}</p>` +
		`<p><strong>Run source:</strong> ${escapeHtml(options.source)}<br><strong>Generated at:</strong> ${new Date().toISOString()}</p>` +
		`<h3>Summary</h3><p>${escapeHtml(digest.summary)}</p>` +
		`<h3>Highlights</h3>${highlightsHtml}` +
		`<h3>Articles</h3>${articlesHtml}`;

	return {
		subject: digest.subject,
		plain,
		html,
	};
}
