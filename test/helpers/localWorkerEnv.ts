import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEV_VARS_PATH = resolve(process.cwd(), '.dev.vars');
const DEV_VARS_BACKUP_PATH = resolve(process.cwd(), '.dev.vars.codex-backup');
const COOKIE_FILE_PATH = resolve(process.cwd(), '.secrets/x-session-cookies.json');

export interface WorkerRuntimeSecrets {
	adminToken: string;
	openAiApiKey: string;
	xSessionCookies: string;
}

export async function loadRuntimeSecrets(): Promise<WorkerRuntimeSecrets | null> {
	const adminToken = process.env.ADMIN_TOKEN;
	const openAiApiKey = process.env.OPENAI_API_KEY;
	const xSessionCookies = await readCookieSource();

	if (!adminToken || !openAiApiKey || !xSessionCookies) {
		return null;
	}

	return {
		adminToken,
		openAiApiKey,
		xSessionCookies,
	};
}

export async function setupDevVars(vars: Record<string, string>): Promise<() => Promise<void>> {
	const hadExisting = await fileExists(DEV_VARS_PATH);
	if (hadExisting) {
		await rm(DEV_VARS_BACKUP_PATH, { force: true });
		await rename(DEV_VARS_PATH, DEV_VARS_BACKUP_PATH);
	}

	const content = Object.entries(vars)
		.map(([key, value]) => `${key}=${serializeValue(value)}`)
		.join('\n');
	await writeFile(DEV_VARS_PATH, `${content}\n`, 'utf8');

	return async () => {
		await rm(DEV_VARS_PATH, { force: true });
		if (hadExisting) {
			await rename(DEV_VARS_BACKUP_PATH, DEV_VARS_PATH);
		}
	};
}

function serializeValue(value: string): string {
	return value.replaceAll('\n', '');
}

async function readCookieSource(): Promise<string | null> {
	if (process.env.X_SESSION_COOKIES) {
		return process.env.X_SESSION_COOKIES;
	}

	if (!(await fileExists(COOKIE_FILE_PATH))) {
		return null;
	}

	const text = await readFile(COOKIE_FILE_PATH, 'utf8');
	const compact = text.trim();
	return compact.length > 0 ? compact : null;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
