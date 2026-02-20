import { getAgentByName } from 'agents';
import { COORDINATOR_INSTANCE } from '../constants';
import type { DigestCoordinator } from '../durable-objects/DigestCoordinator';
import type { RuntimeEnv } from '../types';

export async function getDigestAgent(env: RuntimeEnv) {
	return getAgentByName<RuntimeEnv, DigestCoordinator>(env.DIGEST_COORDINATOR, COORDINATOR_INSTANCE);
}
