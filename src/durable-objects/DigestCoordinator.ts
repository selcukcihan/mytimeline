import { Agent } from 'agents';
import { RUN_LOCK_TTL_MS } from '../constants';
import { executeBackfill, executeDigest } from '../digest/executeDigest';
import type { DigestCoordinatorState, RunOptions, RunResult, RuntimeEnv } from '../types';

export class DigestCoordinator extends Agent<RuntimeEnv, DigestCoordinatorState> {
	initialState: DigestCoordinatorState = {
		runLockUntil: null,
		lastResult: null,
	};

	async runDailyDigest(options: RunOptions): Promise<RunResult> {
		return this.runLocked(() => executeDigest(this.env, options));
	}

	async backfillRecentDays(options: RunOptions, days: number): Promise<RunResult> {
		return this.runLocked(() => executeBackfill(this.env, options, days));
	}

	private async runLocked(task: () => Promise<RunResult>): Promise<RunResult> {
		if (this.state.runLockUntil !== null && this.state.runLockUntil > Date.now()) {
			return { status: 'skipped', reason: 'digest already running' };
		}

		this.setState({
			...this.state,
			runLockUntil: Date.now() + RUN_LOCK_TTL_MS,
		});

		try {
			const result = await task();
			this.setState({
				...this.state,
				runLockUntil: null,
				lastResult: {
					at: new Date().toISOString(),
					result,
				},
			});
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.setState({
				...this.state,
				runLockUntil: null,
				lastResult: {
					at: new Date().toISOString(),
					result: { status: 'failed', error: message } satisfies RunResult,
				},
			});
			return { status: 'failed', error: message };
		}
	}

	async getLastResult() {
		return this.state.lastResult;
	}
}
