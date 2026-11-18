/** Read-state commit order is independent of message IDs and gateway sequence. */
export function isReadStateVersion(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    (value.length < 19 || value <= '9223372036854775807');
}

/** Inputs are validated canonical decimal strings; never convert them to Number. */
export function compareReadStateVersions(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}
