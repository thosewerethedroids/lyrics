import { useEffect } from 'react';

/**
 * Holds a screen wake lock while `active`.
 *
 * This is the single most important line of defence against the app failing on stage: a phone
 * dimming and locking mid-song is the exact thing performance mode exists to prevent. The lock is
 * re-requested on every return to visibility, because the browser drops it whenever the tab is
 * hidden — switching apps to check a text and coming back would otherwise leave the screen free to
 * sleep again.
 *
 * `navigator.wakeLock` is absent on older iOS and on http origins; the app degrades to the OS
 * auto-lock timeout rather than erroring.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (!('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied (often because the tab is not focused). The visibility handler will retry.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
