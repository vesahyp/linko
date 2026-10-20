/**
 * The safe area (the notch, the home bar) in css px. CSS reads it as
 * --safe-t/r/b/l (styles.css); the renderer reads the same values here, so
 * the HUD and the play area agree. `?safe=l,r,t,b` stands in for a notch in a
 * browser that has none, such as Playwright's emulated iPhone: the
 * screenshots then show what the safe area does on a real one.
 */
const asked = new URLSearchParams(location.search).get('safe');
if (asked) {
  const [l, r, t, b] = asked.split(',').map((v) => Number(v) || 0);
  const st = document.documentElement.style;
  st.setProperty('--safe-l', `${l}px`);
  st.setProperty('--safe-r', `${r}px`);
  st.setProperty('--safe-t', `${t}px`);
  st.setProperty('--safe-b', `${b}px`);
}

export function readInsets(): { l: number; r: number; t: number; b: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const o = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return o;
}

/** Running from the home screen, with no browser around it. */
export function standalone(): boolean {
  return window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** An iPhone or iPod in Safari: no fullscreen for pages, so the home screen is the way. */
export function iPhoneSafari(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent) && !standalone();
}

/**
 * Ask for fullscreen and landscape where the browser allows it (Android
 * Chrome, iPad Safari). iPhone Safari has no fullscreen for pages; there the
 * call does nothing and the home-screen install is the route.
 */
export function goFullscreen(): void {
  if (standalone()) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const p = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
    void Promise.resolve(p)
      .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
      .catch(() => {});
  } catch {
    /* not offered here */
  }
}
