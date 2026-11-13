import { clamp, lerp } from '../utils/math.js';
import {
  sampleArcPoints,
  sampleEllipseArc,
  sampleCurveX,
  chaikinSmooth
} from '../utils/math.js';

// Fixed, 100% static inner rock texture markings (zero random generation)
export const STATIC_ROCK_PILLS = Object.freeze([
  { x: 58, y: 74, w: 94, h: 16 },    { x: 215, y: 68, w: 72, h: 16 },   { x: 390, y: 58, w: 112, h: 16 },
  { x: 602, y: 64, w: 86, h: 16 },   { x: 840, y: 70, w: 108, h: 16 },  { x: 1095, y: 82, w: 78, h: 16 },
  { x: 76, y: 158, w: 118, h: 16 },  { x: 280, y: 148, w: 66, h: 16 },  { x: 520, y: 136, w: 92, h: 16 },
  { x: 765, y: 146, w: 80, h: 16 },  { x: 990, y: 164, w: 114, h: 16 }, { x: 1140, y: 182, w: 74, h: 16 },
  { x: 48, y: 248, w: 84, h: 16 },   { x: 142, y: 312, w: 68, h: 16 },  { x: 1105, y: 268, w: 96, h: 16 },
  { x: 1152, y: 348, w: 72, h: 16 }, { x: 64, y: 405, w: 106, h: 16 },  { x: 1085, y: 424, w: 88, h: 16 },
  { x: 245, y: 492, w: 88, h: 16 },  { x: 412, y: 518, w: 110, h: 16 }, { x: 585, y: 496, w: 72, h: 16 },
  { x: 745, y: 514, w: 104, h: 16 }, { x: 930, y: 498, w: 82, h: 16 },  { x: 1110, y: 516, w: 92, h: 16 },
  { x: 88, y: 562, w: 102, h: 16 },  { x: 295, y: 584, w: 76, h: 16 },  { x: 545, y: 572, w: 118, h: 16 },
  { x: 802, y: 582, w: 94, h: 16 },  { x: 1020, y: 576, w: 84, h: 16 }, { x: 165, y: 618, w: 96, h: 16 },
  { x: 448, y: 616, w: 80, h: 16 },  { x: 690, y: 620, w: 108, h: 16 }, { x: 940, y: 614, w: 78, h: 16 }
]);

function doubleValleyY(x, base = 442, crest = 434, depth = 42, leftX = 255, rightX = 1025, ledge = 60) {
  const cx = 640;
  const span = (cx - leftX) - ledge;
  const d = Math.abs(x - cx);
  if (d >= span) return base;
  const t = d / span;
  const midline = lerp(crest, base, 0.5 * (1 - Math.cos(Math.PI * t)));
  const dip = depth * 0.5 * (1 - Math.cos(2 * Math.PI * t));
  return midline + dip;
}

function caterpillar3PeakY(x) {
  // Smooth 3-peak wave across x=255..1025 landing tangentially at y=462 at both wing joints
  const d = Math.abs(x - 640);
  const u = clamp(d / 385, 0, 1);
  const wave = -26 * Math.cos(u * Math.PI * 4.0);
  const centerBoost = d < 95 ? -14 * Math.cos((d / 95) * Math.PI * 0.5) : 0;
  return 488 + wave + centerBoost;
}

function cavernFloor4DipY(x) {
  const u = clamp((x - 165) / 950, 0, 1);
  return 542 + 16 * Math.sin(u * Math.PI * 7 - Math.PI * 0.5);
}

function cloverFloorY(x) {
  const u = (x - 640) / 460;
  if (Math.abs(u) >= 1) return 546;
  return 544 + 28 * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)) - 18 * Math.cos(Math.PI * u);
}

