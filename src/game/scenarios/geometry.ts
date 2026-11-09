/** Segment/segment intersection test used by gate checks (pure, shared with headless tools). */
export function segmentsCrossPure(p1x: number, p1z: number, p2x: number, p2z: number, ax: number, az: number, bx: number, bz: number): boolean {
  const d1x = p2x - p1x;
  const d1z = p2z - p1z;
  const d2x = bx - ax;
  const d2z = bz - az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((ax - p1x) * d2z - (az - p1z) * d2x) / den;
  const u = ((ax - p1x) * d1z - (az - p1z) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
