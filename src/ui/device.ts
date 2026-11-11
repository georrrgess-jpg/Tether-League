/**
 * Phone and tablet helpers: screen wake lock during play, fullscreen where the browser allows it,
 * and short vibrations for touch feedback. Every call is guarded: these APIs are missing on some
 * browsers and can be refused inside embedded frames, and the game must work the same without them.
 */

type WakeSentinel = { released: boolean; release(): Promise<void>; addEventListener?(type: 'release', fn: () => void): void };
type WakeNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> } };

let sentinel: WakeSentinel | null = null;
let wanted = false;
let pending = false;
let visHooked = false;

async function acquire(): Promise<void> {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as WakeNavigator | null;
  if (!wanted || pending || (sentinel && !sentinel.released) || !nav?.wakeLock || document.hidden) return;
  pending = true;
  try {
    const s = await nav.wakeLock.request('screen');
    if (!wanted) {
      void s.release().catch(() => {});
    } else {
      sentinel = s;
      s.addEventListener?.('release', () => {
        if (sentinel === s) sentinel = null;
      });
    }
  } catch {
    // Refused (permissions policy in a frame, battery saver, not visible): play on without it.
  } finally {
    pending = false;
  }
}

/** Keeps the screen awake while a match is being played (the lock is dropped by the browser when hidden). */
export const screenWake = {
  hold(): void {
    wanted = true;
    if (!visHooked && typeof document !== 'undefined') {
      visHooked = true;
      // The browser releases the lock when the page is hidden; take it again on return if still wanted.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void acquire();
      });
    }
    void acquire();
  },
  release(): void {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) void s.release().catch(() => {});
  },
};

type FsDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** True when this page may go fullscreen (false on iPhone Safari and in frames without permission). */
export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Enters or leaves fullscreen. Resolves to the new state; a refusal leaves things as they were. */
export async function toggleFullscreen(): Promise<boolean> {
  const d = document as FsDocument;
  try {
    if (isFullscreen()) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else await d.webkitExitFullscreen?.();
    } else {
      const el = document.documentElement as FsElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    }
  } catch {
    /* refused: stay as we are */
  }
  return isFullscreen();
}

/** True when the device can vibrate (Android browsers; not iOS). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** A short buzz for touch feedback. Silently does nothing where unsupported or blocked. */
export function buzz(ms: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* blocked in this frame */
  }
}
