import {
  FIXED_DT,
  CAR_SPEC,
  VEHICLE_PHYSICS
} from '../config/constants.js';
import { clamp, lerp, normalizeAngle } from '../utils/math.js';

export const BODY_KEYS = Object.freeze([
  ['p1Car', 'chassis', 'c1'], ['p1Car', 'wheelR', 'w1r'], ['p1Car', 'wheelF', 'w1f'], ['p1Car', 'head', 'h1'],
  ['p2Car', 'chassis', 'c2'], ['p2Car', 'wheelR', 'w2r'], ['p2Car', 'wheelF', 'w2f'], ['p2Car', 'head', 'h2']
]);

export class VehiclePhysicsController {
  constructor(BodyApi, QueryApi, engine) {
    this.Body = BodyApi;
    this.Query = QueryApi;
    this.engine = engine;
  }

  _probeWheelRay(wheel, wheelRadius, carDown, driveBodies, prevNormal, isGrounded = false) {
    if (!driveBodies || driveBodies.length === 0) return null;
    const start = wheel.position;
    const carUpX = -carDown.x;
    const carUpY = -carDown.y;
    const pnx = prevNormal ? prevNormal.x : 0;
    const pny = prevNormal ? prevNormal.y : -1;
    const probeDist = (wheelRadius || CAR_SPEC.wheelRadius) + (isGrounded ? 3.2 : 1.35);

    const castDir = (dx, dy, dist) => {
      const end = { x: start.x + dx * dist, y: start.y + dy * dist };
      const hits = this.Query.ray(driveBodies, start, end, 1);
      if (!hits || hits.length === 0) return null;

      let bestN = null;
      let bestScore = -2;
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.body && h.body.isBackside) continue;
        let nx = h.normal ? h.normal.x : -dx;
        let ny = h.normal ? h.normal.y : -dy;
        if (nx * dx + ny * dy > 0) {
          nx = -nx;
          ny = -ny;
        }
        const len = Math.hypot(nx, ny);
        if (len < 0.001) continue;
        nx /= len;
        ny /= len;
        const upDot = nx * carUpX + ny * carUpY;
        if (upDot > 0.24) {
          const continuity = nx * pnx + ny * pny;
          const score = upDot * 0.72 + continuity * 0.28;
          if (score > bestScore) {
            bestScore = score;
            bestN = { x: nx, y: ny, isBackside: false };
          }
        }
      }
      return bestN;
    };

    const primary = castDir(carDown.x, carDown.y, probeDist);
    if (primary) return primary;
    const pnLen = Math.hypot(pnx, pny);
    if (pnLen > 0.5) {
      const rx = -pnx / pnLen;
      const ry = -pny / pnLen;
      if (Math.abs(carDown.x * rx + carDown.y * ry) < 0.99) {
        return castDir(rx, ry, probeDist);
      }
    }
    return null;
  }

  _hasTrackAhead(car, normal, driveT, driveBodies) {
    if (!car || !driveBodies || driveBodies.length === 0) return false;
    const fdx = car.wheelF.position.x - car.wheelR.position.x;
    const fdy = car.wheelF.position.y - car.wheelR.position.y;
    const leadWheel = (fdx * driveT.x + fdy * driveT.y) >= 0 ? car.wheelF : car.wheelR;
    const start = {
      x: leadWheel.position.x + driveT.x * 20 + normal.x * 10,
      y: leadWheel.position.y + driveT.y * 20 + normal.y * 10
    };
    const end = {
      x: leadWheel.position.x + driveT.x * 20 - normal.x * 28,
      y: leadWheel.position.y + driveT.y * 20 - normal.y * 28
    };
    const hits = this.Query.ray(driveBodies, start, end, 1);
    if (!hits || hits.length === 0) return false;
    for (let i = 0; i < hits.length; i++) {
      if (hits[i].body && !hits[i].body.isBackside) return true;
    }
    return false;
  }

  detectGroundState(car, wheelContacts, driveBodies, elapsedMs = 0) {
    const angle = car.chassis.angle;
    const carDown = { x: -Math.sin(angle), y: Math.cos(angle) };
    const carUp = { x: Math.sin(angle), y: -Math.cos(angle) };
    const jumpDetaching = (car.justJumpedUntilMs ?? -99999) > elapsedMs;

    const checkWheel = (wheel, wheelRadius, contact) => {
      if (contact && contact.count > 0) {
        const len = Math.hypot(contact.nx, contact.ny);
        if (len > 0.001) {
          const nx = contact.nx / len;
          const ny = contact.ny / len;
          const upDot = nx * carUp.x + ny * carUp.y;
          const velAway = wheel.velocity.x * nx + wheel.velocity.y * ny;
          if (jumpDetaching && velAway > 2.0) {
            return { grounded: false, nx: 0, ny: 0, upDot: 0, isBackside: false };
          }
          if (upDot > 0.24) {
            return { grounded: true, nx, ny, upDot, isBackside: Boolean(contact.isBackside && !contact.hasFront) };
          }
        }
      }
      const velUp = wheel.velocity.x * carUp.x + wheel.velocity.y * carUp.y;
      if ((car.isAirborne || jumpDetaching) && velUp > 1.4) {
        return { grounded: false, nx: 0, ny: 0, upDot: 0, isBackside: false };
      }
      const rayNormal = this._probeWheelRay(wheel, wheelRadius, carDown, driveBodies, car.groundNormal, !car.isAirborne);
      if (rayNormal) {
        const upDot = rayNormal.x * carUp.x + rayNormal.y * carUp.y;
        return { grounded: true, nx: rayNormal.x, ny: rayNormal.y, upDot, isBackside: Boolean(rayNormal.isBackside) };
      }
      return { grounded: false, nx: 0, ny: 0, upDot: 0, isBackside: false };
    };

    const rRes = checkWheel(car.wheelR, car.wheelRadiusR || CAR_SPEC.wheelRadius, wheelContacts.rear);
    const fRes = checkWheel(car.wheelF, car.wheelRadiusF || CAR_SPEC.wheelRadius, wheelContacts.front);

    const rearGrounded = rRes.grounded;
    const frontGrounded = fRes.grounded;
    const groundedCount = (rearGrounded ? 1 : 0) + (frontGrounded ? 1 : 0);
    const grounded = groundedCount > 0;
    const isBackside = grounded && (!rearGrounded || rRes.isBackside) && (!frontGrounded || fRes.isBackside);

    if (grounded) {
      let targetNx = 0;
      let targetNy = -1;
      if (rearGrounded && frontGrounded) {
        if (rRes.isBackside !== fRes.isBackside) {
          const pref = rRes.isBackside ? fRes : rRes;
          targetNx = pref.nx;
          targetNy = pref.ny;
        } else {
          const len = Math.hypot(rRes.nx + fRes.nx, rRes.ny + fRes.ny) || 1;
          targetNx = (rRes.nx + fRes.nx) / len;
          targetNy = (rRes.ny + fRes.ny) / len;
        }
      } else {
        const one = rearGrounded ? rRes : fRes;
        targetNx = one.nx;
        targetNy = one.ny;
      }

      if (car.airTicks > 0) {
        const blendNx = lerp(car.groundNormal.x, targetNx, 0.84);
        const blendNy = lerp(car.groundNormal.y, targetNy, 0.84);
        const bLen = Math.hypot(blendNx, blendNy) || 1;
        car.groundNormal = { x: blendNx / bLen, y: blendNy / bLen };
        car.groundAngle = Math.atan2(car.groundNormal.x, -car.groundNormal.y);
      } else {
        // Blend curve normals smoothly along poly segments to prevent polygonal hitching
        const curAng = Math.atan2(car.groundNormal.x, -car.groundNormal.y);
        const targetAng = Math.atan2(targetNx, -targetNy);
        const dAng = normalizeAngle(targetAng - curAng);
        const blendGain = Math.abs(dAng) < 0.25 ? 0.58 : 0.72;
        const stepAng = clamp(dAng * blendGain, -0.28, 0.28);
        const nextAng = curAng + stepAng;
        car.groundNormal = { x: Math.sin(nextAng), y: -Math.cos(nextAng) };
        car.groundAngle = normalizeAngle(nextAng);
      }
      const angDelta = normalizeAngle(car.groundAngle - (car.lastGroundAngle ?? car.groundAngle));
      car.curveRate = lerp(car.curveRate || 0, Math.abs(angDelta), 0.35);
      car.lastGroundAngle = car.groundAngle;
      car.lastGroundNormal = { x: targetNx, y: targetNy };
      car.lastGroundedAtMs = elapsedMs;
      car.airTicks = 0;
    } else {
      car.airTicks += 1;
      car.groundNormal = {
        x: lerp(car.groundNormal.x, 0, 0.04),
        y: lerp(car.groundNormal.y, -1, 0.04)
      };
      const nLen = Math.hypot(car.groundNormal.x, car.groundNormal.y) || 1;
      car.groundNormal.x /= nLen;
      car.groundNormal.y /= nLen;
      car.groundAngle = Math.atan2(car.groundNormal.x, -car.groundNormal.y);
      car.curveRate = (car.curveRate || 0) * 0.85;
      car.lastGroundAngle = car.groundAngle;
    }

    car.isAirborne = !grounded;
    return {
      grounded,
      groundedCount,
      rearGrounded,
      frontGrounded,
      isBackside,
      normal: car.groundNormal,
      groundAngle: car.groundAngle
    };
  }

  _applyPitchStability(car, groundAngle, targetNoseLift, extraAntiFlip = false) {
    const relPitch = normalizeAngle(car.chassis.angle - groundAngle);
    const noseLift = -car.facing * relPitch;
    const liftVel = -car.facing * car.chassis.angularVelocity;

    const err = targetNoseLift - noseLift;
    const overTarget = noseLift > Math.max(0.11, targetNoseLift + 0.025);
    const kp = extraAntiFlip && overTarget ? VEHICLE_PHYSICS.PITCH_KP * 1.45 : VEHICLE_PHYSICS.PITCH_KP;
    const kd = extraAntiFlip && overTarget ? VEHICLE_PHYSICS.PITCH_KD * 1.25 : VEHICLE_PHYSICS.PITCH_KD;
    const torque = clamp(err * kp - liftVel * kd, -VEHICLE_PHYSICS.PITCH_TORQUE_LIMIT, VEHICLE_PHYSICS.PITCH_TORQUE_LIMIT);
    const nextAv = clamp(
      car.chassis.angularVelocity + (-car.facing * torque),
      -VEHICLE_PHYSICS.MAX_ANGULAR_VELOCITY,
      VEHICLE_PHYSICS.MAX_ANGULAR_VELOCITY
    );
    this.Body.setAngularVelocity(car.chassis, nextAv);
  }

  clampAirborneAndMaxSpeed(car) {
    if (!car) return;
    const bodies = [car.chassis, car.wheelR, car.wheelF, car.head];
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b) continue;
      if (
        !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y) ||
        !Number.isFinite(b.velocity.x) || !Number.isFinite(b.velocity.y) ||
        !Number.isFinite(b.angle) || !Number.isFinite(b.angularVelocity)
      ) {
        const safe = (car.spawnParts && car.spawnParts[i]) || { x: 640, y: 360 };
        this.Body.setPosition(b, { x: safe.x, y: safe.y });
        this.Body.setVelocity(b, { x: 0, y: 0 });
        this.Body.setAngle(b, 0);
        this.Body.setAngularVelocity(b, 0);
      }
    }

    const spdScale = car.speedScale || 1.0;
    if (car.isAirborne) {
      const clampedAv = clamp(
        car.chassis.angularVelocity,
        -VEHICLE_PHYSICS.AIR_MAX_SPIN,
        VEHICLE_PHYSICS.AIR_MAX_SPIN
      );
      if (clampedAv !== car.chassis.angularVelocity) {
        this.Body.setAngularVelocity(car.chassis, clampedAv);
      }
    } else if (car.accelDir !== 0 && !car.dead) {
      const isRev = (car.accelDir * car.facing) < 0;
      const maxS = (isRev ? VEHICLE_PHYSICS.MAX_REVERSE_SPEED : VEHICLE_PHYSICS.MAX_FORWARD_SPEED) * spdScale;
      const tx = -car.groundNormal.y;
      const ty = car.groundNormal.x;
      const vT = car.chassis.velocity.x * tx + car.chassis.velocity.y * ty;
      const vAlong = car.accelDir * vT;
      if (vAlong > maxS) {
        const trim = vAlong - maxS;
        const dx = car.accelDir * tx * trim;
        const dy = car.accelDir * ty * trim;
        for (const b of bodies) {
          this.Body.setVelocity(b, { x: b.velocity.x - dx, y: b.velocity.y - dy });
        }
      }
      const totalSpd = Math.hypot(car.chassis.velocity.x, car.chassis.velocity.y);
      const totalCap = maxS * 1.04;
      if (totalSpd > totalCap) {
        const sc = totalCap / totalSpd;
        for (const b of bodies) {
          this.Body.setVelocity(b, { x: b.velocity.x * sc, y: b.velocity.y * sc });
        }
      }
    }

    const worldCap = VEHICLE_PHYSICS.MAX_WORLD_SPEED * Math.max(1.0, spdScale);
    for (const body of bodies) {
      const spd = Math.hypot(body.velocity.x, body.velocity.y);
      if (spd > worldCap) {
        const scale = worldCap / spd;
        this.Body.setVelocity(body, { x: body.velocity.x * scale, y: body.velocity.y * scale });
      }
    }

    if (!car.isAirborne && !car.dead) {
      const edgeSpinCap = VEHICLE_PHYSICS.MAX_ANGULAR_VELOCITY * 1.45;
      if (Math.abs(car.chassis.angularVelocity) > edgeSpinCap) {
        this.Body.setAngularVelocity(
          car.chassis,
          clamp(car.chassis.angularVelocity, -edgeSpinCap, edgeSpinCap)
        );
      }
    }
    if (car.head && Math.abs(car.head.angularVelocity) > 0.45) {
      this.Body.setAngularVelocity(car.head, clamp(car.head.angularVelocity, -0.45, 0.45));
    }
    for (const w of [car.wheelR, car.wheelF]) {
      if (w && Math.abs(w.angularVelocity) > 1.5) {
        this.Body.setAngularVelocity(w, clamp(w.angularVelocity, -1.5, 1.5));
      }
    }
  }

  updateVehicle(car, inputCmd, wheelContacts, driveBodies, elapsedMs = 0) {
    if (!car || car.dead) {
      if (car) {
        car.driving = false;
        car.accelHoldMs = 0;
        car.accelDir = 0;
      }
      return { grounded: false, rearGrounded: false, frontGrounded: false };
    }

    const inputL = !!(inputCmd && inputCmd.l);
    const inputR = !!(inputCmd && inputCmd.r);
    const ground = this.detectGroundState(car, wheelContacts, driveBodies, elapsedMs);
    const jumpDetaching = (car.justJumpedUntilMs ?? -99999) > elapsedMs;
    const worldDir = (inputR ? 1 : 0) - (inputL ? 1 : 0);
    car.driving = worldDir !== 0;

    if (!ground.grounded) {
      // Mid-air: zero horizontal drive, apply progressive clamped pitch torque (gentle over small bumps, full stunt flip in high air)
      car.wheelR.friction = VEHICLE_PHYSICS.WHEEL_BASE_FRICTION;
      car.wheelF.friction = VEHICLE_PHYSICS.WHEEL_BASE_FRICTION;
      if (worldDir === 0) {
        car.accelHoldMs = Math.max(0, car.accelHoldMs - FIXED_DT * VEHICLE_PHYSICS.ACCEL_RELEASE_DECAY);
      }

      const forwardPressed = car.facing > 0 ? inputR : inputL;
      const reversePressed = car.facing > 0 ? inputL : inputR;
      const pitchCmd = (forwardPressed ? 1 : 0) - (reversePressed ? 1 : 0);
      // Inverted mid-air pitch rotation: Gas rolls nose-up/backflip, Reverse rolls nose-down
      const torqueDir = -(pitchCmd * car.facing);

      if (torqueDir !== 0) {
        const rampStart = pitchCmd > 0 ? 15 : 9;
        const rampBase = pitchCmd > 0 ? 0.13 : 0.24;
        const airGain = lerp(rampBase, 1.0, clamp((car.airTicks - rampStart) / 8, 0, 1));
        const clampedTorque = clamp(
          torqueDir * VEHICLE_PHYSICS.AIR_PITCH_TORQUE * airGain,
          -VEHICLE_PHYSICS.MAX_AIR_TORQUE,
          VEHICLE_PHYSICS.MAX_AIR_TORQUE
        );
        car.chassis.torque += clampedTorque;
      } else {
        this.Body.setAngularVelocity(
          car.chassis,
          clamp(
            car.chassis.angularVelocity * VEHICLE_PHYSICS.AIR_ANGULAR_DAMPING,
            -VEHICLE_PHYSICS.AIR_MAX_SPIN,
            VEHICLE_PHYSICS.AIR_MAX_SPIN
          )
        );
      }
      return ground;
    }

    const tx = -ground.normal.y;
    const ty = ground.normal.x;
    const vT = car.chassis.velocity.x * tx + car.chassis.velocity.y * ty;

    if (worldDir === 0) {
      // Ease-out with reduced coasting friction so landed/released cars keep a slight natural roll
      car.accelDir = 0;
      car.accelHoldMs = Math.max(0, car.accelHoldMs - FIXED_DT * VEHICLE_PHYSICS.ACCEL_RELEASE_DECAY);
      car.wheelR.friction = VEHICLE_PHYSICS.WHEEL_COAST_FRICTION;
      car.wheelF.friction = VEHICLE_PHYSICS.WHEEL_COAST_FRICTION;

      this.Body.setAngularVelocity(car.wheelR, car.wheelR.angularVelocity * 0.992);
      this.Body.setAngularVelocity(car.wheelF, car.wheelF.angularVelocity * 0.992);
      if (Math.abs(vT) > 0.08) {
        const dragMag = clamp(Math.abs(vT) * VEHICLE_PHYSICS.COAST_DRAG_COEFF, 0.00008, 0.005);
        const dragSign = vT > 0 ? -1 : 1;
        this.Body.applyForce(car.chassis, car.chassis.position, {
          x: tx * dragSign * dragMag,
          y: ty * dragSign * dragMag
        });
      }
      this.Body.setAngularVelocity(
        car.chassis,
        clamp(car.chassis.angularVelocity * VEHICLE_PHYSICS.GROUND_ANGULAR_DAMPING, -VEHICLE_PHYSICS.MAX_ANGULAR_VELOCITY, VEHICLE_PHYSICS.MAX_ANGULAR_VELOCITY)
      );
      return ground;
    }

    const driveT = { x: worldDir * tx, y: worldDir * ty };
    const vAlong = worldDir * vT;
    const uphillFactor = clamp(-driveT.y, 0, 1);
    const steepWallFactor = clamp(ground.normal.y + 0.85, 0, 1.45);
    const isReverse = (worldDir * car.facing) < 0;

    const activeFriction = clamp(VEHICLE_PHYSICS.WHEEL_BASE_FRICTION + (uphillFactor + steepWallFactor) * 0.03, 0.96, 1.0);
    car.wheelR.friction = activeFriction;
    car.wheelF.friction = activeFriction;

    // Smooth Brake-to-Reverse until tangential velocity crosses zero
    if (vAlong < -VEHICLE_PHYSICS.BRAKE_ZERO_THRESHOLD) {
      car.accelHoldMs = 0;
      car.accelDir = worldDir;
      const brakeScale = clamp((-vAlong) / 2.2, 0.35, 1.0);
      const brakeMag = VEHICLE_PHYSICS.BRAKE_DECEL_FORCE * brakeScale;

      this.Body.setAngularVelocity(car.wheelR, car.wheelR.angularVelocity * 0.60);
      this.Body.setAngularVelocity(car.wheelF, car.wheelF.angularVelocity * 0.60);

      this.Body.applyForce(car.chassis, car.chassis.position, {
        x: driveT.x * brakeMag * 0.54,
        y: driveT.y * brakeMag * 0.54
      });
      if (ground.rearGrounded) {
        this.Body.applyForce(car.wheelR, car.wheelR.position, {
          x: driveT.x * brakeMag * 0.23,
          y: driveT.y * brakeMag * 0.23
        });
      }
      if (ground.frontGrounded) {
        this.Body.applyForce(car.wheelF, car.wheelF.position, {
          x: driveT.x * brakeMag * 0.23,
          y: driveT.y * brakeMag * 0.23
        });
      }

      this._applyPitchStability(car, ground.groundAngle, 0, true);
      return ground;
    }

    // Progressive input-duration acceleration curve
    if (car.accelDir !== worldDir) {
      car.accelDir = worldDir;
      const rawHold = inputCmd && typeof inputCmd.holdMs === 'number' ? inputCmd.holdMs : 0;
      car.accelHoldMs = clamp(rawHold, FIXED_DT, VEHICLE_PHYSICS.ACCEL_RAMP_MS);
    } else {
      car.accelHoldMs = clamp(car.accelHoldMs + FIXED_DT, 0, VEHICLE_PHYSICS.ACCEL_RAMP_MS);
    }

    const rampU = clamp(car.accelHoldMs / VEHICLE_PHYSICS.ACCEL_RAMP_MS, 0, 1);
    const smoothStep = rampU * rampU * (3 - 2 * rampU);
    const progressiveGain = VEHICLE_PHYSICS.ACCEL_MIN_GAIN + (1 - VEHICLE_PHYSICS.ACCEL_MIN_GAIN) * smoothStep;

    const spdScale = car.speedScale || 1.0;
    const accScale = car.accelScale || spdScale;
    const maxSpeed = (isReverse ? VEHICLE_PHYSICS.MAX_REVERSE_SPEED : VEHICLE_PHYSICS.MAX_FORWARD_SPEED) * spdScale;
    const baseTorque = (isReverse ? VEHICLE_PHYSICS.REVERSE_TORQUE : VEHICLE_PHYSICS.FORWARD_TORQUE) * accScale;
    const maxWheelSpin = (isReverse ? VEHICLE_PHYSICS.WHEEL_REVERSE_MAX_SPIN : VEHICLE_PHYSICS.WHEEL_MAX_SPIN) * spdScale;

    const speedRatio = clamp(vAlong / maxSpeed, 0, 1.25);
    const lowEndMultiplier = 1.0 - (0.52 - 0.14 * uphillFactor) * clamp(speedRatio, 0, 1);
    const slopeClimbBoost = 1.0 + Math.max(uphillFactor, steepWallFactor * 0.85) * (VEHICLE_PHYSICS.SLOPE_GRIP_MULTIPLIER - 1.0);
    const contactScale = ground.groundedCount === 2 ? 1.0 : (!isReverse && uphillFactor > 0.35 ? 0.98 : 0.90);

    const totalMass = car.chassis.mass + car.wheelR.mass + car.wheelF.mass + car.head.mass;
    const massScale = clamp(totalMass / 15.3403, 0.68, 1.18);
    const uphillCompBoost = isReverse ? 0.0 : 0.04;
    const gravityComp = totalMass * this.engine.gravity.y * 0.001 * Math.max(uphillFactor, steepWallFactor * 0.7) * (VEHICLE_PHYSICS.GRAVITY_COMP_SCALE + uphillCompBoost * uphillFactor) * (0.45 + 0.55 * progressiveGain);

    let tangentForce = 0;
    if (vAlong < maxSpeed) {
      tangentForce = (baseTorque * massScale * progressiveGain * lowEndMultiplier * slopeClimbBoost + gravityComp) * contactScale;
    } else {
      const excess = vAlong - maxSpeed;
      const trim = Math.min(excess, excess * 0.65 + 0.15);
      if (trim > 0.001) {
        this.Body.setVelocity(car.chassis, {
          x: car.chassis.velocity.x - driveT.x * trim,
          y: car.chassis.velocity.y - driveT.y * trim
        });
      }
    }

    const radR = car.wheelRadiusR || CAR_SPEC.wheelRadius;
    const radF = car.wheelRadiusF || CAR_SPEC.wheelRadius;
    const targetWheelSpeed = Math.min(maxSpeed, Math.max(vAlong + 0.9, maxSpeed * progressiveGain));
    const spinR = worldDir * clamp((targetWheelSpeed / radR) * 1.06, 0.08, maxWheelSpin * (CAR_SPEC.wheelRadius / radR));
    const spinF = worldDir * clamp((targetWheelSpeed / radF) * 1.06, 0.08, maxWheelSpin * (CAR_SPEC.wheelRadius / radF));
    this.Body.setAngularVelocity(car.wheelR, lerp(car.wheelR.angularVelocity, spinR, 0.30));
    this.Body.setAngularVelocity(car.wheelF, lerp(car.wheelF.angularVelocity, spinF, 0.30));

    const noseWheel = car.facing > 0 ? car.wheelF : car.wheelR;
    const tailWheel = car.facing > 0 ? car.wheelR : car.wheelF;
    const noseGrounded = car.facing > 0 ? ground.frontGrounded : ground.rearGrounded;
    const tailGrounded = car.facing > 0 ? ground.rearGrounded : ground.frontGrounded;

    // Speed Boost multiplier applies tangentially without exceeding speed cap
    const chassisFrac = 0.50;
    let tailFrac = isReverse ? 0.20 : 0.28;
    let noseFrac = isReverse ? 0.30 : 0.22;
    if (tailGrounded && !noseGrounded) {
      tailFrac += noseFrac * 0.65;
      noseFrac = 0;
    } else if (noseGrounded && !tailGrounded) {
      noseFrac += tailFrac * 0.65;
      tailFrac = 0;
    }

    if (tangentForce > 0) {
      this.Body.applyForce(car.chassis, car.chassis.position, {
        x: driveT.x * tangentForce * chassisFrac,
        y: driveT.y * tangentForce * chassisFrac
      });
      if (tailFrac > 0) {
        this.Body.applyForce(tailWheel, tailWheel.position, {
          x: driveT.x * tangentForce * tailFrac,
          y: driveT.y * tangentForce * tailFrac
        });
      }
      if (noseFrac > 0) {
        this.Body.applyForce(noseWheel, noseWheel.position, {
          x: driveT.x * tangentForce * noseFrac,
          y: driveT.y * tangentForce * noseFrac
        });
      }
    }

    // Track circular hills, convex crests, concave bowls, and steep loop walls so BOTH wheels stay planted,
    // while releasing cleanly right at open ramp/wing lips so reversing up open wings still launches into air!
    const hasTrackAhead = !ground.isBackside && this._hasTrackAhead(car, ground.normal, driveT, driveBodies);
    const onOpenWingTip = !hasTrackAhead && ground.normal.y > -0.45 && uphillFactor > 0.44 && vAlong > 2.2;
    const onCurvedTrack = !ground.isBackside && hasTrackAhead && (
      ground.normal.y > -0.96 ||
      (car.curveRate || 0) > 0.007 ||
      Math.abs(ground.normal.x) > 0.12
    );
    if (!jumpDetaching && !onOpenWingTip && onCurvedTrack && vAlong > 0.45) {
      const speedNorm = clamp(Math.abs(vAlong) / maxSpeed, 0.25, 1.0);
      const slopeGrip = clamp((ground.normal.y + 1.0) * 1.65, 0, 1.45);
      const curveGrip = clamp((car.curveRate || 0) * 24, 0, 0.72);
      const downhillHold = driveT.y > 0.08 && Math.abs(ground.normal.x) > 0.16 ? 0.36 : 0;
      const hillFactor = clamp(Math.max(0.34, slopeGrip + curveGrip + downhillHold), 0.34, 1.50);
      // Scale centripetal adhesion by actual model mass so roadster/truck/jcb hug circular curves uniformly
      const massAdhesionScale = clamp(totalMass / 15.3403, 0.48, 1.35);
      const stick = VEHICLE_PHYSICS.CURVE_ADHESION_FORCE * 1.06 * massAdhesionScale * Math.pow(speedNorm, 1.05) * hillFactor;
      const sx = -ground.normal.x * stick;
      const sy = -ground.normal.y * stick;
      this.Body.applyForce(car.chassis, car.chassis.position, { x: sx * 0.40, y: sy * 0.40 });
      this.Body.applyForce(car.wheelR, car.wheelR.position, { x: sx * 0.30, y: sy * 0.30 });
      this.Body.applyForce(car.wheelF, car.wheelF.position, { x: sx * 0.30, y: sy * 0.30 });
      if (ground.groundedCount === 1 && Math.abs(ground.normal.x) > 0.16 && tangentForce > 0 && !(isReverse && !hasTrackAhead && uphillFactor > 0.42)) {
        const liftedWheel = ground.rearGrounded ? car.wheelF : car.wheelR;
        this.Body.applyForce(liftedWheel, liftedWheel.position, { x: sx * 0.40, y: sy * 0.40 });
      }
    }

    // Subtle magnetic suction along -N_surface on overhanging cave walls & ceilings (N_surface.y > 0) while holding Drive
    if (!jumpDetaching && !ground.isBackside && ground.normal.y > 0.02 && car.driving) {
      const overhangBlend = clamp(ground.normal.y / 0.35, 0.30, 1.0);
      const massAdhesionScale = clamp(totalMass / 15.3403, 0.48, 1.35);
      const suctionPerBody = VEHICLE_PHYSICS.CEILING_SUCTION_FORCE * overhangBlend * massAdhesionScale;
      const sxC = -ground.normal.x * suctionPerBody;
      const syC = -ground.normal.y * suctionPerBody;
      this.Body.applyForce(car.chassis, car.chassis.position, { x: sxC * 1.4, y: syC * 1.4 });
      this.Body.applyForce(car.wheelR, car.wheelR.position, { x: sxC * 0.85, y: syC * 0.85 });
      this.Body.applyForce(car.wheelF, car.wheelF.position, { x: sxC * 0.85, y: syC * 0.85 });
    }

    if (isReverse) {
      // Keep wheels flush on steep reverse-ramp climbs so cars launch cleanly along the ramp rather than pitching away
      const revPitch = -VEHICLE_PHYSICS.REVERSE_PITCH_BIAS * (1 - clamp(uphillFactor * 1.4, 0, 1));
      this._applyPitchStability(car, ground.groundAngle, revPitch, true);
    } else if (onOpenWingTip && uphillFactor > 0.50) {
      this._applyPitchStability(car, ground.groundAngle, VEHICLE_PHYSICS.FORWARD_PITCH_MAX_OFFSET, true);
    } else {
      // Immediate controlled +5 deg wheelie elevation on straight terrain, fading cleanly on slopes & circular hills
      const curveFade = clamp(((car.curveRate || 0) - 0.006) / 0.014, 0, 1);
      const slopeFade = clamp(Math.max((Math.abs(ground.groundAngle) - 0.08) / 0.14, curveFade), 0, 1);
      const forwardTargetLift = lerp(VEHICLE_PHYSICS.FORWARD_WHEELIE_ANGLE, 0.0, slopeFade);
      this._applyPitchStability(car, ground.groundAngle, forwardTargetLift, true);
      // Apply subtle front-axle wheelie weight-transfer on straight flat terrain when below 5 deg target
      const noseLiftNow = -car.facing * normalizeAngle(car.chassis.angle - ground.groundAngle);
      if (
        slopeFade < 0.5 &&
        Math.abs(uphillFactor) < 0.08 &&
        car.accelHoldMs > 30 &&
        noseLiftNow < forwardTargetLift - 0.004
      ) {
        const liftGain = clamp((forwardTargetLift - noseLiftNow) / VEHICLE_PHYSICS.FORWARD_WHEELIE_ANGLE, 0, 1);
        this.Body.applyForce(noseWheel, noseWheel.position, {
          x: ground.normal.x * 0.0040 * massScale * liftGain,
          y: ground.normal.y * 0.0040 * massScale * liftGain
        });
      }
    }

    return ground;
  }
}
