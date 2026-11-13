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
export const EXTREME_JUMP_COOLDOWN_MS = 2000;
export const DEATH_JUMP_COOLDOWN_MS = 1000;
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

// Additional 9% size reduction across all vehicle models (0.7533 * 0.91 = 0.6855)
export const CAR_SCALE = 0.6855;

// Grounded Stability, 25% Reduced Max Speed, Progressive Accel, Curved Wall Climb & Backflips
export const BASE_MAX_FORWARD_SPEED = 8.8;
export const BASE_MAX_REVERSE_SPEED = 6.8;
export const SPEED_REDUCTION_FACTOR = 0.75; // Exact 25% speed reduction across forward & reverse
export const FORWARD_TORQUE = 0.0112;
export const REVERSE_TORQUE = 0.0102;
export const MAX_FORWARD_SPEED = Number((BASE_MAX_FORWARD_SPEED * SPEED_REDUCTION_FACTOR).toFixed(4)); // 6.6 px/tick
export const MAX_REVERSE_SPEED = Number((BASE_MAX_REVERSE_SPEED * SPEED_REDUCTION_FACTOR).toFixed(4)); // 5.1 px/tick
export const SLOPE_GRIP_MULTIPLIER = 2.05;
export const CENTER_OF_MASS_OFFSET = Number((8.5 * CAR_SCALE).toFixed(2)); // 6.40px below chassis midpoint
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
  JUMP_SPEED: 8.6,
  JUMP_COYOTE_MS: 110,
  JUMP_ROOF_WEIGHT: 0.70,
  JUMP_NORMAL_WEIGHT: 0.30,
  JUMP_DETACH_MS: 160,
  JUMP_SQUASH_MS: 80,
  CEILING_SUCTION_FORCE: 0.0018,
  JUMP_IMPULSE_VY: 8.0,
  JUMP_MAX_VY: 9.6,
  JUMP_MIN_VY: 6.0,
  JUMP_FWD_BOOST: 1.35,
  MAX_WORLD_SPEED: 10.8,
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
  WHEEL_MAX_SPIN: Number(((MAX_FORWARD_SPEED / (14.5 * CAR_SCALE)) * 1.04).toFixed(3)),
  WHEEL_REVERSE_MAX_SPIN: Number(((MAX_REVERSE_SPEED / (14.5 * CAR_SCALE)) * 1.04).toFixed(3)),
  GRAVITY_COMP_SCALE: 0.90
});

export const CAR_MODEL_IDS = Object.freeze(['roadster', 'truck', 'jcb', 'bike', 'tank']);

