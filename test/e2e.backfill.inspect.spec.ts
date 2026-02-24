import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRuntimeSecrets, setupDevVars } from './helpers/localWorkerEnv';

const runtimeSecrets = await loadRuntimeSecrets();
const maybeDescribe = runtimeSecrets ? describe : describe.skip;

const TEST_PORT = 8793;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'backfill-inspection');

let devServer: ChildProcessWithoutNullStreams | null = null;
let cleanupDevVars: (() => Promise<void>) | null = null;

maybeDescribe('e2e backfill inspection', () => {
	beforeAll(async () => {
		cleanupDevVars = await setupDevVars({
			OPENAI_API_KEY: runtimeSecrets!.openAiApiKey,
			ADMIN_TOKEN: runtimeSecrets!.adminToken,
			X_SESSION_COOKIES: runtimeSecrets!.xSessionCookies,
			SCHEDULED_DRY_RUN: '1',
			PERSIST_DRY_RUN: '1',
			TARGET_TWEET_COUNT: '220',
			SCROLL_PASSES: '45',
		});

		devServer = spawn('npx', ['wrangler', 'dev', '--port', String(TEST_PORT), '--log-level', 'error'], {
			cwd: process.cwd(),
			env: process.env,
			stdio: 'pipe',
		});

		await waitForHealth();
	}, 90_000);

	afterAll(async () => {
		if (devServer) {
			devServer.kill('SIGTERM');
			devServer = null;
		}
		if (cleanupDevVars) {
			await cleanupDevVars();
			cleanupDevVars = null;
		}
	});

	it(
		'runs 3-day backfill and writes inspection artifact',
		{ timeout: 360_000 },
		async () => {
			const response = await fetch(`${BASE_URL}/backfill?days=3&dryRun=1`, {
				method: 'POST',
				headers: {
					'x-admin-token': runtimeSecrets!.adminToken,
				},
			});
			expect(response.ok).toBe(true);
			const payload = (await response.json()) as unknown;

			const daysResponse = await fetch(`${BASE_URL}/api/days`);
			expect(daysResponse.ok).toBe(true);
			const dayPayload = (await daysResponse.json()) as unknown;

			await mkdir(ARTIFACT_DIR, { recursive: true });
			const filename = `backfill-run-${new Date().toISOString().replaceAll(':', '-')}.md`;
			const path = join(ARTIFACT_DIR, filename);
			await writeFile(path, renderMarkdown(payload, dayPayload), 'utf8');

			expect(typeof payload).toBe('object');
		},
	);
});

async function waitForHealth(): Promise<void> {
	const timeoutMs = 60_000;
	const startedAt = Date.now();
	for (;;) {
		try {
			const response = await fetch(`${BASE_URL}/health`);
			if (response.ok) {
				return;
			}
		} catch {
			// retry
		}
		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error('Timed out waiting for wrangler dev health endpoint.');
		}
		await sleep(500);
	}
}

function renderMarkdown(backfillPayload: unknown, daysPayload: unknown): string {
	return [
		'# Backfill Inspection Report',
		'',
		`Generated at: ${new Date().toISOString()}`,
		'',
		'## POST /backfill?days=3&dryRun=1 Payload',
		'',
		'```json',
		JSON.stringify(backfillPayload, null, 2),
		'```',
		'',
		'## GET /api/days Payload',
		'',
		'```json',
		JSON.stringify(daysPayload, null, 2),
		'```',
		'',
	].join('\n');
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
