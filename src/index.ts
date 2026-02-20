import { routeAgentRequest } from 'agents';
import { handleFetch } from './handlers/fetchHandler';
import { handleScheduled } from './handlers/scheduledHandler';
import type { RuntimeEnv } from './types';

export { DigestCoordinator } from './durable-objects/DigestCoordinator';
export { buildDigestEmail } from './email/buildDigestEmail';
export { parseEngagementCount, scoreTweets } from './tweets/scoring';
export type { OpenAIDigestResponse, RunOptions, RunResult, RuntimeEnv, Tweet } from './types';

export default {
	async fetch(request, env): Promise<Response> {
		const runtimeEnv = env as RuntimeEnv;
		const agentResponse = await routeAgentRequest(request, runtimeEnv);
		if (agentResponse) {
			return agentResponse;
		}

		return handleFetch(request, runtimeEnv);
	},

	async scheduled(_event, env): Promise<void> {
		await handleScheduled(env as RuntimeEnv);
	},
} satisfies ExportedHandler<Env>;
