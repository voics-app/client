export function parseVersion(text: string): [number, number, number];
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function publishedFromLatestYml(yml: string | null | undefined): string | null;
export function nextVersion(input: { base: string; published: string | null; tag?: string }): string;
