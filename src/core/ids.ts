/** Identifier and clock helpers. Kept in one place so tests can stub them. */

/**
 * A v4 UUID.
 *
 * `crypto.randomUUID` is unavailable on pages served over plain HTTP, which is exactly how the
 * dev server is reached from a phone on the LAN — so the fallback is not theoretical.
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** ISO-8601 with milliseconds, always UTC. The only timestamp format written to storage. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Later of two ISO timestamps. Undefined sorts before everything. */
export function laterIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
