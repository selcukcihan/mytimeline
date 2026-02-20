import { EmailMessage } from 'cloudflare:email';
import type { DigestEmail, RuntimeEnv } from '../types';

export async function sendDigestEmail(env: RuntimeEnv, email: DigestEmail): Promise<void> {
	const sender = env.DIGEST_SENDER;
	const recipient = env.DIGEST_RECIPIENT;
	if (!sender || !recipient) {
		throw new Error('DIGEST_SENDER and DIGEST_RECIPIENT must be configured.');
	}

	const raw = buildRawEmail(sender, recipient, email.subject, email.plain);
	const message = new EmailMessage(sender, recipient, raw);
	await env.DIGEST_EMAIL.send(message);
}

function buildRawEmail(sender: string, recipient: string, subject: string, body: string): string {
	return [
		`From: <${sender}>`,
		`To: <${recipient}>`,
		`Subject: ${subject}`,
		`Date: ${new Date().toUTCString()}`,
		'Content-Type: text/plain; charset=UTF-8',
		'MIME-Version: 1.0',
		'',
		body,
	].join('\r\n');
}