function makeWingedFloatingIsland(xLeft, xRight, yJoint, rWing, topFn, bellyMidY = 564) {
  // End wings at ~1.04*PI / -0.04*PI (~7 deg inward) so reversing up launches
  // cleanly upward/inward for air time without curling into a razor perch beak.
  const leftWingTop = sampleArcPoints(xLeft, yJoint - rWing, rWing, Math.PI * 1.04, Math.PI * 0.5, 16);
  const centerTop = sampleCurveX(xLeft, xRight, 34, topFn);
  const rightWingTop = sampleArcPoints(xRight, yJoint - rWing, rWing, Math.PI * 0.5, -Math.PI * 0.04, 16);
  const top = [...leftWingTop, ...centerTop.slice(1, -1), ...rightWingTop];

  const rTipX = rightWingTop[rightWingTop.length - 1].x;
  const rTipY = rightWingTop[rightWingTop.length - 1].y;
  const lTipX = leftWingTop[0].x;
  const lTipY = leftWingTop[0].y;

  const belly = chaikinSmooth([
    { x: rTipX, y: rTipY },
    { x: rTipX + 11, y: rTipY - 1 },
    { x: rTipX + 22, y: rTipY + 14 },
    { x: rTipX + 27, y: rTipY + 38 },
    { x: xRight + rWing + 24, y: yJoint - rWing * 0.25 },
    { x: xRight + rWing - 6, y: yJoint + 56 },
    { x: xRight - 40, y: 604 },
    { x: 640, y: bellyMidY },
    { x: xLeft + 40, y: 604 },
    { x: xLeft - rWing + 6, y: yJoint + 56 },
    { x: xLeft - rWing - 24, y: yJoint - rWing * 0.25 },
    { x: lTipX - 27, y: lTipY + 38 },
    { x: lTipX - 22, y: lTipY + 14 },
    { x: lTipX - 11, y: lTipY - 1 },
    { x: lTipX, y: lTipY }
  ], false, 2);

  return { top, belly, poly: [...top, ...belly.slice(1, -1)] };
}

function makeCloverInteriorLoop() {
  const pts = [];
  pts.push(...sampleCurveX(230, 1050, 28, cloverFloorY));
  pts.push(...sampleEllipseArc(1055, 455, 118, 90, Math.PI * 0.45, -Math.PI * 0.45, 10));
  pts.push({ x: 1035, y: 335 });
  pts.push(...sampleEllipseArc(905, 215, 165, 112, 0.28, -Math.PI * 0.85, 12));
  pts.push({ x: 688, y: 170 });
  pts.push({ x: 640, y: 205 });
  pts.push({ x: 592, y: 170 });
  pts.push(...sampleEllipseArc(375, 215, 165, 112, -Math.PI * 0.15, -Math.PI * 1.28, 12));
  pts.push({ x: 245, y: 335 });
  pts.push(...sampleEllipseArc(225, 455, 118, 90, -Math.PI * 0.55, -Math.PI * 1.45, 10));
  return chaikinSmooth(pts, true, 2);
}

function makeOvalCapsuleLoop(cx = 640, cy = 355, halfStraight = 265, r = 215) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const x = lerp(cx - halfStraight, cx + halfStraight, i / 20);
    const u = (x - cx) / halfStraight;
    const y = (cy + r) - 10 * Math.cos(u * Math.PI * 1.5);
    pts.push({ x, y });
  }
  pts.push(...sampleEllipseArc(cx + halfStraight, cy, r + 15, r, Math.PI * 0.48, -Math.PI * 0.48, 16));
  for (let i = 1; i <= 18; i++) {
    const x = lerp(cx + halfStraight, cx - halfStraight, i / 18);
    pts.push({ x, y: (cy - r) - 12 * Math.cos(((x - cx) / halfStraight) * Math.PI * 0.5) });
  }
  pts.push(...sampleEllipseArc(cx - halfStraight, cy, r + 15, r, -Math.PI * 0.52, -Math.PI * 1.48, 16));
  return chaikinSmooth(pts, true, 1);
}

