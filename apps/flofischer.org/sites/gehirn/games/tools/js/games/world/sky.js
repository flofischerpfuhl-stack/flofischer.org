/**
 * The painted sky of the game scenes (baked, so it may be rich): a gradient, the sun with its halo or a cratered moon,
 * round stars of two sizes, the Frostpeak aurora and two layers of soft cloud banks lit from above. Drawn on a plane
 * that fills the view (uv 0..1; `aspect` = plane width / height, `res` = its height in pixels for the star size).
 */
import { THREE } from '../three-kit.js';

const SKY_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const SKY_FS = `
varying vec2 vUv;
uniform vec3 top, horizon, glow, cloudC, shadeC; uniform float kind, night, aspect, res;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
void main(){
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec3 c = mix(horizon, top, pow(smoothstep(.18, 1., vUv.y), .8));
  // sun (day) or moon (night), with a wide soft halo
  vec2 sp = vec2(.8 * aspect, .78); float d = length(p - sp);
  float disc = smoothstep(.034, .03, d);
  if (night > .5) {
    float crater = fbm((p - sp) * 60.) * .25;
    c = mix(c, vec3(.92, .94, 1.) * (1. - crater), disc) + vec3(.35, .45, .7) * .25 * exp(-d * 9.);
  } else {
    c += glow * (.6 * exp(-d * 10.) + .25 * exp(-d * 3.)) + glow * disc * 1.6;
  }
  // round stars of a few sizes (night, and faint at the Ember dusk)
  float starAmt = max(night, kind > 2.5 ? .55 : 0.);
  if (starAmt > 0.) {
    for (int l = 0; l < 2; l++) {
      float cell = l == 0 ? 34. : 13.;
      vec2 g = p * res / cell, id = floor(g), f = fract(g) - .5;
      float r = h21(id + float(l) * 7.);
      vec2 o = vec2(h21(id + 3.1), h21(id + 9.7)) - .5;
      float size = (l == 0 ? 2.2 : 1.1) * (.4 + r) / cell;
      float s = smoothstep(size, size * .2, length(f - o * .6)) * step(.55, r);
      c += vec3(1., .96, .88) * s * starAmt * smoothstep(.35, .75, vUv.y) * (l == 0 ? 1.2 : .7);
    }
  }
  if (kind > 1.5 && kind < 2.5) { // aurora ribbons
    float x = p.x;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float y0 = .78 + .05 * sin(x * (1.6 + fk * .4) + fk * 2.) + .02 * fbm(vec2(x * 3., fk));
      float band = exp(-pow((vUv.y - y0) * (18. + fk * 6.), 2.)) * (.55 + .45 * fbm(vec2(x * 7. + fk * 3., vUv.y * 5.)));
      float curtain = smoothstep(y0 - .12, y0, vUv.y) * smoothstep(y0 + .02, y0 - .02, vUv.y) * .5;
      c += mix(vec3(.2, .95, .7), vec3(.5, .4, 1.), fk * .45) * (band + curtain * .4) * (.35 + night * .6);
    }
  }
  // painted cloud banks: two layers, lit from above
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 q = vec2(p.x * (1.6 + fk * .8) + fk * 13., vUv.y * (5. + fk * 2.));
    float band = smoothstep(.0, .12, vUv.y - (.35 + fk * .2)) * smoothstep(.95, .55, vUv.y);
    float n = fbm(q) * band;
    float m = smoothstep(.42 - fk * .04, .62, n);
    float lit = smoothstep(.4, .75, fbm(q + vec2(0., .35)));
    vec3 cc = mix(cloudC, shadeC, lit * .7) * (1. - night * .55);
    c = mix(c, cc, m * (.85 - fk * .25));
  }
  gl_FragColor = vec4(c * (1. - night * .5), 1.);
}`;


/** sky: { top, horizon, glow, cloud, shade } colours; kind: world index (2 aurora, 3 dusk stars); night: 0/1. */
export function skyMaterial(sky, kind, night) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) }, horizon: { value: new THREE.Color(sky.horizon) }, glow: { value: new THREE.Color(sky.glow) },
      cloudC: { value: new THREE.Color(sky.cloud) }, shadeC: { value: new THREE.Color(sky.shade) },
      kind: { value: kind }, night: { value: night }, aspect: { value: 1 }, res: { value: 900 },
    },
  });
}