export const CAR_MODELS = Object.freeze({
  roadster: Object.freeze({
    id: 'roadster',
    name: 'ROADSTER',
    scale: CAR_SCALE,
    width: 90 * CAR_SCALE,          // 67.80 (-10% from 75.33)
    height: 23.5 * CAR_SCALE,       // 17.70
    chamfer: 8.5 * CAR_SCALE,
    density: 0.0064,
    restitution: 0.10,
    friction: 0.05,
    wheelOffsetX: 27 * CAR_SCALE,   // 20.34
    wheelOffsetY: 12.6 * CAR_SCALE, // 9.49
    wheelOffsetYF: 12.6 * CAR_SCALE,
    wheelRadius: 14.5 * CAR_SCALE,  // 10.92
    wheelRadiusR: 14.5 * CAR_SCALE,
    wheelRadiusF: 14.5 * CAR_SCALE,
    wheelDensity: 0.0109,
    wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
    wheelRestitution: 0.08,
    headRadius: 11.5 * CAR_SCALE,   // 8.66
    headOffsetX: 0,
    headOffsetY: -14.2 * CAR_SCALE, // -10.70
    collarX: 0,
    collarY: -4 * CAR_SCALE,
    headDensity: 0.00055,
    headRestitution: 0.15,
    maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN,
    exhaustLocal: Object.freeze({ x: -49 * CAR_SCALE, y: -1 * CAR_SCALE })
  }),
  truck: Object.freeze({
    id: 'truck',
    name: 'SMALL TRUCK',
    scale: CAR_SCALE,
    width: 93 * CAR_SCALE,
    height: 26 * CAR_SCALE,
    chamfer: 6.5 * CAR_SCALE,
    density: 0.0064,
    restitution: 0.10,
    friction: 0.05,
    wheelOffsetX: 28 * CAR_SCALE,
    wheelOffsetY: 13.8 * CAR_SCALE,
    wheelOffsetYF: 13.8 * CAR_SCALE,
    wheelRadius: 15.8 * CAR_SCALE,
    wheelRadiusR: 15.8 * CAR_SCALE,
    wheelRadiusF: 15.8 * CAR_SCALE,
    wheelDensity: 0.0110,
    wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
    wheelRestitution: 0.08,
    headRadius: 11.5 * CAR_SCALE,
    headOffsetX: 5 * CAR_SCALE,
    headOffsetY: -16.4 * CAR_SCALE,
    collarX: 5 * CAR_SCALE,
    collarY: -5.5 * CAR_SCALE,
    headDensity: 0.00055,
    headRestitution: 0.15,
    maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN,
    exhaustLocal: Object.freeze({ x: -15 * CAR_SCALE, y: -32 * CAR_SCALE })
  }),
  jcb: Object.freeze({
    id: 'jcb',
    name: 'SMALL JCB',
    scale: CAR_SCALE,
    width: 88 * CAR_SCALE,
    height: 24.5 * CAR_SCALE,
    chamfer: 8.5 * CAR_SCALE,
    density: 0.0066,
    restitution: 0.10,
    friction: 0.05,
    wheelOffsetX: 25.5 * CAR_SCALE,
    wheelOffsetY: 12.2 * CAR_SCALE,  // R: 12.2 + 16.4 = 28.6 * CAR_SCALE bottom
    wheelOffsetYF: 14.8 * CAR_SCALE, // F: 14.8 + 13.8 = 28.6 * CAR_SCALE bottom (level stance)
    wheelRadius: 16.4 * CAR_SCALE,
    wheelRadiusR: 16.4 * CAR_SCALE,
    wheelRadiusF: 13.8 * CAR_SCALE,
    wheelDensity: 0.0112,
    wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
    wheelRestitution: 0.08,
    headRadius: 11.5 * CAR_SCALE,
    headOffsetX: -3 * CAR_SCALE,
    headOffsetY: -16.8 * CAR_SCALE,
    collarX: -3 * CAR_SCALE,
    collarY: -6 * CAR_SCALE,
    headDensity: 0.00055,
    headRestitution: 0.15,
    maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN,
    exhaustLocal: Object.freeze({ x: 11 * CAR_SCALE, y: -28 * CAR_SCALE })
  }),
  bike: Object.freeze({
    id: 'bike',
    name: 'STUNT BIKE',
    scale: CAR_SCALE,
    width: 68 * CAR_SCALE,
    height: 15.5 * CAR_SCALE,
    chamfer: 7.2 * CAR_SCALE,
    density: 0.0060,
    restitution: 0.12,
    friction: 0.04,
    wheelOffsetX: 21.5 * CAR_SCALE,
    wheelOffsetY: 10.5 * CAR_SCALE,
    wheelRadius: 14.6 * CAR_SCALE,
    wheelDensity: 0.0108,
    wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
    wheelRestitution: 0.10,
    headRadius: 11.5 * CAR_SCALE,
    headOffsetX: -1 * CAR_SCALE,
    headOffsetY: -17.5 * CAR_SCALE,
    collarX: -2 * CAR_SCALE,
    collarY: -6.5 * CAR_SCALE,
    headDensity: 0.0005,
    headRestitution: 0.15,
    maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN,
    exhaustLocal: Object.freeze({ x: -34 * CAR_SCALE, y: 2 * CAR_SCALE })
  }),
  tank: Object.freeze({
    id: 'tank',
    name: 'PANZER TANK',
    scale: CAR_SCALE,
    width: 92 * CAR_SCALE,
    height: 22 * CAR_SCALE,
    chamfer: 6 * CAR_SCALE,
    density: 0.0074,
    restitution: 0.08,
    friction: 0.04,
    wheelOffsetX: 26 * CAR_SCALE,
    wheelOffsetY: 11.5 * CAR_SCALE,
    wheelRadius: 15.2 * CAR_SCALE,
    wheelDensity: 0.0125,
    wheelFriction: VEHICLE_PHYSICS.WHEEL_BASE_FRICTION,
    wheelRestitution: 0.06,
    headRadius: 11.5 * CAR_SCALE,
    headOffsetX: -3 * CAR_SCALE,
    headOffsetY: -22.5 * CAR_SCALE,
    collarX: -3 * CAR_SCALE,
    collarY: -12 * CAR_SCALE,
    headDensity: 0.00055,
    headRestitution: 0.15,
    maxWheelSpin: VEHICLE_PHYSICS.WHEEL_MAX_SPIN,
    exhaustLocal: Object.freeze({ x: -38 * CAR_SCALE, y: -6 * CAR_SCALE })
  })
});

export const CAR_SPEC = CAR_MODELS.roadster;
