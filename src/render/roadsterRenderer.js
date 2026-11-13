import {
  PALETTE,
  CAR_SCALE,
  CAR_SPEC,
  CENTER_OF_MASS_OFFSET
} from '../config/constants.js';

export function drawRoadster(ctx, carState, isRedPlayer) {
  const colors = isRedPlayer ? PALETTE.red : PALETTE.blue;
  const { facing, chassis, wheelR, wheelF, head, headSevered } = carState;

  // 1. Seated Charcoal Torso & Scaled Neck Bridge (Behind chassis rim)
  const sinC = Math.sin(chassis.angle);
  const cosC = Math.cos(chassis.angle);
  const collarLocalY = (-4 * CAR_SCALE) - CENTER_OF_MASS_OFFSET;
  const collarX = chassis.position.x - sinC * collarLocalY;
  const collarY = chassis.position.y + cosC * collarLocalY;

  if (!headSevered) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 15 * CAR_SCALE;
    ctx.beginPath();
    ctx.moveTo(collarX, collarY);
    ctx.lineTo(head.position.x, head.position.y);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.charcoal;
    ctx.lineWidth = 9 * CAR_SCALE;
    ctx.beginPath();
    ctx.moveTo(collarX, collarY);
    ctx.lineTo(head.position.x, head.position.y);
    ctx.stroke();

    ctx.translate(chassis.position.x, chassis.position.y);
    ctx.rotate(chassis.angle);
    ctx.translate(0, -CENTER_OF_MASS_OFFSET);
    ctx.scale(CAR_SCALE, CAR_SCALE);
    ctx.fillStyle = PALETTE.charcoal;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3.5 / CAR_SCALE;
    ctx.beginPath();
    ctx.ellipse(0, -4, 13, 10, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 2. Helmet Head (90% scaled radius = 10.35px, crisp ink outline, visor)
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
  ctx.restore();

  // 3. Chassis Roadster Body (81 x 23.4 = 10% smaller), Tailpipe, Stripe, Windshield & Wheel Wells
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
  ctx.lineTo(-50, -3);
  ctx.lineTo(-49, 4);
  ctx.lineTo(-39, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Windshield Post
  ctx.fillStyle = PALETTE.white;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 / CAR_SCALE;
  ctx.beginPath();
  ctx.moveTo(15, -10);
  ctx.lineTo(12, -21);
  ctx.lineTo(17, -21);
  ctx.lineTo(20, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Roadster Silhouette
  ctx.beginPath();
  ctx.moveTo(-38, 12);
  ctx.lineTo(38, 12);
  ctx.quadraticCurveTo(46, 12, 46, 2);
  ctx.quadraticCurveTo(46, -10, 32, -11);
  ctx.lineTo(17, -11);
  ctx.quadraticCurveTo(10, -2, 0, -2);
  ctx.quadraticCurveTo(-10, -2, -16, -12);
  ctx.lineTo(-34, -12);
  ctx.quadraticCurveTo(-45, -11, -45, 2);
  ctx.quadraticCurveTo(-45, 12, -38, 12);
  ctx.closePath();

  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.lip;
  ctx.fillRect(-48, 6, 96, 8);
  ctx.fillStyle = PALETTE.stripeGold;
  ctx.fillRect(-46, -1, 92, 5.5);
  ctx.restore();

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.5 / CAR_SCALE;
  ctx.stroke();

  // Wheel-Well Arches
  for (const wx of [-27, 27]) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(wx, 13, 18, Math.PI, 0);
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
