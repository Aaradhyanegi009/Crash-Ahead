import {
  WORLD_W,
  WORLD_H,
  WATER_CREST_Y,
  PALETTE,
  CAR_SCALE,
  CENTER_OF_MASS_OFFSET
} from '../config/constants.js';
import { ARENAS } from '../maps/arenas.js';
import { lerp } from '../utils/math.js';
import { drawRoadster, drawRagdoll } from './roadsterRenderer.js';

const SKYLINE_BUILDINGS = [
  { x: -10, w: 120, h: 255, back: true, cols: 3, rows: 7 },
  { x: 35, w: 110, h: 215, back: false, cols: 3, rows: 6 },
  { x: 162, w: 165, h: 318, back: true, cols: 4, rows: 9 },
  { x: 255, w: 145, h: 235, back: false, cols: 3, rows: 6 },
  { x: 348, w: 125, h: 265, back: true, cols: 3, rows: 7 },
  { x: 782, w: 145, h: 278, back: true, cols: 3, rows: 8 },
  { x: 878, w: 155, h: 225, back: false, cols: 4, rows: 6 },
  { x: 1005, w: 170, h: 305, back: true, cols: 4, rows: 9 },
  { x: 1135, w: 155, h: 245, back: false, cols: 4, rows: 7 }
];

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function tracePointLoop(path, pts, closed = true) {
  if (!pts.length) return;
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  if (closed) path.closePath();
}

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.smoke = [];
    this.splashes = [];
    this.popStar = null;
    this.tickCount = 0;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(WORLD_W * this.dpr);
    this.canvas.height = Math.round(WORLD_H * this.dpr);
  }

  clearEffects() {
    this.smoke = [];
    this.splashes = [];
    this.popStar = null;
  }

  spawnExhaustPuff(carState) {
    if (!carState || carState.dead) return;
    const a = carState.chassis.angle;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const lx = -49 * CAR_SCALE * carState.facing;
    const ly = (-1 * CAR_SCALE) - CENTER_OF_MASS_OFFSET;
    const px = carState.chassis.position.x + lx * cos - ly * sin;
    const py = carState.chassis.position.y + lx * sin + ly * cos;
    const spread = ((this.tickCount % 5) - 2) * 0.08;
    this.smoke.push({
      x: px,
      y: py,
      vx: -carState.facing * 1.25 + spread,
      vy: -0.95 - (this.tickCount % 3) * 0.2,
      r: 3.6,
      life: 1.0
    });
  }

  spawnWaterSplash(x, crestY = WATER_CREST_Y) {
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI * (0.18 + (i / 7) * 0.64);
      const spd = 5 + (i % 3) * 1.8;
      this.splashes.push({
        x,
        y: crestY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 6 + (i % 3) * 1.5,
        life: 1.0
      });
    }
  }

  spawnBonkPop(x, y, color) {
    this.popStar = { x, y, color, life: 1.0 };
  }

  spawnJumpBurst(x, y) {
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI * (0.15 + (i / 5) * 0.7);
      const spd = 2.4 + (i % 2) * 1.4;
      this.smoke.push({
        x: x + (i - 2.5) * 6,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.65,
        r: 5.5,
        life: 0.95
      });
    }
  }

  updateEffects(dtScale = 1, sim = null) {
    this.tickCount++;
    if (sim) {
      for (const car of [sim.p1Car, sim.p2Car]) {
        if (!car || car.dead) continue;
        const cadence = car.driving ? 4 : 26;
        if (this.tickCount % cadence === 0) this.spawnExhaustPuff(car);
      }
    }

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.x += s.vx * dtScale;
      s.y += s.vy * dtScale;
      s.r = lerp(s.r, 10, 0.08 * dtScale);
      s.life -= 0.042 * dtScale;
      if (s.life <= 0) this.smoke.splice(i, 1);
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const d = this.splashes[i];
      d.vy += 0.35 * dtScale;
      d.x += d.vx * dtScale;
      d.y += d.vy * dtScale;
      d.life -= 0.03 * dtScale;
      if (d.life <= 0) this.splashes.splice(i, 1);
    }

    if (this.popStar) {
      this.popStar.life -= 0.045 * dtScale;
      if (this.popStar.life <= 0) this.popStar = null;
    }
  }

  _drawSkyAndCity(ctx) {
    ctx.fillStyle = PALETTE.skyPeach;
    ctx.fillRect(0, 0, WORLD_W, 338);
    ctx.fillStyle = PALETTE.horizonMauve;
    ctx.fillRect(0, 338, WORLD_W, WORLD_H - 338);

    ctx.fillStyle = PALETTE.sunCream;
    ctx.fillRect(545, 315, 190, 145);

    for (const backPass of [true, false]) {
      for (const b of SKYLINE_BUILDINGS) {
        if (b.back !== backPass) continue;
        const topY = WATER_CREST_Y - b.h;
        ctx.fillStyle = b.back ? PALETTE.cityBack : PALETTE.cityFront;
        ctx.fillRect(b.x, topY, b.w, b.h + 4);

        ctx.fillStyle = PALETTE.cityWindow;
        const padX = 16;
        const gapX = 9;
        const winW = (b.w - padX * 2 - gapX * (b.cols - 1)) / b.cols;
        const winH = 9;
        const rowStep = 22;
        for (let r = 0; r < b.rows; r++) {
          const wy = topY + 18 + r * rowStep;
          if (wy + winH > WATER_CREST_Y - 12) break;
          for (let c = 0; c < b.cols; c++) {
            ctx.fillRect(b.x + padX + c * (winW + gapX), wy, winW, winH);
          }
        }
      }
    }
  }

  _fillRockAndClipPills(ctx, path, fillRule, pills) {
    ctx.fillStyle = PALETTE.rockFill;
    ctx.fill(path, fillRule);
    ctx.save();
    ctx.clip(path, fillRule);
    ctx.fillStyle = PALETTE.rockPill;
    for (const p of pills) {
      ctx.beginPath();
      drawRoundedRectPath(ctx, p.x, p.y, p.w, p.h, p.h * 0.5);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawArenaTerrain(ctx, sim) {
    const arena = ARENAS[sim.arenaIndex];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const isl of arena.islands) {
      const path = new Path2D();
      tracePointLoop(path, isl.poly, true);
      this._fillRockAndClipPills(ctx, path, 'nonzero', arena.pills);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.stroke(path);
    }

    for (const caveLoop of arena.caves) {
      const fillPath = new Path2D();
      fillPath.rect(-25, -25, WORLD_W + 50, WORLD_H + 50);
      tracePointLoop(fillPath, caveLoop, true);
      this._fillRockAndClipPills(ctx, fillPath, 'evenodd', arena.pills);

      const rimPath = new Path2D();
      tracePointLoop(rimPath, caveLoop, true);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.stroke(rimPath);
    }

    for (const openRock of arena.openRocks) {
      const fillPath = new Path2D();
      tracePointLoop(fillPath, openRock.visualPoly, true);
      this._fillRockAndClipPills(ctx, fillPath, 'nonzero', arena.pills);

      const rimPath = new Path2D();
      tracePointLoop(rimPath, openRock.surface, false);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.stroke(rimPath);
    }

    for (const pipe of arena.halfPipes) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = pipe.thickness + 9;
      ctx.beginPath();
      ctx.arc(pipe.cx, pipe.cy, pipe.r, pipe.aStart, pipe.aEnd, false);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.rockFill;
      ctx.lineWidth = pipe.thickness;
      ctx.beginPath();
      ctx.arc(pipe.cx, pipe.cy, pipe.r, pipe.aStart, pipe.aEnd, false);
      ctx.stroke();
      ctx.restore();
    }

    for (const blk of arena.blocks) {
      if (blk.hiddenVisual) continue;
      ctx.save();
      ctx.translate(blk.x, blk.y);
      ctx.rotate(blk.angle || 0);
      ctx.fillStyle = PALETTE.rockFill;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      drawRoundedRectPath(ctx, -blk.w * 0.5, -blk.h * 0.5, blk.w, blk.h, blk.chamfer || 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const sw of sim.seesaws) {
      ctx.save();
      ctx.translate(sw.body.position.x, sw.body.position.y);
      ctx.rotate(sw.body.angle);
      ctx.fillStyle = PALETTE.plankFill;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      drawRoundedRectPath(ctx, -sw.w * 0.5, -14, sw.w, 28, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = PALETTE.rockPill;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawWaterWaves(ctx, timeMs, crestY, isRising) {
    const waveY = (x, offset) => crestY + Math.sin((x / 55) * Math.PI * 2 + timeMs * 0.0045 + offset) * 6;

    ctx.save();
    if (isRising) {
      // Translucent upper water crest when rising so players can still track lower hulls
      ctx.globalAlpha = 0.86;
    }

    ctx.fillStyle = PALETTE.waterTop;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W; x += 4) ctx.lineTo(x, waveY(x, 0) - 2);
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.closePath();
    ctx.fill();

    if (isRising) {
      ctx.strokeStyle = PALETTE.waterFoam;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 4) {
        const y = waveY(x, 0) - 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = PALETTE.waterDeep;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W; x += 4) ctx.lineTo(x, waveY(x, 1.8) + 16);
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawEffects(ctx, bannerText) {
    for (const s of this.smoke) {
      ctx.fillStyle = `rgba(245, 245, 250, ${(s.life * 0.72).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const d of this.splashes) {
      ctx.fillStyle = PALETTE.waterTop;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * d.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (this.popStar) {
      const { x, y, life } = this.popStar;
      const s = (1.3 - life * 0.4) * 32;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = PALETTE.stripeGold;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const rad = i % 2 === 0 ? s : s * 0.48;
        const ang = (i / 12) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (bannerText) {
      ctx.save();
      const isDigitCountdown = bannerText === '3' || bannerText === '2' || bannerText === '1';
      const isGo = bannerText === 'GO!';
      const fontSize = isDigitCountdown ? 96 : isGo ? 74 : 54;
      ctx.font = `800 ${fontSize}px "Fredoka", "Rubik", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = isDigitCountdown ? 12 : 10;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PALETTE.ink;
      const yPos = isDigitCountdown || isGo ? 156 : 138;
      ctx.strokeText(bannerText, WORLD_W * 0.5, yPos);
      ctx.fillStyle = isDigitCountdown ? PALETTE.stripeGold : PALETTE.white;
      ctx.fillText(bannerText, WORLD_W * 0.5, yPos);
      ctx.restore();
    }
  }

  render(sim, bannerText = '') {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawSkyAndCity(ctx);
    this._drawArenaTerrain(ctx, sim);
    if (sim.p1Car) drawRoadster(ctx, sim.p1Car, true);
    if (sim.p2Car) drawRoadster(ctx, sim.p2Car, false);
    if (sim.ragdolls) {
      for (const rag of sim.ragdolls) drawRagdoll(ctx, rag);
    }
    this._drawWaterWaves(ctx, performance.now(), sim.waterCrestY, sim.waterRising);
    this._drawEffects(ctx, bannerText);

    ctx.restore();
  }
}
