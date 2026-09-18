// Lightweight deterministic value-noise generator (no external deps).
// Good enough for rolling island terrain height + placement scattering.

export class Noise2D {
  constructor(seed = 1337) {
    this.seed = seed;
    this._perm = new Uint8Array(512);
    let s = seed >>> 0;
    const rand = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this._perm[i] = p[i & 255];
  }

  static _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static _lerp(a, b, t) { return a + t * (b - a); }
  static _grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  get(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = Noise2D._fade(xf);
    const v = Noise2D._fade(yf);
    const p = this._perm;
    const aa = p[X + p[Y]];
    const ab = p[X + p[Y + 1]];
    const ba = p[X + 1 + p[Y]];
    const bb = p[X + 1 + p[Y + 1]];
    const x1 = Noise2D._lerp(Noise2D._grad(aa, xf, yf), Noise2D._grad(ba, xf - 1, yf), u);
    const x2 = Noise2D._lerp(Noise2D._grad(ab, xf, yf - 1), Noise2D._grad(bb, xf - 1, yf - 1), u);
    return Noise2D._lerp(x1, x2, v);
  }

  // Fractal Brownian Motion for more natural rolling hills
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.get(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
