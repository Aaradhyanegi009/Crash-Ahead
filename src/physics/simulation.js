import {
  WORLD_W,
  WORLD_H,
  FIXED_DT,
  WATER_CREST_Y,
  WATER_HAZARD_Y,
  WATER_RISE,
  CAR_SCALE,
  CENTER_OF_MASS_OFFSET,
  SUSPENSION_DAMPING,
  VEHICLE_PHYSICS,
  CAR_SPEC
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
      gravity: { x: 0, y: 1.0, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 4
    });

    this.vehicleController = new VehiclePhysicsController(this.Body, this.Query, this.engine);

    this.arenaIndex = 0;
    this.p1Car = null;
    this.p2Car = null;
    this.seesaws = [];
    this.driveSurfaces = [];
    this.grounded = { p1R: false, p1F: false, p2R: false, p2F: false };
    this._resetWheelContacts();

    this.roundElapsedMs = 0;
    this.waterCrestY = WATER_CREST_Y;
    this.waterHazardY = WATER_HAZARD_Y;
    this.waterRising = false;

    this.onHeadKO = null;
    this.onWaterKO = null;
    this.onCarBump = null;
    this.onJump = null;

    this._bindCollisions();
  }

  _resetWheelContacts() {
    this.wheelContacts = {
      p1: { rear: { count: 0, nx: 0, ny: 0 }, front: { count: 0, nx: 0, ny: 0 } },
      p2: { rear: { count: 0, nx: 0, ny: 0 }, front: { count: 0, nx: 0, ny: 0 } }
    };
  }

  _bindCollisions() {
    this.Events.on(this.engine, 'beforeUpdate', () => {
      this._resetWheelContacts();
    });

    this.Events.on(this.engine, 'collisionActive', (ev) => {
      const addWheelContact = (wheelBody, pKey, wKey, pair) => {
        const wc = this.wheelContacts[pKey][wKey];
        const n = pair.collision && pair.collision.normal;
        if (!n) return;
        const sign = pair.bodyA === wheelBody ? -1 : 1;
        wc.nx += n.x * sign;
        wc.ny += n.y * sign;
        wc.count += 1;
      };

      for (let i = 0; i < ev.pairs.length; i++) {
        const pair = ev.pairs[i];
        const a = pair.bodyA;
        const b = pair.bodyB;
        const la = a.label || '';
        const lb = b.label || '';
        const solidA = la === 'island' || la === 'seesaw' || la.startsWith('chassis_') || la.startsWith('wheel_');
        const solidB = lb === 'island' || lb === 'seesaw' || lb.startsWith('chassis_') || lb.startsWith('wheel_');

        if (la === 'wheel_p1_r' && solidB && !lb.includes('_p1')) addWheelContact(a, 'p1', 'rear', pair);
        if (lb === 'wheel_p1_r' && solidA && !la.includes('_p1')) addWheelContact(b, 'p1', 'rear', pair);
        if (la === 'wheel_p1_f' && solidB && !lb.includes('_p1')) addWheelContact(a, 'p1', 'front', pair);
        if (lb === 'wheel_p1_f' && solidA && !la.includes('_p1')) addWheelContact(b, 'p1', 'front', pair);

        if (la === 'wheel_p2_r' && solidB && !lb.includes('_p2')) addWheelContact(a, 'p2', 'rear', pair);
        if (lb === 'wheel_p2_r' && solidA && !la.includes('_p2')) addWheelContact(b, 'p2', 'rear', pair);
        if (la === 'wheel_p2_f' && solidB && !lb.includes('_p2')) addWheelContact(a, 'p2', 'front', pair);
        if (lb === 'wheel_p2_f' && solidA && !la.includes('_p2')) addWheelContact(b, 'p2', 'front', pair);
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

        if (la === 'head_p1' || lb === 'head_p1') {
          const other = la === 'head_p1' ? b : a;
          const ol = other.label || '';
          if (ol === 'island' || ol === 'seesaw' || ol.endsWith('_p2') || ol.includes('_p2_')) {
            const pt = (pair.collision.supports && pair.collision.supports[0]) || a.position;
            if (this.onHeadKO) this.onHeadKO(1, pt);
          }
        }
        if (la === 'head_p2' || lb === 'head_p2') {
          const other = la === 'head_p2' ? b : a;
          const ol = other.label || '';
          if (ol === 'island' || ol === 'seesaw' || ol.endsWith('_p1') || ol.includes('_p1_')) {
            const pt = (pair.collision.supports && pair.collision.supports[0]) || b.position;
            if (this.onHeadKO) this.onHeadKO(2, pt);
          }
        }

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

  _addSurfacePolyline(pts, inwardSign = 1, thickness = 34, closeLoop = false) {
    const count = closeLoop ? pts.length : pts.length - 1;
    const jointRadius = thickness * 0.48;
    const normals = [];
    for (let i = 0; i < count; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1) {
        normals.push(null);
        continue;
      }
      const angle = Math.atan2(dy, dx);
      const nx = -Math.sin(angle) * inwardSign;
      const ny = Math.cos(angle) * inwardSign;
      normals.push({ nx, ny });
      const cx = (p0.x + p1.x) * 0.5 + nx * (thickness * 0.5);
      const cy = (p0.y + p1.y) * 0.5 + ny * (thickness * 0.5);

      // Use exact segment length (+0.5px weld) so corners never poke above concave curves.
      const rect = this.Bodies.rectangle(cx, cy, segLen + 0.5, thickness, {
        isStatic: true,
        angle,
        chamfer: { radius: 2 },
        friction: 0.92,
        restitution: 0.08,
        slop: 0.015,
        label: 'island'
      });
      this.Composite.add(this.engine.world, rect);
      this.driveSurfaces.push(rect);
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
      const joint = this.Bodies.circle(
        pt.x + (ax / len) * (thickness * 0.5),
        pt.y + (ay / len) * (thickness * 0.5),
        jointRadius,
        {
          isStatic: true,
          friction: 0.92,
          restitution: 0.08,
          slop: 0.015,
          label: 'island'
        }
      );
      this.Composite.add(this.engine.world, joint);
      this.driveSurfaces.push(joint);
    }
  }

  _addHalfPipeColliders(pipe) {
    const steps = 20;
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
      const seg = this.Bodies.rectangle(cx, cy, segLen + 0.5, pipe.thickness, {
        isStatic: true,
        angle,
        friction: 0.92,
        restitution: 0.10,
        slop: 0.015,
        label: 'island'
      });
      this.Composite.add(this.engine.world, seg);
      this.driveSurfaces.push(seg);
    }
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const capRadius = (i === 0 || i === pts.length - 1) ? pipe.thickness * 0.5 : pipe.thickness * 0.49;
      const cap = this.Bodies.circle(pt.x, pt.y, capRadius, {
        isStatic: true,
        friction: 0.92,
        restitution: 0.10,
        slop: 0.015,
        label: 'island'
      });
      this.Composite.add(this.engine.world, cap);
      this.driveSurfaces.push(cap);
    }
  }

  _addSeesaw(cfg) {
    const isBridge = !!cfg.isBridge;
    const plank = this.Bodies.rectangle(cfg.x, cfg.y, cfg.w, 28, {
      density: isBridge ? 0.0036 : 0.0042,
      chamfer: { radius: 14 },
      friction: 0.95,
      restitution: 0.08,
      frictionAir: isBridge ? 0.006 : 0.012,
      slop: 0.015,
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
      maxAngle: typeof cfg.maxAngle === 'number' ? cfg.maxAngle : 0,
      springRate: typeof cfg.springRate === 'number' ? cfg.springRate : 0
    });
    this.driveSurfaces.push(plank);
  }

  resetArena(arenaIndex = this.arenaIndex) {
    this.arenaIndex = ((arenaIndex % ARENAS.length) + ARENAS.length) % ARENAS.length;
    const arena = ARENAS[this.arenaIndex];

    this.Composite.clear(this.engine.world, false);
    this.engine.timing.timeScale = 1.0;
    this.seesaws = [];
    this.driveSurfaces = [];
    this.grounded = { p1R: false, p1F: false, p2R: false, p2F: false };
    this._resetWheelContacts();

    this.roundElapsedMs = 0;
    this.waterCrestY = WATER_CREST_Y;
    this.waterHazardY = WATER_HAZARD_Y;
    this.waterRising = false;

    for (const isl of arena.islands) {
      this._addSurfacePolyline(isl.top, 1, 34, false);
      this._addSurfacePolyline(isl.belly, 1, 24, false);
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
      const rect = this.Bodies.rectangle(blk.x, blk.y, blk.w, blk.h, {
        isStatic: true,
        angle: blk.angle || 0,
        chamfer: { radius: blk.chamfer || 4 },
        friction: 1.0,
        restitution: 0.14,
        label: 'island'
      });
      this.Composite.add(this.engine.world, rect);
      this.driveSurfaces.push(rect);
    }

    for (const sw of arena.seesaws) {
      this._addSeesaw(sw);
    }

    this.p1Car = this._buildRoadster(1, arena.p1Spawn.x, arena.p1Spawn.y);
    this.p2Car = this._buildRoadster(2, arena.p2Spawn.x, arena.p2Spawn.y);
  }

  _buildRoadster(playerIndex, x, y) {
    const facing = playerIndex === 1 ? 1 : -1;
    const pTag = playerIndex === 1 ? 'p1' : 'p2';
    const group = this.Body.nextGroup(true);

    const chassis = this.Bodies.rectangle(x, y, CAR_SPEC.width, CAR_SPEC.height, {
      chamfer: { radius: 7 * CAR_SCALE },
      density: CAR_SPEC.density,
      restitution: CAR_SPEC.restitution,
      friction: CAR_SPEC.friction,
      frictionAir: 0.0045,
      slop: 0.015,
      collisionFilter: { group },
      label: `chassis_${pTag}`
    });
    this.Body.setCentre(chassis, { x: 0, y: CENTER_OF_MASS_OFFSET }, true);

    const wheelR = this.Bodies.circle(x - CAR_SPEC.wheelOffsetX, y + CAR_SPEC.wheelOffsetY, CAR_SPEC.wheelRadius, {
      density: CAR_SPEC.wheelDensity,
      friction: CAR_SPEC.wheelFriction,
      frictionStatic: 0.22,
      restitution: CAR_SPEC.wheelRestitution,
      frictionAir: 0.004,
      slop: 0.008,
      collisionFilter: { group },
      label: `wheel_${pTag}_r`
    });

    const wheelF = this.Bodies.circle(x + CAR_SPEC.wheelOffsetX, y + CAR_SPEC.wheelOffsetY, CAR_SPEC.wheelRadius, {
      density: CAR_SPEC.wheelDensity,
      friction: CAR_SPEC.wheelFriction,
      frictionStatic: 0.22,
      restitution: CAR_SPEC.wheelRestitution,
      frictionAir: 0.004,
      slop: 0.008,
      collisionFilter: { group },
      label: `wheel_${pTag}_f`
    });

    const head = this.Bodies.circle(x, y + CAR_SPEC.headOffsetY, CAR_SPEC.headRadius, {
      density: CAR_SPEC.headDensity,
      restitution: CAR_SPEC.headRestitution,
      friction: 0.3,
      frictionAir: 0.008,
      collisionFilter: { group },
      label: `head_${pTag}`
    });

    const suspY = CAR_SPEC.wheelOffsetY - CENTER_OF_MASS_OFFSET;
    const suspRVert = this.Constraint.create({
      bodyA: chassis, pointA: { x: -CAR_SPEC.wheelOffsetX, y: suspY },
      bodyB: wheelR, pointB: { x: 0, y: 0 },
      length: 0, stiffness: VEHICLE_PHYSICS.SUSPENSION_STIFFNESS, damping: SUSPENSION_DAMPING
    });
    const suspRArm = this.Constraint.create({
      bodyA: chassis, pointA: { x: 0, y: suspY },
      bodyB: wheelR, pointB: { x: 0, y: 0 },
      length: CAR_SPEC.wheelOffsetX, stiffness: VEHICLE_PHYSICS.AXLE_ARM_STIFFNESS, damping: VEHICLE_PHYSICS.AXLE_ARM_DAMPING
    });

    const suspFVert = this.Constraint.create({
      bodyA: chassis, pointA: { x: CAR_SPEC.wheelOffsetX, y: suspY },
      bodyB: wheelF, pointB: { x: 0, y: 0 },
      length: 0, stiffness: VEHICLE_PHYSICS.SUSPENSION_STIFFNESS, damping: SUSPENSION_DAMPING
    });
    const suspFArm = this.Constraint.create({
      bodyA: chassis, pointA: { x: 0, y: suspY },
      bodyB: wheelF, pointB: { x: 0, y: 0 },
      length: CAR_SPEC.wheelOffsetX, stiffness: VEHICLE_PHYSICS.AXLE_ARM_STIFFNESS, damping: VEHICLE_PHYSICS.AXLE_ARM_DAMPING
    });

    const collarY = (-2 * CAR_SCALE) - CENTER_OF_MASS_OFFSET;
    const neckSpanX = 16 * CAR_SCALE;
    const neckSpine = this.Constraint.create({
      bodyA: chassis, pointA: { x: 0, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.92, damping: 0.16
    });
    const neckL = this.Constraint.create({
      bodyA: chassis, pointA: { x: -neckSpanX, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.78, damping: 0.16
    });
    const neckR = this.Constraint.create({
      bodyA: chassis, pointA: { x: neckSpanX, y: collarY },
      bodyB: head, pointB: { x: 0, y: 0 },
      stiffness: 0.78, damping: 0.16
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
      chassis,
      wheelR,
      wheelF,
      head,
      headConstraints: [neckSpine, neckL, neckR],
      headSevered: false,
      dead: false,
      airTicks: 0,
      isAirborne: false,
      accelHoldMs: 0,
      accelDir: 0,
      groundAngle: 0,
      groundNormal: { x: 0, y: -1 },
      driving: false,
      speedScale: 1.0,
      accelScale: 1.0,
      lastJumpAtMs: -99999
    };
  }

  triggerBotJump(car, chaseDir = 0) {
    if (!car || car.dead) return false;
    if (this.roundElapsedMs - car.lastJumpAtMs < 9000) return false;
    if (car.isAirborne && car.airTicks > 8) return false;

    const dxBoost = chaseDir * 1.35;
    const bodies = [car.chassis, car.wheelR, car.wheelF, car.head];
    for (const b of bodies) {
      const targetVy = clamp(b.velocity.y - 7.8, -9.2, -5.8);
      this.Body.setVelocity(b, {
        x: clamp(b.velocity.x + dxBoost, -10.0, 10.0),
        y: targetVy
      });
    }
    car.lastJumpAtMs = this.roundElapsedMs;
    car.airTicks = Math.max(car.airTicks, 2);
    if (this.onJump) {
      this.onJump(car.playerIndex, {
        x: car.chassis.position.x,
        y: car.chassis.position.y + CAR_SPEC.wheelOffsetY + 6
      });
    }
    return true;
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
        this.Body.setPosition(body, { x: st[0], y: st[1] });
        this.Body.setVelocity(body, { x: st[2], y: st[3] });
        this.Body.setAngle(body, st[4]);
        this.Body.setAngularVelocity(body, st[5]);
        return;
      }
      this.Body.setPosition(body, { x: st.x, y: st.y });
      this.Body.setAngle(body, st.a);
      if (typeof st.vx === 'number' && typeof st.vy === 'number') {
        this.Body.setVelocity(body, { x: st.vx, y: st.vy });
      }
      if (typeof st.av === 'number') {
        this.Body.setAngularVelocity(body, st.av);
      }
    };

    for (const [carKey, bodyKey, shortKey] of BODY_KEYS) {
      const car = this[carKey];
      if (car && snap[shortKey]) applyBody(car[bodyKey], snap[shortKey]);
    }
    if (this.p1Car) {
      this.p1Car.driving = !!snap.dr1;
      if (typeof snap.hm1 === 'number') this.p1Car.accelHoldMs = snap.hm1;
      if (typeof snap.ad1 === 'number') this.p1Car.accelDir = snap.ad1;
    }
    if (this.p2Car) {
      this.p2Car.driving = !!snap.dr2;
      if (typeof snap.hm2 === 'number') this.p2Car.accelHoldMs = snap.hm2;
      if (typeof snap.ad2 === 'number') this.p2Car.accelDir = snap.ad2;
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
          this.Body.setAngle(this.seesaws[i].body, swSt[0]);
          this.Body.setAngularVelocity(this.seesaws[i].body, swSt[1]);
        } else {
          this.Body.setAngle(this.seesaws[i].body, swSt.a);
          if (typeof swSt.av === 'number') {
            this.Body.setAngularVelocity(this.seesaws[i].body, swSt.av);
          }
        }
      }
    }
  }

  popHelmet(playerIndex, impactPt) {
    const car = playerIndex === 1 ? this.p1Car : this.p2Car;
    if (!car || car.headSevered) return;
    car.headSevered = true;
    car.dead = true;

    for (const c of car.headConstraints) {
      this.Composite.remove(this.engine.world, c);
    }
    car.headConstraints = [];
    car.head.collisionFilter.group = 0;

    const dx = car.head.position.x - (impactPt ? impactPt.x : car.chassis.position.x);
    const dy = car.head.position.y - (impactPt ? impactPt.y : car.chassis.position.y);
    const len = Math.hypot(dx, dy) || 1;
    this.Body.setVelocity(car.head, {
      x: (dx / len) * 7.5,
      y: -8.2
    });
    this.Body.setAngularVelocity(car.head, -car.facing * 0.28);
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

  step(p1Input, p2Input, canControl, updateWater = true) {
    const empty = { l: false, r: false, holdMs: 0 };
    const activeP1 = canControl ? (p1Input || empty) : empty;
    const activeP2 = canControl ? (p2Input || empty) : empty;

    if (canControl && updateWater) {
      this._updateRisingWater();
    }

    const g1 = this.vehicleController.updateVehicle(this.p1Car, activeP1, this.wheelContacts.p1, this.driveSurfaces);
    const g2 = this.vehicleController.updateVehicle(this.p2Car, activeP2, this.wheelContacts.p2, this.driveSurfaces);

    if (canControl && activeP2.jump && this.p2Car && !this.p2Car.dead) {
      const chaseDir = activeP2.r ? 1 : (activeP2.l ? -1 : 0);
      this.triggerBotJump(this.p2Car, chaseDir);
    }

    this.grounded.p1R = g1.rearGrounded;
    this.grounded.p1F = g1.frontGrounded;
    this.grounded.p2R = g2.rearGrounded;
    this.grounded.p2F = g2.frontGrounded;

    this.Engine.update(this.engine, FIXED_DT);

    this.vehicleController.clampAirborneAndMaxSpeed(this.p1Car);
    this.vehicleController.clampAirborneAndMaxSpeed(this.p2Car);

    for (const sw of this.seesaws) {
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
      this.Body.setAngularVelocity(sw.body, av);
    }

    if (this.isHostSide) {
      const checkWater = (car, idx) => {
        if (!car || car.dead) return;
        if (car.head.position.y > this.waterHazardY || car.chassis.position.y > this.waterHazardY) {
          if (this.onWaterKO) this.onWaterKO(idx, { x: car.chassis.position.x, y: this.waterCrestY });
        }
      };
      checkWater(this.p1Car, 1);
      checkWater(this.p2Car, 2);
    }
  }
}