function makeCavernArchOpenWalls(floorFn, lipXLeft = 405, lipXRight = 875) {
  // Fully curved side walls: overhanging upper arc flows straight into one tall
  // quarter-pipe that meets the floor tangentially (no straight vertical sections).
  const xWallL = lipXLeft - 250;
  const xWallR = lipXRight + 250;
  const yWallMid = 285;
  const rxPipe = 165;
  const xFloorL = xWallL + rxPipe;
  const xFloorR = xWallR - rxPipe;
  const ryPipeL = floorFn(xFloorL) - yWallMid;
  const ryPipeR = floorFn(xFloorR) - yWallMid;

  const raw = [];
  raw.push({ x: lipXLeft, y: -18 });
  raw.push(...sampleEllipseArc(lipXLeft, yWallMid, 250, 215, -Math.PI * 0.52, -Math.PI, 12));
  raw.push(...sampleEllipseArc(xFloorL, yWallMid, rxPipe, ryPipeL, Math.PI, Math.PI * 0.5, 16).slice(1));
  raw.push(...sampleCurveX(xFloorL, xFloorR, 28, floorFn).slice(1, -1));
  raw.push(...sampleEllipseArc(xFloorR, yWallMid, rxPipe, ryPipeR, Math.PI * 0.5, 0, 16));
  raw.push(...sampleEllipseArc(lipXRight, yWallMid, 250, 215, 0, -Math.PI * 0.48, 12).slice(1));
  raw.push({ x: lipXRight, y: -18 });
  const surface = chaikinSmooth(raw, false, 2);

  const visualPoly = [
    { x: lipXLeft, y: -25 },
    { x: -25, y: -25 },
    { x: -25, y: 745 },
    { x: 1305, y: 745 },
    { x: 1305, y: -25 },
    { x: lipXRight, y: -25 },
    ...surface.slice().reverse()
  ];
  return { surface, visualPoly };
}

function makeCanyonWallPair(floorFn, lipXLeft = 325, lipXRight = 955) {
  // Overhanging C-shaped cliffs whose lower half is a continuous quarter-pipe
  // landing tangentially on the canyon floor (no straight wall segments).
  const xWallL = 135;
  const xWallR = 1145;
  const yWallMid = 265;
  const rxPipe = 170;
  const xFloorL = xWallL + rxPipe;
  const xFloorR = xWallR - rxPipe;
  const ryPipeL = floorFn(xFloorL) - yWallMid;
  const ryPipeR = floorFn(xFloorR) - yWallMid;

  const raw = [];
  raw.push({ x: lipXLeft, y: -18 });
  raw.push(...sampleEllipseArc(320, yWallMid, 185, 240, -Math.PI * 0.52, -Math.PI, 12));
  raw.push(...sampleEllipseArc(xFloorL, yWallMid, rxPipe, ryPipeL, Math.PI, Math.PI * 0.5, 16).slice(1));
  raw.push(...sampleCurveX(xFloorL, xFloorR, 32, floorFn).slice(1, -1));
  raw.push(...sampleEllipseArc(xFloorR, yWallMid, rxPipe, ryPipeR, Math.PI * 0.5, 0, 16));
  raw.push(...sampleEllipseArc(960, yWallMid, 185, 240, 0, -Math.PI * 0.48, 12).slice(1));
  raw.push({ x: lipXRight, y: -18 });
  const surface = chaikinSmooth(raw, false, 2);

  const visualPoly = [
    { x: lipXLeft, y: -25 },
    { x: -25, y: -25 },
    { x: -25, y: 745 },
    { x: 1305, y: 745 },
    { x: 1305, y: -25 },
    { x: lipXRight, y: -25 },
    ...surface.slice().reverse()
  ];
  return { surface, visualPoly };
}

