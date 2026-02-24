import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDigestAgent: vi.fn(),
}));

vi.mock('../../../src/agents/getDigestAgent', () => ({
	getDigestAgent: mocks.getDigestAgent,
}));

import { handleScheduled } from '../../../src/handlers/scheduledHandler';

describe('handleScheduled', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('runs scheduled digest with dryRun from env flag', async () => {
		const runDailyDigest = vi.fn().mockResolvedValue({ status: 'dry-run' });
		mocks.getDigestAgent.mockResolvedValue({ runDailyDigest });
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		await handleScheduled({ SCHEDULED_DRY_RUN: '1' } as Env);

		expect(runDailyDigest).toHaveBeenCalledWith({ source: 'scheduled', dryRun: true });
		expect(logSpy).toHaveBeenCalledTimes(1);
		logSpy.mockRestore();
	});
});
