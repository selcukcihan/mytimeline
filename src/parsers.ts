export function parseTopics(input: string | undefined): string[] {
	if (!input) {
		return [];
	}

	return input
		.split(',')
		.map((topic) => topic.trim().toLowerCase())
		.filter(Boolean);
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
	if (!raw) {
		return fallback;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export function parseCookieList(rawJson: string | undefined): Array<Record<string, unknown>> {
	if (!rawJson) {
		return [];
	}

	try {
		const parsed = JSON.parse(rawJson);
		if (typeof parsed === 'string') {
			const nested = JSON.parse(parsed);
			if (!Array.isArray(nested)) {
				return [];
			}
			return nested.filter((item) => typeof item === 'object' && item !== null);
		}
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item) => typeof item === 'object' && item !== null);
	} catch {
		return [];
	}
}
