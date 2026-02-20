import { getDigestAgent } from '../agents/getDigestAgent';
import { isAuthorized } from '../auth';
import type { RuntimeEnv } from '../types';

export async function handleFetch(request: Request, env: RuntimeEnv): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === 'GET' && url.pathname === '/health') {
		return Response.json({
			ok: true,
			service: 'timeline-digest-worker',
			now: new Date().toISOString(),
		});
	}

	if (request.method === 'GET' && url.pathname === '/last-run') {
		if (!isAuthorized(request, env)) {
			return new Response('Unauthorized', { status: 401 });
		}
		const coordinator = await getDigestAgent(env);
		const last = await coordinator.getLastResult();
		return Response.json(last ?? { status: 'never-run' });
	}

	if (request.method === 'POST' && url.pathname === '/run') {
		if (!isAuthorized(request, env)) {
			return new Response('Unauthorized', { status: 401 });
		}

		const dryRun = url.searchParams.get('dryRun') === '1';
		const coordinator = await getDigestAgent(env);
		const result = await coordinator.runDailyDigest({ source: 'manual', dryRun });
		return Response.json(result);
	}

	return new Response('Not Found', { status: 404 });
}
