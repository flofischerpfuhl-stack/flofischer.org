/** One throw-away WebGL context per page answers both "is there WebGL" and "which renderer": it is created once and released at once. */
let probe = null;
export function glProbe() {
  if (probe) return probe;
  probe = { ok: false, renderer: '' };
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (gl) {
      probe.ok = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      probe.renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* no WebGL */ }
  return probe;
}
