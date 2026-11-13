import {
  WORLD_W,
  WORLD_H,
  FIXED_DT,
  JUMP_COOLDOWN_MS,
  WATER_CREST_Y,
  WATER_HAZARD_Y,
  WATER_RISE,
  CAR_SCALE,
  CENTER_OF_MASS_OFFSET,
  SUSPENSION_DAMPING,
  VEHICLE_PHYSICS,
  CAR_SPEC,
  CAR_MODELS
} from '../config/constants.js';
import { ARENAS } from '../maps/arenas.js';
import { clamp, lerp, lerpAngle, sampleArcPoints } from '../utils/math.js';
import { BODY_KEYS, VehiclePhysicsController } from './vehicleController.js';

export class PhysicsSimulation {
  constructor(isHostSide = true) {
    this.isHostSide = isHostSide;
    const Matter = window.Matter;
    this.Engine = Matter.Engine;
    this.Bodies = Matter.Bodies;
    this.Body = Matter.Body;
    this.Composite = Matter.Composite;
    this.Constraint = Matter.Constraint;
    this.Events = Matter.Events;
    this.Query = Matter.Query;

    this.engine = this.Engine.create({
      gravity: { x: 0, y: VEHICLE_PHYSICS.GRAVITY_Y, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 4
    });

    const Detector = window.Matter?.Detector;
    if (Detector && !Detector._crashAheadHooked) {
      const origCollisions = Detector.collisions;
      Detector.collisions = function(detector) {
        const collisions = origCollisions.call(this, detector);
        if (detector && typeof detector._postProcessCollisions === 'function') {
          detector._postProcessCollisions(collisions);
        }
        return collisions;
      };
      Detector._crashAheadHooked = true;
    }
    if (this.engine?.detector) {
      this.engine.detector._postProcessCollisions = (collisions) => this._smoothTerrainCollisions(collisions);
    }
    this._prevBodyPoses = new Map();
    this._prevWaterCrestY = WATER_CREST_Y;

    this.vehicleController = new VehiclePhysicsController(this.Body, this.Query, this.engine);

    this.arenaIndex = 0;
    this.p1Model = 'roadster';
    this.p2Model = 'roadster';
    this.p1Car = null;
    this.p2Car = null;
    this.seesaws = [];
    this.driveSurfaces = [];
    this.ragdolls = [];
    this.grounded = { p1R: false, p1F: false, p2R: false, p2F: false };
    this._resetWheelContacts();

    this.roundElapsedMs = 0;
    this.waterCrestY = WATER_CREST_Y;
    this.waterHazardY = WATER_HAZARD_Y;
    this.waterRising = false;
    if (this._prevBodyPoses) this._prevBodyPoses.clear();
    this._prevWaterCrestY = this.waterCrestY;

    this.onHeadKO = null;
    this.onWaterKO = null;
    this.onCarBump = null;
    this.onJump = null;
    this.onRagdollSplash = null;

    this._bindCollisions();
  }

  _resetWheelContacts() {
    this.wheelContacts = {
      p1: { rear: { count: 0, bestDot: -1, nx: 0, ny: 0, hasFront: false, isBackside: false }, front: { count: 0, bestDot: -1, nx: 0, ny: 0, hasFront: false, isBackside: false } },
      p2: { rear: { count: 0, bestDot: -1, nx: 0, ny: 0, hasFront: false, isBackside: false }, front: { count: 0, bestDot: -1, nx: 0, ny: 0, hasFront: false, isBackside: false } }
    };
  }

  _bindCollisions() {
    this.Events.on(this.engine, 'beforeUpdate', () => {
      this._resetWheelContacts();
    });

    this.Events.on(this.engine, 'collisionActive', (ev) => {
      const addWheelContact = (wheelBody, otherBody, pKey, wKey, pair, car) => {
        const wc = this.wheelContacts[pKey][wKey];
        const otherIsBack = Boolean(otherBody && otherBody.isBackside);
        if (otherIsBack && wc.hasFront) return;
        const n = pair.collision && pair.collision.normal;
        if (!n) return;
        let nx = n.x;
        let ny = n.y;
        const supp = pair.collision.supports && pair.collision.supports[0];
        if (supp) {
          const toWheelX = wheelBody.position.x - supp.x;
          const toWheelY = wheelBody.position.y - supp.y;
          const suppDot = nx * toWheelX + ny * toWheelY;
          if (Math.abs(suppDot) > 0.05) {
            if (suppDot < 0) {
              nx = -nx;
              ny = -ny;
            }
          } else {
            const sign = pair.bodyA === wheelBody ? 1 : -1;
            nx *= sign;
            ny *= sign;
          }
        } else {
          const sign = pair.bodyA === wheelBody ? 1 : -1;
          nx *= sign;
          ny *= sign;
        }
        const len = Math.hypot(nx, ny);
        if (len < 0.001) return;
        const unx = nx / len;
        const uny = ny / len;
        let upDot = 1;
        if (car && car.chassis) {
          const ang = car.chassis.angle;
          upDot = unx * Math.sin(ang) + uny * (-Math.cos(ang));
        }
        if (upDot > 0.25 && ((!otherIsBack && !wc.hasFront) || upDot >= wc.bestDot)) {
          wc.bestDot = upDot;
          wc.nx = unx;
          wc.ny = uny;
          wc.isBackside = otherIsBack;
          if (!otherIsBack) wc.hasFront = true;
          wc.count += 1;
        }
      };

      for (let i = 0; i < ev.pairs.length; i++) {
        const pair = ev.pairs[i];
        const a = pair.bodyA;
        const b = pair.bodyB;
        const la = a.label || '';
        const lb = b.label || '';
        // Only treat arena terrain & seesaws as drivable ground surfaces (never opponent bumpers or ragdolls)
        const terrainA = la === 'island' || la === 'seesaw';
        const terrainB = lb === 'island' || lb === 'seesaw';

        if (la === 'wheel_p1_r' && terrainB) addWheelContact(a, b, 'p1', 'rear', pair, this.p1Car);
        if (lb === 'wheel_p1_r' && terrainA) addWheelContact(b, a, 'p1', 'rear', pair, this.p1Car);
        if (la === 'wheel_p1_f' && terrainB) addWheelContact(a, b, 'p1', 'front', pair, this.p1Car);
        if (lb === 'wheel_p1_f' && terrainA) addWheelContact(b, a, 'p1', 'front', pair, this.p1Car);

        if (la === 'wheel_p2_r' && terrainB) addWheelContact(a, b, 'p2', 'rear', pair, this.p2Car);
        if (lb === 'wheel_p2_r' && terrainA) addWheelContact(b, a, 'p2', 'rear', pair, this.p2Car);
        if (la === 'wheel_p2_f' && terrainB) addWheelContact(a, b, 'p2', 'front', pair, this.p2Car);
        if (lb === 'wheel_p2_f' && terrainA) addWheelContact(b, a, 'p2', 'front', pair, this.p2Car);
      }
    });

    this.Events.on(this.engine, 'collisionStart', (ev) => {
      if (!this.isHostSide) return;
      for (let i = 0; i < ev.pairs.length; i++) {
        const pair = ev.pairs[i];
        const a = pair.bodyA;
        const b = pair.bodyB;
        const la = a.label || '';
        const lb = b.label || '';

        const checkHeadHit = (headLabel, playerIdx, oppTag) => {
          if (la !== headLabel && lb !== headLabel) return;
          const headBody = la === headLabel ? a : b;
          const other = la === headLabel ? b : a;
          const ol = other.label || '';
          if (ol === 'island' || ol === 'seesaw' || ol.endsWith(oppTag) || ol.includes(`${oppTag}_`)) {
            const pt = (pair.collision.supports && pair.collision.supports[0]) || headBody.position;
            if (this.onHeadKO) this.onHeadKO(playerIdx, pt);
          }
        };
        checkHeadHit('head_p1', 1, '_p2');
        checkHeadHit('head_p2', 2, '_p1');

        if (
          (la.startsWith('chassis_p') || la.startsWith('wheel_p')) &&
          (lb.startsWith('chassis_p') || lb.startsWith('wheel_p') || lb === 'seesaw')
        ) {
          const spd = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
          if (spd > 2.5 && this.onCarBump) {
            const pt = (pair.collision.supports && pair.collision.supports[0]) || a.position;
            this.onCarBump(pt, clamp(spd / 12, 0.2, 1.0));
          }
        }
      }
    });
  }

  _applySmoothedNormal(c, sx, sy, sign, align) {
    const nx = sx * sign;
    const ny = sy * sign;
    const newDepth = Math.max(0.001, c.depth * align);
    c.normal.x = nx;
    c.normal.y = ny;
    c.tangent.x = -ny;
    c.tangent.y = nx;
    c.depth = newDepth;
    c.penetration.x = nx * newDepth;
    c.penetration.y = ny * newDepth;
  }

  _smoothTerrainCollisions(collisions) {
    const keptWheelHits = [];
    for (let k = collisions.length - 1; k >= 0; k--) {
      const c = collisions[k];
      const lA = c.bodyA.label || '';
      const lB = c.bodyB.label || '';
      const aIsCar = lA.startsWith('wheel_') || lA.startsWith('chassis_');
      const bIsCar = lB.startsWith('wheel_') || lB.startsWith('chassis_');
      if (aIsCar === bIsCar) continue;

      const carPart = aIsCar ? c.bodyA : c.bodyB;
      const terr = aIsCar ? c.bodyB : c.bodyA;
      const isWheel = (carPart.label || '').startsWith('wheel_');
      const sign = aIsCar ? 1 : -1;
      const ox = c.normal.x * sign;
      const oy = c.normal.y * sign;
      let frontOutX = 0;
      let frontOutY = 0;
      let isSmoothFront = false;

      if (terr._curveSeg) {
        const m = terr._curveSeg;
        const relX = carPart.position.x - m.ax;
        const relY = carPart.position.y - m.ay;
        const uRaw = (relX * m.dirX + relY * m.dirY) / m.segLen;
        if ((m.openStart && uRaw < 0.04) || (m.openEnd && uRaw > 0.96)) continue;

        const faceDot = ox * m.outNx + oy * m.outNy;
        if (faceDot < -0.25) continue;

        const atInnerStart = uRaw <= 0.22 && !m.openStart && m.adjDotStart > 0.55;
        const atInnerEnd = uRaw >= 0.78 && !m.openEnd && m.adjDotEnd > 0.55;
        if (faceDot <= 0.14) {
          if ((atInnerStart || atInnerEnd) && (relX * m.outNx + relY * m.outNy > -m.halfThick * 0.45)) {
            collisions.splice(k, 1);
          }
          continue;
        }

        const u = uRaw < 0 ? 0 : (uRaw > 1 ? 1 : uRaw);
        let sx = m.nAx + (m.nBx - m.nAx) * u;
        let sy = m.nAy + (m.nBy - m.nAy) * u;
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl;
        sy /= sl;
        const align = ox * sx + oy * sy;
        if (align > 0.2 && align < 0.9995) {
          this._applySmoothedNormal(c, sx, sy, sign, align);
        }
        frontOutX = sx;
        frontOutY = sy;
        isSmoothFront = true;
      } else if (terr._curveJoint) {
        const m = terr._curveJoint;
        const faceDot = ox * m.outNx + oy * m.outNy;
        if (faceDot < -0.25) continue;

        if (m.isConcave) {
          collisions.splice(k, 1);
          continue;
        }

        if (faceDot <= 0.15) {
          collisions.splice(k, 1);
          continue;
        }
        const cross01 = m.n0x * m.n1y - m.n0y * m.n1x;
        const ax = cross01 >= 0 ? m.n0x : m.n1x;
        const ay = cross01 >= 0 ? m.n0y : m.n1y;
        const bx = cross01 >= 0 ? m.n1x : m.n0x;
        const by = cross01 >= 0 ? m.n1y : m.n0y;
        let sx = ox;
        let sy = oy;
        let clamped = false;
        if (ax * oy - ay * ox < 0) {
          sx = ax;
          sy = ay;
          clamped = true;
        } else if (ox * by - oy * bx < 0) {
          sx = bx;
          sy = by;
          clamped = true;
        }
        if (clamped) {
          const align = ox * sx + oy * sy;
          if (align <= 0.15) {
            collisions.splice(k, 1);
            continue;
          }
          this._applySmoothedNormal(c, sx, sy, sign, align);
        }
        frontOutX = sx;
        frontOutY = sy;
        isSmoothFront = true;
      } else if (terr._halfPipeSeg) {
        const m = terr._halfPipeSeg;
        if (m.openStart || m.openEnd) continue;
        const faceDot = ox * m.outNx + oy * m.outNy;
        if (Math.abs(faceDot) < (m.isCap ? 0.2 : 0.15)) {
          collisions.splice(k, 1);
          continue;
        }
        const rSign = faceDot >= 0 ? 1 : -1;
        let sx = (m.cx - carPart.position.x) * rSign;
        let sy = (m.cy - carPart.position.y) * rSign;
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl;
        sy /= sl;
        const align = ox * sx + oy * sy;
        if (align > 0.2 && align < 0.9995) {
          this._applySmoothedNormal(c, sx, sy, sign, align);
        }
        frontOutX = sx;
        frontOutY = sy;
        isSmoothFront = true;
      }

      if (isSmoothFront && isWheel) {
        let merged = false;
        for (let i = 0; i < keptWheelHits.length; i++) {
          const entry = keptWheelHits[i];
          if (entry.wheelId !== carPart.id) continue;
          if (entry.nx * frontOutX + entry.ny * frontOutY > 0.72) {
            if (c.depth > entry.c.depth) {
              const dropIdx = collisions.indexOf(entry.c);
              if (dropIdx >= 0) collisions.splice(dropIdx, 1);
              entry.c = c;
              entry.nx = frontOutX;
              entry.ny = frontOutY;
            } else {
              collisions.splice(k, 1);
            }
            merged = true;
            break;
          }
        }
        if (!merged) {
          keptWheelHits.push({ wheelId: carPart.id, c, nx: frontOutX, ny: frontOutY });
        }
      }
    }
  }

  _addSurfacePolyline(pts, inwardSign = 1, thickness = 34, closeLoop = false, opts = {}) {
    const isBackside = Boolean(opts.isBackside);
    const taperEnds = Boolean(opts.taperEnds && !closeLoop);
    const count = closeLoop ? pts.length : pts.length - 1;
    const normals = [];
    const segments = [];
    for (let i = 0; i < count; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1) {
        normals.push(null);
        segments.push(null);
        continue;
      }
      const angle = Math.atan2(dy, dx);
      const nx = -Math.sin(angle) * inwardSign;
      const ny = Math.cos(angle) * inwardSign;
      normals.push({ nx, ny });
      const segThick = taperEnds
        ? (i === 0 || i === count - 1)
          ? Math.min(thickness, 10)
          : (i === 1 || i === count - 2)
            ? Math.min(thickness, 18)
            : thickness
        : thickness;
      const cx = (p0.x + p1.x) * 0.5 + nx * (segThick * 0.5);
      const cy = (p0.y + p1.y) * 0.5 + ny * (segThick * 0.5);

      const rect = this.Bodies.rectangle(cx, cy, segLen, segThick, {
        isStatic: true,
        angle,
        friction: 0.92,
        restitution: 0.0,
        slop: 0.004,
        label: 'island',
        isBackside
      });
      this.Composite.add(this.engine.world, rect);
      this.driveSurfaces.push(rect);
      segments.push({ rect, p0, dx, dy, segLen, segThick, nx, ny });
    }

    for (let i = 0; i < count; i++) {
      const s = segments[i];
      if (!s) continue;
      const outX = -s.nx;
      const outY = -s.ny;
      const prevN = i > 0 ? normals[i - 1] : (closeLoop ? normals[count - 1] : null);
      const nextN = i < count - 1 ? normals[i + 1] : (closeLoop ? normals[0] : null);
      const prevOutX = prevN ? -prevN.nx : outX;
      const prevOutY = prevN ? -prevN.ny : outY;
      const nextOutX = nextN ? -nextN.nx : outX;
      const nextOutY = nextN ? -nextN.ny : outY;
      let nAx = prevOutX + outX;
      let nAy = prevOutY + outY;
      const lenA = Math.hypot(nAx, nAy) || 1;
      nAx /= lenA;
      nAy /= lenA;
      let nBx = outX + nextOutX;
      let nBy = outY + nextOutY;
      const lenB = Math.hypot(nBx, nBy) || 1;
      nBx /= lenB;
      nBy /= lenB;
      s.rect._curveSeg = {
        ax: s.p0.x,
        ay: s.p0.y,
        dirX: s.dx / s.segLen,
        dirY: s.dy / s.segLen,
        segLen: s.segLen,
        halfThick: s.segThick * 0.5,
        outNx: outX,
        outNy: outY,
        nAx,
        nAy,
        nBx,
        nBy,
        openStart: !closeLoop && i === 0,
        openEnd: !closeLoop && i === count - 1,
        adjDotStart: prevOutX * outX + prevOutY * outY,
        adjDotEnd: nextOutX * outX + nextOutY * outY
      };
    }

    // Add interior tangent weld circles at vertices so convex joints never trap a tire.
    const jointStart = closeLoop ? 0 : 1;
    for (let i = jointStart; i < count; i++) {
      const prevIdx = (i - 1 + normals.length) % normals.length;
      const n0 = normals[prevIdx];
      const n1 = normals[i];
      if (!n0 || !n1) continue;
      const ax = n0.nx + n1.nx;
      const ay = n0.ny + n1.ny;
      const len = Math.hypot(ax, ay) || 1;
      const pt = pts[i];
      const pNext = pts[(i + 1) % pts.length];
      const localThick = taperEnds
        ? (i === 1 || i === count - 1)
          ? Math.min(thickness, 14)
          : (i === 2 || i === count - 2)
            ? Math.min(thickness, 22)
            : thickness
        : thickness;
      const joint = this.Bodies.circle(
        pt.x + (ax / len) * (localThick * 0.5),
        pt.y + (ay / len) * (localThick * 0.5),
        localThick * 0.5,
        {
          isStatic: true,
          friction: 0.92,
          restitution: 0.0,
          slop: 0.004,
          label: 'island',
          isBackside
        }
      );
      const isConcave = ((pNext.x - pt.x) * (-n0.nx) + (pNext.y - pt.y) * (-n0.ny)) > 0;
      joint._curveJoint = {
        outNx: -(ax / len),
        outNy: -(ay / len),
        n0x: -n0.nx,
        n0y: -n0.ny,
        n1x: -n1.nx,
        n1y: -n1.ny,
        isConcave
      };
      this.Composite.add(this.engine.world, joint);
      this.driveSurfaces.push(joint);
    }

    // Add rounded open-end nose caps flush inside the visual cheek so open wing tips have no jagged shelf.
    if (!closeLoop && opts.endCaps && count >= 2) {
      const capR = Math.min(thickness, 12) * 0.48;
      const addCap = (pEnd, pAdj, nEnd) => {
        if (!nEnd) return;
        const tx = pAdj.x - pEnd.x;
        const ty = pAdj.y - pEnd.y;
        const tLen = Math.hypot(tx, ty) || 1;
        const cap = this.Bodies.circle(
          pEnd.x + nEnd.nx * capR + (tx / tLen) * (capR * 0.7),
          pEnd.y + nEnd.ny * capR + (ty / tLen) * (capR * 0.7),
          capR,
          {
            isStatic: true,
            friction: 0.92,
            restitution: 0.0,
            slop: 0.004,
            label: 'island',
            isBackside
          }
        );
        this.Composite.add(this.engine.world, cap);
        this.driveSurfaces.push(cap);
      };
      addCap(pts[0], pts[1], normals[0]);
      addCap(pts[count], pts[count - 1], normals[count - 1]);
    }
  }

