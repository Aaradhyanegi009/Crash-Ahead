import { ARENAS } from '../maps/arenas.js';
import { normalizeAngle } from '../utils/math.js';

export class SmartAI {
  constructor() {
    this.flipBias = 0;
    this.decisionTick = 0;
    this.runupSide = 0; // -1 = building speed on left side, +1 = right side
    this.runupTicks = 0;
  }

  _moveLeft() { return { l: true, r: false }; }
  _moveRight() { return { l: false, r: true }; }

  decide(sim, aiIsP1 = false) {
    const me = aiIsP1 ? sim.p1Car : sim.p2Car;
    const opp = aiIsP1 ? sim.p2Car : sim.p1Car;
    if (!me || !opp || me.dead) return { l: false, r: false };

    this.decisionTick++;
    const arena = ARENAS[sim.arenaIndex];
    const mx = me.chassis.position.x;
    const my = me.chassis.position.y;
    const mvx = me.chassis.velocity.x;
    const ox = opp.chassis.position.x;
    const oy = opp.chassis.position.y;
    const angle = normalizeAngle(me.chassis.angle);
    const gx = me.playerIndex === 1
      ? (sim.grounded.p1R || sim.grounded.p1F)
      : (sim.grounded.p2R || sim.grounded.p2F);

    // Rising-water survival instinct: if sea approaches floor, favor high outer curved walls/peaks
    const nearWater = my > sim.waterCrestY - 95;
    if (nearWater && arena.id === 8) {
      // Climb outer bowl C-walls instead of hanging in bottom cradle
      if (mx < 640 && mx > 270) return this._moveLeft();
      if (mx >= 640 && mx < 1010) return this._moveRight();
    }

    // Map 8 (Half-Pipe Bowls): Smart run-up & jump across the central sea chasm (x ~ 585..695)
    if (arena.id === 8) {
      const speed = Math.hypot(mvx, me.chassis.velocity.y);
      const ovx = opp.chassis.velocity.x;
      const meLeftBowl = mx < 640;
      const oppLeftBowl = ox < 640;

      // In-air chasm crossing stabilizer: keep nose level over x=575..705 so wheels land cleanly on opposite bowl
      if (!gx && mx > 575 && mx < 705) {
        if (Math.abs(angle) > 0.32) return angle > 0 ? this._moveLeft() : this._moveRight();
        return { l: false, r: false };
      }

      if (this.runupTicks > 0) {
        this.runupTicks--;
        if (meLeftBowl && mx > 335) return this._moveLeft();
        if (!meLeftBowl && mx < 945) return this._moveRight();
        this.runupTicks = 0;
      }

      // Guard against rolling slowly off the inner chasm lip into the sea
      if (gx && meLeftBowl && mx > 530 && mvx > 0.1 && speed < 4.0) {
        this.runupTicks = 28;
        return this._moveLeft();
      }
      if (gx && !meLeftBowl && mx < 750 && mvx < -0.1 && speed < 4.0) {
        this.runupTicks = 28;
        return this._moveRight();
      }

      if (meLeftBowl !== oppLeftBowl) {
        // Avoid blind head-on mid-air collision over the ocean gap when opponent is already jumping toward us
        const oppJumpingToMe = meLeftBowl
          ? (ox < 760 && ovx < -2.6 && (!sim.grounded.p2R && !sim.grounded.p2F || ox < 710))
          : (ox > 520 && ovx > 2.6 && (!sim.grounded.p1R && !sim.grounded.p1F || ox > 570));
        if (oppJumpingToMe || (aiIsP1 && sim.roundElapsedMs < 550)) {
          // Hold ground inside bowl cradle to intercept incoming jumper safely on rock
          if (meLeftBowl) return mx > 455 ? this._moveLeft() : (mx < 365 ? this._moveRight() : { l: false, r: false });
          return mx < 825 ? this._moveRight() : (mx > 915 ? this._moveLeft() : { l: false, r: false });
        }
        // Charge straight down bowl and up the 41-degree inner lip at full speed to soar across!
        return meLeftBowl ? this._moveRight() : this._moveLeft();
      }
    }

    // Map 9 (Twin Islands Bridge): Seesaw bridge & edge awareness over central chasm (476..804)
    if (arena.id === 9 && sim.seesaws && sim.seesaws.length > 0) {
      const sw = sim.seesaws[0].body;
      const swTilt = Math.abs(normalizeAngle(sw.angle));
      const approachingGapFromLeft = mx > 435 && mx < 495 && ox > mx;
      const approachingGapFromRight = mx < 845 && mx > 785 && ox < mx;
      if ((approachingGapFromLeft || approachingGapFromRight) && swTilt > 0.34) {
        return approachingGapFromLeft ? this._moveLeft() : this._moveRight();
      }
    }

    // Open-water edge guards for floating islands
    if (arena.id === 1 || arena.id === 2 || arena.id === 9) {
      if (mx < 185 && mvx < -1.0) return this._moveRight();
      if (mx > 1095 && mvx > 1.0) return this._moveLeft();
    } else {
      if (mx < 220 && mvx < 0) return this._moveRight();
      if (mx > 1060 && mvx > 0) return this._moveLeft();
    }

    // Mid-air stabilization & opportunistic strike pitch
    if (!gx && my < 490) {
      if (this.decisionTick % 24 === 0) this.flipBias = ((this.decisionTick / 24) % 3) * 0.35;
      if (Math.abs(angle) > 0.65) return angle > 0 ? this._moveLeft() : this._moveRight();
      if (Math.abs(ox - mx) < 160 && this.flipBias < 0.55) {
        return ox < mx ? this._moveLeft() : this._moveRight();
      }
      return { l: false, r: false };
    }

    if (Math.abs(angle) > 1.35) return angle > 0 ? this._moveLeft() : this._moveRight();

    if (ox < mx - 35) return this._moveLeft();
    if (ox > mx + 35) return this._moveRight();
    return oy < my ? { l: me.facing > 0, r: me.facing < 0 } : (ox < mx ? this._moveLeft() : this._moveRight());
  }
}
