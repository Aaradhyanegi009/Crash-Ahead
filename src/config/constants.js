export const GAME_META = Object.freeze({
  title: 'Unfair:Crash ahead',
  subtitle: 'FIRST TO 5 BONKS OR WATER SPLASHES'
});

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const FIXED_DT = 1000 / 60;
export const WIN_SCORE = 5;
export const ROUND_COUNTDOWN_MS = 3000;
export const KO_FREEZE_MS = 2000;
export const KO_SLOWMO_SCALE = 0.25;
export const DOUBLE_KO_WINDOW_MS = 100;
export const JUMP_COOLDOWN_MS = 5000;
export const PEER_PREFIX = 'crash-ahead-p2p-';

export const WATER_CREST_Y = WORLD_H - 62;  // 658
export const WATER_HAZARD_Y = WORLD_H - 52; // 668

// Flood mechanic: sea begins rising smoothly 20s into each round
export const WATER_RISE = Object.freeze({
  DELAY_MS: 20000,
  WARN_BEFORE_MS: 3000,
  SPEED_PX_PER_SEC: 11,
  MIN_CREST_Y: 230,
  HAZARD_OFFSET_Y: 10
});

export const PALETTE = Object.freeze({
  skyPeach: '#FAD6BE',
  horizonMauve: '#B58D94',
  sunCream: '#FCE8CC',
  cityBack: '#D3A7A8',
  cityFront: '#B58D94',
  cityWindow: '#E5BCB8',
  rockFill: '#4A4F55',
  rockPill: '#3A3E42',
  ink: '#111111',
  plankFill: '#9E5834',
  waterTop: '#2994FF',
  waterDeep: '#1565C0',
  waterFoam: '#9FD4FF',
  white: '#FFFFFF',
  charcoal: '#232529',
  stripeGold: '#F7B538',
  red: Object.freeze({ body: '#F25C54', lip: '#C93B33', rim: '#F25C54', helmet: '#F25C54' }),
  blue: Object.freeze({ body: '#00B4FF', lip: '#0082B8', rim: '#00B4FF', helmet: '#00B4FF' })
});

// Additional 7% sleek size reduction across chassis, wheels, driver, and CoM offset (0.9 * 0.93 = 0.837)
export const CAR_SCALE = 0.837;

// Grounded Stability, 25% Reduced Max Speed, Progressive Accel, Curved Wall Climb & Backflips
export const BASE_MAX_FORWARD_SPEED = 8.8;
export const BASE_MAX_REVERSE_SPEED = 6.8;
export const SPEED_REDUCTION_FACTOR = 0.75; // Exact 25% speed reduction across forward & reverse
export const FORWARD_TORQUE = 0.0112;
export const REVERSE_TORQUE = 0.0102;
export const MAX_FORWARD_SPEED = Number((BASE_MAX_FORWARD_SPEED * SPEED_REDUCTION_FACTOR).toFixed(4)); // 6.6 px/tick
export const MAX_REVERSE_SPEED = Number((BASE_MAX_REVERSE_SPEED * SPEED_REDUCTION_FACTOR).toFixed(4)); // 5.1 px/tick
export const SLOPE_GRIP_MULTIPLIER = 2.05;
export const CENTER_OF_MASS_OFFSET = Number((8.5 * CAR_SCALE).toFixed(2)); // 7.65px below chassis midpoint
export const SUSPENSION_DAMPING = 0.28;

export const VEHICLE_PHYSICS = Object.freeze({
  BASE_MAX_FORWARD_SPEED,
  BASE_MAX_REVERSE_SPEED,
  SPEED_REDUCTION_FACTOR,
  FORWARD_TORQUE,
  REVERSE_TORQUE,
  MAX_FORWARD_SPEED,
  MAX_REVERSE_SPEED,
  GRAVITY_Y: 1.12,
  JUMP_COOLDOWN_MS,
  JUMP_IMPULSE_VY: 8.0,
  JUMP_MAX_VY: 9.6,
  JUMP_MIN_VY: 6.0,
  JUMP_FWD_BOOST: 1.35,
  MAX_WORLD_SPEED: 10.2,
  SLOPE_GRIP_MULTIPLIER,
  CENTER_OF_MASS_OFFSET,
  SUSPENSION_DAMPING,
  SUSPENSION_STIFFNESS: 0.48,
  AXLE_ARM_STIFFNESS: 0.85,
  AXLE_ARM_DAMPING: 0.30,
  ACCEL_RAMP_MS: 600,
  ACCEL_MIN_GAIN: 0.24,
  ACCEL_RELEASE_DECAY: 2.4,
  COAST_DRAG_COEFF: 0.00055,
  CURVE_ADHESION_FORCE: 0.014,  // Centripetal grip for steep concave walls & curved bowls (tuned for 1.12x gravity)
  BRAKE_DECEL_FORCE: 0.025,
  BRAKE_ZERO_THRESHOLD: 0.28,
  MAX_ANGULAR_VELOCITY: 0.145,
  GROUND_ANGULAR_DAMPING: 0.88,
  AIR_PITCH_TORQUE: 1.86,       // Balanced for composite car+wheel inertia (~21k): snappy controllable 360 rolls
  MAX_AIR_TORQUE: 2.05,
  AIR_MAX_SPIN: 0.118,          // Fun air-rolls off ramps/steeps while clamped against wild spin
  AIR_ANGULAR_DAMPING: 0.935,
  FORWARD_WHEELIE_ANGLE: 0.088, // ~5 deg steady straight-line gas wheelie elevation against suspension
  FORWARD_PITCH_MAX_OFFSET: 0.108,
  REVERSE_PITCH_BIAS: 0.04,
  PITCH_KP: 0.30,
  PITCH_KD: 0.42,
  PITCH_TORQUE_LIMIT: 0.052,
  WHEEL_BASE_FRICTION: 0.96,
  WHEEL_COAST_FRICTION: 0.68,
  WHEEL_MAX_SPIN: 0.555,         // 6.6 / 12.14 = 0.544 rad/tick + grip headroom
  WHEEL_REVERSE_MAX_SPIN: 0.432, // 5.1 / 12.14 = 0.420 rad/tick + grip headroom
  GRAVITY_COMP_SCALE: 0.90
});

export const CAR_SPEC = Object.freeze({
  scale: CAR_SCALE,
  width: 90 * CAR_SCALE,          // 75.33 (-7% from 81)
  height: 23.5 * CAR_SCALE,       // 19.67 (sleek low-profile hitbox)
  density: 0.0064,                // Mass-balanced for 7% smaller + sleeker hull
  restitution: 0.10,
  friction: 0.05,
  wheelOffsetX: 27 * CAR_SCALE,   // 22.60
  wheelOffsetY: 12.6 * CAR_SCALE, // 10.55
  wheelRadius: 14.5 * CAR_SCALE,  // 12.14
  wheelDensity: 0.0109,
  wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
  wheelRestitution: 0.08,
  headRadius: 11.5 * CAR_SCALE,   // 9.63
  headOffsetY: -14.2 * CAR_SCALE, // -11.89
  headDensity: 0.00055,
  headRestitution: 0.15,
  maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN
});
