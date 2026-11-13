import { EXTREME_JUMP_COOLDOWN_MS } from '../config/constants.js';
import { ARENAS } from '../maps/arenas.js';
import { clamp, normalizeAngle } from '../utils/math.js';

export const BOT_DIFFICULTIES = Object.freeze({
  hard: Object.freeze({
    id: 'hard',
    label: 'HARD',
    speedScale: 1.05,
    accelScale: 1.12,
    aggression: 2.0,
    jumpCooldownMs: 0,
    smartPathing: true,
    reactionCadence: 2,
    playerCanJump: true
  }),
  extreme: Object.freeze({
    id: 'extreme',
    label: 'EXTREME',
    speedScale: 1.25,
    accelScale: 1.48,
    aggression: 3.6,
    jumpCooldownMs: EXTREME_JUMP_COOLDOWN_MS,
    smartPathing: true,
    reactionCadence: 1,
    playerCanJump: true
  }),
  death: Object.freeze({
    id: 'death',
    label: 'DEATH',
    speedScale: 1.30,
    accelScale: 1.56,
    aggression: 4.5,
    jumpCooldownMs: EXTREME_JUMP_COOLDOWN_MS,
    smartPathing: true,
    reactionCadence: 1,
    playerCanJump: false
  })
});

const EXTREME_PATTERNS = ['headhunter', 'highground', 'feint_counter', 'ringout', 'wheelie_scoop'];

export class SmartAI {
  constructor(difficulty = 'hard') {
    this.difficulty = BOT_DIFFICULTIES[difficulty] ? difficulty : 'hard';
    this.flipBias = 0;
    this.decisionTick = 0;
    this.runupTicks = 0;
    this.commitDir = 0;
    this.commitTicks = 0;
    this.commitMode = null;
    this.pattern = 'headhunter';
    this.patternTicks = 0;
    this.feintCooldownTicks = 0;
    this.feintDir = 0;
    this.feintTicks = 0;
    this._rngState = 0x9e3779b9;
    this._lastCmd = { l: false, r: false, jump: false };
    this._pickPattern(null, 640);
  }

