import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOptionalWorkerVars, loadRuntimeSecrets, setupDevVars } from './helpers/localWorkerEnv';

const runtimeSecrets = await loadRuntimeSecrets();
const maybeDescribe = runtimeSecrets ? describe : describe.skip;

const TEST_PORT = 8791;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'scheduler-inspection');

let devServer: ChildProcessWithoutNullStreams | null = null;
let cleanupDevVars: (() => Promise<void>) | null = null;

maybeDescribe('e2e scheduler inspection', () => {
	beforeAll(async () => {
		cleanupDevVars = await setupDevVars({
			OPENAI_API_KEY: runtimeSecrets!.openAiApiKey,
			ADMIN_TOKEN: runtimeSecrets!.adminToken,
			X_SESSION_COOKIES: runtimeSecrets!.xSessionCookies,
			SCHEDULED_DRY_RUN: '1',
			...getOptionalWorkerVars(),
		});

		devServer = spawn(
			'npx',
			['wrangler', 'dev', '--test-scheduled', '--port', String(TEST_PORT), '--log-level', 'error'],
			{
				cwd: process.cwd(),
				env: process.env,
				stdio: 'pipe',
			},
		);

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
		'triggers scheduler and writes a markdown inspection artifact',
		{ timeout: 180_000 },
		async () => {
			const scheduledResponse = await fetch(`${BASE_URL}/__scheduled`);
			expect(scheduledResponse.ok).toBe(true);

			const lastRunResponse = await fetch(`${BASE_URL}/last-run`, {
				headers: {
					'x-admin-token': runtimeSecrets!.adminToken,
				},
			});
			expect(lastRunResponse.ok).toBe(true);
			const payload = (await lastRunResponse.json()) as unknown;

			await mkdir(ARTIFACT_DIR, { recursive: true });
			const filename = `scheduler-run-${new Date().toISOString().replaceAll(':', '-')}.md`;
			const outputPath = join(ARTIFACT_DIR, filename);
			await writeFile(outputPath, renderMarkdown(payload), 'utf8');

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
			// Keep polling until timeout.
		}

		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error('Timed out waiting for wrangler dev health endpoint.');
		}
		await sleep(500);
	}
}

function renderMarkdown(payload: unknown): string {
	return [
		'# Scheduler Inspection Report',
		'',
		`Generated at: ${new Date().toISOString()}`,
		'',
		'## Last Run Payload',
		'',
		'```json',
		JSON.stringify(payload, null, 2),
		'```',
		'',
	].join('\n');
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
