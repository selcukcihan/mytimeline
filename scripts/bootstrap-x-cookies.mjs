import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const OUT_PATH = resolve(process.cwd(), '.secrets/x-session-cookies.json');
const PROFILE_DIR = resolve(process.cwd(), '.secrets/x-bootstrap-profile');
const LOGIN_URL = 'https://x.com/i/flow/login';

async function main() {
	const context = await chromium.launchPersistentContext(PROFILE_DIR, {
		headless: false,
		channel: 'chrome',
		args: ['--disable-blink-features=AutomationControlled'],
		viewport: null,
	});

	try {
		const page = context.pages()[0] ?? (await context.newPage());
		await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

		printInstructions();
		await waitForUserConfirmation();

		const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
		if (cookies.length === 0) {
			throw new Error('No cookies captured. Make sure login completed before confirming.');
		}

		const sanitized = cookies.map((cookie) => ({
			name: cookie.name,
			value: cookie.value,
			domain: cookie.domain,
			path: cookie.path,
			expires: cookie.expires,
			httpOnly: cookie.httpOnly,
			secure: cookie.secure,
			sameSite: cookie.sameSite,
		}));

		await mkdir(dirname(OUT_PATH), { recursive: true });
		await writeFile(OUT_PATH, JSON.stringify(sanitized), 'utf8');

		console.log('');
		console.log(`Saved ${sanitized.length} cookies to: ${OUT_PATH}`);
		console.log('');
		console.log('Set Worker secret:');
		console.log(`cat ${OUT_PATH} | npx wrangler secret put X_SESSION_COOKIES`);
	} finally {
		await context.close();
	}
}

function printInstructions() {
	console.log('');
	console.log('Cookie bootstrap started.');
	console.log('1. Login to X/Twitter in the opened browser window.');
	console.log('2. Ensure you can see your home timeline.');
	console.log('3. Return here and press Enter to capture cookies.');
}

async function waitForUserConfirmation() {
	const rl = readline.createInterface({ input, output });
	try {
		await rl.question('Press Enter when timeline is fully loaded...');
	} finally {
		rl.close();
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Cookie bootstrap failed: ${message}`);
	process.exitCode = 1;
});