  _rand() {
    let t = (this._rngState = (this._rngState + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setDifficulty(difficulty) {
    this.difficulty = BOT_DIFFICULTIES[difficulty] ? difficulty : 'hard';
  }

  getProfile() {
    return BOT_DIFFICULTIES[this.difficulty] || BOT_DIFFICULTIES.hard;
  }

  resetRoundState(seed = null) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      this._rngState = (seed | 0) || 1;
    } else {
      this._rngState = ((this._rngState * 1664525 + 1013904223) | 0) || 1;
    }
    this.runupTicks = 0;
    this.commitTicks = 0;
    this.commitMode = null;
    this.feintTicks = 0;
    this.feintCooldownTicks = 0;
    this.patternTicks = 0;
    this._lastCmd = { l: false, r: false, jump: false };
    this._pickPattern(null, 640);
  }

  _pickPattern(arena, mx) {
    const profile = this.getProfile();
    if (profile.aggression < 3.0) {
      this.pattern = 'headhunter';
      this.patternTicks = 120;
      return;
    }
    const arenaId = arena ? arena.id : 0;
    const pool = [];
    // Weight randomized winning patterns suited to current arena
    pool.push('headhunter', 'feint_counter', 'wheelie_scoop');
    if (arenaId === 0 || (arenaId >= 3 && arenaId <= 8)) {
      pool.push('highground', 'highground');
    }
    if (arenaId === 0 || arenaId === 1 || arenaId === 2 || arenaId === 9) {
      pool.push('ringout', 'ringout');
    }
    // Prefer a different pattern on re-roll so bot constantly shifts rhythm
    const filtered = pool.filter((p) => p !== this.pattern);
    const choices = filtered.length > 0 ? filtered : EXTREME_PATTERNS;
    this.pattern = choices[Math.floor(this._rand() * choices.length)];
    const minT = profile.aggression >= 4.0 ? 68 : 85;
    const spanT = profile.aggression >= 4.0 ? 65 : 85;
    this.patternTicks = minT + Math.floor(this._rand() * spanT);
    if (this.pattern === 'highground') {
      this.commitDir = this._rand() < 0.72 ? (mx < 640 ? -1 : 1) : (mx < 640 ? 1 : -1);
    }
  }

  _moveLeft(jump = false) { return { l: true, r: false, jump }; }
  _moveRight(jump = false) { return { l: false, r: true, jump }; }

  _canJump(sim, me, profile, gx) {
    const cdMs = profile.jumpCooldownMs ? (me.jumpCooldownMs || profile.jumpCooldownMs) : 0;
    if (!cdMs || !me || me.dead) return false;
    if (!gx && me.airTicks > 5) return false;
    const minStartMs = profile.aggression >= 3.2 ? 380 : 650;
    if (sim.roundElapsedMs < minStartMs) return false;
    return (sim.roundElapsedMs - me.lastJumpAtMs) >= cdMs;
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

    // Extreme & Death dynamically shift winning patterns rather than running one fixed script
    if (profile.aggression >= 3.0) {
      if (this.feintCooldownTicks > 0) this.feintCooldownTicks--;
      this.patternTicks--;
      if (this.patternTicks <= 0) {
        this._pickPattern(arena, mx);
      }
      if (sim.waterRising && (arena.id === 1 || arena.id === 2 || arena.id === 9) && this._rand() < 0.08) {
        this.pattern = 'ringout';
      }
    }

    // Hard reacts slightly slower between ticks; Extreme & Death react every single frame
    if (profile.reactionCadence > 1 && (this.decisionTick % profile.reactionCadence) !== 0) {
      return { l: this._lastCmd.l, r: this._lastCmd.r, jump: false };
    }

    const emit = (cmd) => {
      this._lastCmd = { l: !!cmd.l, r: !!cmd.r, jump: !!cmd.jump };
      return this._lastCmd;
    };

    const oppHeadX = opp.head ? opp.head.position.x : ox;
    const oppHeadY = opp.head ? opp.head.position.y : oy;
    const oppG = opp.playerIndex === 1
      ? (sim.grounded.p1R || sim.grounded.p1F)
      : (sim.grounded.p2R || sim.grounded.p2F);

    // Tactical winning jump evaluation (purposeful head-dunk, vault dodge, chasm/bridge leap, or self-save)
    const evaluateJump = () => {
      if (!canJump) return false;
      const dxAbs = Math.abs(ox - mx);
      const closingToMe = ovx * (mx > ox ? 1 : -1);
      const upright = Math.abs(angle) < 0.44 && Math.abs(me.chassis.angularVelocity) < 0.09;

      // Cliff/chasm safety guard: never jump blindly off open sea edges or into Map 8 sea hole
      const unsafeOpenCliff =
        (arena.id === 1 || arena.id === 2 || arena.id === 9) &&
        ((mx < 240 && mvx < -0.5) || (mx > 1040 && mvx > 0.5));
      const unsafeGapRim =
        arena.id === 8 && (
          ((mx < 640 && mx > 535 && ox < 640 && mvx > 0.2)) ||
          ((mx >= 640 && mx < 745 && ox >= 640 && mvx < -0.2))
        );
      const safeAttack = !unsafeOpenCliff && !unsafeGapRim;

      // Never jump into Map 8's overhead stone deck (x ~ 515..765, bottom y ~ 357)
      const underMap8Deck = arena.id === 8 && mx > 490 && mx < 790 && my > 355 && my < 465;

      // 1) Flip recovery & rising-water self-save always allowed when grounded
      if (gx && Math.abs(angle) > 1.15) return true;
      if (gx && my > sim.waterCrestY - 76 && !underMap8Deck) return true;

      // 2) Chasm / bridge intentional gap leap (skip extra boost if ramp already launched vy upward into deck)
      if (arena.id === 8 && me.chassis.velocity.y > -2.6 && ((mx > 555 && mx < 584 && ox >= 640 && mvx > 2.8) || (mx < 725 && mx > 696 && ox < 640 && mvx < -2.8))) {
        return true;
      }
      if (arena.id === 9 && ((mx > 440 && mx < 504 && ox > mx && mvx > 2.0) || (mx < 840 && mx > 776 && ox < mx && mvx < -2.0))) {
        return true;
      }

      if (!gx || !safeAttack || underMap8Deck) return false;

      // Overhead clearance guard: NEVER jump straight up into an enemy bumper/tire positioned right above/overlapping us!
      const myHeadY = me.head ? me.head.position.y : my;
      if (dxAbs < 64 && oppHeadY < myHeadY - 4) return false;

      // 3) True Deadlock / pin breakaway: stuck nearly motionless side-by-side -> hop cleanly above
      if (dxAbs < 62 && Math.abs(mvx) < 0.85 && Math.abs(ovx) < 1.25 && oppHeadY >= myHeadY - 6 && sim.roundElapsedMs > 620) {
        return true;
      }

      // 4) Counter-vault over an incoming high-speed ram (needs >=58px horizontal space so we clear ABOVE hood, not mid-rise!)
      if (upright && dxAbs >= 58 && dxAbs < 142 && closingToMe > 2.5 && oppHeadY >= myHeadY - 12 && oppHeadY <= my + 48) {
        return true;
      }

      // 5) Predictive Aerial Head-Dunk (at 64..158px closing range so peak descends wheels-first onto opp head!)
      if (upright && (this.pattern !== 'wheelie_scoop' || oppHeadY < myHeadY - 5)) {
        const predDx = Math.abs((oppHeadX + ovx * 11) - (mx + mvx * 11));
        const strikeMax = profile.aggression >= 4.0 ? 158 : 138;
        const headReachable = oppHeadY >= myHeadY - 24 && oppHeadY <= my + 54;
        const movingToward = mvx * chaseDir > 1.3;
        if (dxAbs >= 64 && predDx < strikeMax && headReachable && movingToward) return true;
      }

      // 6) Anti-air intercept when opponent jumped away from directly on top of us
      if (upright && profile.aggression >= 4.0 && !oppG && dxAbs >= 56 && dxAbs < 125 && oppHeadY < my - 24 && oppHeadY > my - 115) {
        return true;
      }
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

      // Mid-air PD attitude stabilization across Map 8 chasm: keep nose slightly up & land wheels-down!
      if (!gx && mx > 565 && mx < 715) {
        const desired = -me.facing * 0.08;
        const pd = normalizeAngle(angle - desired) + me.chassis.angularVelocity * 8.0;
        if (Math.abs(pd) > 0.14) return emit(pd > 0 ? this._moveRight() : this._moveLeft());
        return emit({ l: false, r: false, jump: false });
      }

      if (this.runupTicks > 0) {
        this.runupTicks--;
        if (meLeftBowl && mx > 305) return emit(this._moveLeft());
        if (!meLeftBowl && mx < 975) return emit(this._moveRight());
        this.runupTicks = 0;
      }

      if (meLeftBowl && mx > 515 && mvx > 0.1 && (speed < 4.7 || oppLeftBowl) && (gx || mx < 592)) {
        this.runupTicks = oppLeftBowl ? 20 : 28;
        return emit(this._moveLeft());
      }
      if (!meLeftBowl && mx < 765 && mvx < -0.1 && (speed < 4.7 || !oppLeftBowl) && (gx || mx > 688)) {
        this.runupTicks = !oppLeftBowl ? 20 : 28;
        return emit(this._moveRight());
      }

      // Same-bowl chasm-lip brake guard: never drive/push into the sea gap when opponent is in our bowl
      if (meLeftBowl === oppLeftBowl) {
        if (meLeftBowl && mx > (mvx > 2.2 ? 440 : 475)) return emit(this._moveLeft(false));
        if (!meLeftBowl && mx < (mvx < -2.2 ? 840 : 805)) return emit(this._moveRight(false));
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

    const highGroundWanted =
      this.pattern === 'highground' &&
      arena.id >= 3 &&
      arena.id <= 8 &&
      my >= oy - 35 &&
      Math.abs(ox - mx) > 165 &&
      this.commitTicks <= 0;

    if (profile.smartPathing && arena.id >= 3 && arena.id <= 8) {
      if (this.commitTicks > 0 && this.commitMode === 'climb') {
        const reachedTopTarget = my <= oy + 26 && Math.abs(mx - ox) < 275 && (ox - mx) * mvx >= -0.3;
        const maxClimbAng = oppElevated ? 1.82 : 1.18;
        const tooSteepOrAir = Math.abs(angle) > maxClimbAng || (!gx && my < 330 && Math.abs(angle) > 1.1);
        const oppDroppedToFloor = oy > 465 && my > 440 && this.pattern !== 'highground';
        if (reachedTopTarget || oppDroppedToFloor || tooSteepOrAir) {
          this.commitTicks = 0;
          this.commitMode = null;
          if (this.pattern === 'highground') this.pattern = 'headhunter';
        } else {
          this.commitTicks--;
          if (this.commitTicks === 0) {
            this.commitMode = null;
            if (this.pattern === 'highground') this.pattern = 'headhunter';
          }
          const launchJump = canJump && Math.abs(angle) < 0.65 && my < oy + 28 && (ox - mx) * mvx > 0.8 && Math.abs(ox - mx) < 240;
          return emit(this.commitDir < 0 ? this._moveLeft(launchJump) : this._moveRight(launchJump));
        }
      }

      if ((oppElevated && Math.abs(ox - mx) < 420) || highGroundWanted) {
        this.commitDir = highGroundWanted && this.commitDir !== 0
          ? this.commitDir
          : (mx < 580 ? -1 : mx > 700 ? 1 : (mvx < -0.2 ? -1 : mvx > 0.2 ? 1 : (mx < 640 ? -1 : 1)));
        this.commitTicks = highGroundWanted ? 38 : 82;
        this.commitMode = 'climb';
        return emit(this.commitDir < 0 ? this._moveLeft(false) : this._moveRight(false));
      }
    }

    // Feint & bait-counter pattern: brief pullback at mid-range to lure enemy into exposing helmet/momentum
    if (profile.aggression >= 3.0 && gx && Math.abs(angle) < 0.55 && arena.id !== 8) {
      const safeForFeint = mx > 285 && mx < 995;
      if (this.feintTicks > 0) {
        this.feintTicks--;
        if (!safeForFeint || Math.abs(ox - mx) < 105) {
          this.feintTicks = 0;
        } else {
          return emit(this.feintDir < 0 ? this._moveLeft(false) : this._moveRight(false));
        }
      } else if (
        this.pattern === 'feint_counter' &&
        this.feintCooldownTicks <= 0 &&
        safeForFeint &&
        Math.abs(ox - mx) > 175 &&
        Math.abs(ox - mx) < 340
      ) {
        this.feintDir = ox > mx ? -1 : 1;
        this.feintTicks = (profile.aggression >= 4.0 ? 6 : 10) + Math.floor(this._rand() * (profile.aggression >= 4.0 ? 5 : 8));
        this.feintCooldownTicks = 100;
        return emit(this.feintDir < 0 ? this._moveLeft(false) : this._moveRight(false));
      }
    }

    // Mid-air PD attitude control: never spin upside-down trying to steer horizontally in air (air has 0 linear drive!).
    // Keep wheels down & slight front-nose lift so we land safely atop enemy helmets instead of skull-first!
    if (!gx && my < 495) {
      const desired = -me.facing * 0.08;
      const pd = normalizeAngle(angle - desired) + me.chassis.angularVelocity * 8.0;
      if (Math.abs(pd) > 0.14) {
        return emit(pd > 0 ? this._moveRight() : this._moveLeft());
      }
      return emit({ l: false, r: false, jump: false });
    }

    // Inverted/turtled recovery on ground
    if (Math.abs(angle) > 1.32) {
      return emit(angle > 0 ? this._moveRight(canJump) : this._moveLeft(canJump));
    }

    // Never park directly underneath an elevated/descending opponent: sidestep toward safe ground, then counter-strike
    const myHeadYNow = me.head ? me.head.position.y : my;
    if (profile.aggression >= 3.0 && gx && oppHeadY < myHeadYNow - 24 && Math.abs(ox - mx) < 88 && arena.id !== 8) {
      const awayDir = ox <= mx ? 1 : -1;
      const openWaterArena = arena.id === 1 || arena.id === 2 || arena.id === 9;
      const cliffBlocked = openWaterArena && ((awayDir < 0 && mx < 245) || (awayDir > 0 && mx > 1035));
      if (!cliffBlocked) {
        return emit(awayDir < 0 ? this._moveLeft(false) : this._moveRight(false));
      }
    }

    // Extreme, Death & Hard enhanced curved-track / bridge / overhead path tracking
    const deadzone = profile.aggression >= 4.0 ? 2 : (profile.aggression >= 3.2 ? 3 : (profile.aggression >= 2.0 ? 9 : 48));
    const dxClose = Math.abs(ox - mx);
    const lookaheadFrames = dxClose < 115
      ? (profile.aggression >= 3.2 ? 7 : 5)
      : (profile.aggression >= 4.0 ? 16 : (profile.aggression >= 3.2 ? 14 : (profile.smartPathing ? 11 : 4)));
    let minTargetX = 200;
    let maxTargetX = 1080;
    if (arena.id === 8 && (mx < 640) === (ox < 640)) {
      if (mx < 640) maxTargetX = 470;
      else minTargetX = 810;
    }

    // Headhunter aims right at predicted enemy helmet; Ringout pushes from center outward toward sea!
    let aimX = (profile.aggression >= 3.2 ? oppHeadX : ox) + ovx * lookaheadFrames;
    if (this.pattern === 'ringout' && profile.aggression >= 3.0) {
      const oppOutwardDir = ox >= 640 ? 1 : -1;
      const enemyOnOutside = (ox - mx) * oppOutwardDir > -10;
      if (enemyOnOutside) {
        aimX = ox + ovx * (lookaheadFrames * 0.85) + oppOutwardDir * 24;
      } else {
        // Get inside opponent first so we push them toward sea, never ourselves
        aimX = clamp(ox - oppOutwardDir * 95, minTargetX, maxTargetX);
      }
    }
    const targetX = clamp(aimX, minTargetX, maxTargetX);

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
