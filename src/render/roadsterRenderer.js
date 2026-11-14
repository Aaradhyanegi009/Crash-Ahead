import {
  PALETTE,
  CAR_SCALE,
  CAR_SPEC,
  CAR_MODELS,
  CENTER_OF_MASS_OFFSET
} from '../config/constants.js';

function drawHelmet(ctx, head, facing, isRedPlayer, isKO = false) {
  if (!head) return;
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  const r = CAR_SPEC.headRadius;
  ctx.save();
  ctx.translate(head.position.x, head.position.y);
  ctx.rotate(head.angle);
  ctx.scale(facing, 1);

  // Full-face motorsport / motocross helmet contour (dome + brow peak + protruding chin guard)
  ctx.beginPath();
  ctx.moveTo(-0.86 * r, 0.58 * r);
  ctx.bezierCurveTo(-1.12 * r, 0.05 * r, -0.96 * r, -1.04 * r, -0.05 * r, -1.05 * r);
  ctx.bezierCurveTo(0.45 * r, -1.06 * r, 0.78 * r, -0.92 * r, 1.24 * r, -0.74 * r); // sun peak tip
  ctx.lineTo(1.20 * r, -0.54 * r);
  ctx.lineTo(0.84 * r, -0.48 * r); // under peak into brow
  ctx.bezierCurveTo(1.06 * r, -0.20 * r, 1.16 * r, 0.14 * r, 1.10 * r, 0.48 * r); // chin guard nose
  ctx.quadraticCurveTo(0.98 * r, 0.80 * r, 0.42 * r, 0.88 * r);
  ctx.quadraticCurveTo(-0.35 * r, 0.90 * r, -0.86 * r, 0.58 * r);
  ctx.closePath();

  ctx.fillStyle = colors.helmet;
  ctx.fill();

  // Subtle crown speed accent clipped inside helmet shell
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.rim;
  ctx.fillRect(-0.95 * r, -1.08 * r, 1.75 * r, 0.28 * r);
  ctx.fillStyle = colors.lip;
  ctx.beginPath();
  ctx.rect(-1.15 * r, 0.62 * r, 2.35 * r, 0.35 * r);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Contoured dark racing visor shield
  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0.18 * r, -0.50 * r);
  ctx.quadraticCurveTo(0.68 * r, -0.52 * r, 0.96 * r, -0.40 * r);
  ctx.quadraticCurveTo(1.06 * r, -0.08 * r, 0.96 * r, 0.20 * r);
  ctx.quadraticCurveTo(0.56 * r, 0.24 * r, 0.22 * r, 0.16 * r);
  ctx.quadraticCurveTo(0.10 * r, -0.16 * r, 0.18 * r, -0.50 * r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isKO) {
    const vx = 0.58 * r;
    const vy = -0.14 * r;
    const xr = 0.20 * r;
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(vx - xr, vy - xr);
    ctx.lineTo(vx + xr, vy + xr);
    ctx.moveTo(vx + xr, vy - xr);
    ctx.lineTo(vx - xr, vy + xr);
    ctx.stroke();
  } else {
    // Crisp white visor reflection streak
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.32 * r, -0.34 * r);
    ctx.lineTo(0.62 * r, -0.26 * r);
    ctx.stroke();
  }

  // Chin breather vent + subtle side visor hinge bolt (clean, non-eye-like)
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.roundRect(0.64 * r, 0.42 * r, 0.28 * r, 0.14 * r, 0.06 * r);
  ctx.fill();
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.arc(0.06 * r, -0.02 * r, 0.14 * r, 0, Math.PI * 2);
  ctx.fill();

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

