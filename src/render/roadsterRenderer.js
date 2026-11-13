import {
  PALETTE,
  CAR_SCALE,
  CAR_SPEC,
  CENTER_OF_MASS_OFFSET
} from '../config/constants.js';

function drawHelmet(ctx, head, facing, isRedPlayer, isKO = false) {
  if (!head) return;
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  ctx.save();
  ctx.translate(head.position.x, head.position.y);
  ctx.rotate(head.angle);
  ctx.fillStyle = colors.helmet;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, CAR_SPEC.headRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.arc(facing * 5.2 * CAR_SCALE, -0.5 * CAR_SCALE, 5.2 * CAR_SCALE, -0.55 * Math.PI, 0.55 * Math.PI, facing < 0);
  ctx.closePath();
  ctx.fill();

  if (isKO) {
    const vx = facing * 6.0 * CAR_SCALE;
    const vy = -0.5 * CAR_SCALE;
    const xr = 2.0 * CAR_SCALE;
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(vx - xr, vy - xr);
    ctx.lineTo(vx + xr, vy + xr);
    ctx.moveTo(vx + xr, vy - xr);
    ctx.lineTo(vx - xr, vy + xr);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRagdoll(ctx, rag) {
  if (!rag || !rag.torso) return;
  const colors = rag.isRedPlayer ? PALETTE.red : PALETTE.blue;

  const drawLimb = (body, w, h, fill, drawCuff = false) => {
    if (!body) return;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.fillStyle = fill;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3.2;
    const hw = w * 0.5;
    const hh = h * 0.5;
    const rad = hw;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, w, h, rad);
    ctx.fill();
    if (drawCuff) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(-hw, hh - 5.2 * CAR_SCALE, w, 5.5 * CAR_SCALE);
      ctx.restore();
    }
    ctx.stroke();
    ctx.restore();
  };

  drawLimb(rag.legL, 6.4 * CAR_SCALE, 16 * CAR_SCALE, PALETTE.charcoal, true);
  drawLimb(rag.legR, 6.4 * CAR_SCALE, 16 * CAR_SCALE, PALETTE.charcoal, true);
  drawLimb(rag.armL, 5.6 * CAR_SCALE, 15 * CAR_SCALE, colors.lip, true);

  // Torso jacket with racing stripe
  ctx.save();
  ctx.translate(rag.torso.position.x, rag.torso.position.y);
  ctx.rotate(rag.torso.angle);
  const tw = 12.6 * CAR_SCALE;
  const th = 19 * CAR_SCALE;
  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.roundRect(-tw * 0.5, -th * 0.5, tw, th, tw * 0.45);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.body;
  ctx.fillRect(-tw * 0.5, -th * 0.5, tw, th * 0.52);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-tw * 0.5, -1.5 * CAR_SCALE, tw, 3.2 * CAR_SCALE);
  ctx.restore();
  ctx.stroke();
  ctx.restore();

  drawHelmet(ctx, rag.head, rag.facing || 1, rag.isRedPlayer, true);
  drawLimb(rag.armR, 5.6 * CAR_SCALE, 15 * CAR_SCALE, colors.body, true);
}

