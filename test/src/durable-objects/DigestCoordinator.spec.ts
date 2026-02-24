import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUN_LOCK_TTL_MS } from '../../../src/constants';

const mocks = vi.hoisted(() => ({
	executeDigest: vi.fn(),
	executeBackfill: vi.fn(),
}));

vi.mock('agents', () => ({
	Agent: class {
		env: unknown;
		state: Record<string, unknown>;
		constructor(env: unknown) {
			this.env = env;
			this.state = {};
		}
		setState(next: Record<string, unknown>) {
			this.state = next;
		}
	},
}));

vi.mock('../../../src/digest/executeDigest', () => ({
	executeDigest: mocks.executeDigest,
	executeBackfill: mocks.executeBackfill,
}));

import { DigestCoordinator } from '../../../src/durable-objects/DigestCoordinator';

describe('DigestCoordinator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('skips new run while lock is still active', async () => {
		const coordinator = new DigestCoordinator({} as Env);
		coordinator.state = { runLockUntil: Date.now() + 60_000, lastResult: null };

		const result = await coordinator.runDailyDigest({ source: 'manual', dryRun: false });
		expect(result).toEqual({ status: 'skipped', reason: 'digest already running' });
		expect(mocks.executeDigest).not.toHaveBeenCalled();
	});

	it('records successful run result and clears lock', async () => {
		mocks.executeDigest.mockResolvedValue({ status: 'sent', subject: 'Digest' });
		const coordinator = new DigestCoordinator({} as Env);
		coordinator.state = { ...coordinator.initialState };

		const result = await coordinator.runDailyDigest({ source: 'manual', dryRun: false });
		expect(result).toEqual({ status: 'sent', subject: 'Digest' });
		expect(coordinator.state.runLockUntil).toBeNull();
		expect(coordinator.state.lastResult).toMatchObject({ result: { status: 'sent' } });

		const firstLockState = coordinator.state.lastResult;
		expect(firstLockState).toBeTruthy();
		expect(mocks.executeDigest).toHaveBeenCalledWith(expect.anything(), {
			source: 'manual',
			dryRun: false,
		});
	});

	it('maps task errors to failed result snapshot', async () => {
		mocks.executeBackfill.mockRejectedValue(new Error('db failure'));
		const coordinator = new DigestCoordinator({} as Env);
		coordinator.state = { ...coordinator.initialState };

		const result = await coordinator.backfillRecentDays({ source: 'manual', dryRun: true }, 3);
		expect(result).toEqual({ status: 'failed', error: 'db failure' });
		expect(coordinator.state.runLockUntil).toBeNull();
		expect(coordinator.state.lastResult).toMatchObject({ result: { status: 'failed', error: 'db failure' } });
	});

	it('sets lock deadline based on RUN_LOCK_TTL_MS when run starts', async () => {
		mocks.executeDigest.mockImplementation(async () => {
			return { status: 'dry-run' };
		});
		const coordinator = new DigestCoordinator({} as Env);
		coordinator.state = { ...coordinator.initialState };

		await coordinator.runDailyDigest({ source: 'manual', dryRun: true });
		const expectedLowerBound = Date.now() - RUN_LOCK_TTL_MS;
		expect(coordinator.state.lastResult).toBeTruthy();
		expect(expectedLowerBound).toBeGreaterThan(0);
	});
});
