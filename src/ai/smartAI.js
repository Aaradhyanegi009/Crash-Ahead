import { DEATH_JUMP_COOLDOWN_MS, EXTREME_JUMP_COOLDOWN_MS } from '../config/constants.js';
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
    accelScale: 1.72,
    aggression: 5.0,
    jumpCooldownMs: DEATH_JUMP_COOLDOWN_MS,
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
    this._stuckTicks = 0;
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
    this._stuckTicks = 0;
    this._lastCmd = { l: false, r: false, jump: false };
    this._pickPattern(null, 640);
  }

  _isOpenWaterArena(arena) {
    return !!(arena && arena.caves.length === 0 && arena.openRocks.length === 0);
  }

  _hasEnclosedOrArchWalls(arena) {
    return !!(arena && (arena.caves.length > 0 || arena.openRocks.length > 0));
  }

  _getOpenEdgeBounds(arena) {
    if (arena.islands && arena.islands.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const isl of arena.islands) {
        for (const p of isl.top) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
      }
      if (Number.isFinite(minX) && Number.isFinite(maxX)) {
        return { minX, maxX };
      }
    }
    if (arena.id === 13 && arena.halfPipes && arena.halfPipes.length > 0) {
      const p = arena.halfPipes[0];
      return { minX: p.cx - p.r * 0.96, maxX: p.cx + p.r * 0.96 };
    }
    return { minX: 165, maxX: 1115 };
  }

  _hasOverheadClearanceIssue(arena, mx, my, mvx) {
    if (!arena) return false;
    const predMid = mx + clamp(mvx * 8, -75, 75);
    const predApex = mx + clamp(mvx * 18, -165, 165);
    const checkBox = (cx, halfW, bottomY, clearance) => {
      if (my <= bottomY - 4 || (my - bottomY) >= clearance) return false;
      return (
        Math.abs(mx - cx) <= halfW ||
        Math.abs(predMid - cx) <= halfW ||
        Math.abs(predApex - cx) <= halfW
      );
    };

    if (arena.blocks) {
      for (const blk of arena.blocks) {
        if (blk.hiddenVisual) continue;
        if (checkBox(blk.x, blk.w * 0.5 + 32, blk.y + blk.h * 0.5, 230)) return true;
      }
    }
    if (arena.halfPipes) {
      for (const p of arena.halfPipes) {
        const aMid = (p.aStart + p.aEnd) * 0.5;
        if (Math.sin(aMid) < -0.25) {
          const halfSpan = Math.abs(Math.cos(p.aStart)) * p.r + 24;
          const approxBottom = p.cy - Math.sin(p.aStart) * p.r + (p.thickness || 24) * 0.5;
          if (checkBox(p.cx, halfSpan, approxBottom, 185)) return true;
        }
      }
    }
    if (arena.seesaws) {
      for (const sw of arena.seesaws) {
        if (!sw.isBridge && checkBox(sw.x, sw.w * 0.48 + 16, sw.y + 14, 150)) return true;
      }
    }
    if (arena.caves && arena.caves.length > 0 && my < 245) return true;
    return false;
  }

  _pickPattern(arena, mx) {
    const profile = this.getProfile();
    if (profile.aggression < 3.0) {
      this.pattern = 'headhunter';
      this.patternTicks = 120;
      return;
    }
    const isDeath = profile.aggression >= 4.8;
    const pool = [];
    // Weight randomized winning patterns suited to current arena geometry
    pool.push('headhunter', 'headhunter', 'wheelie_scoop');
    if (!isDeath) pool.push('feint_counter');
    if (!arena || this._hasEnclosedOrArchWalls(arena) || arena.id === 8 || (arena.seesaws && arena.seesaws.some((s) => !s.isBridge))) {
      pool.push('highground', 'highground');
    }
    if (!arena || (this._isOpenWaterArena(arena) && arena.id !== 8)) {
      pool.push('ringout', 'ringout');
    }
    if (isDeath) pool.push('headhunter', 'feint_counter');
    // Prefer a different pattern on re-roll so bot constantly shifts rhythm
    const filtered = pool.filter((p) => p !== this.pattern);
    const choices = filtered.length > 0 ? filtered : EXTREME_PATTERNS;
    this.pattern = choices[Math.floor(this._rand() * choices.length)];
    const minT = isDeath ? 48 : (profile.aggression >= 4.0 ? 68 : 85);
    const spanT = isDeath ? 45 : (profile.aggression >= 4.0 ? 65 : 85);
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
    if (!gx && me.airTicks > (profile.aggression >= 4.8 ? 6 : 5)) return false;
    const minStartMs = profile.aggression >= 4.8 ? 160 : (profile.aggression >= 3.2 ? 380 : 650);
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
    const isOpenWater = this._isOpenWaterArena(arena);
    const hasCurvedWalls = this._hasEnclosedOrArchWalls(arena);
    const blockedOverhead = this._hasOverheadClearanceIssue(arena, mx, my, mvx);

    if (gx && me.driving && Math.abs(mvx) < 0.35 && Math.abs(me.chassis.velocity.y) < 0.35) {
      this._stuckTicks++;
    } else {
      this._stuckTicks = 0;
    }

    // Extreme & Death dynamically shift winning patterns rather than running one fixed script
    if (profile.aggression >= 3.0) {
      if (this.feintCooldownTicks > 0) this.feintCooldownTicks--;
      this.patternTicks--;
      if (this.patternTicks <= 0) {
        this._pickPattern(arena, mx);
      }
      if (sim.waterRising && isOpenWater && arena.id !== 8 && this._rand() < 0.08) {
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

    // Tactical winning jump evaluation (purposeful head-dunk, vault dodge, bridge leap, or self-save)
    // Never jumps upward underneath overhead blocks (e.g. Map 8 center deck), arches, seesaws, or low cave ceilings!
    const isDeath = profile.aggression >= 4.8;
    const evaluateJump = () => {
      if (!canJump || blockedOverhead) return false;
      const dxAbs = Math.abs(ox - mx);
      const closingToMe = ovx * (mx > ox ? 1 : -1);
      const uprightLimit = isDeath ? 0.56 : 0.44;
      const upright = Math.abs(angle) < uprightLimit && Math.abs(me.chassis.angularVelocity) < (isDeath ? 0.12 : 0.09);

      // Cliff/chasm safety guard: never jump blindly off open sea edges or into Map 8 sea hole
      const bounds = isOpenWater ? this._getOpenEdgeBounds(arena) : null;
      const unsafeOpenCliff = isOpenWater && arena.id !== 8 && (
        (mx < bounds.minX + 68 && mvx < -0.5) || (mx > bounds.maxX - 68 && mvx > 0.5)
      );
      const unsafeGapRim =
        arena.id === 8 && (
          ((mx < 640 && mx > 535 && ox < 640 && mvx > 0.2)) ||
          ((mx >= 640 && mx < 745 && ox >= 640 && mvx < -0.2))
        );
      const safeAttack = !unsafeOpenCliff && !unsafeGapRim;

      // 1) Flip recovery & rising-water self-save always allowed when grounded and clear overhead
      if (gx && Math.abs(angle) > 1.15) return true;
      if (gx && my > sim.waterCrestY - 76) return true;

      // 2) Intentional seesaw-bridge gap leap (Maps 9 & 10)
      if (arena.seesaws && arena.seesaws.some((s) => s.isBridge)) {
        for (const br of arena.seesaws) {
          if (!br.isBridge) continue;
          const hw = br.w * 0.5;
          if ((mx > br.x - hw - 42 && mx < br.x - hw + 20 && ox > mx && mvx > 2.0) ||
              (mx < br.x + hw + 42 && mx > br.x + hw - 20 && ox < mx && mvx < -2.0)) {
            return true;
          }
        }
      }

      if (!gx || !safeAttack) return false;

      // Overhead clearance guard: NEVER jump straight up into an enemy bumper/tire positioned right above/overlapping us!
      const myHeadY = me.head ? me.head.position.y : my;
      if (dxAbs < (isDeath ? 52 : 64) && oppHeadY < myHeadY - 4) return false;

      // 3) True Deadlock / pin breakaway: stuck nearly motionless side-by-side -> hop cleanly above
      if (dxAbs < 62 && Math.abs(mvx) < 0.85 && Math.abs(ovx) < 1.25 && oppHeadY >= myHeadY - 6 && sim.roundElapsedMs > (isDeath ? 420 : 620)) {
        return true;
      }

      // Death sustained anti-stall escape when actively throttling yet pinned against terrain
      if (isDeath && this._stuckTicks >= 22 && dxAbs > 65 && sim.roundElapsedMs > 480) {
        return true;
      }

      // 4) Counter-vault over an incoming high-speed ram (needs horizontal space so we clear ABOVE hood!)
      if (upright && dxAbs >= (isDeath ? 52 : 58) && dxAbs < 152 && closingToMe > (isDeath ? 1.9 : 2.5) && oppHeadY >= myHeadY - 14 && oppHeadY <= my + 52) {
        return true;
      }

      // 5) Predictive Aerial Head-Dunk (velocity-adaptive intercept so peak descends wheels-first onto opp head!)
      if (upright && (this.pattern !== 'wheelie_scoop' || oppHeadY < myHeadY - 5)) {
        const leadFrames = isDeath ? clamp(dxAbs / 11, 7, 13) : 11;
        const predDx = Math.abs((oppHeadX + ovx * leadFrames) - (mx + mvx * leadFrames));
        const strikeMax = isDeath ? 172 : (profile.aggression >= 4.0 ? 158 : 138);
        const headReachable = oppHeadY >= myHeadY - (isDeath ? 36 : 24) && oppHeadY <= my + 56;
        const movingToward = mvx * chaseDir > (isDeath ? 0.9 : 1.3);
        if (dxAbs >= (isDeath ? 52 : 64) && predDx < strikeMax && headReachable && movingToward) return true;
      }

      // 6) Anti-air intercept & Death defensive counter-dunk when opponent jumped near us
      if (upright && profile.aggression >= 4.0 && !oppG && dxAbs >= (isDeath ? 52 : 56) && dxAbs < (isDeath ? 136 : 125) && oppHeadY < my - 18 && oppHeadY > my - 125) {
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
          const apexJump = canJump && !blockedOverhead && my < 320 && Math.abs(ox - mx) < 320 && (ox - mx) * mvx > 0;
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

    // Seesaw balance-bridge crossing (Maps 9 & 10): charge across bridges or vault if steeply tilted away!
    if (arena.seesaws && sim.seesaws && sim.seesaws.some((s) => s.isBridge)) {
      for (const sw of sim.seesaws) {
        if (!sw.isBridge) continue;
        const swTilt = Math.abs(normalizeAngle(sw.body.angle));
        const hw = sw.w * 0.5;
        const approachingGapFromLeft = mx > sw.x - hw - 58 && mx < sw.x - hw + 12 && ox > mx;
        const approachingGapFromRight = mx < sw.x + hw + 58 && mx > sw.x + hw - 12 && ox < mx;
        if (approachingGapFromLeft || approachingGapFromRight) {
          if (canJump && !blockedOverhead && swTilt > 0.30) {
            return emit(approachingGapFromLeft ? this._moveRight(true) : this._moveLeft(true));
          }
          if (swTilt > 0.42 && !profile.smartPathing) {
            return emit(approachingGapFromLeft ? this._moveLeft() : this._moveRight());
          }
        }
      }
    }

    // Open-water island/half-pipe cliff guards (never trigger on enclosed curved-wall arenas)
    const edgeMargin = profile.aggression >= 2.0 ? 22 : 65;
    if (isOpenWater && arena.id !== 8) {
      const b = this._getOpenEdgeBounds(arena);
      if (mx < b.minX + edgeMargin && mvx < -1.1) return emit(this._moveRight(canJump && !blockedOverhead && my > sim.waterCrestY - 90));
      if (mx > b.maxX - edgeMargin && mvx > 1.1) return emit(this._moveLeft(canJump && !blockedOverhead && my > sim.waterCrestY - 90));
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

    const canClimbHigh = hasCurvedWalls || arena.id === 8 || arena.id === 13;
    const highGroundWanted =
      this.pattern === 'highground' &&
      canClimbHigh &&
      my >= oy - 35 &&
      Math.abs(ox - mx) > 165 &&
      this.commitTicks <= 0;

    if (profile.smartPathing && canClimbHigh) {
      if (this.commitTicks > 0 && this.commitMode === 'climb') {
        const reachedTopTarget = my <= oy + 26 && Math.abs(mx - ox) < 275 && (ox - mx) * mvx >= -0.3;
        const maxClimbAng = arena.id === 13 ? 1.12 : (oppElevated ? 1.92 : 1.18);
        const rimAbort = arena.id === 13 && (mx < 285 || mx > 995);
        const tooSteepOrAir = Math.abs(angle) > maxClimbAng || (!gx && my < 320 && Math.abs(angle) > 1.15) || rimAbort;
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
          // Launch jump onto upper platform from steep tube wall OR when cresting level with opponent
          const wallLaunchJump = arena.id === 15 && canJump && !blockedOverhead && my < 460 && Math.abs(angle) > 0.75 && (ox - mx) * this.commitDir < 0;
          const launchJump = wallLaunchJump || (canJump && !blockedOverhead && Math.abs(angle) < 0.65 && my < oy + 32 && (ox - mx) * mvx > 0.8 && Math.abs(ox - mx) < 260);
          return emit(this.commitDir < 0 ? this._moveLeft(launchJump) : this._moveRight(launchJump));
        }
      }

      if ((oppElevated && Math.abs(ox - mx) < 520) || highGroundWanted) {
        if (arena.id === 15 && oppElevated) {
          // On Map 15 enclosed circular tube, climb the circular end-wall facing the opponent's elevated platform!
          this.commitDir = ox < 640 ? -1 : 1;
        } else {
          this.commitDir = highGroundWanted && this.commitDir !== 0
            ? this.commitDir
            : (mx < 580 ? -1 : mx > 700 ? 1 : (mvx < -0.2 ? -1 : mvx > 0.2 ? 1 : (mx < 640 ? -1 : 1)));
        }
        this.commitTicks = highGroundWanted ? 38 : 88;
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
        (!isDeath || (ovx * (mx > ox ? 1 : -1) > 1.8 && oy <= my + 12)) &&
        Math.abs(ox - mx) > 175 &&
        Math.abs(ox - mx) < 340
      ) {
        this.feintDir = ox > mx ? -1 : 1;
        this.feintTicks = isDeath ? (4 + Math.floor(this._rand() * 3)) : ((profile.aggression >= 4.0 ? 6 : 10) + Math.floor(this._rand() * (profile.aggression >= 4.0 ? 5 : 8)));
        this.feintCooldownTicks = isDeath ? 75 : 100;
        return emit(this.feintDir < 0 ? this._moveLeft(false) : this._moveRight(false));
      }
    }

    // Mid-air PD attitude control: never spin upside-down trying to steer horizontally in air (air has 0 linear drive!).
    // Keep wheels down & slight front-nose lift so we land safely atop enemy helmets instead of skull-first!
    if (!gx && my < 495) {
      const desired = -me.facing * (isDeath ? 0.05 : 0.08);
      const pd = normalizeAngle(angle - desired) + me.chassis.angularVelocity * (isDeath ? 9.5 : 8.0);
      if (Math.abs(pd) > (isDeath ? 0.09 : 0.14)) {
        return emit(pd > 0 ? this._moveRight() : this._moveLeft());
      }
      return emit({ l: false, r: false, jump: false });
    }

    // Inverted/turtled recovery on ground
    if (Math.abs(angle) > 1.32) {
      return emit(angle > 0 ? this._moveRight(canJump && !blockedOverhead) : this._moveLeft(canJump && !blockedOverhead));
    }

    // Never park directly underneath an elevated/descending opponent: sidestep toward safe ground, then counter-strike
    const myHeadYNow = me.head ? me.head.position.y : my;
    if (profile.aggression >= 3.0 && gx && oppHeadY < myHeadYNow - (isDeath ? 16 : 24) && Math.abs(ox - mx) < (isDeath ? 102 : 88) && arena.id !== 8) {
      const awayDir = ox <= mx ? 1 : -1;
      const b = isOpenWater ? this._getOpenEdgeBounds(arena) : null;
      const cliffBlocked = isOpenWater && ((awayDir < 0 && mx < b.minX + 75) || (awayDir > 0 && mx > b.maxX - 75));
      if (!cliffBlocked) {
        const dodgeJump = isDeath && Math.abs(ox - mx) >= 52 && !oppG && evaluateJump();
        return emit(awayDir < 0 ? this._moveLeft(dodgeJump) : this._moveRight(dodgeJump));
      }
    }

    // Extreme, Death & Hard enhanced curved-track / bridge / overhead path tracking
    const deadzone = profile.aggression >= 4.0 ? 2 : (profile.aggression >= 3.2 ? 3 : (profile.aggression >= 2.0 ? 9 : 48));
    const dxClose = Math.abs(ox - mx);
    const lookaheadFrames = dxClose < 115
      ? (profile.aggression >= 3.2 ? 7 : 5)
      : (profile.aggression >= 4.0 ? 16 : (profile.aggression >= 3.2 ? 14 : (profile.smartPathing ? 11 : 4)));
    const edgePadBounds = isOpenWater && arena.id !== 8 ? this._getOpenEdgeBounds(arena) : null;
    let minTargetX = edgePadBounds ? edgePadBounds.minX + 32 : 200;
    let maxTargetX = edgePadBounds ? edgePadBounds.maxX - 32 : 1080;
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