  _addHalfPipeColliders(pipe) {
    const arcLen = Math.abs(pipe.aEnd - pipe.aStart) * pipe.r;
    const steps = clamp(Math.ceil(arcLen / 14), 24, 68);
    const pts = sampleArcPoints(pipe.cx, pipe.cy, pipe.r, pipe.aStart, pipe.aEnd, steps);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const cx = (p0.x + p1.x) * 0.5;
      const cy = (p0.y + p1.y) * 0.5;
      const inX = pipe.cx - cx;
      const inY = pipe.cy - cy;
      const inLen = Math.hypot(inX, inY) || 1;
      const seg = this.Bodies.rectangle(cx, cy, segLen, pipe.thickness, {
        isStatic: true,
        angle,
        friction: 0.92,
        restitution: 0.0,
        slop: 0.004,
        label: 'island'
      });
      seg._halfPipeSeg = {
        cx: pipe.cx,
        cy: pipe.cy,
        r: pipe.r,
        outNx: inX / inLen,
        outNy: inY / inLen,
        openStart: i === 0,
        openEnd: i === pts.length - 2,
        isCap: false
      };
      this.Composite.add(this.engine.world, seg);
      this.driveSurfaces.push(seg);
    }
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const capRadius = pipe.thickness * 0.5;
      const inX = pipe.cx - pt.x;
      const inY = pipe.cy - pt.y;
      const inLen = Math.hypot(inX, inY) || 1;
      const cap = this.Bodies.circle(pt.x, pt.y, capRadius, {
        isStatic: true,
        friction: 0.92,
        restitution: 0.0,
        slop: 0.004,
        label: 'island'
      });
      if (i > 0 && i < pts.length - 1) {
        cap._halfPipeSeg = {
          cx: pipe.cx,
          cy: pipe.cy,
          r: pipe.r,
          outNx: inX / inLen,
          outNy: inY / inLen,
          openStart: false,
          openEnd: false,
          isCap: true
        };
      }
      this.Composite.add(this.engine.world, cap);
      this.driveSurfaces.push(cap);
    }
  }

  _addSeesaw(cfg) {
    const isBridge = !!cfg.isBridge;
    const motorSpeed = typeof cfg.motorSpeed === 'number' ? cfg.motorSpeed : 0;
    const isSpinner = Boolean(cfg.isSpinner || motorSpeed);
    const plank = this.Bodies.rectangle(cfg.x, cfg.y, cfg.w, 28, {
      density: isSpinner ? 0.018 : (isBridge ? 0.0036 : 0.0042),
      chamfer: { radius: 14 },
      friction: 0.95,
      restitution: 0.0,
      frictionAir: isSpinner ? 0.002 : (isBridge ? 0.006 : 0.012),
      slop: 0.004,
      angle: cfg.angle || 0,
      label: 'seesaw'
    });
    const pivot = this.Constraint.create({
      pointA: { x: cfg.x, y: cfg.y },
      bodyB: plank,
      pointB: { x: 0, y: 0 },
      stiffness: 1.0,
      length: 0
    });
    this.Composite.add(this.engine.world, [plank, pivot]);
    this.seesaws.push({
      body: plank,
      x: cfg.x,
      y: cfg.y,
      w: cfg.w,
      isBridge,
      isSpinner,
      motorSpeed,
      maxAngle: typeof cfg.maxAngle === 'number' ? cfg.maxAngle : 0,
      springRate: typeof cfg.springRate === 'number' ? cfg.springRate : 0
    });
    this.driveSurfaces.push(plank);
  }

  resetArena(arenaIndex = this.arenaIndex, p1Model = this.p1Model, p2Model = this.p2Model) {
    this.arenaIndex = ((arenaIndex % ARENAS.length) + ARENAS.length) % ARENAS.length;
    this.p1Model = CAR_MODELS[p1Model] ? p1Model : 'roadster';
    this.p2Model = CAR_MODELS[p2Model] ? p2Model : 'roadster';
    const arena = ARENAS[this.arenaIndex];

    this.Composite.clear(this.engine.world, false);
    this.engine.timing.timeScale = 1.0;
    this.seesaws = [];
    this.driveSurfaces = [];
    this.ragdolls = [];
    this.grounded = { p1R: false, p1F: false, p2R: false, p2F: false };
    this._resetWheelContacts();

    this.roundElapsedMs = 0;
    this.waterCrestY = WATER_CREST_Y;
    this.waterHazardY = WATER_HAZARD_Y;
    this.waterRising = false;
    if (this._prevBodyPoses) this._prevBodyPoses.clear();
    this._prevWaterCrestY = this.waterCrestY;

    for (const isl of arena.islands) {
      this._addSurfacePolyline(isl.top, 1, 28, false, { taperEnds: true, endCaps: true });
      this._addSurfacePolyline(isl.belly, 1, 14, false, { isBackside: true });
    }

    for (const caveLoop of arena.caves) {
      this._addSurfacePolyline(caveLoop, 1, 72, true);
      const backupWalls = [
        this.Bodies.rectangle(WORLD_W / 2, -50, WORLD_W + 200, 100, { isStatic: true, friction: 1.0, label: 'island' }),
        this.Bodies.rectangle(WORLD_W / 2, WORLD_H + 50, WORLD_W + 200, 100, { isStatic: true, friction: 1.0, label: 'island' }),
        this.Bodies.rectangle(-50, WORLD_H / 2, 100, WORLD_H + 200, { isStatic: true, friction: 1.0, label: 'island' }),
        this.Bodies.rectangle(WORLD_W + 50, WORLD_H / 2, 100, WORLD_H + 200, { isStatic: true, friction: 1.0, label: 'island' })
      ];
      this.Composite.add(this.engine.world, backupWalls);
      this.driveSurfaces.push(...backupWalls);
    }

    for (const openRock of arena.openRocks) {
      this._addSurfacePolyline(openRock.surface, 1, 46, false);
      const backupWalls = [
        this.Bodies.rectangle(-50, WORLD_H / 2, 100, WORLD_H + 200, { isStatic: true, friction: 1.0, label: 'island' }),
        this.Bodies.rectangle(WORLD_W + 50, WORLD_H / 2, 100, WORLD_H + 200, { isStatic: true, friction: 1.0, label: 'island' }),
        this.Bodies.rectangle(WORLD_W / 2, WORLD_H + 55, WORLD_W + 200, 100, { isStatic: true, friction: 1.0, label: 'island' })
      ];
      this.Composite.add(this.engine.world, backupWalls);
      this.driveSurfaces.push(...backupWalls);
    }

    for (const pipe of arena.halfPipes) {
      this._addHalfPipeColliders(pipe);
    }

    for (const blk of arena.blocks) {
      const blkChamfer = Math.min(blk.chamfer || 8, blk.w * 0.4, blk.h * 0.44);
      const rect = this.Bodies.rectangle(blk.x, blk.y, blk.w, blk.h, {
        isStatic: true,
        angle: blk.angle || 0,
        chamfer: { radius: blkChamfer },
        friction: 0.92,
        restitution: 0.0,
        slop: 0.004,
        label: 'island',
        isBackside: Boolean(blk.hiddenVisual)
      });
      this.Composite.add(this.engine.world, rect);
      this.driveSurfaces.push(rect);
    }

    for (const sw of arena.seesaws) {
      this._addSeesaw(sw);
    }
    for (const s of this.seesaws) {
      s.spawnAngle = s.body.angle;
    }

    this.p1Car = this._buildVehicle(1, arena.p1Spawn.x, arena.p1Spawn.y, this.p1Model);
    this.p2Car = this._buildVehicle(2, arena.p2Spawn.x, arena.p2Spawn.y, this.p2Model);
  }

  _buildRoadster(playerIndex, x, y) {
    return this._buildVehicle(playerIndex, x, y, 'roadster');
  }

  _buildVehicle(playerIndex, x, y, modelId = 'roadster') {
    const spec = CAR_MODELS[modelId] || CAR_SPEC;
    const facing = playerIndex === 1 ? 1 : -1;
    const pTag = playerIndex === 1 ? 'p1' : 'p2';
    const group = this.Body.nextGroup(true);

    const chassis = this.Bodies.rectangle(x, y, spec.width, spec.height, {
      chamfer: { radius: spec.chamfer ?? 8.5 * CAR_SCALE },
      density: spec.density,
      restitution: Math.min(spec.restitution, 0.01),
      friction: Math.min(spec.friction, 0.012),
      frictionStatic: 0.008,
      frictionAir: 0.0045,
      slop: 0.005,
      collisionFilter: { group },
      label: `chassis_${pTag}`
    });
    this.Body.setCentre(chassis, { x: 0, y: CENTER_OF_MASS_OFFSET }, true);

    // wheelR is screen-left (P1 rear tail, P2 front nose); wheelF is screen-right (P1 front nose, P2 rear tail)
    const yOffLeft = facing > 0 ? spec.wheelOffsetY : (spec.wheelOffsetYF ?? spec.wheelOffsetY);
    const yOffRight = facing > 0 ? (spec.wheelOffsetYF ?? spec.wheelOffsetY) : spec.wheelOffsetY;
    const radLeft = facing > 0 ? (spec.wheelRadiusR ?? spec.wheelRadius) : (spec.wheelRadiusF ?? spec.wheelRadius);
    const radRight = facing > 0 ? (spec.wheelRadiusF ?? spec.wheelRadius) : (spec.wheelRadiusR ?? spec.wheelRadius);

    const makeWheel = (wx, wy, rad, label) => this.Bodies.polygon(wx, wy, 28, rad, {
      circleRadius: rad,
      density: spec.wheelDensity,
      friction: spec.wheelFriction,
      frictionStatic: 0.16,
      restitution: 0.0,
      frictionAir: 0.004,
      slop: 0.004,
      collisionFilter: { group },
      label
    });

    const wheelR = makeWheel(x - spec.wheelOffsetX, y + yOffLeft, radLeft, `wheel_${pTag}_r`);
    const wheelF = makeWheel(x + spec.wheelOffsetX, y + yOffRight, radRight, `wheel_${pTag}_f`);

    const headOffX = (spec.headOffsetX || 0) * facing;
    const head = this.Bodies.circle(x + headOffX, y + spec.headOffsetY, spec.headRadius, {
      density: spec.headDensity,
      restitution: spec.headRestitution,
      friction: 0.3,
      frictionAir: 0.008,
      collisionFilter: { group },
      label: `head_${pTag}`
    });

    const suspYL = yOffLeft - CENTER_OF_MASS_OFFSET;
    const suspYR = yOffRight - CENTER_OF_MASS_OFFSET;
    const suspRVert = this.Constraint.create({
      bodyA: chassis, pointA: { x: -spec.wheelOffsetX, y: suspYL },
      bodyB: wheelR, pointB: { x: 0, y: 0 },
      length: 0, stiffness: VEHICLE_PHYSICS.SUSPENSION_STIFFNESS, damping: SUSPENSION_DAMPING
    });
    const suspRArm = this.Constraint.create({
      bodyA: chassis, pointA: { x: 0, y: suspYL },
      bodyB: wheelR, pointB: { x: 0, y: 0 },
      length: spec.wheelOffsetX, stiffness: VEHICLE_PHYSICS.AXLE_ARM_STIFFNESS, damping: VEHICLE_PHYSICS.AXLE_ARM_DAMPING
    });

    const suspFVert = this.Constraint.create({
      bodyA: chassis, pointA: { x: spec.wheelOffsetX, y: suspYR },
      bodyB: wheelF, pointB: { x: 0, y: 0 },
      length: 0, stiffness: VEHICLE_PHYSICS.SUSPENSION_STIFFNESS, damping: SUSPENSION_DAMPING
    });
    const suspFArm = this.Constraint.create({
      bodyA: chassis, pointA: { x: 0, y: suspYR },
      bodyB: wheelF, pointB: { x: 0, y: 0 },
      length: spec.wheelOffsetX, stiffness: VEHICLE_PHYSICS.AXLE_ARM_STIFFNESS, damping: VEHICLE_PHYSICS.AXLE_ARM_DAMPING
    });

    const collarX = (spec.collarX || 0) * facing;
    const collarY = (spec.collarY ?? (-4 * CAR_SCALE)) - CENTER_OF_MASS_OFFSET;
    const neckSpanX = 16 * CAR_SCALE;
    const neckSpine = this.Constraint.create({
      bodyA: chassis, pointA: { x: collarX, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.90, damping: 0.15
    });
    const neckL = this.Constraint.create({
      bodyA: chassis, pointA: { x: collarX - neckSpanX, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.74, damping: 0.14
    });
    const neckR = this.Constraint.create({
      bodyA: chassis, pointA: { x: collarX + neckSpanX, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.74, damping: 0.14
    });

    this.Composite.add(this.engine.world, [
      chassis, wheelR, wheelF, head,
      suspRVert, suspRArm, suspFVert, suspFArm,
      neckSpine, neckL, neckR
    ]);

    return {
      playerIndex,
      isRedPlayer: playerIndex === 1,
      facing,
      model: spec.id,
      spec,
      wheelRadiusR: radLeft,
      wheelRadiusF: radRight,
      collisionGroup: group,
      chassis,
      wheelR,
      wheelF,
      head,
      spawnParts: [chassis, wheelR, wheelF, head].map((b) => ({ x: b.position.x, y: b.position.y })),
      headConstraints: [neckSpine, neckL, neckR],
      headSevered: false,
      ragdollSpawned: false,
      dead: false,
      airTicks: 0,
      isAirborne: false,
      accelHoldMs: 0,
      accelDir: 0,
      groundAngle: 0,
      curveRate: 0,
      lastGroundAngle: 0,
      groundNormal: { x: 0, y: -1 },
      driving: false,
      speedScale: 1.0,
      accelScale: 1.0,
      jumpDisabled: false,
      jumpCooldownMs: JUMP_COOLDOWN_MS,
      lastJumpAtMs: -99999,
      driverState: {
        lean: 0,
        leanVel: 0,
        armL: 0.78,
        armLVel: 0,
        armR: 0.88,
        armRVel: 0,
        prevVx: 0,
        prevVy: 0
      }
    };
  }

  getJumpCooldownRemaining(playerIndex) {
    const car = playerIndex === 1 ? this.p1Car : this.p2Car;
    if (!car || car.jumpDisabled) return Infinity;
    const cooldownMs = car.jumpCooldownMs || JUMP_COOLDOWN_MS;
    const elapsedSince = this.roundElapsedMs - car.lastJumpAtMs;
    if (elapsedSince >= cooldownMs) return 0;
    return Math.max(0, cooldownMs - elapsedSince);
  }

  triggerJump(car, chaseDir = 0) {
    if (!car || car.dead || car.jumpDisabled) return false;
    const cooldownMs = car.jumpCooldownMs || JUMP_COOLDOWN_MS;
    if (this.roundElapsedMs - car.lastJumpAtMs < cooldownMs) return false;
    if (car.isAirborne && car.airTicks > 8) return false;

    const gn = car.groundNormal || { x: 0, y: -1 };
    const steepWall = Math.abs(gn.x) > 0.50 && gn.y < 0.30;
    const dxBoost = steepWall
      ? (gn.x * 4.2 + chaseDir * 0.5)
      : (chaseDir * VEHICLE_PHYSICS.JUMP_FWD_BOOST);
    const maxVx = Math.max(10.8, VEHICLE_PHYSICS.MAX_FORWARD_SPEED * (car.speedScale || 1.0) + VEHICLE_PHYSICS.JUMP_FWD_BOOST + 0.5);
    const bodies = [car.chassis, car.wheelR, car.wheelF, car.head];
    for (const b of bodies) {
      const targetVy = clamp(
        b.velocity.y - VEHICLE_PHYSICS.JUMP_IMPULSE_VY,
        -VEHICLE_PHYSICS.JUMP_MAX_VY,
        -VEHICLE_PHYSICS.JUMP_MIN_VY
      );
      this.Body.setVelocity(b, {
        x: clamp(b.velocity.x + dxBoost, -maxVx, maxVx),
        y: targetVy
      });
    }
    car.lastJumpAtMs = this.roundElapsedMs;
    car.isAirborne = true;
    car.airTicks = Math.max(car.airTicks, 2);
    if (car.driverState) {
      car.driverState.armLVel -= 0.35;
      car.driverState.armRVel -= 0.40;
      car.driverState.leanVel -= car.facing * 0.22;
    }
    if (this.onJump) {
      const wy = car.spec ? car.spec.wheelOffsetY : CAR_SPEC.wheelOffsetY;
      this.onJump(car.playerIndex, {
        x: car.chassis.position.x,
        y: car.chassis.position.y + wy + 6
      });
    }
    return true;
  }

  triggerBotJump(car, chaseDir = 0) {
    return this.triggerJump(car, chaseDir);
  }

  _forEachRenderBody(fn) {
    for (const car of [this.p1Car, this.p2Car]) {
      if (!car) continue;
      if (car.chassis) fn(car.chassis);
      if (car.wheelR) fn(car.wheelR);
      if (car.wheelF) fn(car.wheelF);
      if (car.head) fn(car.head);
    }
    for (const s of this.seesaws) {
      if (s && s.body) fn(s.body);
    }
    for (const rag of this.ragdolls) {
      if (!rag) continue;
      for (const part of [rag.head, rag.torso, rag.armL, rag.armR, rag.legL, rag.legR]) {
        if (part) fn(part);
      }
    }
  }

  snapshotPrevRenderState() {
    if (!this._prevBodyPoses) this._prevBodyPoses = new Map();
    this._prevBodyPoses.clear();
    this._forEachRenderBody((b) => {
      this._prevBodyPoses.set(b.id, { x: b.position.x, y: b.position.y, a: b.angle });
    });
    this._prevWaterCrestY = this.waterCrestY;
  }

  applyRenderInterpolation(alpha = 1) {
    if (!this._prevBodyPoses || this._prevBodyPoses.size === 0 || alpha >= 0.999) {
      return () => {};
    }
    const t = clamp(alpha, 0, 1);
    const saved = [];
    this._forEachRenderBody((b) => {
      const prev = this._prevBodyPoses.get(b.id);
      if (!prev) return;
      const dx = b.position.x - prev.x;
      const dy = b.position.y - prev.y;
      if (dx * dx + dy * dy > 100 * 100) return;
      saved.push({ body: b, x: b.position.x, y: b.position.y, angle: b.angle });
      b.position.x = prev.x + dx * t;
      b.position.y = prev.y + dy * t;
      const da = Math.atan2(Math.sin(b.angle - prev.a), Math.cos(b.angle - prev.a));
      b.angle = prev.a + da * t;
    });
    const savedWater = this.waterCrestY;
    if (Number.isFinite(this._prevWaterCrestY)) {
      this.waterCrestY = this._prevWaterCrestY + (savedWater - this._prevWaterCrestY) * t;
    }
    return () => {
      for (let i = 0; i < saved.length; i++) {
        const item = saved[i];
        item.body.position.x = item.x;
        item.body.position.y = item.y;
        item.body.angle = item.angle;
      }
      this.waterCrestY = savedWater;
    };
  }

  captureCarPose(car) {
    if (!car) return null;
    const pack = (b) => ({ x: b.position.x, y: b.position.y, a: b.angle });
    return {
      c: pack(car.chassis),
      wr: pack(car.wheelR),
      wf: pack(car.wheelF),
      h: pack(car.head)
    };
  }

  blendCarPose(car, prevPose, alpha) {
    if (!car || !prevPose) return;
    const blend = (b, prev) => {
      this.Body.setPosition(b, {
        x: lerp(prev.x, b.position.x, alpha),
        y: lerp(prev.y, b.position.y, alpha)
      });
      this.Body.setAngle(b, lerpAngle(prev.a, b.angle, alpha));
    };
    blend(car.chassis, prevPose.c);
    blend(car.wheelR, prevPose.wr);
    blend(car.wheelF, prevPose.wf);
    blend(car.head, prevPose.h);
  }

  applyNetState(snap) {
    if (!snap) return;
    const applyBody = (body, st) => {
      if (!body || !st) return;
      if (Array.isArray(st)) {
        if (!st.every(Number.isFinite)) return;
        this.Body.setPosition(body, { x: st[0], y: st[1] });
        this.Body.setVelocity(body, { x: st[2], y: st[3] });
        this.Body.setAngle(body, st[4]);
        this.Body.setAngularVelocity(body, st[5]);
        return;
      }
      if (!Number.isFinite(st.x) || !Number.isFinite(st.y) || !Number.isFinite(st.a)) return;
      this.Body.setPosition(body, { x: st.x, y: st.y });
      this.Body.setAngle(body, st.a);
      if (Number.isFinite(st.vx) && Number.isFinite(st.vy)) {
        this.Body.setVelocity(body, { x: st.vx, y: st.vy });
      }
      if (Number.isFinite(st.av)) {
        this.Body.setAngularVelocity(body, st.av);
      }
    };

    for (const [carKey, bodyKey, shortKey] of BODY_KEYS) {
      const car = this[carKey];
      if (!car || !snap[shortKey]) continue;
      if (bodyKey === 'head' && car.headSevered) continue;
      applyBody(car[bodyKey], snap[shortKey]);
    }
    if (this.p1Car) {
      this.p1Car.driving = !!snap.dr1;
      if (typeof snap.hm1 === 'number') this.p1Car.accelHoldMs = snap.hm1;
      if (typeof snap.ad1 === 'number') this.p1Car.accelDir = snap.ad1;
      if (typeof snap.lj1 === 'number') this.p1Car.lastJumpAtMs = snap.lj1;
    }
    if (this.p2Car) {
      this.p2Car.driving = !!snap.dr2;
      if (typeof snap.hm2 === 'number') this.p2Car.accelHoldMs = snap.hm2;
      if (typeof snap.ad2 === 'number') this.p2Car.accelDir = snap.ad2;
      if (typeof snap.lj2 === 'number') this.p2Car.lastJumpAtMs = snap.lj2;
    }
    if (typeof snap.rt === 'number') this.roundElapsedMs = snap.rt;
    if (typeof snap.wy === 'number') {
      this.waterCrestY = snap.wy;
      this.waterHazardY = snap.wy + WATER_RISE.HAZARD_OFFSET_Y;
      this.waterRising = this.roundElapsedMs >= WATER_RISE.DELAY_MS;
    }
    if (snap.sw && this.seesaws.length === snap.sw.length) {
      for (let i = 0; i < this.seesaws.length; i++) {
        const swSt = snap.sw[i];
        if (Array.isArray(swSt)) {
          if (Number.isFinite(swSt[0])) this.Body.setAngle(this.seesaws[i].body, swSt[0]);
          if (Number.isFinite(swSt[1])) this.Body.setAngularVelocity(this.seesaws[i].body, swSt[1]);
        } else if (swSt && Number.isFinite(swSt.a)) {
          this.Body.setAngle(this.seesaws[i].body, swSt.a);
          if (Number.isFinite(swSt.av)) {
            this.Body.setAngularVelocity(this.seesaws[i].body, swSt.av);
          }
        }
      }
    }
  }

  _spawnRagdollBodies(car, impactPt, isWater = false) {
    if (!car || car.ragdollSpawned) return;
    car.ragdollSpawned = true;

    const ragGroup = car.collisionGroup;
    car.head.collisionFilter.group = ragGroup;
    car.head.restitution = 0.42;
    car.head.friction = 0.45;
    car.head.frictionAir = 0.005;

    const hx = car.head.position.x;
    const hy = car.head.position.y;
    const dx = hx - (impactPt ? impactPt.x : car.chassis.position.x);
    const dy = hy - (impactPt ? impactPt.y : car.chassis.position.y);
    const len = Math.hypot(dx, dy) || 1;

    const baseVx = isWater
      ? -car.facing * 2.8 + car.chassis.velocity.x * 0.25
      : (dx / len) * 7.8 + car.chassis.velocity.x * 0.35;
    const baseVy = isWater ? -11.4 : -9.4;

    this.Body.setVelocity(car.head, { x: baseVx, y: baseVy - 0.8 });
    this.Body.setAngularVelocity(car.head, -car.facing * 0.38);

    const torso = this.Bodies.rectangle(hx, hy + 4 * CAR_SCALE, 12 * CAR_SCALE, 19 * CAR_SCALE, {
      chamfer: { radius: 5.5 * CAR_SCALE },
      density: 0.0008,
      restitution: 0.38,
      friction: 0.45,
      frictionAir: 0.006,
      collisionFilter: { group: ragGroup },
      label: 'ragdoll'
    });
    const armL = this.Bodies.rectangle(hx - 10 * CAR_SCALE, hy, 5.5 * CAR_SCALE, 15 * CAR_SCALE, {
      chamfer: { radius: 2.75 * CAR_SCALE },
      density: 0.0004,
      restitution: 0.42,
      friction: 0.38,
      frictionAir: 0.007,
      collisionFilter: { group: ragGroup },
      label: 'ragdoll'
    });
    const armR = this.Bodies.rectangle(hx + 10 * CAR_SCALE, hy, 5.5 * CAR_SCALE, 15 * CAR_SCALE, {
      chamfer: { radius: 2.75 * CAR_SCALE },
      density: 0.0004,
      restitution: 0.42,
      friction: 0.38,
      frictionAir: 0.007,
      collisionFilter: { group: ragGroup },
      label: 'ragdoll'
    });
    const legL = this.Bodies.rectangle(hx - 5 * CAR_SCALE, hy + 18 * CAR_SCALE, 6 * CAR_SCALE, 16 * CAR_SCALE, {
      chamfer: { radius: 3 * CAR_SCALE },
      density: 0.00045,
      restitution: 0.38,
      friction: 0.42,
      frictionAir: 0.007,
      collisionFilter: { group: ragGroup },
      label: 'ragdoll'
    });
    const legR = this.Bodies.rectangle(hx + 5 * CAR_SCALE, hy + 18 * CAR_SCALE, 6 * CAR_SCALE, 16 * CAR_SCALE, {
      chamfer: { radius: 3 * CAR_SCALE },
      density: 0.00045,
      restitution: 0.38,
      friction: 0.42,
      frictionAir: 0.007,
      collisionFilter: { group: ragGroup },
      label: 'ragdoll'
    });

    const neckJ = this.Constraint.create({
      bodyA: torso, pointA: { x: 0, y: -9 * CAR_SCALE },
      bodyB: car.head, pointB: { x: 0, y: 4 * CAR_SCALE },
      length: 3 * CAR_SCALE, stiffness: 0.72, damping: 0.10
    });
    const shoulderL = this.Constraint.create({
      bodyA: torso, pointA: { x: -5.5 * CAR_SCALE, y: -6 * CAR_SCALE },
      bodyB: armL, pointB: { x: 0, y: -6 * CAR_SCALE },
      length: 1, stiffness: 0.78, damping: 0.08
    });
    const shoulderR = this.Constraint.create({
      bodyA: torso, pointA: { x: 5.5 * CAR_SCALE, y: -6 * CAR_SCALE },
      bodyB: armR, pointB: { x: 0, y: -6 * CAR_SCALE },
      length: 1, stiffness: 0.78, damping: 0.08
    });
    const hipL = this.Constraint.create({
      bodyA: torso, pointA: { x: -3.5 * CAR_SCALE, y: 8.5 * CAR_SCALE },
      bodyB: legL, pointB: { x: 0, y: -6.5 * CAR_SCALE },
      length: 1, stiffness: 0.78, damping: 0.08
    });
    const hipR = this.Constraint.create({
      bodyA: torso, pointA: { x: 3.5 * CAR_SCALE, y: 8.5 * CAR_SCALE },
      bodyB: legR, pointB: { x: 0, y: -6.5 * CAR_SCALE },
      length: 1, stiffness: 0.78, damping: 0.08
    });

    // Deterministic spread velocities & tumbling angular impulses for cartwheeling comic ragdoll
    this.Body.setVelocity(torso, { x: baseVx * 0.96, y: baseVy });
    this.Body.setAngularVelocity(torso, -car.facing * 0.28);

    this.Body.setVelocity(armL, { x: baseVx - 3.0, y: baseVy - 1.6 });
    this.Body.setVelocity(armR, { x: baseVx + 3.0, y: baseVy - 1.1 });
    this.Body.setAngularVelocity(armL, 0.48);
    this.Body.setAngularVelocity(armR, -0.44);

    this.Body.setVelocity(legL, { x: baseVx - 2.0, y: baseVy + 1.0 });
    this.Body.setVelocity(legR, { x: baseVx + 2.0, y: baseVy + 1.2 });
    this.Body.setAngularVelocity(legL, -0.36);
    this.Body.setAngularVelocity(legR, 0.40);

    this.Composite.add(this.engine.world, [
      torso, armL, armR, legL, legR,
      neckJ, shoulderL, shoulderR, hipL, hipR
    ]);

    this.ragdolls.push({
      isRedPlayer: car.isRedPlayer,
      facing: car.facing,
      head: car.head,
      torso,
      armL,
      armR,
      legL,
      legR,
      splashed: false
    });
  }

  _severDriver(playerIndex, impactPt, isWater = false) {
    const car = playerIndex === 1 ? this.p1Car : this.p2Car;
    if (!car || car.headSevered) return;
    car.headSevered = true;
    car.dead = true;

    for (const c of car.headConstraints) {
      this.Composite.remove(this.engine.world, c);
    }
    car.headConstraints = [];
    this._spawnRagdollBodies(car, impactPt, isWater);
  }

  popHelmet(playerIndex, impactPt) {
    this._severDriver(playerIndex, impactPt, false);
  }

  ejectWaterRagdoll(playerIndex, impactPt) {
    this._severDriver(playerIndex, impactPt, true);
  }

  _updateDriverSpring(car) {
    if (!car || car.dead || !car.driverState) return;
    const ds = car.driverState;
    const vx = car.chassis.velocity.x;
    const vy = car.chassis.velocity.y;
    const ax = vx - ds.prevVx;
    const ay = vy - ds.prevVy;
    ds.prevVx = vx;
    ds.prevVy = vy;

    // Deterministic spring-damper whipping the driver torso & arms with G-forces and air-time
    const localAx = (ax * Math.cos(car.chassis.angle) + ay * Math.sin(car.chassis.angle)) * car.facing;
    const targetLean = clamp(-localAx * 0.24 - car.chassis.angularVelocity * 1.4, -0.48, 0.48);
    ds.leanVel = ds.leanVel * 0.78 + (targetLean - ds.lean) * 0.22;
    ds.lean = clamp(ds.lean + ds.leanVel, -0.52, 0.52);

    const spinRate = Math.abs(car.chassis.angularVelocity);
    const wave = Math.sin(this.roundElapsedMs * 0.024 + (car.isRedPlayer ? 0 : 1.7));
    const airFlail = car.isAirborne || spinRate > 0.045;
    const targetArmL = airFlail ? (-0.15 + wave * 0.75) : (0.78 + clamp(-ay * 0.16, -0.55, 0.30));
    const targetArmR = airFlail ? (-0.05 - wave * 0.75) : (0.88 + clamp(-ay * 0.16, -0.55, 0.30));

    ds.armLVel = ds.armLVel * 0.74 + (targetArmL - ds.armL) * 0.26;
    ds.armRVel = ds.armRVel * 0.74 + (targetArmR - ds.armR) * 0.26;
    ds.armL = clamp(ds.armL + ds.armLVel, -1.65, 1.45);
    ds.armR = clamp(ds.armR + ds.armRVel, -1.65, 1.45);
  }

  _updateRisingWater() {
    this.roundElapsedMs += FIXED_DT;
    if (this.roundElapsedMs >= WATER_RISE.DELAY_MS) {
      this.waterRising = true;
      const stepPx = (WATER_RISE.SPEED_PX_PER_SEC * FIXED_DT) / 1000;
      this.waterCrestY = Math.max(WATER_RISE.MIN_CREST_Y, this.waterCrestY - stepPx);
      this.waterHazardY = this.waterCrestY + WATER_RISE.HAZARD_OFFSET_Y;
    }
  }

  stepHoverCountdown(countdownElapsedMs = 0) {
    this.snapshotPrevRenderState();
    const tMs = Number.isFinite(countdownElapsedMs) ? countdownElapsedMs : 0;
    const hoverY = -3.0 * (1 - Math.cos(tMs * 0.0055));
    const cars = [this.p1Car, this.p2Car];
    for (const car of cars) {
      if (!car || !car.spawnParts) continue;
      const parts = [car.chassis, car.wheelR, car.wheelF, car.head];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const base = car.spawnParts[i];
        if (!part || !base) continue;
        this.Body.setPosition(part, { x: base.x, y: base.y + hoverY });
        this.Body.setVelocity(part, { x: 0, y: 0 });
        this.Body.setAngle(part, 0);
        this.Body.setAngularVelocity(part, 0);
      }
      car.isAirborne = false;
      car.airTicks = 0;
      car.driving = false;
      car.accelHoldMs = 0;
      car.accelDir = 0;
    }

    for (const s of this.seesaws) {
      if (!s || !s.body) continue;
      this.Body.setAngle(s.body, s.spawnAngle ?? 0);
      this.Body.setAngularVelocity(s.body, 0);
      this.Body.setVelocity(s.body, { x: 0, y: 0 });
    }
  }

  releaseHoverCountdown() {
    this.stepHoverCountdown(0);
  }

  step(p1Input, p2Input, canControl, updateWater = true) {
    this.snapshotPrevRenderState();
    const empty = { l: false, r: false, holdMs: 0 };
    const activeP1 = canControl ? (p1Input || empty) : empty;
    const activeP2 = canControl ? (p2Input || empty) : empty;

    if (canControl && updateWater) {
      this._updateRisingWater();
    }

    const g1 = this.vehicleController.updateVehicle(this.p1Car, activeP1, this.wheelContacts.p1, this.driveSurfaces);
    const g2 = this.vehicleController.updateVehicle(this.p2Car, activeP2, this.wheelContacts.p2, this.driveSurfaces);

    if (canControl && activeP1.jump && this.p1Car && !this.p1Car.dead && !this.p1Car.jumpDisabled) {
      const chaseDir1 = activeP1.r ? 1 : (activeP1.l ? -1 : 0);
      this.triggerJump(this.p1Car, chaseDir1);
    }
    if (canControl && activeP2.jump && this.p2Car && !this.p2Car.dead && !this.p2Car.jumpDisabled) {
      const chaseDir2 = activeP2.r ? 1 : (activeP2.l ? -1 : 0);
      this.triggerJump(this.p2Car, chaseDir2);
    }

    this.grounded.p1R = g1.rearGrounded;
    this.grounded.p1F = g1.frontGrounded;
    this.grounded.p2R = g2.rearGrounded;
    this.grounded.p2F = g2.frontGrounded;

    this.Engine.update(this.engine, FIXED_DT);

    this.vehicleController.clampAirborneAndMaxSpeed(this.p1Car);
    this.vehicleController.clampAirborneAndMaxSpeed(this.p2Car);
    this._updateDriverSpring(this.p1Car);
    this._updateDriverSpring(this.p2Car);

    for (const rag of this.ragdolls) {
      if (!rag.splashed && rag.torso.position.y > this.waterHazardY - 4 && rag.torso.velocity.y > 1.2) {
        rag.splashed = true;
        if (this.onRagdollSplash) this.onRagdollSplash(rag.torso.position.x, this.waterCrestY);
      }
    }

    for (const sw of this.seesaws) {
      if (sw.motorSpeed) {
        const av = lerp(sw.body.angularVelocity, sw.motorSpeed, 0.35);
        this.Body.setAngularVelocity(sw.body, clamp(av, -0.18, 0.18));
        continue;
      }
      let av = sw.body.angularVelocity * 0.985;
      if (sw.isBridge) {
        if (sw.springRate > 0) {
          av += -sw.body.angle * sw.springRate;
        }
        if (sw.maxAngle > 0) {
          if (sw.body.angle > sw.maxAngle) {
            this.Body.setAngle(sw.body, sw.maxAngle);
            if (av > 0) av = 0;
          } else if (sw.body.angle < -sw.maxAngle) {
            this.Body.setAngle(sw.body, -sw.maxAngle);
            if (av < 0) av = 0;
          }
        }
      }
      this.Body.setAngularVelocity(sw.body, clamp(av, -0.18, 0.18));
    }

    if (this.isHostSide) {
      const checkWater = (car, idx) => {
        if (!car || car.dead) return;
        const outX = car.chassis.position.x < -140 || car.chassis.position.x > WORLD_W + 140;
        if (car.head.position.y > this.waterHazardY || car.chassis.position.y > this.waterHazardY || outX) {
          if (this.onWaterKO) this.onWaterKO(idx, { x: clamp(car.chassis.position.x, 40, WORLD_W - 40), y: this.waterCrestY });
        }
      };
      checkWater(this.p1Car, 1);
      checkWater(this.p2Car, 2);
    }
  }
}
