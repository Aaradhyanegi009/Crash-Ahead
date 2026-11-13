import { JUMP_COOLDOWN_MS } from '../config/constants.js';
import { ARENAS } from '../maps/arenas.js';
import { clamp, normalizeAngle } from '../utils/math.js';

export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: 'EASY',
    speedScale: 0.72,
    accelScale: 0.70,
    aggression: 1.0,
    jumpCooldownMs: 0,
    smartPathing: false,
    reactionCadence: 4
  }),
  hard: Object.freeze({
    id: 'hard',
    label: 'HARD',
    speedScale: 1.05,
    accelScale: 1.12,
    aggression: 2.0,
    jumpCooldownMs: 0,
    smartPathing: true,
    reactionCadence: 2
  }),
  extreme: Object.freeze({
    id: 'extreme',
    label: 'EXTREME',
    speedScale: 1.15,
    accelScale: 1.32,
    aggression: 2.8,
    jumpCooldownMs: JUMP_COOLDOWN_MS,
    smartPathing: true,
    reactionCadence: 1
  })
});

export class SmartAI {
  constructor(difficulty = 'hard') {
    this.difficulty = BOT_DIFFICULTIES[difficulty] ? difficulty : 'hard';
    this.flipBias = 0;
    this.decisionTick = 0;
    this.runupTicks = 0;
    this.commitDir = 0;
    this.commitTicks = 0;
    this.commitMode = null;
    this._lastCmd = { l: false, r: false, jump: false };
  }

  setDifficulty(difficulty) {
    this.difficulty = BOT_DIFFICULTIES[difficulty] ? difficulty : 'hard';
  }

  getProfile() {
    return BOT_DIFFICULTIES[this.difficulty] || BOT_DIFFICULTIES.hard;
  }

  _moveLeft(jump = false) { return { l: true, r: false, jump }; }
  _moveRight(jump = false) { return { l: false, r: true, jump }; }

  _canJump(sim, me, profile, gx) {
    if (!profile.jumpCooldownMs || !me || me.dead) return false;
    if (!gx && me.airTicks > 5) return false;
    if (sim.roundElapsedMs < 650) return false;
    return (sim.roundElapsedMs - me.lastJumpAtMs) >= profile.jumpCooldownMs;
  }

