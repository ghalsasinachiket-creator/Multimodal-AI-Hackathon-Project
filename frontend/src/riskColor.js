// Map a probability (0..1) to a colour: green (low risk) -> yellow -> red (high risk).
// Hue 120 = green, 60 = yellow, 0 = red, so we simply slide the hue down as risk rises.
export function riskColor(p) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)); // guard against NaN / out-of-range
  const hue = Math.round(120 * (1 - clamped) * 10) / 10;
  return `hsl(${hue}, 75%, 45%)`; // three.js Color() understands this string format
}