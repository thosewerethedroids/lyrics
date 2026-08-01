/**
 * A short vibration to confirm a drop or a page turn.
 *
 * `navigator.vibrate` is a no-op on iOS Safari, which is most of this app's use, so this is a
 * progressive enhancement rather than something to rely on — the visual snap animation carries the
 * feedback everywhere; the buzz is a bonus on Android.
 */
export function tick(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some engines throw on vibrate outside a user gesture. Never let feedback break the action.
  }
}
