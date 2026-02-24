import { getDigestAgent } from '../agents/getDigestAgent';
import { isAuthorized } from '../auth';
import { getDailyDigest, listDigestDays } from '../db/readDigests';
import { getUnfilteredDay, listUnfilteredDays } from '../db/readUnfiltered';
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

	if (request.method === 'GET' && url.pathname === '/api/days') {
		const days = await listDigestDays(env, 90);
		return Response.json({ days });
	}

	if (request.method === 'GET' && url.pathname === '/api/unfiltered/days') {
		const days = await listUnfilteredDays(env, 90);
		return Response.json({ days });
	}

	if (request.method === 'GET' && url.pathname.startsWith('/api/day/')) {
		const day = url.pathname.replace('/api/day/', '').trim();
		const record = await getDailyDigest(env, day);
		if (!record) {
			return new Response('Not Found', { status: 404 });
		}
		return Response.json(record);
	}

	if (request.method === 'GET' && url.pathname.startsWith('/api/unfiltered/day/')) {
		const day = url.pathname.replace('/api/unfiltered/day/', '').trim();
		const record = await getUnfilteredDay(env, day);
		if (!record) {
			return new Response('Not Found', { status: 404 });
		}
		return Response.json(record);
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

	if (request.method === 'POST' && url.pathname === '/backfill') {
		if (!isAuthorized(request, env)) {
			return new Response('Unauthorized', { status: 401 });
		}
		const daysRaw = Number.parseInt(url.searchParams.get('days') || '3', 10);
		const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 3;
		const dryRun = url.searchParams.get('dryRun') === '1';
		const coordinator = await getDigestAgent(env);
		const result = await coordinator.backfillRecentDays({ source: 'manual', dryRun }, days);
		return Response.json(result);
	}

	if (request.method === 'GET' && env.ASSETS) {
		const assetResponse = await env.ASSETS.fetch(request);
		if (assetResponse.status !== 404) {
			return assetResponse;
		}

		// SPA fallback for day pages like /2026-02-20
		const indexRequest = new Request(new URL('/index.html', request.url).toString(), request);
		const indexResponse = await env.ASSETS.fetch(indexRequest);
		if (indexResponse.status !== 404) {
			return indexResponse;
		}
	}

	return new Response('Not Found', { status: 404 });
}
