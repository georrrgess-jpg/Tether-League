/** Tiny DOM helpers: the UI is plain accessible HTML, no framework. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Inline SVG icons (original, stroke-based). */
const ICONS: Record<string, string> = {
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  club: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.5 19c.6-3.2 2.8-5 5.5-5s4.900 1.800 5.500 5M14.500 14.500c2.800-.6 5.800 1 6.500 4.500"/>',
  garage: '<path d="M14.500 6.200a4.200 4.200 0 0 0-5.600 5.200L3.500 16.800a1.900 1.900 0 0 0 2.700 2.700l5.400-5.400a4.200 4.200 0 0 0 5.200-5.600l-2.700 2.700-2.300-.6-.6-2.300z"/>',
  academy: '<path d="M2.500 9.500 12 5l9.500 4.500L12 14z"/><path d="M6.500 12v4.500c1.500 1.500 3.500 2.200 5.500 2.200s4-.7 5.500-2.200V12M21.500 9.500v5.500"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.800v2.700M12 18.500v2.700M4.400 6l2.200 1.600M17.400 16.400l2.200 1.600M4.400 18l2.200-1.600M17.400 7.600 19.600 6M2.800 12h2.700M18.500 12h2.700"/>',
  trophy: '<path d="M7.500 4h9v5a4.500 4.500 0 0 1-9 0zM7.500 6H4.500c0 3 1.500 4.500 3.500 4.800M16.500 6h3c0 3-1.500 4.500-3.500 4.800M12 13.500V17M8.500 20h7M9.500 17h5v3h-5z"/>',
  coin: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.200l1.400 3 3.200.4-2.300 2.200.6 3.200-2.900-1.600-2.900 1.600.6-3.200-2.300-2.200 3.200-.4z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5.500" y="10.500" width="13" height="9.500" rx="2"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/>',
  check: '<path d="M4.500 12.500l5 5 10-11"/>',
  back: '<path d="M14.500 5l-7 7 7 7"/>',
  next: '<path d="M9.500 5l7 7-7 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  ball: '<circle cx="12" cy="12" r="8.500"/><path d="M12 8l3.500 2.600-1.300 4.100H9.800l-1.300-4.100zM12 3.500V8M20 10l-4.500.6M17 19l-2.800-4.300M7 19l2.800-4.300M4 10l4.500.6"/>',
  assist: '<circle cx="6" cy="17.500" r="2.500"/><circle cx="18" cy="6.500" r="2.500"/><path d="M8 15.500l8-7"/>',
  save: '<path d="M12 3.500l7.500 3v5.500c0 4.500-3.200 7.300-7.500 8.500-4.300-1.200-7.500-4-7.500-8.500V6.500z"/>',
  pass: '<path d="M4 12h13M12.500 6.500 18 12l-5.500 5.500"/>',
  swing: '<circle cx="18" cy="5" r="2"/><path d="M16.500 6.500 9 14M4 12a8 8 0 0 0 9 8"/><circle cx="8" cy="15" r="2.200"/>',
  intercept: '<path d="M4 4l16 16M20 4 4 20"/>',
  target: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13.500" r="7.500"/><path d="M12 9.500v4l2.500 2M9.500 3h5"/>',
  star: '<path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.900l-5.200 2.700 1-5.800L3.500 9.700l5.900-.8z"/>',
  edit: '<path d="M4.500 19.500l1-4L16 5l3 3L8.500 18.500zM14 7l3 3"/>',
  sound: '<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5"/>',
  info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500M12 7.500v.5"/>',
  retry: '<path d="M5 12a7 7 0 1 0 2.200-5.100M5 4.500V8h3.500"/>',
  home: '<path d="M4 11.500 12 4.500l8 7M6.500 10v9.500h11V10"/>',
  calendar: '<rect x="4" y="5.500" width="16" height="14" rx="2"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>',
  shirt: '<path d="M8.500 4 3.500 7l2 4 2.500-1.200V20h8V9.800L18.500 11l2-4-5-3c-.5 1.600-1.900 2.500-3.500 2.500S9 5.600 8.500 4z"/>',
  face: '<rect x="3.500" y="6.500" width="17" height="11" rx="4"/><path d="M8.500 10.500v3M15.500 10.500v3"/>',
  trail: '<path d="M3.500 17.500c5 0 6-9 11-9M3.500 13.500c3 0 4.500-3.500 7-5"/><circle cx="17.500" cy="8" r="2.500"/>',
  palette: '<path d="M12 3.500a8.500 8.500 0 1 0 0 17c1.500 0 2-1 2-2s-.6-1.500-.6-2.500 1-2 2.500-2h1.600c1.700 0 3-1.300 3-3 0-4.200-3.800-7.500-8.500-7.500z"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="7.500" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/>',
  party: '<path d="M4 20l4.500-12 7.500 7.500zM14 4v2.500M18.500 5.500 17 7.500M20 11h-2.500"/>',
  gift: '<rect x="4" y="9.500" width="16" height="10.500" rx="1.500"/><path d="M4 13.500h16M12 9.500V20M12 9.500c-1-3-5.500-3.500-5 0M12 9.500c1-3 5.500-3.500 5 0"/>',
};

export function icon(name: string, cls = ''): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return wrap.firstChild as SVGSVGElement;
}
