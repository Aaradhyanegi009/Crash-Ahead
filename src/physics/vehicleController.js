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

  _probeWheelRay(wheel, carDown, driveBodies) {
    if (!driveBodies || driveBodies.length === 0) return null;
    const start = wheel.position;
    const carUpX = -carDown.x;
    const carUpY = -carDown.y;

    const castDir = (dx, dy, dist) => {
      const end = { x: start.x + dx * dist, y: start.y + dy * dist };
      const hits = this.Query.ray(driveBodies, start, end, 4);
      if (!hits || hits.length === 0) return null;

      let bestN = null;
      let bestDot = -1;
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
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
        if (upDot > 0.14 && upDot > bestDot) {
          bestDot = upDot;
          bestN = { x: nx, y: ny };
        }
      }
      return bestN;
    };

    const primary = castDir(carDown.x, carDown.y, CAR_SPEC.wheelRadius + 5.6);
    if (primary) return primary;
    if (carDown.y > 0.35 && Math.abs(carDown.x) > 0.25) {
      return castDir(0, 1, CAR_SPEC.wheelRadius + 2.8);
    }
    return null;
  }

  detectGroundState(car, wheelContacts, driveBodies) {
    const angle = car.chassis.angle;
    const carDown = { x: -Math.sin(angle), y: Math.cos(angle) };
    const carUp = { x: Math.sin(angle), y: -Math.cos(angle) };

    let rearGrounded = false;
    let frontGrounded = false;
    let sumNx = 0;
    let sumNy = 0;

    const checkWheel = (wheel, contact) => {
      if (contact && contact.count > 0) {
        const len = Math.hypot(contact.nx, contact.ny);
        if (len > 0.001) {
          const nx = contact.nx / len;
          const ny = contact.ny / len;
          if (nx * carUp.x + ny * carUp.y > 0.15) {
            return { grounded: true, nx, ny };
          }
        }
      }
      if (car.isAirborne && Math.abs(angle) < 0.45 && wheel.velocity.y > 2.3) {
        return { grounded: false, nx: 0, ny: 0 };
      }
      const rayNormal = this._probeWheelRay(wheel, carDown, driveBodies);
      if (rayNormal) {
        return { grounded: true, nx: rayNormal.x, ny: rayNormal.y };
      }
      return { grounded: false, nx: 0, ny: 0 };
    };

    const rRes = checkWheel(car.wheelR, wheelContacts.rear);
    const fRes = checkWheel(car.wheelF, wheelContacts.front);

    if (rRes.grounded) {
      rearGrounded = true;
      sumNx += rRes.nx;
      sumNy += rRes.ny;
    }
    if (fRes.grounded) {
      frontGrounded = true;
      sumNx += fRes.nx;
      sumNy += fRes.ny;
    }

    const groundedCount = (rearGrounded ? 1 : 0) + (frontGrounded ? 1 : 0);
    const grounded = groundedCount > 0;

    if (grounded) {
      const len = Math.hypot(sumNx, sumNy) || 1;
      const targetNx = sumNx / len;
      const targetNy = sumNy / len;
      const blendNx = lerp(car.groundNormal.x, targetNx, 0.72);
      const blendNy = lerp(car.groundNormal.y, targetNy, 0.72);
      const bLen = Math.hypot(blendNx, blendNy) || 1;
      car.groundNormal = { x: blendNx / bLen, y: blendNy / bLen };
      car.groundAngle = Math.atan2(car.groundNormal.x, -car.groundNormal.y);
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
    }

    car.isAirborne = !grounded;
    return {
      grounded,
      groundedCount,
      rearGrounded,
      frontGrounded,
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
        for (const b of [car.chassis, car.wheelR, car.wheelF, car.head]) {
          this.Body.setVelocity(b, { x: b.velocity.x - dx, y: b.velocity.y - dy });
        }
      }
    }

    const worldCap = VEHICLE_PHYSICS.MAX_WORLD_SPEED * Math.max(1.0, spdScale);
    for (const body of [car.chassis, car.wheelR, car.wheelF, car.head]) {
      const spd = Math.hypot(body.velocity.x, body.velocity.y);
      if (spd > worldCap) {
        const scale = worldCap / spd;
        this.Body.setVelocity(body, { x: body.velocity.x * scale, y: body.velocity.y * scale });
      }
    }
  }

  updateVehicle(car, inputCmd, wheelContacts, driveBodies) {
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
    const ground = this.detectGroundState(car, wheelContacts, driveBodies);
    const worldDir = (inputR ? 1 : 0) - (inputL ? 1 : 0);
    car.driving = worldDir !== 0;

    if (!ground.grounded) {
      // Mid-air: zero horizontal drive, apply progressive clamped pitch torque (gentle over small bumps, full stunt flip in high air)
      car.wheelR.friction = VEHICLE_PHYSICS.WHEEL_BASE_FRICTION;
      car.wheelF.friction = VEHICLE_PHYSICS.WHEEL_BASE_FRICTION;
      if (worldDir === 0) {
        car.accelHoldMs = Math.max(0, car.accelHoldMs - FIXED_DT * 0.6);
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
    const lowEndMultiplier = 1.0 - 0.52 * clamp(speedRatio, 0, 1);
    const slopeClimbBoost = 1.0 + Math.max(uphillFactor, steepWallFactor * 0.85) * (VEHICLE_PHYSICS.SLOPE_GRIP_MULTIPLIER - 1.0);
    const contactScale = ground.groundedCount === 2 ? 1.0 : 0.78;

    const totalMass = car.chassis.mass + car.wheelR.mass + car.wheelF.mass + car.head.mass;
    const gravityComp = totalMass * this.engine.gravity.y * 0.001 * Math.max(uphillFactor, steepWallFactor * 0.7) * VEHICLE_PHYSICS.GRAVITY_COMP_SCALE * (0.45 + 0.55 * progressiveGain);

    let tangentForce = 0;
    if (vAlong < maxSpeed) {
      tangentForce = (baseTorque * progressiveGain * lowEndMultiplier * slopeClimbBoost + gravityComp) * contactScale;
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

    const targetWheelSpeed = Math.min(maxSpeed, Math.max(vAlong + 0.9, maxSpeed * progressiveGain));
    const targetWheelSpin = worldDir * clamp((targetWheelSpeed / CAR_SPEC.wheelRadius) * 1.06, 0.08, maxWheelSpin);
    this.Body.setAngularVelocity(car.wheelR, lerp(car.wheelR.angularVelocity, targetWheelSpin, 0.30));
    this.Body.setAngularVelocity(car.wheelF, lerp(car.wheelF.angularVelocity, targetWheelSpin, 0.30));

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

    // Track concave bowls/walls with strong centripetal adhesion (Map 4 loops, Map 5 canyon, Map 7 oval, Map 8 bowls),
    // while releasing downward suction on fast kicker crests so steeps/ramps launch into fun air-rolls!
    const onSteepWallOrLoop = ground.normal.y > -0.78;
    const crestingHillLip = !onSteepWallOrLoop && vAlong > 5.3 && uphillFactor > 0.34 && tailGrounded && !noseGrounded;
    const concaveOrWall = onSteepWallOrLoop || (ground.normal.y > -0.90 && uphillFactor > 0.12 && ground.groundedCount === 2);
    if (!crestingHillLip && concaveOrWall && vAlong > 0.7) {
      const speedNorm = clamp(Math.abs(vAlong) / maxSpeed, 0.24, 1.0);
      const wallFactor = clamp((ground.normal.y + 0.88) * 1.25, 0.30, 1.35);
      const stick = VEHICLE_PHYSICS.CURVE_ADHESION_FORCE * Math.pow(speedNorm, 1.2) * wallFactor;
      this.Body.applyForce(car.chassis, car.chassis.position, {
        x: -ground.normal.x * stick,
        y: -ground.normal.y * stick
      });
    }

    if (isReverse) {
      this._applyPitchStability(car, ground.groundAngle, -VEHICLE_PHYSICS.REVERSE_PITCH_BIAS, true);
    } else if (crestingHillLip) {
      this._applyPitchStability(car, ground.groundAngle, VEHICLE_PHYSICS.FORWARD_PITCH_MAX_OFFSET, true);
    } else {
      // Immediate controlled +5 deg wheelie elevation on straight terrain, fading cleanly on slopes so hills/bumps stay planted
      const slopeFade = clamp((Math.abs(ground.groundAngle) - 0.08) / 0.14, 0, 1);
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
          x: ground.normal.x * 0.0040 * liftGain,
          y: ground.normal.y * 0.0040 * liftGain
        });
      }
    }

    return ground;
  }
}
