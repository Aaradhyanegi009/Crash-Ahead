# Crash Ahead!

A mobile-first, 1v1 2D physics car gladiator game built with HTML5 Canvas, Matter.js, PeerJS WebRTC P2P, and procedural Web Audio.

**Play Online:** https://aaradhyanegi009.github.io/Crash-Ahead/

## Modes
- **2 Player (Same Device):** Split multi-touch arcade buttons on mobile, or `A`/`D` (Red) vs `Left`/`Right` Arrow keys (Blue) on desktop.
- **Online 1v1 (Room Code):** Direct WebRTC P2P duel with shareable 4-character room code (`CRSH-XXXX`) or `?room=` invite link.
- **1 Player (vs Bot):** Single-player duel with selectable Split-Thumbs or Side-Pair mobile controls.

## Features
- **9 Deterministic Arenas:** Strictly the 9 core islands, caverns, half-pipes, and seesaw stages loaded in exact sequence (`1–9`) or selectable via map lock, with 100% deterministic obstacle layouts.
- **Grounded Physics & Hill Climbing:** Lowered center of mass, damped spring suspension, slope-aware forward/reverse climbing torque, smooth brake-to-reverse transitions, tilting seesaws, low-seated driver helmet knockoffs (`5` to win), and bottom water hazards.
- **Zero-Build:** Runs directly from a single self-contained `index.html`.
