import {
  FIXED_DT,
  WIN_SCORE,
  KO_FREEZE_MS,
  DOUBLE_KO_WINDOW_MS,
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
    this.ai = new SmartAI();
    this.sim = new PhysicsSimulation(true);

    this.mode = 'attract'; // 'attract' | 'ai' | 'local' | 'online_host' | 'online_client'
    this.phase = 'MENU';   // 'MENU' | 'FIGHT' | 'KO' | 'MATCH_OVER'
    this.scores = [0, 0];
    this.roundNumber = 1;
    this.bannerText = '';
    this.selectedArenaIdx = -1; // -1 = ALL 9 MAPS IN ORDER, 0..8 = locked specific map
    this.attractMapTicks = 0;

    this.koPending = false;
    this.koWindowMs = 0;
    this.koTimerMs = 0;
    this.koPendingRound = 0;
    this._pendingAward = 0;

    this.p1Input = { l: false, r: false };
    this.p2Input = { l: false, r: false };
    this.localRematchWant = false;
    this.remoteRematchWant = false;

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
    if (previousIndex < 0) return 0;
    return (previousIndex + 1) % ARENAS.length;
  }

  _bindSimCallbacks() {
    const handleRoundKO = (loserIdx, pt, isWater) => {
      if (this.mode === 'attract') {
        if (!this.koPending) {
          this.koPending = true;
          if (!isWater) this.sim.popHelmet(loserIdx, pt);
          else {
            const c = loserIdx === 1 ? this.sim.p1Car : this.sim.p2Car;
            if (c) c.dead = true;
          }
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
        const c = loserIdx === 1 ? this.sim.p1Car : this.sim.p2Car;
        if (c) c.dead = true;
        this.renderer.spawnWaterSplash(pt.x, this.sim.waterCrestY);
        this.sound.playSplash();
        if (this.mode === 'online_host') {
          this.net.sendEvent('splash', { x: Math.round(pt.x), y: Math.round(this.sim.waterCrestY) });
        }
      }

      Haptics.ko();

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
  }

  _initNetwork() {
    const applySnapshotMeta = (snap) => {
      if (this.mode !== 'online_client') return;
      if (snap.rn !== this.roundNumber || snap.ai !== this.sim.arenaIndex) {
        this.roundNumber = snap.rn;
        this.koPendingRound = 0;
        this.net.pendingInputs = [];
        this.sim.resetArena(snap.ai || 0);
        this.renderer.clearEffects();
      }
      if (snap.sc[0] !== this.scores[0] || snap.sc[1] !== this.scores[1]) {
        this.scores = [snap.sc[0], snap.sc[1]];
        this.ui.updateScores(this.scores);
      }
      const staleFight = this.koPendingRound === snap.rn && snap.ph === 'FIGHT';
      if (!staleFight) this.phase = snap.ph;
      if (snap.ph === 'KO') this.koPendingRound = snap.rn;
      this.bannerText = snap.bt || '';
      if (this.sim.p1Car) this.sim.p1Car.dead = !!snap.d1;
      if (this.sim.p2Car) this.sim.p2Car.dead = !!snap.d2;
    };
    this._applySnapshotMeta = applySnapshotMeta;

    this.net = new NetworkManager({
      onRoomCode: (code) => this.ui.setRoomCode(code),
      onStatus: (text, cls, showRetry = false) => this.ui.setOnlineStatus(text, cls, showRetry),
      onConnected: (role) => this.ui.setOnlineConnected(role),
      onPing: (ms) => this.ui.setPing(ms),
      onMatchStart: (arenaIdx) => this.startMatch('online_client', arenaIdx),
      onSnapshotState: applySnapshotMeta,
      onGameEvent: (msg) => {
        if (msg.kind === 'bump') {
          this.sound.playBump(msg.n || 0.5);
          if (msg.n > 0.4) Haptics.bump();
        } else if (msg.kind === 'bonk') {
          this.koPendingRound = this.roundNumber;
          this.phase = 'KO';
          this.bannerText = 'BONK!';
          this.renderer.spawnBonkPop(msg.x, msg.y, msg.p === 1 ? PALETTE.red.body : PALETTE.blue.body);
          this.sound.playBonk();
          Haptics.ko();
        } else if (msg.kind === 'splash') {
          this.koPendingRound = this.roundNumber;
          this.phase = 'KO';
          this.bannerText = 'SPLASH!';
          this.renderer.spawnWaterSplash(msg.x, msg.y || this.sim.waterCrestY);
          this.sound.playSplash();
          Haptics.ko();
        } else if (msg.kind === 'match_over') {
          this.scores = msg.scores;
          this.ui.updateScores(this.scores);
          this._showVictory();
        } else if (msg.kind === 'rematch_start') {
          this.startMatch('online_client', msg.ai || 0);
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
        this.mode = 'attract';
        this.phase = 'MENU';
        this.input.setMode('menu');
        this.sound.updateEngine(false, 0, 0);
        this.ui.setOnlineDisconnected(reason);
      }
    });
  }

  _bindUI() {
    this.ui.updateSoundIcon(this.sound.muted);
    this.ui.updateMapPicker(this.selectedArenaIdx);
    this.ui.updateCtrlLayoutLabel(this.input.singleLayout);

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
        if (!document.fullscreenElement) {
          if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
        } else if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
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
          const previewIdx = this.selectedArenaIdx >= 0 ? this.selectedArenaIdx : 0;
          this.sim.resetArena(previewIdx);
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
      onOpenOnline: () => {
        this.sound.unlock();
        this.sound.playClick();
        this._openOnlineModal('host');
      },
      onOnlineBack: () => {
        this.sound.playClick();
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
        if (this.net.role !== 'host') return;
        this.sound.unlock();
        this.sound.playClick();
        const arenaIdx = this._pickArenaIndex(-1);
        this.net.sendMatchStart(arenaIdx);
        this.startMatch('online_host', arenaIdx);
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
    const previewIdx = this.selectedArenaIdx >= 0 ? this.selectedArenaIdx : 0;
    this.sim.resetArena(previewIdx);
    this.renderer.clearEffects();
  }

  startMatch(mode, explicitArenaIdx = null) {
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

    const startIdx = explicitArenaIdx !== null ? explicitArenaIdx : this._pickArenaIndex(-1);
    this._resetRound(startIdx);
  }

  _triggerOnlineRematch() {
    const arenaIdx = this._pickArenaIndex(this.sim.arenaIndex);
    this.net.sendEvent('rematch_start', { ai: arenaIdx });
    this.startMatch('online_host', arenaIdx);
  }

  _resetRound(explicitArenaIdx = null) {
    this.phase = 'FIGHT';
    this.bannerText = '';
    this.koPending = false;
    this.koWindowMs = 0;
    this.koTimerMs = 0;
    this._pendingAward = 0;
    this.p1Input = { l: false, r: false };
    this.p2Input = { l: false, r: false };

    const nextIdx = explicitArenaIdx !== null ? explicitArenaIdx : this._pickArenaIndex(this.sim.arenaIndex);
    this.sim.resetArena(nextIdx);
    this.renderer.clearEffects();
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
        const nextIdx = this.selectedArenaIdx >= 0
          ? this.selectedArenaIdx
          : (this.sim.arenaIndex + 1) % ARENAS.length;
        this.sim.resetArena(nextIdx);
        this.renderer.clearEffects();
      }
    } else {
      this.attractMapTicks++;
      if (this.attractMapTicks > 540 && this.selectedArenaIdx < 0) {
        this.attractMapTicks = 0;
        this.sim.resetArena((this.sim.arenaIndex + 1) % ARENAS.length);
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
        this.sim.engine.timing.timeScale = 0.25;
        this.bannerText = this._pendingAward === 0 ? 'DRAW!' : 'BONK!';
      }
    }

    if (this.phase === 'KO') {
      this.sim.step({ l: false, r: false }, { l: false, r: false }, false, false);
      this.koTimerMs -= FIXED_DT;
      if (this.koTimerMs <= 0) {
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
      this.p1Input = this.input.getP1();
      if (this.mode === 'ai') this.p2Input = this.ai.decide(this.sim, false);
      else if (this.mode === 'local') this.p2Input = this.input.getP2();
      else if (this.mode === 'online_host') this.p2Input = this.net.remoteInput;

      this.sim.step(this.p1Input, this.p2Input, true, true);
    }

    if (this.mode === 'online_host') {
      this.net.sendHostSnapshot(this.sim, {
        scores: this.scores,
        roundNumber: this.roundNumber,
        phase: this.phase,
        bannerText: this.bannerText,
        p1Input: this.p1Input
      });
    }
  }

  _stepClientPredictedTick() {
    if (this.phase === 'MATCH_OVER') return;
    if (this.phase !== 'FIGHT') {
      this.p2Input = { l: false, r: false, holdMs: 0 };
      this.sim.step({ l: false, r: false, holdMs: 0 }, { l: false, r: false, holdMs: 0 }, false, false);
      return;
    }
    const rawP2 = this.input.getP2();
    this.p2Input = rawP2;
    const cmd = this.net.queueClientInput(rawP2);
    this.sim.step(this.net.lastHostP1Input, cmd, true, false);
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
    this.sound.updateEngine(true, throttle, clamp(spd / 0.515, 0, 1));
  }

  _startMainLoop() {
    let last = performance.now();
    let acc = 0;

    const loop = (now) => {
      const elapsed = Math.min(100, now - last);
      last = now;

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

      this.renderer.updateEffects(elapsed / FIXED_DT, this.sim);
      this._updateAudio();
      this.renderer.render(this.sim, this.bannerText);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
