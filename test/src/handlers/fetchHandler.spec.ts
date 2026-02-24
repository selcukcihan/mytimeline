import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDigestAgent: vi.fn(),
	isAuthorized: vi.fn(),
	listDigestDays: vi.fn(),
	getDailyDigest: vi.fn(),
	listUnfilteredDays: vi.fn(),
	getUnfilteredDay: vi.fn(),
}));

vi.mock('../../../src/agents/getDigestAgent', () => ({
	getDigestAgent: mocks.getDigestAgent,
}));
vi.mock('../../../src/auth', () => ({
	isAuthorized: mocks.isAuthorized,
}));
vi.mock('../../../src/db/readDigests', () => ({
	listDigestDays: mocks.listDigestDays,
	getDailyDigest: mocks.getDailyDigest,
}));
vi.mock('../../../src/db/readUnfiltered', () => ({
	listUnfilteredDays: mocks.listUnfilteredDays,
	getUnfilteredDay: mocks.getUnfilteredDay,
}));

import { handleFetch } from '../../../src/handlers/fetchHandler';

describe('handleFetch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isAuthorized.mockReturnValue(true);
		mocks.listDigestDays.mockResolvedValue([]);
		mocks.listUnfilteredDays.mockResolvedValue([]);
	});

	it('returns health payload for /health', async () => {
		const response = await handleFetch(new Request('https://example.com/health'), {} as Env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; service: string };
		expect(body.ok).toBe(true);
		expect(body.service).toBe('timeline-digest-worker');
	});

	it('returns digest days for /api/days', async () => {
		mocks.listDigestDays.mockResolvedValue(['2026-02-24', '2026-02-23']);

		const response = await handleFetch(new Request('https://example.com/api/days'), {} as Env);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ days: ['2026-02-24', '2026-02-23'] });
		expect(mocks.listDigestDays).toHaveBeenCalledWith(expect.anything(), 90);
	});

	it('returns unfiltered day payload for /api/unfiltered/day/:day', async () => {
		mocks.getUnfilteredDay.mockResolvedValue({ day: '2026-02-24', highlights: [] });

		const response = await handleFetch(
			new Request('https://example.com/api/unfiltered/day/2026-02-24'),
			{} as Env,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ day: '2026-02-24', highlights: [] });
	});

	it('enforces authorization for protected endpoint', async () => {
		mocks.isAuthorized.mockReturnValue(false);

		const response = await handleFetch(new Request('https://example.com/last-run'), {} as Env);
		expect(response.status).toBe(401);
	});

	it('invokes coordinator for POST /backfill with parsed days and dryRun flag', async () => {
		const coordinator = {
			backfillRecentDays: vi.fn().mockResolvedValue({ status: 'sent' }),
			runDailyDigest: vi.fn(),
			getLastResult: vi.fn(),
		};
		mocks.getDigestAgent.mockResolvedValue(coordinator);

		const response = await handleFetch(
			new Request('https://example.com/backfill?days=5&dryRun=1', { method: 'POST' }),
			{} as Env,
		);

		expect(response.status).toBe(200);
		expect(coordinator.backfillRecentDays).toHaveBeenCalledWith({ source: 'manual', dryRun: true }, 5);
		expect(await response.json()).toEqual({ status: 'sent' });
	});

	it('falls back to ASSETS index.html for SPA route misses', async () => {
		const assets = {
			fetch: vi
				.fn()
				.mockResolvedValueOnce(new Response('missing', { status: 404 }))
				.mockResolvedValueOnce(new Response('index content', { status: 200 })),
		};

		const response = await handleFetch(new Request('https://example.com/2026-02-24'), {
			ASSETS: assets,
		} as Env);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('index content');
		expect(assets.fetch).toHaveBeenCalledTimes(2);
	});
});
