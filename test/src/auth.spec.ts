import { describe, expect, it } from 'vitest';
import { isAuthorized } from '../../src/auth';

describe('isAuthorized', () => {
	it('authorizes when request token matches admin token', () => {
		const request = new Request('https://example.com/run', {
			headers: { 'x-admin-token': 'secret' },
		});

		expect(isAuthorized(request, { ADMIN_TOKEN: 'secret' } as Env)).toBe(true);
	});

	it('rejects when token is missing or mismatched', () => {
		const request = new Request('https://example.com/run', {
			headers: { 'x-admin-token': 'wrong' },
		});

		expect(isAuthorized(request, { ADMIN_TOKEN: 'secret' } as Env)).toBe(false);
		expect(isAuthorized(request, {} as Env)).toBe(false);
	});
});
