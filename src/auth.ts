import type { RuntimeEnv } from './types';

export function isAuthorized(request: Request, env: RuntimeEnv): boolean {
	const adminToken = env.ADMIN_TOKEN;
	if (!adminToken) {
		return false;
	}
	return request.headers.get('x-admin-token') === adminToken;
}
