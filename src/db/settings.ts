import { db } from './db';
import { uuid } from '../core/ids';

/**
 * Key/value settings.
 *
 * These live in IndexedDB rather than `localStorage` for one reason that matters: the sync token
 * goes in here too, and `localStorage` is readable by any script on the origin and is exposed to
 * more of the platform's tooling. It is also synchronous, which blocks the main thread on a phone.
 */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

const DEVICE_ID_KEY = 'deviceId';

let cachedDeviceId: string | null = null;

/**
 * A stable identifier for this browser profile.
 *
 * Minted once and kept forever. It is never sent anywhere except into the records this device
 * writes, where its only job is to let the conflict chooser say "your iPad" instead of "version B".
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await getSetting<string | null>(DEVICE_ID_KEY, null);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const minted = uuid();
  await setSetting(DEVICE_ID_KEY, minted);
  cachedDeviceId = minted;
  return minted;
}

/** A human-facing name for this device, editable in settings. */
export async function getDeviceName(): Promise<string> {
  return getSetting<string>('deviceName', guessDeviceName());
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  return 'This device';
}
