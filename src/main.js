import { CAR_SPEC, VEHICLE_PHYSICS, WATER_RISE } from './config/constants.js';
import { ARENAS } from './maps/arenas.js';
import { CrashAheadGame } from './game/gameCoordinator.js';

window.addEventListener('DOMContentLoaded', () => {
  if (typeof window.Matter === 'undefined') {
    document.body.innerHTML =
      '<div style="padding:32px;text-align:center;"><h2>Matter.js Failed to Load</h2><p>Check your connection and refresh.</p></div>';
    return;
  }
  window.__crashAheadGame = new CrashAheadGame();
  window.__crashAheadArenas = ARENAS;
  window.__crashAheadPhysics = VEHICLE_PHYSICS;
  window.__crashAheadCarSpec = CAR_SPEC;
  window.__crashAheadWater = WATER_RISE;
});
