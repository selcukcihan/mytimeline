import { Agent } from 'agents';
import { RUN_LOCK_TTL_MS } from '../constants';
import { executeDigest } from '../digest/executeDigest';
import type { DigestCoordinatorState, RunOptions, RunResult, RuntimeEnv } from '../types';

export class DigestCoordinator extends Agent<RuntimeEnv, DigestCoordinatorState> {
	initialState: DigestCoordinatorState = {
		runLockUntil: null,
		lastResult: null,
	};

	async runDailyDigest(options: RunOptions): Promise<RunResult> {
		if (this.state.runLockUntil !== null && this.state.runLockUntil > Date.now()) {
			return { status: 'skipped', reason: 'digest already running' };
		}

		this.setState({
			...this.state,
			runLockUntil: Date.now() + RUN_LOCK_TTL_MS,
		});

		try {
			const result = await executeDigest(this.env, options);
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