  decide(sim, aiIsP1 = false) {
    const profile = this.getProfile();
    const me = aiIsP1 ? sim.p1Car : sim.p2Car;
    const opp = aiIsP1 ? sim.p2Car : sim.p1Car;
    if (!me || !opp || me.dead) return { l: false, r: false, jump: false };

    this.decisionTick++;
    const arena = ARENAS[sim.arenaIndex];
    const mx = me.chassis.position.x;
    const my = me.chassis.position.y;
    const mvx = me.chassis.velocity.x;
    const ox = opp.chassis.position.x;
    const oy = opp.chassis.position.y;
    const ovx = opp.chassis.velocity.x;
    const angle = normalizeAngle(me.chassis.angle);
    const gx = me.playerIndex === 1
      ? (sim.grounded.p1R || sim.grounded.p1F)
      : (sim.grounded.p2R || sim.grounded.p2F);

    const canJump = this._canJump(sim, me, profile, gx);
    const chaseDir = ox < mx ? -1 : 1;

    // Easy reacts slower between decisions; jump still evaluates immediately if enabled
    if (profile.reactionCadence > 1 && (this.decisionTick % profile.reactionCadence) !== 0) {
      return { l: this._lastCmd.l, r: this._lastCmd.r, jump: false };
    }

    const emit = (cmd) => {
      this._lastCmd = { l: !!cmd.l, r: !!cmd.r, jump: !!cmd.jump };
      return this._lastCmd;
    };

    // Extreme jump triggers (5s cooldown)
    const evaluateJump = () => {
      if (!canJump) return false;
      const dxAbs = Math.abs(ox - mx);
      const pounceDist = profile.aggression >= 2.5 ? 215 : 185;
      // 1) Aggressive pounce / overhead helmet slam / close grapple breakaway
      if (dxAbs < pounceDist && oy <= my + 56 && mvx * chaseDir > 0.75) return true;
      if (profile.aggression >= 2.5 && dxAbs < 85 && Math.abs(mvx) < 1.3 && sim.roundElapsedMs > 800) return true;
      if (profile.aggression >= 2.0 && dxAbs < 120 && Math.abs(oy - my) < 62 && sim.roundElapsedMs > 1200) return true;
      // 2) Chasm / bridge leap
      if (arena.id === 8 && ((mx > 540 && mx < 582 && ox >= 640 && mvx > 2.2) || (mx < 740 && mx > 698 && ox < 640 && mvx < -2.2))) {
        return true;
      }
      if (arena.id === 9 && ((mx > 442 && mx < 502 && ox > mx && mvx > 2.0) || (mx < 838 && mx > 778 && ox < mx && mvx < -2.0))) {
        return true;
      }
      // 3) Flip recovery or rising-water hop
      if (gx && Math.abs(angle) > 1.15) return true;
      if (gx && my > sim.waterCrestY - 82) return true;
      return false;
    };

    const nearWater = my > sim.waterCrestY - 95;
    if (nearWater && arena.id === 8) {
      const jump = evaluateJump();
      if (mx < 640 && mx > 265) return emit(this._moveLeft(jump));
      if (mx >= 640 && mx < 1015) return emit(this._moveRight(jump));
    }

    // Map 8 (Half-Pipe Bowls): Smart run-up & leap across the central sea chasm (x ~ 585..695)
    // If opponent is perched up high on/above the central stone deck, climb own outer C-wall to drop from above!
    if (arena.id === 8) {
      const oppPerchedCenter = oy < my - 85 && Math.abs(ox - 640) < 175 && my > 360;
      if (profile.smartPathing && oppPerchedCenter && Math.abs(mvx) < 9) {
        if (this.commitTicks <= 0 || this.commitMode !== 'climb') {
          this.commitDir = mx < 640 ? -1 : 1;
          this.commitTicks = 92;
          this.commitMode = 'climb';
        }
      }
      if (this.commitTicks > 0 && this.commitMode === 'climb') {
        const landedTop = my <= oy + 24 && Math.abs(mx - ox) < 220;
        if (!landedTop) {
          this.commitTicks--;
          if (this.commitTicks === 0) this.commitMode = null;
          const apexJump = canJump && my < 320 && Math.abs(ox - mx) < 320 && (ox - mx) * mvx > 0;
          return emit(this.commitDir < 0 ? this._moveLeft(apexJump) : this._moveRight(apexJump));
        }
        this.commitTicks = 0;
        this.commitMode = null;
      }

      const speed = Math.hypot(mvx, me.chassis.velocity.y);
      const meLeftBowl = mx < 640;
      const oppLeftBowl = ox < 640;

      // Inverted mid-air stabilization across Map 8 chasm: right reduces clockwise tilt, left increases
      if (!gx && mx > 565 && mx < 715) {
        if (Math.abs(angle) > 0.24) return emit(angle > 0 ? this._moveRight() : this._moveLeft());
        if (mx < 605 || (mx < 640 && mvx > 0.25)) return emit(this._moveRight());
        if (mx > 675 || (mx >= 640 && mvx < -0.25)) return emit(this._moveLeft());
        return emit({ l: false, r: false, jump: false });
      }

      if (this.runupTicks > 0) {
        this.runupTicks--;
        if (meLeftBowl && mx > 315) return emit(this._moveLeft());
        if (!meLeftBowl && mx < 965) return emit(this._moveRight());
        this.runupTicks = 0;
      }

      if (meLeftBowl && mx > 520 && mvx > 0.1 && speed < 4.3 && (gx || mx < 595)) {
        this.runupTicks = 26;
        return emit(this._moveLeft());
      }
      if (!meLeftBowl && mx < 760 && mvx < -0.1 && speed < 4.3 && (gx || mx > 685)) {
        this.runupTicks = 26;
        return emit(this._moveRight());
      }

      if (meLeftBowl !== oppLeftBowl) {
        const oppJumpingToMe = meLeftBowl
          ? (ox < 760 && ovx < -2.6 && (!sim.grounded.p2R && !sim.grounded.p2F || ox < 710))
          : (ox > 520 && ovx > 2.6 && (!sim.grounded.p1R && !sim.grounded.p1F || ox > 570));
        if (oppJumpingToMe || (aiIsP1 && sim.roundElapsedMs < 550)) {
          if (meLeftBowl) return emit(mx > 455 ? this._moveLeft() : (mx < 365 ? this._moveRight() : { l: false, r: false, jump: false }));
          return emit(mx < 825 ? this._moveRight() : (mx > 915 ? this._moveLeft() : { l: false, r: false, jump: false }));
        }
        return emit(meLeftBowl ? this._moveRight(evaluateJump()) : this._moveLeft(evaluateJump()));
      }
    }

    // Map 9 (Twin Islands Bridge): Charge across middle balance bridge (482..798) or jump across!
    if (arena.id === 9 && sim.seesaws && sim.seesaws.length > 0) {
      const sw = sim.seesaws[0].body;
      const swTilt = Math.abs(normalizeAngle(sw.angle));
      const approachingGapFromLeft = mx > 425 && mx < 495 && ox > mx;
      const approachingGapFromRight = mx < 855 && mx > 785 && ox < mx;
      if (approachingGapFromLeft || approachingGapFromRight) {
        if (canJump && swTilt > 0.30) {
          return emit(approachingGapFromLeft ? this._moveRight(true) : this._moveLeft(true));
        }
        if (swTilt > 0.42 && !profile.smartPathing) {
          return emit(approachingGapFromLeft ? this._moveLeft() : this._moveRight());
        }
      }
    }

    // Open-water island cliff guards (never trigger on enclosed curved-wall arenas 3..7 where sides are C-ramps)
    const edgeMargin = profile.aggression >= 2.0 ? 22 : 65;
    if (arena.id === 1 || arena.id === 2 || arena.id === 9) {
      if (mx < 165 + edgeMargin && mvx < -1.1) return emit(this._moveRight(canJump && my > sim.waterCrestY - 90));
      if (mx > 1115 - edgeMargin && mvx > 1.1) return emit(this._moveLeft(canJump && my > sim.waterCrestY - 90));
    }

    // Active curved-wall climb commit toward player elevated on balancing rods / upper platforms
    const oppOnSeesaw = arena.seesaws && arena.seesaws.some(
      (sw) => oy < sw.y + 34 && Math.abs(ox - sw.x) < sw.w * 0.75
    );
    const oppElevated = oy < my - 56 && (
      oppOnSeesaw ||
      (arena.seesaws && arena.seesaws.length > 0) ||
      (arena.blocks && arena.blocks.length > 0) ||
      oy < my - 84
    );

    if (profile.smartPathing && arena.id >= 3 && arena.id <= 8) {
      if (this.commitTicks > 0 && this.commitMode === 'climb') {
        const reachedTopTarget = my <= oy + 32 && Math.abs(mx - ox) < 270 && (ox - mx) * mvx >= 0;
        const oppDroppedToFloor = oy > 465 && my > 440;
        if (reachedTopTarget || oppDroppedToFloor) {
          this.commitTicks = 0;
          this.commitMode = null;
        } else {
          this.commitTicks--;
          if (this.commitTicks === 0) this.commitMode = null;
          const launchJump = canJump && my < oy + 36 && (ox - mx) * mvx > 0.6;
          return emit(this.commitDir < 0 ? this._moveLeft(launchJump) : this._moveRight(launchJump));
        }
      }

      if (oppElevated && Math.abs(ox - mx) < 420) {
        this.commitDir = mx < 580 ? -1 : mx > 700 ? 1 : (mvx < -0.2 ? -1 : mvx > 0.2 ? 1 : (mx < 640 ? -1 : 1));
        this.commitTicks = 92;
        this.commitMode = 'climb';
        return emit(this.commitDir < 0 ? this._moveLeft(false) : this._moveRight(false));
      }
    }

    // Inverted mid-air pitch recovery & opportunistic flip/slam dive
    if (!gx && my < 495) {
      if (this.decisionTick % 20 === 0) this.flipBias = ((this.decisionTick / 20) % 3) * 0.35;
      if (profile.aggression >= 2.5 && oy > my + 24 && Math.abs(ox - mx) < 195) {
        return emit(ox < mx ? this._moveLeft() : this._moveRight());
      }
      if (Math.abs(angle) > 0.55) {
        return emit(angle > 0 ? this._moveRight() : this._moveLeft());
      }
      if (profile.aggression >= 2.0 && Math.abs(ox - mx) < 170 && oy < my) {
        // Flip / slam orientation above enemy
        return emit(ox < mx ? this._moveLeft() : this._moveRight());
      }
      return emit({ l: false, r: false, jump: false });
    }

    // Inverted/turtled recovery on ground
    if (Math.abs(angle) > 1.32) {
      return emit(angle > 0 ? this._moveRight(canJump) : this._moveLeft(canJump));
    }

    // Extreme & Hard enhanced curved-track / bridge / overhead path tracking
    const deadzone = profile.aggression >= 2.5 ? 6 : (profile.aggression >= 2.0 ? 10 : 48);
    const lookaheadFrames = profile.aggression >= 2.5 ? 15 : (profile.smartPathing ? 12 : 4);
    const targetX = clamp(ox + ovx * lookaheadFrames, 200, 1080);

    const doJump = evaluateJump();
    if (targetX < mx - deadzone) return emit(this._moveLeft(doJump));
    if (targetX > mx + deadzone) return emit(this._moveRight(doJump));

    // Close-quarters aggressive ram: maintain throttle toward enemy rather than braking
    if (profile.aggression >= 2.0) {
      return emit(ox <= mx ? this._moveLeft(doJump) : this._moveRight(doJump));
    }
    return emit(oy < my ? { l: me.facing > 0, r: me.facing < 0, jump: false } : (ox < mx ? this._moveLeft() : this._moveRight()));
  }
}