function drawDriverAndNeck(ctx, carState, colors, spec) {
  const { facing, chassis, head, headSevered, driverState } = carState;
  if (headSevered) return;

  const sinC = Math.sin(chassis.angle);
  const cosC = Math.cos(chassis.angle);
  const collarLocalX = (spec.collarX || 0) * facing;
  const collarLocalY = (spec.collarY ?? (-4 * CAR_SCALE)) - CENTER_OF_MASS_OFFSET;
  const collarX = chassis.position.x + cosC * collarLocalX - sinC * collarLocalY;
  const collarY = chassis.position.y + sinC * collarLocalX + cosC * collarLocalY;
  const lean = driverState ? driverState.lean : 0;

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
  ctx.translate((spec.collarX || 0) / CAR_SCALE, ((spec.collarY ?? (-4 * CAR_SCALE)) / CAR_SCALE) + 4);

  ctx.save();
  ctx.rotate(lean);

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

  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.beginPath();
  ctx.ellipse(0, -4, 13, 10.5, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const aR = driverState ? driverState.armR : 0.88;
  drawArm(aR, colors.body);
  ctx.restore();

  ctx.restore();
}

function drawRoadsterBody(ctx, colors) {
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
}

function drawTruckBody(ctx, colors) {
  ctx.lineWidth = 3.2 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Vertical chrome diesel exhaust smokestack behind cab (aligns with exhaustLocal -15, -32)
  ctx.fillStyle = '#bcc6d0';
  ctx.beginPath();
  ctx.roundRect(-18, -32.5, 6, 20, 2.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-18.5, -33.5, 7, 3.8, 1.4);
  ctx.fill();
  ctx.stroke();

  // Rear heavy headboard rack protecting driver cab behind open seat
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-11.5, -30, 5.5, 16, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.roundRect(-11, -33, 4.5, 3.8, 1.5);
  ctx.fill();
  ctx.stroke();

  // Tall boxy front cab A-pillar + windshield + roof sun-visor
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.moveTo(18, -16);
  ctx.lineTo(17, -33.5);
  ctx.lineTo(31, -32.5);
  ctx.lineTo(34, -17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Extended roof visor eyebrow
  ctx.fillStyle = colors.lip;
  ctx.beginPath();
  ctx.roundRect(12.5, -34.5, 20, 5.2, 2.2);
  ctx.fill();
  ctx.stroke();

  // Large square truck windshield glass
  ctx.fillStyle = '#dff6ff';
  ctx.beginPath();
  ctx.moveTo(20, -18.5);
  ctx.lineTo(19.5, -29.2);
  ctx.lineTo(28.5, -28.8);
  ctx.lineTo(31.2, -18.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rugged Heavy Boxy Cargo/Utility Truck Body (High Dump Bed -48..-8, Tall Nose +16..+48)
  ctx.beginPath();
  ctx.moveTo(-45, 12.5);
  ctx.lineTo(44.5, 12.5);
  ctx.lineTo(48, 8.5);
  ctx.lineTo(48, -16.5);          // Vertical flat truck nose
  ctx.lineTo(44, -20.5);          // Crisp square hood corner
  ctx.lineTo(17, -20.5);          // Tall hood cowl in front of driver
  ctx.lineTo(14.5, -5.5);         // Open driver cab cockpit well (leaves helmet exposed)
  ctx.lineTo(-5.5, -5.5);
  ctx.lineTo(-8.5, -19.5);        // Tall cargo dump bed bulkhead
  ctx.lineTo(-46.5, -19.5);       // Flat heavy utility bed top rail
  ctx.lineTo(-48.5, -15);
  ctx.lineTo(-48, 9);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Heavy bed rail + lower chassis sill + bold team truck stripe
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-50, 6.2, 102, 7.5);
  ctx.fillStyle = '#3f4b56';
  ctx.fillRect(-50, -21, 42, 5.5);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-50, -3.5, 102, 4.4);
  // Corrugated cargo bed vertical stake ribs
  ctx.fillStyle = colors.lip;
  for (const bx of [-42, -31, -20]) {
    ctx.fillRect(bx, -15.5, 3.8, 21.5);
  }
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Heavy dark slatted front truck grille
  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4 / CAR_SCALE;
  ctx.beginPath();
  ctx.roundRect(42.5, -15, 6.5, 19, 1.8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d2dae2';
  for (const gy of [-12, -7.2, -2.4]) {
    ctx.fillRect(43.5, gy, 4.8, 2.2);
  }

  // Dual stacked front truck headlights + chunky chrome bullbar front bumper & rear step bumper
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.roundRect(44, -18.5, 4.5, 3.8, 1.2);
  ctx.fill();
  ctx.fillStyle = '#d2dae2';
  ctx.beginPath();
  ctx.roundRect(44.5, 2.5, 7, 11.5, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-51, 3.5, 6.5, 10, 2);
  ctx.fill();
  ctx.stroke();

  // Heavy-duty Squared Wheel-Well Flares
  for (const wx of [-28, 28]) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(wx, 13, 19.2, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function drawJcbBody(ctx, colors) {
  const jcbYellow = '#f5b818';
  const jcbAmber = '#d98e0b';

  // Rear folded Backhoe Digging Arm tucked behind cab (-20..-46)
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.fillStyle = jcbAmber;
  ctx.beginPath();
  ctx.moveTo(-21, -2);
  ctx.lineTo(-34, -22);
  ctx.lineTo(-27, -25);
  ctx.lineTo(-16, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = jcbYellow;
  ctx.beginPath();
  ctx.moveTo(-31, -22);
  ctx.lineTo(-44, -5);
  ctx.lineTo(-38, -2);
  ctx.lineTo(-26, -18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mini rear backhoe bucket claw
  ctx.fillStyle = '#3b444f';
  ctx.beginPath();
  ctx.moveTo(-42, -7);
  ctx.lineTo(-49, -1);
  ctx.lineTo(-45, 7);
  ctx.lineTo(-37, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Upright black JCB exhaust chimney ahead of cab (x=+11, top y=-28)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(9, -29, 4.5, 21, 1.8);
  ctx.fill();
  ctx.stroke();

  // ROPS Industrial Cab Frame & Roof Canopy with team-colored stripe + beacon
  ctx.fillStyle = jcbYellow;
  ctx.beginPath();
  ctx.roundRect(-20, -28, 25, 4.8, 2);
  ctx.fill();
  ctx.stroke();

  // Team-colored roof trim & beacon so Red vs Blue is unmistakable!
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(-19, -27.2, 23, 2.4, 1);
  ctx.fill();
  ctx.fillStyle = '#ff9f1c';
  ctx.strokeStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.roundRect(-12, -32.2, 5.5, 4.5, 2);
  ctx.fill();
  ctx.stroke();

  // Front & rear cab pillars (open middle for driver helmet)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-19.5, -24, 4.2, 16, 1.5);
  ctx.roundRect(0.8, -24, 4.2, 16, 1.5);
  ctx.fill();
  ctx.stroke();

  // Main Heavy JCB Chassis & Sloped Engine Hood
  ctx.beginPath();
  ctx.moveTo(-36, 11);
  ctx.lineTo(35, 11);
  ctx.lineTo(38, 4);
  ctx.lineTo(33, -7);
  ctx.lineTo(7, -10.5);
  ctx.lineTo(4, -3);
  ctx.lineTo(-10, -3);
  ctx.lineTo(-16, -11);
  ctx.lineTo(-34, -10);
  ctx.lineTo(-38, 3);
  ctx.closePath();

  ctx.fillStyle = jcbYellow;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Bold Team Livery Stripe & Belly Plate
  ctx.fillStyle = colors.body;
  ctx.fillRect(-39, -3.5, 78, 7.2);
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-39, 6, 78, 6.5);
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(15, -10, 12, 6);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Front Loader Boom Arm + Heavy Toothed Scoop Bucket (+16..+53)
  ctx.fillStyle = jcbYellow;
  ctx.beginPath();
  ctx.moveTo(14, -7);
  ctx.lineTo(37, 2);
  ctx.lineTo(35, 8);
  ctx.lineTo(12, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#3b444f';
  ctx.beginPath();
  ctx.moveTo(35, -7.5);
  ctx.lineTo(47, -2);
  ctx.lineTo(52.5, 10.5);
  ctx.lineTo(36, 11.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wheel-Well Arches sized for Large Rear Tractor Wheel (-25.5) & Smaller Front Wheel (+25.5)
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(-25.5, 12.4, 19.2, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(25.5, 14.2, 16.4, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

function drawBikeBody(ctx, colors) {
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Rear upswept exhaust pipe + muffler tip (matches exhaustLocal -34, +2)
  ctx.fillStyle = '#adb5bd';
  ctx.beginPath();
  ctx.moveTo(-6, 7);
  ctx.lineTo(-27, 4);
  ctx.lineTo(-34, 0.5);
  ctx.lineTo(-32.5, 4.8);
  ctx.lineTo(-25, 8.2);
  ctx.lineTo(-4, 10.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dark tail cone tip
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.arc(-33.5, 2.4, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rear swingarm connecting pivot (-4, 6) to rear axle (-21.5, 10.5)
  ctx.fillStyle = '#6c757d';
  ctx.beginPath();
  ctx.moveTo(-22.5, 8.2);
  ctx.lineTo(-3, 4.2);
  ctx.lineTo(-2, 9.2);
  ctx.lineTo(-21, 12.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front telescopic fork + golden stanchion from steering neck (+10, -14) to axle (+21.5, 10.5)
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(8.5, -14.5);
  ctx.lineTo(13, -15.5);
  ctx.lineTo(18.5, -1.5);
  ctx.lineTo(14, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d2dae2';
  ctx.beginPath();
  ctx.moveTo(14.5, -1.5);
  ctx.lineTo(18.2, -2.5);
  ctx.lineTo(23.2, 9.8);
  ctx.lineTo(19.6, 11.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Compact engine block & silver cylinder fins under rider
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-10, -1, 19, 11, 3.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9aa5b1';
  ctx.beginPath();
  ctx.roundRect(-6.5, 1.2, 11.5, 6.2, 2);
  ctx.fill();
  ctx.stroke();

  // Sport-stunt motorcycle frame, sculpted tank, seat & swept tail fairing
  ctx.beginPath();
  ctx.moveTo(-34, -8.5);           // high tail fin
  ctx.lineTo(-15, -6.5);           // rider seat dip
  ctx.quadraticCurveTo(-5, -5.5, 0, -11.5); // rise into sculpted fuel tank
  ctx.quadraticCurveTo(9, -17.5, 19.5, -12.5); // front tank & cowl crown
  ctx.lineTo(24.5, -5.5);          // nose beak above front tire
  ctx.lineTo(14, -2.5);
  ctx.lineTo(9, 4.5);
  ctx.lineTo(-10, 4.5);
  ctx.lineTo(-22, -2.5);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Dark saddle & racing speed stripe
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(-19, -9.5, 19, 5.2);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-35, -3.5, 60, 3.5);
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-35, 1.2, 60, 5.5);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.3 / CAR_SCALE;
  ctx.stroke();

  // Front yellow headlight lens + handlebar riser & grip
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.roundRect(19.5, -11, 4.5, 4.6, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.roundRect(7, -18.5, 7, 3.6, 1.5);
  ctx.fill();
}

function drawTankBody(ctx, colors) {
  ctx.lineWidth = 3.2 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Heavy upper tread belt & bogie rollers linking front/rear drive wheels
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-37, -1.5, 74, 15.5, 7.2);
  ctx.fill();
  ctx.stroke();

  // Center armored road bogie wheels peeking along the track bed
  for (const bx of [-8.8, 8.8]) {
    ctx.fillStyle = '#495057';
    ctx.beginPath();
    ctx.arc(bx, 11.2, 8.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.rim;
    ctx.beginPath();
    ctx.arc(bx, 11.2, 4.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Heavy cannon barrel & slotted muzzle brake extending cleanly forward
  ctx.fillStyle = '#495057';
  ctx.beginPath();
  ctx.roundRect(12, -16.8, 33, 5.4, 2.0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(41, -18.0, 7.5, 7.8, 2.0);
  ctx.fill();
  ctx.stroke();

  // Sloped Panzer Turret Dome with open top commander cupola (leaves helmet proudly exposed!)
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.moveTo(-23, -8.5);
  ctx.lineTo(-18.5, -18.5);
  ctx.lineTo(13, -18.5);
  ctx.lineTo(19, -11.5);
  ctx.lineTo(17, -8.5);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-24, -12.8, 44, 5.2);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-24, -15.6, 44, 2.6);
  ctx.restore();
  ctx.stroke();

  // Commander cupola ring rim
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-11, -20.5, 16, 3.2, 1.4);
  ctx.fill();
  ctx.stroke();

  // Rear diesel exhaust stack stub (aligns with exhaustLocal -38, -6)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-41, -11, 6, 8, 2);
  ctx.fill();
  ctx.stroke();

  // Main Beveled Armored Hull & Side Mud Skirts
  ctx.beginPath();
  ctx.moveTo(-43, 6.5);
  ctx.lineTo(-45, -2.5);
  ctx.lineTo(-39, -9.5);
  ctx.lineTo(36, -9.5);
  ctx.lineTo(46, -1.5);
  ctx.lineTo(43.5, 6.5);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Armored skirt plate, gold tactical band & steel belly trim
  ctx.fillStyle = '#3f4b56';
  ctx.fillRect(-46, 0.5, 93, 7);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-46, -3.2, 93, 3.6);
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-46, -9.5, 93, 3.8);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Armored skirt rivets
  ctx.fillStyle = '#d2dae2';
  for (const rx of [-30, -15, 0, 15, 30]) {
    ctx.beginPath();
    ctx.arc(rx, 3.4, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAircraftBody(ctx, colors, roundElapsedMs = 0) {
  ctx.lineWidth = 3.1 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Landing gear V-struts connecting lower fuselage to rear tailwheel (-24, 12.2) & main axle (+24, 12.2)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.moveTo(10, 5);
  ctx.lineTo(25.5, 11.5);
  ctx.lineTo(22.5, 13.5);
  ctx.lineTo(6.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-18, 4.5);
  ctx.lineTo(-25, 11.8);
  ctx.lineTo(-22, 13.4);
  ctx.lineTo(-14, 5.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rear WWI vertical tail fin & rudder + horizontal stabilizer
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.moveTo(-31, -4);
  ctx.quadraticCurveTo(-41, -22, -45.5, -18);
  ctx.lineTo(-44.5, 3.5);
  ctx.lineTo(-33, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(-46, -22, 4.8, 28);
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-41.2, -22, 4.4, 28);
  ctx.restore();
  ctx.stroke();

  // Main WWI tapered fabric-skinned fuselage (-42..+42)
  ctx.beginPath();
  ctx.moveTo(-42, 4);
  ctx.lineTo(35, 7.5);
  ctx.quadraticCurveTo(43.5, 7.5, 43.5, 0);
  ctx.quadraticCurveTo(43.5, -9, 34, -10.5);
  ctx.lineTo(12, -11.5);
  ctx.lineTo(4, -5.5);          // open cockpit bay cutout for pilot helmet
  ctx.lineTo(-11.5, -5.5);
  ctx.lineTo(-15.5, -10.5);     // rear turtledeck spine
  ctx.lineTo(-42.5, -4.5);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-45, 2.2, 92, 7.5);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-45, -1.8, 92, 3.6);
  ctx.restore();
  ctx.stroke();

  // Classic WWI circular squadron roundel on rear fuselage flank
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(-23, -1, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.6 / CAR_SCALE;
  ctx.stroke();
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.beginPath();
  ctx.arc(-23, -1, 2.3, 0, Math.PI * 2);
  ctx.fill();

  // Open cockpit leather coaming rim + angled aero windscreen + nose machine guns
  ctx.lineWidth = 2.6 / CAR_SCALE;
  ctx.fillStyle = '#5c3721';
  ctx.beginPath();
  ctx.roundRect(-12.5, -11, 18, 4.4, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#dff6ff';
  ctx.beginPath();
  ctx.moveTo(6.5, -10.5);
  ctx.lineTo(3.5, -16.5);
  ctx.lineTo(7.5, -16.5);
  ctx.lineTo(11, -10.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Twin nose cowl machine gun barrels + rotary radial aluminum nose cowling
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(14, -13.2, 16, 2.8, 1);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#adb5bd';
  ctx.beginPath();
  ctx.roundRect(35.5, -9.8, 7.8, 17, 3.2);
  ctx.fill();
  ctx.stroke();

  // Lower biplane wing airfoil chord
  ctx.fillStyle = colors.lip;
  ctx.beginPath();
  ctx.roundRect(-13, 2.5, 31, 5.5, 2.7);
  ctx.fill();
  ctx.stroke();

  // Interplane wooden struts well clear of central pilot helmet bay (-16 & +15)
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.roundRect(-18.5, -29.5, 3.4, 33.5, 1.4);
  ctx.roundRect(14.5, -29.5, 3.4, 33.5, 1.4);
  ctx.fill();
  ctx.stroke();

  // Upper parasol WWI biplane wing cleanly above pilot helmet (-33.5..-28.2)
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(-21, -33.5, 45, 5.4, 2.6);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-21, -30.5, 45, 2.6);
  ctx.restore();
  ctx.stroke();

  // Animated spinning front propeller + hub spinner
  const spinPhase = (roundElapsedMs || 0) * 0.045;
  const bladeH = 4.5 + Math.abs(Math.sin(spinPhase)) * 13.5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(46.2, -1.2, 2.8, 18.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5c3721';
  ctx.beginPath();
  ctx.roundRect(45.2, -1.2 - bladeH, 3.2, bladeH * 2, 1.6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.stripeGold;
  ctx.beginPath();
  ctx.arc(44.2, -1.2, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawJetskiBody(ctx, colors) {
  ctx.lineWidth = 3.2 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Rear jet-pump nozzle & transom step (-45..-36)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-45.5, 0.5, 9.5, 8.2, 2.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9aa5b1';
  ctx.beginPath();
  ctx.roundRect(-47, 2.4, 3.4, 4.4, 1);
  ctx.fill();

  // Low dark wake/hydro-hull skirt framing underside rollers
  ctx.fillStyle = '#24313f';
  ctx.beginPath();
  ctx.moveTo(-39, 7);
  ctx.lineTo(36, 7);
  ctx.lineTo(39, 13.5);
  ctx.quadraticCurveTo(0, 15.5, -36, 13.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Angled watercraft steering console & high handlebar grips
  ctx.fillStyle = colors.lip;
  ctx.beginPath();
  ctx.moveTo(6, -5);
  ctx.lineTo(13, -17.5);
  ctx.lineTo(19, -15.5);
  ctx.lineTo(14.5, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.roundRect(10.5, -19.5, 9.5, 3.8, 1.6);
  ctx.fill();

  // Small tinted jetski bow splash visor
  ctx.fillStyle = '#dff6ff';
  ctx.beginPath();
  ctx.moveTo(16, -11.5);
  ctx.lineTo(25.5, -15.2);
  ctx.lineTo(28, -9.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sharp wave-piercing Jetski hull (-41..+48)
  ctx.beginPath();
  ctx.moveTo(-38, 10.5);
  ctx.lineTo(32, 10.5);
  ctx.quadraticCurveTo(46.5, 9.5, 49, -1.5);
  ctx.quadraticCurveTo(43.5, -8.5, 22, -10.5);
  ctx.lineTo(11, -10.5);
  ctx.lineTo(3, -5.5);           // rider straddle footwell dip
  ctx.lineTo(-22, -6.5);
  ctx.lineTo(-37, -11.5);        // kicked-up rear grab spoiler
  ctx.lineTo(-41.5, -7);
  ctx.lineTo(-40.5, 7);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Crisp white wave-chine bottom, gold slash & lower team lip
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(-44, 5.8, 96, 5.8);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.beginPath();
  ctx.moveTo(-42, 2);
  ctx.lineTo(48, -4.5);
  ctx.lineTo(48, 0.2);
  ctx.lineTo(-42, 5.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-44, -12, 96, 5.2);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Dark contoured straddle saddle
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-24.5, -10, 26, 5.8, 2.6);
  ctx.fill();
  ctx.stroke();
}

function drawSnowmobileBody(ctx, colors) {
  ctx.lineWidth = 3.1 / CAR_SCALE;
  ctx.strokeStyle = PALETTE.ink;

  // Rear snow-flap + heavy cleated rubber track suspension frame (-44..-1, y +3..+22)
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-45.5, 5, 5.5, 13.5, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-41.5, 5.5, 39.5, 17, 7.8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#5c6670';
  for (const bx of [-34, -22, -10]) {
    ctx.beginPath();
    ctx.arc(bx, 14, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Front spindle strut + twin curved Alpine Ski Runner (+7..+53, y +11..+24.5)
  ctx.fillStyle = '#adb5bd';
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(25.5, 4);
  ctx.lineTo(28.5, 20.5);
  ctx.lineTo(23, 20.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.moveTo(7.5, 20.5);
  ctx.lineTo(43, 20.5);
  ctx.quadraticCurveTo(51.5, 20.5, 53.5, 11.2);
  ctx.lineTo(49.5, 9.8);
  ctx.quadraticCurveTo(47.5, 17, 42, 17.5);
  ctx.lineTo(8.5, 17.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.body;
  ctx.fillRect(14, 18.2, 24, 1.8);

  // Tall riser handlebars & icy tinted angular windshield
  ctx.fillStyle = '#dff6ff';
  ctx.beginPath();
  ctx.moveTo(12, -10.5);
  ctx.lineTo(21, -22.5);
  ctx.lineTo(26, -21);
  ctx.lineTo(20, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.lip;
  ctx.beginPath();
  ctx.roundRect(6, -18.5, 8.5, 4.0, 1.6);
  ctx.fill();
  ctx.stroke();

  // Sharp faceted Snowmobile tunnel & front nose cowling (-40..+45)
  ctx.beginPath();
  ctx.moveTo(-40, 8);
  ctx.lineTo(35, 8);
  ctx.lineTo(46, 3);
  ctx.lineTo(39, -6.5);
  ctx.lineTo(14, -11.5);
  ctx.lineTo(4, -5);
  ctx.lineTo(-22, -6.5);
  ctx.lineTo(-39, -9.5);
  ctx.lineTo(-42, 2);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(-43, 2.5, 91, 6.5);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-43, -1.8, 91, 3.8);
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(16, -9.5, 28, 3.5);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Thermal quilted snowmobile saddle
  ctx.fillStyle = PALETTE.charcoal;
  ctx.beginPath();
  ctx.roundRect(-25.5, -10.2, 26.5, 5.8, 2.5);
  ctx.fill();
  ctx.stroke();
}

function drawWheel(ctx, wheel, radius, colors, style = 'roadster', offsetX = 0, offsetY = 0) {
  ctx.save();
  ctx.translate(wheel.position.x + offsetX, wheel.position.y + offsetY);
  ctx.rotate(wheel.angle);

  if (style === 'jetski') {
    // Low-profile dark hydro-roller subtly visible under watercraft hull
    ctx.fillStyle = '#1b2631';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334e68';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (style === 'jcb') {
    // Bold industrial tractor tread lugs around tire perimeter
    const lugCount = 8;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < lugCount; i++) {
      const a = (i / lugCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-2.4 * CAR_SCALE, -radius - 1.4 * CAR_SCALE, 4.8 * CAR_SCALE, 3.6 * CAR_SCALE, 1.1 * CAR_SCALE);
      ctx.fill();
      ctx.restore();
    }
  } else if (style === 'tank') {
    const lugCount = 10;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < lugCount; i++) {
      const a = (i / lugCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-2.1 * CAR_SCALE, -radius - 1.2 * CAR_SCALE, 4.2 * CAR_SCALE, 3.2 * CAR_SCALE, 0.8 * CAR_SCALE);
      ctx.fill();
      ctx.restore();
    }
  } else if (style === 'truck') {
    const lugCount = 6;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < lugCount; i++) {
      const a = (i / lugCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-2.0 * CAR_SCALE, -radius - 0.8 * CAR_SCALE, 4.0 * CAR_SCALE, 2.8 * CAR_SCALE, 0.9 * CAR_SCALE);
      ctx.fill();
      ctx.restore();
    }
  } else if (style === 'snowmobile') {
    const lugCount = 7;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < lugCount; i++) {
      const a = (i / lugCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-1.8 * CAR_SCALE, -radius - 1.0 * CAR_SCALE, 3.6 * CAR_SCALE, 2.6 * CAR_SCALE, 0.8 * CAR_SCALE);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  const rimR = style === 'jcb' ? radius * 0.56 : style === 'bike' ? radius * 0.62 : style === 'tank' ? radius * 0.58 : style === 'aircraft' ? radius * 0.64 : style === 'snowmobile' ? radius * 0.55 : radius * 0.53;
  ctx.fillStyle = style === 'jcb' ? '#f5b818' : style === 'tank' ? '#5c6670' : style === 'aircraft' ? '#e6d5b8' : style === 'snowmobile' ? '#3f4b56' : colors.rim;
  ctx.beginPath();
  ctx.arc(0, 0, rimR, 0, Math.PI * 2);
  ctx.fill();

  if (style === 'jcb' || style === 'tank' || style === 'snowmobile') {
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 2.2 * CAR_SCALE;
    ctx.stroke();
  } else if (style === 'bike' || style === 'aircraft') {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = (style === 'aircraft' ? 1.2 : 1.6) * CAR_SCALE;
    const spokes = style === 'aircraft' ? 8 : 5;
    for (let i = 0; i < spokes; i++) {
      const sa = (i / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sa) * rimR, Math.sin(sa) * rimR);
      ctx.stroke();
    }
  }

  ctx.fillStyle = style === 'aircraft' ? colors.rim : PALETTE.white;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.23, 0, Math.PI * 2);
  ctx.fill();

  if (style === 'truck' || style === 'jcb' || style === 'tank' || style === 'snowmobile') {
    ctx.fillStyle = PALETTE.ink;
    const bolts = style === 'tank' ? 6 : 4;
    for (let i = 0; i < bolts; i++) {
      const ba = (i / bolts) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ba) * radius * 0.37, Math.sin(ba) * radius * 0.37, 1.3 * CAR_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawVehicle(ctx, carState, isRedPlayer, roundElapsedMs = 0) {
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  const spec = carState.spec || CAR_MODELS[carState.model] || CAR_SPEC;
  const model = spec.id || 'roadster';
  const { facing, chassis, wheelR, wheelF, head, headSevered } = carState;

  // 80ms suspension strut compression -> smooth spring expansion on relative jump takeoff
  let wheelLift = 0;
  let chassisDrop = 0;
  if (typeof carState.jumpSquashAtMs === 'number' && roundElapsedMs >= carState.jumpSquashAtMs) {
    const dtJump = roundElapsedMs - carState.jumpSquashAtMs;
    if (dtJump <= 80) {
      const compress = 0.45 + 0.55 * Math.sin((dtJump / 80) * Math.PI);
      wheelLift = compress * 4.2 * CAR_SCALE;
      chassisDrop = compress * 2.0 * CAR_SCALE;
    } else if (dtJump <= 185) {
      const u = (dtJump - 80) / 105;
      const curve = (1 - u) * 0.45 - Math.sin(u * Math.PI) * 0.28;
      wheelLift = curve * 4.2 * CAR_SCALE;
      chassisDrop = curve * 2.0 * CAR_SCALE;
    }
  }
  const cosA = Math.cos(chassis.angle);
  const sinA = Math.sin(chassis.angle);
  const carUpX = sinA;
  const carUpY = -cosA;
  const wheelOffX = carUpX * wheelLift;
  const wheelOffY = carUpY * wheelLift;

  // 0. Mechanical Suspension Struts connecting chassis mounts to wheel hubs
  const mountLocalY = 2 * CAR_SCALE - CENTER_OF_MASS_OFFSET;
  const drawStrut = (mxLocal, wheel) => {
    if (!wheel) return;
    const ax = chassis.position.x + mxLocal * cosA - mountLocalY * sinA - carUpX * chassisDrop;
    const ay = chassis.position.y + mxLocal * sinA + mountLocalY * cosA - carUpY * chassisDrop;
    const wx = wheel.position.x + wheelOffX;
    const wy = wheel.position.y + wheelOffY;
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.2 * CAR_SCALE;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.strokeStyle = '#9aa5b1';
    ctx.lineWidth = 1.8 * CAR_SCALE;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo((ax + wx) * 0.5, (ay + wy) * 0.5);
    ctx.stroke();
    ctx.restore();
  };
  drawStrut(-spec.wheelOffsetX, wheelR);
  drawStrut(spec.wheelOffsetX, wheelF);

  // 1. Seated Charcoal Torso, Expressive Flailing Arms & Elastic Neck
  drawDriverAndNeck(ctx, carState, colors, spec);

  // 2. Helmet Head (drawn attached here while driver is intact; severed head renders inside drawRagdoll)
  if (!headSevered) {
    drawHelmet(ctx, head, facing, isRedPlayer, false);
  }

  // 3. Model-specific Vehicle Chassis Body
  ctx.save();
  ctx.translate(chassis.position.x - carUpX * chassisDrop, chassis.position.y - carUpY * chassisDrop);
  ctx.rotate(chassis.angle);
  ctx.translate(0, -CENTER_OF_MASS_OFFSET);
  ctx.scale(facing * CAR_SCALE, CAR_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (model === 'truck') {
    drawTruckBody(ctx, colors);
  } else if (model === 'jcb') {
    drawJcbBody(ctx, colors);
  } else if (model === 'bike') {
    drawBikeBody(ctx, colors);
  } else if (model === 'tank') {
    drawTankBody(ctx, colors);
  } else if (model === 'aircraft') {
    drawAircraftBody(ctx, colors, roundElapsedMs);
  } else if (model === 'jetski') {
    drawJetskiBody(ctx, colors);
  } else if (model === 'snowmobile') {
    drawSnowmobileBody(ctx, colors);
  } else {
    drawRoadsterBody(ctx, colors);
  }
  ctx.restore();

  // 4. Tires, Colored/Hubbed Rims & Lug Detail
  const radR = carState.wheelRadiusR || spec.wheelRadiusR || spec.wheelRadius;
  const radF = carState.wheelRadiusF || spec.wheelRadiusF || spec.wheelRadius;
  drawWheel(ctx, wheelR, radR, colors, model, wheelOffX, wheelOffY);
  drawWheel(ctx, wheelF, radF, colors, model, wheelOffX, wheelOffY);
}

export const drawRoadster = drawVehicle;
