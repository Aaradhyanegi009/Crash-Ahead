export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function normalizeAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function lerpAngle(a, b, t) {
  return a + normalizeAngle(b - a) * t;
}

export function sampleArcPoints(cx, cy, r, aStart, aEnd, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = lerp(aStart, aEnd, i / steps);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function sampleEllipseArc(cx, cy, rx, ry, aStart, aEnd, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = lerp(aStart, aEnd, i / steps);
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

export function sampleCurveX(x0, x1, steps, fn) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = lerp(x0, x1, i / steps);
    pts.push({ x, y: fn(x) });
  }
  return pts;
}

export function chaikinSmooth(pts, closed = false, passes = 2) {
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    const out = [];
    const len = cur.length;
    if (!closed) out.push(cur[0]);
    const limit = closed ? len : len - 1;
    for (let i = 0; i < limit; i++) {
      const p0 = cur[i];
      const p1 = cur[(i + 1) % len];
      out.push({ x: lerp(p0.x, p1.x, 0.25), y: lerp(p0.y, p1.y, 0.25) });
      out.push({ x: lerp(p0.x, p1.x, 0.75), y: lerp(p0.y, p1.y, 0.75) });
    }
    if (!closed) out.push(cur[len - 1]);
    cur = out;
  }
  return cur;
}
