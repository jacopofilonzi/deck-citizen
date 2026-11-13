/** "0.1.0.0" / "v0.1.0" -> [0, 1, 0] */
export function parseVersion(text: string): number[] | undefined {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

export function isNewer(candidate: string, current: string): boolean {
	const [a, b] = [parseVersion(candidate), parseVersion(current)];
	if (!a || !b) {
		return false;
	}
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) {
			return a[i]! > b[i]!;
		}
	}
	return false;
}
