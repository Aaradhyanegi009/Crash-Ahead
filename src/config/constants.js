export const GAME_META = Object.freeze({
  title: 'Unfair:Crash ahead',
  subtitle: 'FIRST TO 5 BONKS OR WATER SPLASHES'
});

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const FIXED_DT = 1000 / 60;
export const WIN_SCORE = 5;
export const KO_FREEZE_MS = 650;
export const DOUBLE_KO_WINDOW_MS = 100;
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

// 10% smaller vehicles across chassis, wheels, driver, and CoM offset
export const CAR_SCALE = 0.9;

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
  MAX_WORLD_SPEED: 9.5,
  SLOPE_GRIP_MULTIPLIER,
  CENTER_OF_MASS_OFFSET,
  SUSPENSION_DAMPING,
  SUSPENSION_STIFFNESS: 0.48,
  AXLE_ARM_STIFFNESS: 0.85,
  AXLE_ARM_DAMPING: 0.30,
  ACCEL_RAMP_MS: 600,
  ACCEL_MIN_GAIN: 0.24,
  ACCEL_RELEASE_DECAY: 2.4,
  COAST_DRAG_COEFF: 0.0022,
  CURVE_ADHESION_FORCE: 0.0105, // Centripetal grip for vertical wall climbs & loop launches
  BRAKE_DECEL_FORCE: 0.025,
  BRAKE_ZERO_THRESHOLD: 0.28,
  MAX_ANGULAR_VELOCITY: 0.135,
  GROUND_ANGULAR_DAMPING: 0.86,
  AIR_PITCH_TORQUE: 1.72,       // Balanced for composite car+wheel inertia (~21k): smooth controllable 360 backflips
  MAX_AIR_TORQUE: 1.95,
  AIR_MAX_SPIN: 0.105,          // Allows full 360 backflip off ramps while clamped against wild spin
  AIR_ANGULAR_DAMPING: 0.90,
  FORWARD_PITCH_MAX_OFFSET: 0.10,
  REVERSE_PITCH_BIAS: 0.04,
  PITCH_KP: 0.014,
  PITCH_KD: 0.18,
  PITCH_TORQUE_LIMIT: 0.020,
  WHEEL_BASE_FRICTION: 0.96,
  WHEEL_MAX_SPIN: 0.515,         // 6.6 / 13.05 = 0.506 rad/tick + grip headroom
  WHEEL_REVERSE_MAX_SPIN: 0.400, // 5.1 / 13.05 = 0.391 rad/tick + grip headroom
  GRAVITY_COMP_SCALE: 0.82
});

export const CAR_SPEC = Object.freeze({
  scale: CAR_SCALE,
  width: 90 * CAR_SCALE,        // 81
  height: 26 * CAR_SCALE,       // 23.4
  density: 0.005,
  restitution: 0.10,
  friction: 0.35,
  wheelOffsetX: 27 * CAR_SCALE, // 24.3
  wheelOffsetY: 13 * CAR_SCALE, // 11.7
  wheelRadius: 14.5 * CAR_SCALE,// 13.05
  wheelDensity: 0.0094,
  wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
  wheelRestitution: 0.08,
  headRadius: 11.5 * CAR_SCALE, // 10.35
  headOffsetY: -16 * CAR_SCALE, // -14.4
  headDensity: 0.0005,
  headRestitution: 0.15,
  maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN
});
