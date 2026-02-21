import { getDigestAgent } from '../agents/getDigestAgent';
import type { RuntimeEnv } from '../types';

export async function handleScheduled(env: RuntimeEnv): Promise<void> {
	const coordinator = await getDigestAgent(env);
	const result = await coordinator.runDailyDigest({
		source: 'scheduled',
		dryRun: env.SCHEDULED_DRY_RUN === '1',
	});
	console.log(
		JSON.stringify({
			event: 'scheduled-digest-run',
			result,
		}),
	);
}
