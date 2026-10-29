/** Live Fernwork design tokens for the 3D hub: read from CSS at runtime, normalised to #rrggbb. */
export const TOKEN_NAMES = ['bg', 'surface-1', 'surface-2', 'border-subtle', 'border-strong', 'text-1', 'text-2', 'accent-fill', 'accent-fill-hover', 'accent-subtle-bg', 'accent-border', 'accent-on'];

let probe = null;
/** Resolve any CSS colour (hex, rgb(), rgba() with alpha, color-mix) to #rrggbb, composited over `over`. */
export function cssToHex(value, over = '#ffffff') {
  try {
    probe ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    probe.canvas.width = probe.canvas.height = 1;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = over; probe.fillRect(0, 0, 1, 1);
    probe.fillStyle = value; probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  } catch { return over; }
}

export function siteIsDark(media) {
  const set = document.documentElement.dataset.theme;
  return set ? set === 'dark' : media.matches;
}

/** Palette keyed by token name (without the leading dashes), plus `dark`. */
export function readPalette(media) {
  const style = getComputedStyle(document.documentElement), palette = { dark: siteIsDark(media) };
  const fallback = { bg: palette.dark ? '#0b0b0c' : '#ffffff', 'accent-fill': palette.dark ? '#22c55e' : '#15803d' };
  const bg = cssToHex(style.getPropertyValue('--bg').trim() || fallback.bg, fallback.bg);
  palette.bg = bg;
  for (const name of TOKEN_NAMES) {
    if (name === 'bg') continue;
    const raw = style.getPropertyValue('--' + name).trim();
    palette[name] = raw ? cssToHex(raw, bg) : (fallback[name] ?? bg);
  }
  return palette;
}

/** Linear blend of two #rrggbb colours. */
export function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
