// Inline SVG icons (24x24 viewBox, currentColor) so they stay crisp at any size.

const P: Record<string, string> = {
  pause: `<rect x="6" y="4.5" width="4" height="15" rx="1.4"/><rect x="14" y="4.5" width="4" height="15" rx="1.4"/>`,
  play: `<path d="M8 4.8v14.4c0 .8.9 1.3 1.6.8l10.6-7.2c.6-.4.6-1.3 0-1.7L9.6 4c-.7-.5-1.6 0-1.6.8z"/>`,
  back: `<path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  home: `<path d="M12 3.2 2.8 11h2.7v8.3c0 .7.6 1.2 1.2 1.2h3.5v-5.6h3.6v5.6h3.5c.7 0 1.2-.5 1.2-1.2V11h2.7z"/>`,
  retry: `<path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M20.5 3.5v6.2h-6.2z"/>`,
  gear: `<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.6 4.9-1.9-.4a6.9 6.9 0 0 1-.6 1.5l1.1 1.6a1 1 0 0 1-.1 1.3l-1.2 1.2a1 1 0 0 1-1.3.1l-1.6-1.1c-.5.3-1 .5-1.5.6l-.4 1.9a1 1 0 0 1-1 .8h-1.7a1 1 0 0 1-1-.8l-.4-1.9a6.9 6.9 0 0 1-1.5-.6l-1.6 1.1a1 1 0 0 1-1.3-.1l-1.2-1.2a1 1 0 0 1-.1-1.3l1.1-1.6a6.9 6.9 0 0 1-.6-1.5l-1.9-.4a1 1 0 0 1-.8-1v-1.7c0-.5.3-.9.8-1l1.9-.4c.1-.5.4-1 .6-1.5L4.4 7.1a1 1 0 0 1 .1-1.3l1.2-1.2a1 1 0 0 1 1.3-.1l1.6 1.1c.5-.3 1-.5 1.5-.6l.4-1.9a1 1 0 0 1 1-.8h1.7c.5 0 .9.3 1 .8l.4 1.9c.5.1 1 .4 1.5.6l1.6-1.1a1 1 0 0 1 1.3.1l1.2 1.2a1 1 0 0 1 .1 1.3l-1.1 1.6c.3.5.5 1 .6 1.5l1.9.4c.5.1.8.5.8 1v1.7c0 .5-.3.9-.8 1z"/>`,
  music: `<path d="M9 18V5.6l11-2.6v12.6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><circle cx="6.2" cy="18" r="3"/><circle cx="17.2" cy="15.6" r="3"/>`,
  sound: `<path d="M3 9.5v5c0 .6.4 1 1 1h3l4.4 3.9c.6.5 1.6.1 1.6-.7V5.3c0-.8-1-1.2-1.6-.7L7 8.5H4c-.6 0-1 .4-1 1z"/><path d="M16.2 8.5a5 5 0 0 1 0 7M18.8 5.8a8.8 8.8 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  vibrate: `<rect x="7.5" y="3" width="9" height="18" rx="2.2"/><rect x="9.5" y="5.6" width="5" height="11.2" rx=".8" fill="rgba(0,0,0,.35)"/><path d="M4.3 8.5v7M1.8 10v4M19.7 8.5v7M22.2 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  face: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="8.8" cy="10.3" r="1.5"/><circle cx="15.2" cy="10.3" r="1.5"/><path d="M8.2 14.2a4.6 4.6 0 0 0 7.6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  guide: `<path d="M12 2.5v2.4M12 7.4v2.4M12 12.3v2.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18.6" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>`,
  trophy: `<path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.2c0 3 1.2 4.5 3.3 4.8M17 5.5h2.8c0 3-1.2 4.5-3.3 4.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.8 13.4h2.4v3.4h-2.4z"/><rect x="7.6" y="16.6" width="8.8" height="3.4" rx="1"/>`,
  flame: `<path d="M12.2 2.4c.4 3-2.3 4.7-3.8 6.7A7.3 7.3 0 0 0 12 21.6a7 7 0 0 0 7-7c0-3.1-1.8-4.7-2.8-6.2-.3 1.5-1 2.5-2 3 .4-3.1-.6-6.6-2-9z"/>`,
  planet: `<circle cx="12" cy="12" r="5.6"/><ellipse cx="12" cy="12" rx="10.3" ry="3.4" transform="rotate(-20 12 12)" fill="none" stroke="currentColor" stroke-width="1.9"/>`,
  blackhole: `<path d="M12 3.5a8.5 8.5 0 0 1 8.4 7.2M20.5 12a8.5 8.5 0 0 1-7.2 8.4M12 20.5a8.5 8.5 0 0 1-8.4-7.2M3.5 12a8.5 8.5 0 0 1 7.2-8.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M12 7.2a4.8 4.8 0 0 1 4.8 4.8M12 16.8A4.8 4.8 0 0 1 7.2 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4"/>`,
  shake: `<rect x="7" y="7" width="10" height="10" rx="2.6"/><path d="M3.2 8.2a8.6 8.6 0 0 0 0 7.6M20.8 8.2a8.6 8.6 0 0 1 0 7.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  star: `<path d="m12 2.8 2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.8 6.4 20l1.3-6.3L2.9 9.4l6.4-.7z"/>`,
};

export function icon(name: string, cls = "icon"): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${P[name] ?? ""}</svg>`;
}
