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
  // Lower rear tailpipe + vertical rollbar exhaust stack behind cab
  ctx.fillStyle = PALETTE.charcoal;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.beginPath();
  ctx.roundRect(-48, -1, 10, 6.2, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#536270';
  ctx.beginPath();
  ctx.roundRect(-16, -24, 5.4, 17, 2.2);
  ctx.fill();
  ctx.stroke();

  // Rollbar hoop behind cab opening
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4.5 / CAR_SCALE;
  ctx.beginPath();
  ctx.moveTo(-11, -9);
  ctx.lineTo(-10, -25);
  ctx.lineTo(-2, -25);
  ctx.stroke();

  // Cab roof pillars / open sunroof frame around driver (head at x=+4)
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.beginPath();
  ctx.moveTo(15, -9);
  ctx.lineTo(13, -24);
  ctx.lineTo(22.5, -24);
  ctx.lineTo(26.5, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Windshield highlight glass strip
  ctx.fillStyle = '#dff6ff';
  ctx.beginPath();
  ctx.moveTo(16.5, -10.5);
  ctx.lineTo(15, -21);
  ctx.lineTo(20.8, -21);
  ctx.lineTo(24.2, -10.5);
  ctx.closePath();
  ctx.fill();

  // Rugged Pickup Body Silhouette (Cargo bed -46..-11, cab/hood -11..+46)
  ctx.beginPath();
  ctx.moveTo(-43, 12);
  ctx.lineTo(43, 12);
  ctx.lineTo(46.5, 8);
  ctx.lineTo(46.5, -5.5);
  ctx.quadraticCurveTo(45, -10.5, 36, -11);
  ctx.lineTo(22, -11);
  ctx.lineTo(14.5, -11);
  ctx.lineTo(11, -3);
  ctx.lineTo(-3, -3);
  ctx.lineTo(-10, -11.5);
  ctx.lineTo(-42.5, -11.5);
  ctx.lineTo(-46, -8);
  ctx.lineTo(-45.5, 9);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Cargo bed recessed trim + racing gold stripe + lower skid lip
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-48, 6.2, 97, 7);
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(-43, -12, 31, 4.5);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-47, 1.2, 95, 3.8);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Chrome/Steel Front Bullbar Bumper + Headlight
  ctx.fillStyle = '#d2dae2';
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.6 / CAR_SCALE;
  ctx.beginPath();
  ctx.roundRect(44, -6, 6.5, 16, 2.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.roundRect(41, -7.5, 4.2, 5.2, 1.5);
  ctx.fill();

  // Wheel-Well Arches
  for (const wx of [-27.5, 27.5]) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(wx, 12.8, 18.6, Math.PI, 0);
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

function drawWheel(ctx, wheel, radius, colors, style = 'roadster') {
  ctx.save();
  ctx.translate(wheel.position.x, wheel.position.y);
  ctx.rotate(wheel.angle);

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
  }

  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  const rimR = style === 'jcb' ? radius * 0.56 : radius * 0.53;
  ctx.fillStyle = style === 'jcb' ? '#f5b818' : colors.rim;
  ctx.beginPath();
  ctx.arc(0, 0, rimR, 0, Math.PI * 2);
  ctx.fill();

  if (style === 'jcb') {
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 2.2 * CAR_SCALE;
    ctx.stroke();
  }

  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.23, 0, Math.PI * 2);
  ctx.fill();

  if (style === 'truck' || style === 'jcb') {
    ctx.fillStyle = PALETTE.ink;
    const bolts = 4;
    for (let i = 0; i < bolts; i++) {
      const ba = (i / bolts) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ba) * radius * 0.37, Math.sin(ba) * radius * 0.37, 1.3 * CAR_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawVehicle(ctx, carState, isRedPlayer) {
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  const spec = carState.spec || CAR_MODELS[carState.model] || CAR_SPEC;
  const model = spec.id || 'roadster';
  const { facing, chassis, wheelR, wheelF, head, headSevered } = carState;

  // 1. Seated Charcoal Torso, Expressive Flailing Arms & Elastic Neck
  drawDriverAndNeck(ctx, carState, colors, spec);

  // 2. Helmet Head (drawn attached here while driver is intact; severed head renders inside drawRagdoll)
  if (!headSevered) {
    drawHelmet(ctx, head, facing, isRedPlayer, false);
  }

  // 3. Model-specific Vehicle Chassis Body
  ctx.save();
  ctx.translate(chassis.position.x, chassis.position.y);
  ctx.rotate(chassis.angle);
  ctx.translate(0, -CENTER_OF_MASS_OFFSET);
  ctx.scale(facing * CAR_SCALE, CAR_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (model === 'truck') {
    drawTruckBody(ctx, colors);
  } else if (model === 'jcb') {
    drawJcbBody(ctx, colors);
  } else {
    drawRoadsterBody(ctx, colors);
  }
  ctx.restore();

  // 4. Tires, Colored/Hubbed Rims & Lug Detail
  const radR = carState.wheelRadiusR || spec.wheelRadiusR || spec.wheelRadius;
  const radF = carState.wheelRadiusF || spec.wheelRadiusF || spec.wheelRadius;
  drawWheel(ctx, wheelR, radR, colors, model);
  drawWheel(ctx, wheelF, radF, colors, model);
}

export const drawRoadster = drawVehicle;