export function drawRoadster(ctx, carState, isRedPlayer) {
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  const { facing, chassis, wheelR, wheelF, head, headSevered, driverState } = carState;

  // 1. Seated Charcoal Torso, Expressive Flailing Arms & Elastic Neck (Behind chassis rim)
  const sinC = Math.sin(chassis.angle);
  const cosC = Math.cos(chassis.angle);
  const collarLocalY = (-4 * CAR_SCALE) - CENTER_OF_MASS_OFFSET;
  const collarX = chassis.position.x - sinC * collarLocalY;
  const collarY = chassis.position.y + cosC * collarLocalY;
  const lean = driverState ? driverState.lean : 0;

  if (!headSevered) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 14 * CAR_SCALE;
    ctx.beginPath();
    ctx.moveTo(collarX, collarY);
    ctx.lineTo(head.position.x, head.position.y);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.charcoal;
    ctx.lineWidth = 8.5 * CAR_SCALE;
    ctx.beginPath();
    ctx.moveTo(collarX, collarY);
    ctx.lineTo(head.position.x, head.position.y);
    ctx.stroke();

    ctx.translate(chassis.position.x, chassis.position.y);
    ctx.rotate(chassis.angle);
    ctx.translate(0, -CENTER_OF_MASS_OFFSET);
    ctx.scale(facing * CAR_SCALE, CAR_SCALE);

    // Leaning torso & flailing arms inside cockpit
    ctx.save();
    ctx.rotate(lean);

    // Back arm (armL)
    const aL = driverState ? driverState.armL : 0.78;
    const drawArm = (ang, fill) => {
      ctx.save();
      ctx.translate(-1, -8);
      ctx.rotate(ang);
      ctx.fillStyle = fill;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.8 / CAR_SCALE;
      ctx.beginPath();
      ctx.roundRect(-2.6, -13, 5.2, 13.5, 2.6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.white;
      ctx.beginPath();
      ctx.arc(0, -12.5, 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    drawArm(aL, colors.lip);

    // Torso shoulders
    ctx.fillStyle = PALETTE.charcoal;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3.5 / CAR_SCALE;
    ctx.beginPath();
    ctx.ellipse(0, -4, 13, 10.5, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front arm (armR)
    const aR = driverState ? driverState.armR : 0.88;
    drawArm(aR, colors.body);
    ctx.restore();

    ctx.restore();
  }

  // 2. Helmet Head (drawn attached here while driver is intact; severed head renders inside drawRagdoll)
  if (!headSevered) {
    drawHelmet(ctx, head, facing, isRedPlayer, false);
  }

  // 3. Sleek Aero Roadster Body (-7% overall size, low wedge nose, raked windscreen & tail lip)
  ctx.save();
  ctx.translate(chassis.position.x, chassis.position.y);
  ctx.rotate(chassis.angle);
  ctx.translate(0, -CENTER_OF_MASS_OFFSET);
  ctx.scale(facing * CAR_SCALE, CAR_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Rear Exhaust Tailpipe Stub
  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.beginPath();
  ctx.moveTo(-40, 2);
  ctx.lineTo(-50, -3.5);
  ctx.lineTo(-49, 3.5);
  ctx.lineTo(-39, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Raked Aerodynamic Windshield Post
  ctx.fillStyle = PALETTE.white;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.beginPath();
  ctx.moveTo(13, -7.5);
  ctx.lineTo(6.5, -18);
  ctx.lineTo(11.5, -18);
  ctx.lineTo(18.5, -7.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sleek Wedge Roadster Silhouette
  ctx.beginPath();
  ctx.moveTo(-39, 11);
  ctx.lineTo(40, 11);
  ctx.quadraticCurveTo(47.5, 11, 47.5, 3);
  ctx.quadraticCurveTo(46, -5.5, 31, -7.5);
  ctx.lineTo(16.5, -8.5);
  ctx.quadraticCurveTo(9, -1, 0, -1);
  ctx.quadraticCurveTo(-9, -1, -15.5, -9.5);
  ctx.lineTo(-36.5, -10.5);
  ctx.lineTo(-46.5, -13);
  ctx.quadraticCurveTo(-45.5, -2, -45, 3.5);
  ctx.quadraticCurveTo(-45, 11, -39, 11);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-48, 5.5, 97, 7);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-47, 0.2, 95, 4.0);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Sleek Wheel-Well Arches
  for (const wx of [-27, 27]) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(wx, 12.2, 17.5, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 4. Tires, Colored Rims & White Axle Dots (10% smaller)
  for (const w of [wheelR, wheelF]) {
    ctx.save();
    ctx.translate(w.position.x, w.position.y);
    ctx.rotate(w.angle);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(0, 0, CAR_SPEC.wheelRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.rim;
    ctx.beginPath();
    ctx.arc(0, 0, 7.6 * CAR_SCALE, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.arc(0, 0, 3.4 * CAR_SCALE, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
