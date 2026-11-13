import {
  FIXED_DT,
  WIN_SCORE,
  ROUND_COUNTDOWN_MS,
  JUMP_COOLDOWN_MS,
  KO_FREEZE_MS,
  KO_SLOWMO_SCALE,
  DOUBLE_KO_WINDOW_MS,
  VEHICLE_PHYSICS,
  CAR_MODEL_IDS,
  CAR_MODELS,
  PALETTE
} from '../config/constants.js';
import { clamp } from '../utils/math.js';
import { ARENAS } from '../maps/arenas.js';
import { SoundFX, Haptics } from '../audio/soundFX.js';
import { PhysicsSimulation } from '../physics/simulation.js';
import { CanvasRenderer } from '../render/canvasRenderer.js';
import { SmartAI } from '../ai/smartAI.js';
import { InputManager } from '../input/inputManager.js';
import { NetworkManager } from '../network/networkManager.js';
import { UIManager } from '../ui/uiManager.js';

export class CrashAheadGame {
  constructor() {
    this.sound = new SoundFX();
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new CanvasRenderer(this.canvas);
    this.input = new InputManager(this.sound);
    this.ui = new UIManager();
    this.aiDifficulty = 'hard';
    this.ai = new SmartAI(this.aiDifficulty);
    this.sim = new PhysicsSimulation(true);

    this.mode = 'attract'; // 'attract' | 'ai' | 'local' | 'online_host' | 'online_client'
    this.phase = 'MENU';   // 'MENU' | 'COUNTDOWN' | 'FIGHT' | 'KO' | 'MATCH_OVER'
    this.scores = [0, 0];
    this.roundNumber = 1;
    this.bannerText = '';
    this.selectedArenaIdx = -1; // -1 = RANDOM MAPS (ALL 15), 0..14 = locked specific map
    this.selectedCarIdx = -1;   // -1 = RANDOM VEHICLES (ALL 5), 0..4 = locked P1 vehicle
    this.attractMapTicks = 0;

    this.countdownMs = 0;
    this.goBannerMs = 0;
    this._lastCountdownSec = 0;
    this.koPending = false;
    this.koWindowMs = 0;
    this.koTimerMs = 0;
    this.koPendingRound = 0;
    this._pendingAward = 0;

    this.p1Input = { l: false, r: false, jump: false };
    this.p2Input = { l: false, r: false, jump: false };
    if (this.ai) this.ai.resetRoundState((Math.random() * 0x7fffffff) | 0);
    this.localRematchWant = false;
    this.remoteRematchWant = false;
    this._autoStartTimer = null;
    this._netSnapTick = 0;

    this._bindSimCallbacks();
    this._initNetwork();
    this._bindUI();

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 120));

    this._startAttractMode();
    this._checkUrlAutoJoin();
    this._startMainLoop();
  }

  _pickArenaIndex(previousIndex = -1) {
    if (this.selectedArenaIdx >= 0) return clamp(this.selectedArenaIdx, 0, ARENAS.length - 1);
    if (previousIndex >= 0 && previousIndex < ARENAS.length && ARENAS.length > 1) {
      const offset = 1 + Math.floor(Math.random() * (ARENAS.length - 1));
      return (previousIndex + offset) % ARENAS.length;
    }
    return Math.floor(Math.random() * ARENAS.length);
  }

  _pickRandomCarPair() {
    const pick = () => CAR_MODEL_IDS[Math.floor(Math.random() * CAR_MODEL_IDS.length)] || CAR_MODEL_IDS[0];
    if (this.selectedCarIdx >= 0 && this.selectedCarIdx < CAR_MODEL_IDS.length) {
      const p1 = CAR_MODEL_IDS[this.selectedCarIdx];
      const others = CAR_MODEL_IDS.filter((id) => id !== p1);
      const p2 = others[Math.floor(Math.random() * others.length)] || p1;
      return [p1, p2];
    }
    return [pick(), pick()];
  }

  _bindSimCallbacks() {
    const handleRoundKO = (loserIdx, pt, isWater) => {
      if (this.mode === 'attract') {
        if (!this.koPending) {
          this.koPending = true;
          if (!isWater) this.sim.popHelmet(loserIdx, pt);
          else this.sim.ejectWaterRagdoll(loserIdx, pt);
          this.koTimerMs = 900;
        }
        return;
      }
      if (this.phase !== 'FIGHT') return;

      if (!isWater) {
        this.sim.popHelmet(loserIdx, pt);
        this.renderer.spawnBonkPop(pt.x, pt.y, loserIdx === 1 ? PALETTE.red.body : PALETTE.blue.body);
        this.sound.playBonk();
        if (this.mode === 'online_host') {
          this.net.sendEvent('bonk', { x: Math.round(pt.x), y: Math.round(pt.y), p: loserIdx });
        }
      } else {
        this.sim.ejectWaterRagdoll(loserIdx, pt);
        this.renderer.spawnWaterSplash(pt.x, this.sim.waterCrestY);
        this.sound.playSplash();
        if (this.mode === 'online_host') {
          this.net.sendEvent('splash', { x: Math.round(pt.x), y: Math.round(this.sim.waterCrestY), p: loserIdx });
        }
      }

      Haptics.ko();
      // Immediately enter 2s slow-motion on KO hit so impacts aren't hyper-fast
      this.sim.engine.timing.timeScale = KO_SLOWMO_SCALE;

      if (!this.koPending) {
        this.koPending = true;
        this.koWindowMs = DOUBLE_KO_WINDOW_MS;
        this._pendingAward = loserIdx === 1 ? 2 : 1;
      } else if (this._pendingAward !== 0 && this._pendingAward !== (loserIdx === 1 ? 2 : 1)) {
        this._pendingAward = 0;
      }
    };

    this.sim.onHeadKO = (loserIdx, pt) => handleRoundKO(loserIdx, pt, false);
    this.sim.onWaterKO = (loserIdx, pt) => handleRoundKO(loserIdx, pt, true);
    this.sim.onCarBump = (_pt, norm) => {
      if (this.mode === 'attract') return;
      this.sound.playBump(norm);
      if (norm > 0.4) Haptics.bump();
      if (this.mode === 'online_host') this.net.sendEvent('bump', { n: Math.round(norm * 100) / 100 });
    };
    this.sim.onJump = (idx, pt) => {
      if (this.mode === 'online_client' && idx !== 2) return;
      this.renderer.spawnJumpBurst(pt);
      if (this.mode !== 'attract') this.sound.playJump();
      if (this.mode === 'online_host') {
        this.net.sendEvent('jump', {
          p: idx,
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          jx: Math.round((pt.jx ?? 0) * 100) / 100,
          jy: Math.round((pt.jy ?? -1) * 100) / 100,
          wrx: Math.round(pt.wrx ?? pt.x),
          wry: Math.round(pt.wry ?? pt.y),
          wfx: Math.round(pt.wfx ?? pt.x),
          wfy: Math.round(pt.wfy ?? pt.y)
        });
      }
    };
    this.sim.onRagdollSplash = (x, crestY) => {
      this.renderer.spawnWaterSplash(x, crestY);
      if (this.mode !== 'attract') this.sound.playSplash();
    };
  }

  _initNetwork() {
    const applySnapshotMeta = (snap) => {
      if (this.mode !== 'online_client') return;
      const snapM1 = typeof snap.m1 === 'number' ? (CAR_MODEL_IDS[snap.m1] || 'roadster') : this.sim.p1Model;
      const snapM2 = typeof snap.m2 === 'number' ? (CAR_MODEL_IDS[snap.m2] || 'roadster') : this.sim.p2Model;
      if (
        snap.rn !== this.roundNumber ||
        snap.ai !== this.sim.arenaIndex ||
        snapM1 !== this.sim.p1Model ||
        snapM2 !== this.sim.p2Model
      ) {
        this.roundNumber = snap.rn;
        this.koPendingRound = 0;
        this._countdownElapsedMs = 0;
        this.net.pendingInputs = [];
        this.sim.resetArena(snap.ai || 0, snapM1, snapM2);
        this.renderer.clearEffects();
      }
      if (snap.sc[0] !== this.scores[0] || snap.sc[1] !== this.scores[1]) {
        this.scores = [snap.sc[0], snap.sc[1]];
        this.ui.updateScores(this.scores);
      }
      const prevPhase = this.phase;
      const staleFight = this.koPendingRound === snap.rn && (snap.ph === 'FIGHT' || snap.ph === 'COUNTDOWN');
      if (!staleFight) this.phase = snap.ph;
      if (prevPhase !== 'COUNTDOWN' && this.phase === 'COUNTDOWN') {
        this._countdownElapsedMs = 0;
      }
      if (prevPhase === 'COUNTDOWN' && this.phase === 'FIGHT') {
        this.sim.releaseHoverCountdown();
      }
      if (this.phase === 'COUNTDOWN') {
        this.sim.stepHoverCountdown(this._countdownElapsedMs || 0);
      }
      if (snap.ph === 'KO') this.koPendingRound = snap.rn;
      const nextBanner = snap.bt || '';
      if (nextBanner !== this.bannerText && (nextBanner === '3' || nextBanner === '2' || nextBanner === '1' || nextBanner === 'GO!')) {
        this.sound.playCountdown(nextBanner === 'GO!');
      }
      this.bannerText = nextBanner;
      this.sim.engine.timing.timeScale = (this.phase === 'KO' || snap.d1 || snap.d2) ? KO_SLOWMO_SCALE : 1.0;
      if (this.sim.p1Car) this.sim.p1Car.dead = !!snap.d1;
      if (this.sim.p2Car) this.sim.p2Car.dead = !!snap.d2;
    };
    this._applySnapshotMeta = applySnapshotMeta;

    this.net = new NetworkManager({
      onRoomCode: (code) => this.ui.setRoomCode(code),
      onStatus: (text, cls, showRetry = false) => this.ui.setOnlineStatus(text, cls, showRetry),
      onLocalRoomDiscovered: (code) => this.ui.suggestLocalRoom(code),
      onConnected: (role) => {
        this.ui.setOnlineConnected(role);
        if (role === 'host') {
          if (this._autoStartTimer) clearTimeout(this._autoStartTimer);
          this._autoStartTimer = setTimeout(() => {
            this._autoStartTimer = null;
            this._triggerHostOnlineStart();
          }, 400);
        }
      },
      onStartRequested: () => this._triggerHostOnlineStart(),
      onPing: (ms) => this.ui.setPing(ms),
      onMatchStart: (arenaIdx, m1, m2) => {
        if (this.mode !== 'online_client') {
          this.startMatch('online_client', arenaIdx, [m1 || 'roadster', m2 || 'roadster']);
        }
      },
      onSnapshotPacket: (snap) => {
        if (this.net.role === 'client' && this.mode !== 'online_client') {
          const m1 = typeof snap.m1 === 'number' ? (CAR_MODEL_IDS[snap.m1] || 'roadster') : 'roadster';
          const m2 = typeof snap.m2 === 'number' ? (CAR_MODEL_IDS[snap.m2] || 'roadster') : 'roadster';
          this.startMatch('online_client', snap.ai || 0, [m1, m2]);
        }
      },
      onSnapshotState: applySnapshotMeta,
      onGameEvent: (msg) => {
        if (msg.kind === 'bump') {
          this.sound.playBump(msg.n || 0.5);
          if (msg.n > 0.4) Haptics.bump();
        } else if (msg.kind === 'bonk') {
          this.koPendingRound = this.roundNumber;
          this.phase = 'KO';
          this.bannerText = 'BONK!';
          this.sim.engine.timing.timeScale = KO_SLOWMO_SCALE;
          if (msg.p) this.sim.popHelmet(msg.p, { x: msg.x, y: msg.y });
          this.renderer.spawnBonkPop(msg.x, msg.y, msg.p === 1 ? PALETTE.red.body : PALETTE.blue.body);
          this.sound.playBonk();
          Haptics.ko();
        } else if (msg.kind === 'splash') {
          this.koPendingRound = this.roundNumber;
          this.phase = 'KO';
          this.bannerText = 'SPLASH!';
          this.sim.engine.timing.timeScale = KO_SLOWMO_SCALE;
          if (msg.p) this.sim.ejectWaterRagdoll(msg.p, { x: msg.x, y: msg.y });
          this.renderer.spawnWaterSplash(msg.x, msg.y || this.sim.waterCrestY);
          this.sound.playSplash();
          Haptics.ko();
        } else if (msg.kind === 'jump') {
          if (msg.p === 1) {
            if (this.sim.p1Car) this.sim.p1Car.jumpSquashAtMs = this.sim.roundElapsedMs;
            this.renderer.spawnJumpBurst(msg);
            this.sound.playJump();
          }
        } else if (msg.kind === 'match_over') {
          this.scores = msg.scores;
          this.ui.updateScores(this.scores);
          this._showVictory();
        } else if (msg.kind === 'rematch_start') {
          const m1 = typeof msg.m1 === 'number' ? (CAR_MODEL_IDS[msg.m1] || 'roadster') : 'roadster';
          const m2 = typeof msg.m2 === 'number' ? (CAR_MODEL_IDS[msg.m2] || 'roadster') : 'roadster';
          this.startMatch('online_client', msg.ai || 0, [m1, m2]);
        }
      },
      onRematchSignal: () => {
        this.remoteRematchWant = true;
        if (this.mode === 'online_host') {
          if (this.localRematchWant) this._triggerOnlineRematch();
          else this.ui.setVictoryNote('Opponent wants a rematch!');
        } else {
          this.ui.setVictoryNote('Host wants a rematch!');
        }
      },
      onDisconnected: (reason) => {
        if (this._autoStartTimer) { clearTimeout(this._autoStartTimer); this._autoStartTimer = null; }
        this.mode = 'attract';
        this.phase = 'MENU';
        this.input.setMode('menu');
        this.sound.updateEngine(false, 0, 0);
        this.ui.setOnlineDisconnected(reason);
      }
    });
  }

  _triggerHostOnlineStart() {
    if (this.net.role !== 'host' || !this.net.isConnected()) return;
    if (this.mode === 'online_host' && this.phase !== 'MENU') return;
    if (this._autoStartTimer) { clearTimeout(this._autoStartTimer); this._autoStartTimer = null; }
    const arenaIdx = this._pickArenaIndex(-1);
    const models = this._pickRandomCarPair();
    this.net.sendMatchStart(arenaIdx, models[0], models[1]);
    this.startMatch('online_host', arenaIdx, models);
  }

  _bindUI() {
    this.ui.updateSoundIcon(this.sound.muted);
    this.ui.updateMapPicker(this.selectedArenaIdx);
    this.ui.updateCarPicker(this.selectedCarIdx, CAR_MODEL_IDS, CAR_MODELS);
    this.ui.updateCtrlLayoutLabel(this.input.singleLayout);
    this.ui.updateBotDifficulty(this.aiDifficulty);

    this.ui.bindHandlers({
      onForceLandscape: () => {
        document.body.classList.add('force-landscape');
        setTimeout(() => this.renderer.resize(), 60);
      },
      onToggleMute: () => {
        this.sound.unlock();
        this.sound.setMuted(!this.sound.muted);
        this.ui.updateSoundIcon(this.sound.muted);
        this.sound.playClick();
      },
      onToggleFullscreen: () => {
        this.sound.unlock();
        this.sound.playClick();
        const docEl = document.documentElement;
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
          const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
          if (req) Promise.resolve(req.call(docEl)).catch(() => {});
        } else {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) Promise.resolve(exit.call(document)).catch(() => {});
        }
      },
      onStepMap: (delta) => {
        this.sound.unlock();
        this.sound.playClick();
        const total = ARENAS.length + 1;
        const cur = this.selectedArenaIdx + 1;
        const next = ((cur + delta) % total + total) % total;
        this.selectedArenaIdx = next - 1;
        this.ui.updateMapPicker(this.selectedArenaIdx);
        if (this.mode === 'attract') {
          const previewIdx = this.selectedArenaIdx >= 0 ? this.selectedArenaIdx : this._pickArenaIndex(-1);
          const [m1, m2] = this._pickRandomCarPair();
          this.sim.resetArena(previewIdx, m1, m2);
          this.renderer.clearEffects();
        }
      },
      onStepCar: (delta) => {
        this.sound.unlock();
        this.sound.playClick();
        const total = CAR_MODEL_IDS.length + 1;
        const cur = this.selectedCarIdx + 1;
        const next = ((cur + delta) % total + total) % total;
        this.selectedCarIdx = next - 1;
        this.ui.updateCarPicker(this.selectedCarIdx, CAR_MODEL_IDS, CAR_MODELS);
        if (this.mode === 'attract') {
          const previewIdx = this.selectedArenaIdx >= 0
            ? this.selectedArenaIdx
            : (this.sim ? this.sim.arenaIndex : this._pickArenaIndex(-1));
          const [m1, m2] = this._pickRandomCarPair();
          this.sim.resetArena(previewIdx, m1, m2);
          this.renderer.clearEffects();
        }
      },
      onToggleCtrlLayout: () => {
        this.sound.unlock();
        this.sound.playClick();
        this.input.setSingleLayout(this.input.singleLayout === 'split' ? 'grouped' : 'split');
        this.ui.updateCtrlLayoutLabel(this.input.singleLayout);
      },
      onStartMode: (mode) => {
        this.sound.unlock();
        this.sound.playClick();
        this.startMatch(mode);
      },
      onSelectBotDifficulty: (diff) => {
        this.sound.unlock();
        this.sound.playClick();
        this.setBotDifficulty(diff);
      },
      onOpenOnline: () => {
        this.sound.unlock();
        this.sound.playClick();
        this._openOnlineModal('host');
      },
      onOnlineBack: () => {
        this.sound.playClick();
        if (this._autoStartTimer) { clearTimeout(this._autoStartTimer); this._autoStartTimer = null; }
        this.net.destroy();
        this.ui.showHomeMenu();
      },
      onSwitchOnlineTab: (tab) => {
        this.sound.playClick();
        this._switchOnlineTab(tab);
      },
      onCopyCode: (text, btn, original) => {
        this.sound.playClick();
        this.ui.copyWithFeedback(text, btn, original);
      },
      onJoinConnect: (val) => {
        this.sound.unlock();
        this.sound.playClick();
        this.net.joinRoom(val);
      },
      onOnlineStart: () => {
        this.sound.unlock();
        this.sound.playClick();
        if (this.net.role === 'host') {
          this._triggerHostOnlineStart();
        } else if (this.net.role === 'client') {
          this.net.sendRequestStart();
        }
      },
      onOnlineRetry: (joinVal) => {
        this.sound.unlock();
        this.sound.playClick();
        if (this.net.role === 'client') {
          this.net.joinRoom(joinVal || this.net.roomCode);
        } else {
          this.net.hostRoom();
        }
      },
      onExit: () => {
        this.sound.playClick();
        if (this._autoStartTimer) { clearTimeout(this._autoStartTimer); this._autoStartTimer = null; }
        this.net.destroy();
        this._startAttractMode();
      },
      onRematch: () => {
        this.sound.unlock();
        this.sound.playClick();
        if (this.mode === 'online_host' || this.mode === 'online_client') {
          this.localRematchWant = true;
          this.net.sendRematch();
          this.ui.setRematchWaiting();
          if (this.mode === 'online_host' && this.remoteRematchWant) this._triggerOnlineRematch();
        } else {
          this.startMatch(this.mode);
        }
      },
      onVictoryMenu: () => {
        this.sound.playClick();
        this.net.destroy();
        this._startAttractMode();
      }
    });

    const syncFs = () => {
      this.ui.updateFullscreenState(document.fullscreenElement || document.webkitFullscreenElement);
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    syncFs();
  }

  _openOnlineModal(tab) {
    this.ui.showOnlineModal();
    this._switchOnlineTab(tab);
  }

  _switchOnlineTab(tab) {
    this.ui.setOnlineTabUI(tab);
    if (tab === 'host') {
      this.net.hostRoom();
    } else {
      this.net.destroy();
    }
  }

  _checkUrlAutoJoin() {
    const room = new URLSearchParams(window.location.search).get('room');
    if (!room) return;
    this._openOnlineModal('join');
    this.ui.setJoinCodeValue(room.toUpperCase());
    setTimeout(() => this.net.joinRoom(room), 300);
  }

  _startAttractMode() {
    this.mode = 'attract';
    this.phase = 'MENU';
    this.scores = [0, 0];
    this.bannerText = '';
    this.koPending = false;
    this.input.setMode('menu');
    this.sound.updateEngine(false, 0, 0);
    this.ui.showHomeMenu();

    this.sim.isHostSide = true;
    this.sim.engine.timing.timeScale = 1.0;
    const previewIdx = this._pickArenaIndex(-1);
    const [p1Model, p2Model] = this._pickRandomCarPair();
    this.sim.resetArena(previewIdx, p1Model, p2Model);
    this.renderer.clearEffects();
  }

  startMatch(mode, explicitArenaIdx = null, explicitModels = null) {
    this.mode = mode;
    this.scores = [0, 0];
    this.roundNumber = 1;
    this.koPendingRound = 0;
    this.localRematchWant = false;
    this.remoteRematchWant = false;

    this.ui.showGameplayHUD(mode === 'online_host' || mode === 'online_client');
    this.sim.isHostSide = mode !== 'online_client';
    this.input.setMode(mode);
    this.ui.updateScores(this.scores);

    const startIdx = explicitArenaIdx !== null
      ? explicitArenaIdx
      : this._pickArenaIndex(this.sim ? this.sim.arenaIndex : -1);
    this._resetRound(startIdx, explicitModels);
  }

  _triggerOnlineRematch() {
    const arenaIdx = this._pickArenaIndex(this.sim.arenaIndex);
    const models = this._pickRandomCarPair();
    this.net.sendRematchStart(arenaIdx, models[0], models[1]);
    this.startMatch('online_host', arenaIdx, models);
  }

  setBotDifficulty(diff) {
    this.ai.setDifficulty(diff);
    this.aiDifficulty = this.ai.difficulty;
    this.ui.updateBotDifficulty(this.aiDifficulty);
    this._applyDifficultySpeeds();
  }

  _isPlayerJumpEnabled() {
    if (this.mode !== 'ai') return true;
    const prof = this.ai.getProfile();
    return !prof || prof.playerCanJump !== false;
  }

  _applyDifficultySpeeds() {
    const prof = this.mode === 'ai' ? this.ai.getProfile() : null;
    const playerCanJump = this._isPlayerJumpEnabled();
    if (this.sim.p1Car) {
      this.sim.p1Car.speedScale = 1.0;
      this.sim.p1Car.accelScale = 1.0;
      this.sim.p1Car.jumpCooldownMs = JUMP_COOLDOWN_MS;
      this.sim.p1Car.jumpDisabled = !playerCanJump;
    }
    if (this.sim.p2Car) {
      this.sim.p2Car.speedScale = prof ? prof.speedScale : 1.0;
      this.sim.p2Car.accelScale = prof ? prof.accelScale : 1.0;
      this.sim.p2Car.jumpCooldownMs = (prof && prof.jumpCooldownMs) ? prof.jumpCooldownMs : JUMP_COOLDOWN_MS;
      this.sim.p2Car.jumpDisabled = false;
    }
  }

  _resetRound(explicitArenaIdx = null, explicitModels = null) {
    this.phase = 'COUNTDOWN';
    this.countdownMs = ROUND_COUNTDOWN_MS;
    this._countdownElapsedMs = 0;
    this.goBannerMs = 0;
    this._lastCountdownSec = 3;
    this.bannerText = '3';
    this.koPending = false;
    this.koWindowMs = 0;
    this.koTimerMs = 0;
    this._pendingAward = 0;
    this.p1Input = { l: false, r: false, jump: false };
    this.p2Input = { l: false, r: false, jump: false };
    if (this.ai) this.ai.resetRoundState((Math.random() * 0x7fffffff) | 0);
    if (this.mode === 'online_host' || this.mode === 'online_client') {
      this.net.resetRoundInput();
    }

    const nextIdx = explicitArenaIdx !== null ? explicitArenaIdx : this._pickArenaIndex(this.sim.arenaIndex);
    const [p1Model, p2Model] = explicitModels || this._pickRandomCarPair();
    this.sim.resetArena(nextIdx, p1Model, p2Model);
    this.sim.stepHoverCountdown(0);
    this.sim.engine.timing.timeScale = 1.0;
    this._applyDifficultySpeeds();
    this.renderer.clearEffects();
    if (this.mode !== 'attract') this.sound.playCountdown(false);
  }

  _showVictory() {
    this.phase = 'MATCH_OVER';
    this.sound.updateEngine(false, 0, 0);
    this.sound.playVictory();
    this.input.setMode('menu');
    this.ui.showVictory(this.scores);
  }

  _stepAttractTick() {
    if (this.koPending) {
      this.sim.step({ l: false, r: false }, { l: false, r: false }, false, false);
      this.koTimerMs -= FIXED_DT;
      if (this.koTimerMs <= 0) {
        this.koPending = false;
        const nextIdx = this._pickArenaIndex(this.sim.arenaIndex);
        const [m1, m2] = this._pickRandomCarPair();
        this.sim.resetArena(nextIdx, m1, m2);
        this.renderer.clearEffects();
      }
    } else {
      this.attractMapTicks++;
      if (this.attractMapTicks > 540 && this.selectedArenaIdx < 0) {
        this.attractMapTicks = 0;
        const [m1, m2] = this._pickRandomCarPair();
        this.sim.resetArena(this._pickArenaIndex(this.sim.arenaIndex), m1, m2);
        this.renderer.clearEffects();
      }
      this.sim.step(this.ai.decide(this.sim, true), this.ai.decide(this.sim, false), true, false);
    }
  }

  _stepAuthoritativeTick() {
    if (this.phase === 'MATCH_OVER') return;

    if (this.koPending && this.koWindowMs > 0) {
      this.koWindowMs -= FIXED_DT;
      if (this.koWindowMs <= 0) {
        this.phase = 'KO';
        this.koTimerMs = KO_FREEZE_MS;
        this.sim.engine.timing.timeScale = KO_SLOWMO_SCALE;
        this.bannerText = this._pendingAward === 0 ? 'DRAW!' : 'BONK!';
        if (this.mode === 'online_host') this.net.resetRoundInput();
      }
    }

    if (this.phase === 'COUNTDOWN') {
      const empty = { l: false, r: false, jump: false };
      this.p1Input = empty;
      this.p2Input = empty;
      this.countdownMs -= FIXED_DT;
      if (this.countdownMs <= 0) {
        this.sim.releaseHoverCountdown();
        this.phase = 'FIGHT';
        this.bannerText = 'GO!';
        this.goBannerMs = 600;
        this.sound.playCountdown(true);
      } else {
        this._countdownElapsedMs = (this._countdownElapsedMs || 0) + FIXED_DT;
        this.sim.stepHoverCountdown(this._countdownElapsedMs);
        const sec = clamp(Math.ceil(this.countdownMs / 1000), 1, 3);
        if (sec !== this._lastCountdownSec) {
          this._lastCountdownSec = sec;
          this.bannerText = String(sec);
          this.sound.playCountdown(false);
        }
      }
    } else if (this.phase === 'KO') {
      this.p1Input = { l: false, r: false };
      this.p2Input = { l: false, r: false };
      this.sim.step({ l: false, r: false }, { l: false, r: false }, false, false);
      this.koTimerMs -= FIXED_DT;
      if (this.koTimerMs <= 0) {
        this.sim.engine.timing.timeScale = 1.0;
        if (this._pendingAward === 1) this.scores[0]++;
        else if (this._pendingAward === 2) this.scores[1]++;
        this.ui.updateScores(this.scores);

        if (this.scores[0] >= WIN_SCORE || this.scores[1] >= WIN_SCORE) {
          if (this.mode === 'online_host') this.net.sendEvent('match_over', { scores: this.scores });
          this._showVictory();
          return;
        }
        this.roundNumber++;
        this._resetRound();
      }
    } else {
      if (this.goBannerMs > 0) {
        this.goBannerMs -= FIXED_DT;
        if (this.goBannerMs <= 0 && !this.koPending) this.bannerText = '';
      }
      this.p1Input = this.input.getP1();
      if (!this._isPlayerJumpEnabled()) {
        this.p1Input = { ...this.p1Input, jump: false };
      }
      if (this.mode === 'ai') this.p2Input = this.ai.decide(this.sim, false);
      else if (this.mode === 'local') this.p2Input = this.input.getP2();
      else if (this.mode === 'online_host') {
        this.net.tickHostWatchdog();
        this.p2Input = this.net.remoteInput;
      }

      this.sim.step(this.p1Input, this.p2Input, true, true);
    }

    if (this.mode === 'online_host') {
      this._netSnapTick = (this._netSnapTick + 1) & 1;
      if (this._netSnapTick === 0 || this.phase !== 'FIGHT') {
        this.net.sendHostSnapshot(this.sim, {
          scores: this.scores,
          roundNumber: this.roundNumber,
          phase: this.phase,
          bannerText: this.bannerText,
          p1Input: this.p1Input
        });
      }
    }
  }

  _stepClientPredictedTick() {
    if (this.phase === 'MATCH_OVER') return;
    if (this.phase !== 'FIGHT') {
      this.p2Input = { l: false, r: false, holdMs: 0 };
      this.net.flushClientRelease();
      if (this.phase === 'COUNTDOWN') {
        this._countdownElapsedMs = (this._countdownElapsedMs || 0) + FIXED_DT;
        this.sim.stepHoverCountdown(this._countdownElapsedMs);
      } else {
        this.sim.step({ l: false, r: false, holdMs: 0 }, { l: false, r: false, holdMs: 0 }, false, false);
      }
      return;
    }
    const rawP2 = this.input.getP2();
    this.p2Input = rawP2;
    const cmd = this.net.queueClientInput(rawP2);
    this.net.hostInputPredictTicks = (this.net.hostInputPredictTicks || 0) + 1;
    const hostP1 = this.net.hostInputPredictTicks <= 6
      ? this.net.lastHostP1Input
      : { l: false, r: false, holdMs: 0 };
    this.sim.step(hostP1, cmd, true, false);
  }

  _updateAudio() {
    if (this.mode === 'attract' || this.phase !== 'FIGHT') {
      this.sound.updateEngine(false, 0, 0);
      return;
    }
    const t1 = (this.p1Input.l || this.p1Input.r) ? 1 : 0;
    const t2 = (this.p2Input.l || this.p2Input.r) ? 1 : 0;
    const throttle = this.mode === 'online_client'
      ? ((this.input.state.p1_l || this.input.state.p1_r || this.input.state.p2_l || this.input.state.p2_r) ? 1 : 0)
      : Math.max(t1, t2 * 0.65);
    let spd = 0;
    if (this.sim.p1Car) spd = Math.max(spd, Math.abs(this.sim.p1Car.wheelF.angularVelocity));
    if (this.sim.p2Car) spd = Math.max(spd, Math.abs(this.sim.p2Car.wheelF.angularVelocity));
    this.sound.updateEngine(true, throttle, clamp(spd / VEHICLE_PHYSICS.WHEEL_MAX_SPIN, 0, 1));
  }

  _startMainLoop() {
    let lastSimTime = performance.now();
    let acc = 0;

    const advanceSimulation = (now) => {
      const elapsed = Math.min(100, Math.max(0, now - lastSimTime));
      lastSimTime = now;

      if (this.mode === 'online_client') {
        this.net.reconcileClientFrame(this.sim, this._applySnapshotMeta);
        acc += elapsed;
        while (acc >= FIXED_DT) {
          this._stepClientPredictedTick();
          acc -= FIXED_DT;
        }
      } else {
        acc += elapsed;
        while (acc >= FIXED_DT) {
          if (this.mode === 'attract') this._stepAttractTick();
          else this._stepAuthoritativeTick();
          acc -= FIXED_DT;
        }
      }

      this.ui.updateWaterAlert(
        this.mode !== 'attract' && this.phase === 'FIGHT',
        this.sim.roundElapsedMs,
        this.sim.waterRising
      );
      this.ui.updateJumpPads(
        this.sim.getJumpCooldownRemaining(1),
        this.sim.getJumpCooldownRemaining(2),
        this.mode !== 'attract' && this.phase === 'FIGHT',
        this._isPlayerJumpEnabled()
      );
      return {
        elapsed,
        alpha: this.phase === 'MATCH_OVER' ? 1 : clamp(acc / FIXED_DT, 0, 1)
      };
    };

    const bgTick = () => {
      const now = performance.now();
      const isOnline = this.mode === 'online_host' || this.mode === 'online_client';
      if (isOnline && (document.hidden || (now - lastSimTime) >= FIXED_DT * 1.5)) {
        advanceSimulation(now);
      }
    };

    try {
      const workerBlob = new Blob(
        ['setInterval(() => postMessage(0), 16);'],
        { type: 'application/javascript' }
      );
      const workerUrl = URL.createObjectURL(workerBlob);
      this._bgWorker = new Worker(workerUrl);
      this._bgWorker.onmessage = bgTick;
      URL.revokeObjectURL(workerUrl);
    } catch (_) {
      this._bgTimer = setInterval(bgTick, 16);
    }

    const loop = (now) => {
      const { elapsed, alpha } = advanceSimulation(now);
      this.renderer.updateEffects(elapsed / FIXED_DT, this.sim);
      this._updateAudio();
      const restorePose = this.sim.applyRenderInterpolation(alpha);
      try {
        this.renderer.render(this.sim, this.bannerText);
      } finally {
        restorePose();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
