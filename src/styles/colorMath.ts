/**
 * Colour maths for the palette guards (PLAN §3.2): WCAG 2.x contrast, Machado et al. (2009) colour-vision-deficiency
 * simulation at severity 1.0, and CIE76 ΔE in CIELAB (D65). Pure functions; used by tokens.test.ts.
 */

export type Rgb = readonly [number, number, number]; // sRGB channels 0..255
export type Cvd = 'protanopia' | 'deuteranopia' | 'tritanopia';
type Matrix = readonly [Rgb, Rgb, Rgb];

/** Machado, Oliveira & Fernandes (2009), severity 1.0; applied to linear RGB. */
export const MACHADO: Record<Cvd, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Parses `#rgb` or `#rrggbb`. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => {
  const c = Math.min(1, Math.max(0, l));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};
const linear = (rgb: Rgb) => rgb.map(toLinear) as unknown as Rgb;

/** WCAG 2.x relative luminance. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = linear(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio (1..21) between two hex colours. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(parseHex(a)), luminance(parseHex(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Simulates a colour-vision deficiency; `undefined` = normal vision. */
export function simulate(rgb: Rgb, cvd?: Cvd): Rgb {
  if (!cvd) return rgb;
  const lin = linear(rgb);
  return MACHADO[cvd].map((row) => toSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as unknown as Rgb;
}

/** sRGB -> CIELAB (D65 white). */
export function toLab(rgb: Rgb): Rgb {
  const [r, g, b] = linear(rgb);
  const xyz = [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883,
  ];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)) as [
    number,
    number,
    number,
  ];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two hex colours as seen with the given deficiency. */
export function deltaE(a: string, b: string, cvd?: Cvd): number {
  const [la, lb] = [toLab(simulate(parseHex(a), cvd)), toLab(simulate(parseHex(b), cvd))];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
