import { describe, expect, it } from 'vitest';
import { parseCookieList, parsePositiveInt, parseTopics } from '../../src/parsers';

describe('parseTopics', () => {
	it('returns lowercase trimmed topics and drops empty tokens', () => {
		expect(parseTopics(' Cloud Services,AI-assisted development, , DevTools ')).toEqual([
			'cloud services',
			'ai-assisted development',
			'devtools',
		]);
	});

	it('returns empty list for missing input', () => {
		expect(parseTopics(undefined)).toEqual([]);
	});
});

describe('parsePositiveInt', () => {
	it('uses parsed integer when value is positive', () => {
		expect(parsePositiveInt('42', 7)).toBe(42);
	});

	it('falls back for invalid or non-positive values', () => {
		expect(parsePositiveInt(undefined, 7)).toBe(7);
		expect(parsePositiveInt('abc', 7)).toBe(7);
		expect(parsePositiveInt('0', 7)).toBe(7);
		expect(parsePositiveInt('-3', 7)).toBe(7);
	});
});

describe('parseCookieList', () => {
	it('parses direct json array and keeps object entries only', () => {
		const input = JSON.stringify([{ name: 'auth_token' }, null, 'x', { name: 'ct0' }]);
		expect(parseCookieList(input)).toEqual([{ name: 'auth_token' }, { name: 'ct0' }]);
	});

	it('parses nested json array string payload', () => {
		const nested = JSON.stringify(JSON.stringify([{ name: 'auth_token' }, { name: 'ct0' }]));
		expect(parseCookieList(nested)).toEqual([{ name: 'auth_token' }, { name: 'ct0' }]);
	});

	it('returns empty list for invalid payloads', () => {
		expect(parseCookieList(undefined)).toEqual([]);
		expect(parseCookieList('not json')).toEqual([]);
		expect(parseCookieList(JSON.stringify({ name: 'auth_token' }))).toEqual([]);
	});
});
