# Unfair:Crash ahead

A zero-build, mobile-first 1v1 2D physics car gladiator game built with HTML5 Canvas, Matter.js, PeerJS WebRTC P2P (with client-side prediction & rigid-body server reconciliation), and procedural Web Audio.

**Play Online:** https://aaradhyanegi009.github.io/Crash-Ahead/

## Modes
- **2 Player (Same Device):** Multi-touch pointer controls on mobile, or `A`/`D` (`S`/`W`) vs Arrow keys on desktop.
- **Online 1v1 (Room Code):** Direct WebRTC P2P duel with shareable room code (`CRSH-XXXX`) or `?room=` invite link.
- **1 Player (vs Bot):** Gap-aware and ramp-aware bot opponent with Split-Thumbs or Side-Pair mobile touch layout.

## Gameplay & Mechanics
- **9 Deterministic Arenas with Curved Flip Walls:** All 9 maps feature curved climbing walls, quarter-pipe kickers, arches, or 360° loops for aerial launches and backflips, plus tuned crossable ocean jumps and seesaw bridges.
- **10% More Compact Roadsters & Grounded Physics:** Scaled roadster bodies with lowered Center of Mass, progressive input-duration acceleration curves, strict speed thresholds, and clamped mid-air pitch rotation.
- **Rising Sea Sudden Death (20s):** After 20 seconds into any active round, the ocean tide steadily rises to flush out stalemates and force elevated wall/seesaw combat.

## Modular Architecture
```text
crash-ahead/
├── index.html                  # Home page, HUD, touch pads, modals, module entry
├── styles/
│   ├── base.css                # Theme variables, 16:9 responsive stage, rotate overlay
│   ├── hud.css                 # Score/ping pills, water alert badge, touch buttons
│   └── modals.css              # Menu, map selector, online lobby, victory cards
└── src/
    ├── main.js                 # App bootstrap & debug exports
    ├── config/constants.js     # Tunable car specs, physics, palette & rising water config
    ├── utils/math.js           # Interpolation & spline geometry helpers
    ├── maps/arenas.js          # 9 deterministic arena definitions
    ├── physics/
    │   ├── vehicleController.js # CoM, speed ramp, curve adhesion, mid-air pitch control
    │   └── simulation.js       # Matter.js world, colliders, seesaws, tide rise, KO rules
    ├── ai/smartAI.js           # Gap-jumping & wall-climbing AI opponent
    ├── render/
    │   ├── roadsterRenderer.js # Flat-vector cartoon roadsters & driver helmets
    │   └── canvasRenderer.js   # Skyline, rocks, rising water waves & effects
    ├── audio/soundFX.js        # Procedural Web Audio synth & haptics
    ├── input/inputManager.js   # Unified keyboard + Android PointerEvent input layer
    ├── network/networkManager.js # PeerJS P2P, OpenRelay TURN fallback, CSP/reconciliation
    ├── ui/uiManager.js         # Home screen, modals, HUD & tide alert state
    └── game/gameCoordinator.js # Fixed-timestep match coordinator
```