export const ARENAS = Object.freeze([
  // 1. Double-Valley Island with Curved Quarter-Pipe Climbing Walls
  (() => {
    const isl = makeWingedFloatingIsland(255, 1025, 442, 118, (x) => doubleValleyY(x), 564);
    return Object.freeze({
      id: 1,
      name: 'DOUBLE-VALLEY ISLAND',
      desc: 'Floating rock with curved quarter-pipe flip walls',
      islands: [isl],
      caves: [],
      openRocks: [],
      halfPipes: [],
      blocks: [{ x: 640, y: 542, w: 690, h: 86, chamfer: 26, hiddenVisual: true }],
      seesaws: [],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 295, y: 404 },
      p2Spawn: { x: 985, y: 404 }
    });
  })(),

  // 2. Bumpy 3-Peak Caterpillar Island with Curved Wall Kickers
  (() => {
    const isl = makeWingedFloatingIsland(255, 1025, 462, 120, caterpillar3PeakY, 610);
    return Object.freeze({
      id: 2,
      name: '3-PEAK CATERPILLAR',
      desc: 'Triple center waves + curved backflip side walls',
      islands: [isl],
      caves: [],
      openRocks: [],
      halfPipes: [],
      blocks: [{ x: 640, y: 562, w: 780, h: 80, chamfer: 22, hiddenVisual: true }],
      seesaws: [],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 295, y: 416 },
      p2Spawn: { x: 985, y: 416 }
    });
  })(),

  // 3. Cavern Arch with High Center Seesaw
  (() => {
    const arch = makeCavernArchOpenWalls(cavernFloor4DipY, 415, 865);
    return Object.freeze({
      id: 3,
      name: 'HIGH SEESAW CAVERN',
      desc: 'Arched rock walls + suspended seesaw beam',
      islands: [],
      caves: [],
      openRocks: [arch],
      halfPipes: [],
      blocks: [],
      seesaws: [{ x: 640, y: 415, w: 340 }],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 280, y: 505 },
      p2Spawn: { x: 1000, y: 505 }
    });
  })(),

  // 4. The Cloud / Clover Enclosed Cave
  (() => {
    const loop = makeCloverInteriorLoop();
    return Object.freeze({
      id: 4,
      name: 'CLOVER CLOUD CAVE',
      desc: '3-lobed 360-degree loop cavern with ceiling tooth',
      islands: [],
      caves: [loop],
      openRocks: [],
      halfPipes: [],
      blocks: [],
      seesaws: [],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 270, y: 512 },
      p2Spawn: { x: 1010, y: 512 }
    });
  })(),

  // 5. Open Canyon Bowl with Overhanging Lip Cliffs
  (() => {
    const canyonFloor = (x) => {
      const d = Math.abs(x - 640);
      const t = clamp(d / 455, 0, 1);
      const peak = -135 * Math.exp(-(d * d) / (92 * 92));
      const dips = 34 * Math.sin(t * Math.PI * 2.5);
      return 540 + peak + dips;
    };
    const wall = makeCanyonWallPair(canyonFloor, 315, 965);
    return Object.freeze({
      id: 5,
      name: 'OVERHANG CANYON',
      desc: 'Center mountain peak + C-shaped quarter-pipes',
      islands: [],
      caves: [],
      openRocks: [wall],
      halfPipes: [],
      blocks: [],
      seesaws: [],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 265, y: 492 },
      p2Spawn: { x: 1015, y: 492 }
    });
  })(),

  // 6. Cavern Arch with Twin Angled Seesaw Bridges
  (() => {
    const arch = makeCavernArchOpenWalls((x) => {
      const u = (x - 640) / 460;
      return 538 + 38 * Math.sin(Math.abs(u) * Math.PI * 1.6);
    }, 495, 785);
    return Object.freeze({
      id: 6,
      name: 'TWIN SEESAW ARCH',
      desc: 'Curved arch walls + crossable twin rotating bridges',
      islands: [],
      caves: [],
      openRocks: [arch],
      halfPipes: [],
      blocks: [],
      seesaws: [
        { x: 472, y: 356, w: 260, angle: 0.14 },
        { x: 808, y: 356, w: 260, angle: -0.14 }
      ],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 405, y: 300 },
      p2Spawn: { x: 875, y: 300 }
    });
  })(),

  // 7. Fully Enclosed Oval Capsule Dome + Low Center Seesaw
  (() => {
    const oval = makeOvalCapsuleLoop(640, 355, 265, 215);
    return Object.freeze({
      id: 7,
      name: 'OVAL CAPSULE DOME',
      desc: 'Smooth enclosed stadium loop + low seesaw',
      islands: [],
      caves: [oval],
      openRocks: [],
      halfPipes: [],
      blocks: [],
      seesaws: [{ x: 640, y: 405, w: 330 }],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 530, y: 365 },
      p2Spawn: { x: 750, y: 365 }
    });
  })(),

  // 8. Twin Floating Half-Pipe Bowls with Crossable Central Sea Gap
  Object.freeze({
    id: 8,
    name: 'HALF-PIPE BOWLS',
    desc: 'Crossable ocean gap + reachable center deck & C-wall backflips',
    islands: [],
    caves: [],
    openRocks: [],
    halfPipes: [
      { cx: 424, cy: 365, r: 220, aStart: 0.26 * Math.PI, aEnd: 1.44 * Math.PI, thickness: 28 },
      { cx: 856, cy: 365, r: 220, aStart: -0.44 * Math.PI, aEnd: 0.74 * Math.PI, thickness: 28 }
    ],
    blocks: [{ x: 640, y: 345, w: 250, h: 24 }],
    seesaws: [],
    pills: STATIC_ROCK_PILLS,
    p1Spawn: { x: 416, y: 540 },
    p2Spawn: { x: 864, y: 540 }
  }),

  // 9. Twin Floating Islands with Curved End Ramps & Center Seesaw Bridge
  (() => {
    const makeCurvedWingIsland = (isLeft) => {
      const rWing = 104;
      const yDeck = 452;
      if (isLeft) {
        const wing = sampleArcPoints(255, yDeck - rWing, rWing, Math.PI * 1.04, Math.PI * 0.5, 14);
        const flat = sampleCurveX(255, 472, 12, (x) => {
          const t = (x - 255) / 217;
          return yDeck - 4 * Math.sin(t * Math.PI);
        });
        const top = [...wing, ...flat.slice(1)];
        const tip = wing[0];
        const belly = chaikinSmooth([
          { x: 472, y: yDeck + 6 },
          { x: 464, y: 510 },
          { x: 410, y: 568 },
          { x: 325, y: 584 },
          { x: 205, y: 562 },
          { x: 145, y: 495 },
          { x: tip.x - 26, y: tip.y + 36 },
          { x: tip.x - 21, y: tip.y + 13 },
          { x: tip.x - 10, y: tip.y - 1 },
          { x: tip.x, y: tip.y }
        ], false, 2);
        return { top, belly, poly: [...top, ...belly.slice(1, -1)] };
      } else {
        const flat = sampleCurveX(808, 1025, 12, (x) => {
          const t = (x - 808) / 217;
          return yDeck - 4 * Math.sin(t * Math.PI);
        });
        const wing = sampleArcPoints(1025, yDeck - rWing, rWing, Math.PI * 0.5, -Math.PI * 0.04, 14);
        const top = [...flat, ...wing.slice(1)];
        const tip = wing[wing.length - 1];
        const belly = chaikinSmooth([
          { x: tip.x, y: tip.y },
          { x: tip.x + 10, y: tip.y - 1 },
          { x: tip.x + 21, y: tip.y + 13 },
          { x: tip.x + 26, y: tip.y + 36 },
          { x: 1135, y: 495 },
          { x: 1075, y: 562 },
          { x: 955, y: 584 },
          { x: 870, y: 568 },
          { x: 816, y: 510 },
          { x: 808, y: yDeck + 6 }
        ], false, 2);
        return { top, belly, poly: [...top, ...belly.slice(1, -1)] };
      }
    };
    return Object.freeze({
      id: 9,
      name: 'TWIN ISLANDS BRIDGE',
      desc: 'Curved outer flip walls + seesaw bridge over sea',
      islands: [makeCurvedWingIsland(true), makeCurvedWingIsland(false)],
      caves: [],
      openRocks: [],
      halfPipes: [],
      blocks: [],
      seesaws: [{ x: 640, y: 465, w: 316, isBridge: true, maxAngle: 0.46, springRate: 0.0032 }],
      pills: STATIC_ROCK_PILLS,
      p1Spawn: { x: 295, y: 410 },
      p2Spawn: { x: 985, y: 410 }
    });
  })()
]);
