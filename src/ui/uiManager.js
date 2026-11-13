import { WATER_RISE, WIN_SCORE } from '../config/constants.js';
import { ARENAS } from '../maps/arenas.js';

export class UIManager {
  constructor() {
    this.dom = {
      scorePill: document.getElementById('score-pill'),
      scoreP1: document.getElementById('score-p1'),
      scoreP2: document.getElementById('score-p2'),
      pingTag: document.getElementById('online-ping-tag'),
      waterAlert: document.getElementById('water-alert-pill'),
      btnExit: document.getElementById('btn-exit'),

      menuOverlay: document.getElementById('menu-overlay'),
      onlineOverlay: document.getElementById('online-overlay'),
      victoryOverlay: document.getElementById('victory-overlay'),

      mapTitle: document.getElementById('map-picker-title'),
      mapSub: document.getElementById('map-picker-sub'),
      btnCtrlToggle: document.getElementById('btn-ctrl-toggle'),
      btnMute: document.getElementById('btn-mute'),
      iconSoundOn: document.getElementById('icon-sound-on'),
      iconSoundOff: document.getElementById('icon-sound-off'),

      tabHost: document.getElementById('tab-host'),
      tabJoin: document.getElementById('tab-join'),
      panelHost: document.getElementById('panel-host'),
      panelJoin: document.getElementById('panel-join'),
      hostRoomCode: document.getElementById('host-room-code'),
      joinCodeInput: document.getElementById('join-code-input'),
      onlineStatus: document.getElementById('online-status'),
      onlineStatusText: document.getElementById('online-status-text'),
      onlineLobbyPing: document.getElementById('online-lobby-ping'),
      btnOnlineRetry: document.getElementById('btn-online-retry'),
      btnOnlineStart: document.getElementById('btn-online-start'),

      victoryTitle: document.getElementById('victory-title'),
      victoryScore: document.getElementById('victory-score'),
      victoryNote: document.getElementById('victory-note'),
      btnRematch: document.getElementById('btn-rematch')
    };
  }

  bindHandlers(h) {
    document.getElementById('force-landscape-btn').addEventListener('click', h.onForceLandscape);
    this.dom.btnMute.addEventListener('click', h.onToggleMute);
    document.getElementById('btn-fullscreen').addEventListener('click', h.onToggleFullscreen);

    document.getElementById('btn-map-prev').addEventListener('click', () => h.onStepMap(-1));
    document.getElementById('btn-map-next').addEventListener('click', () => h.onStepMap(1));
    document.getElementById('btn-map-cycle').addEventListener('click', () => h.onStepMap(1));
    this.dom.btnCtrlToggle.addEventListener('click', h.onToggleCtrlLayout);

    document.getElementById('btn-mode-local').addEventListener('click', () => h.onStartMode('local'));
    document.getElementById('btn-mode-ai').addEventListener('click', () => h.onStartMode('ai'));
    document.getElementById('btn-mode-online').addEventListener('click', h.onOpenOnline);

    document.getElementById('btn-online-back').addEventListener('click', h.onOnlineBack);
    this.dom.tabHost.addEventListener('click', () => h.onSwitchOnlineTab('host'));
    this.dom.tabJoin.addEventListener('click', () => h.onSwitchOnlineTab('join'));

    document.getElementById('btn-copy-code').addEventListener('click', (e) => {
      h.onCopyCode(this.dom.hostRoomCode.textContent, e.currentTarget, 'COPY CODE');
    });
    document.getElementById('btn-copy-link').addEventListener('click', (e) => {
      const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(this.dom.hostRoomCode.textContent)}`;
      h.onCopyCode(url, e.currentTarget, 'COPY LINK');
    });

    document.getElementById('btn-join-connect').addEventListener('click', () => {
      h.onJoinConnect(this.dom.joinCodeInput.value);
    });
    this.dom.joinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-join-connect').click();
    });

    this.dom.btnOnlineStart.addEventListener('click', h.onOnlineStart);
    this.dom.btnOnlineRetry.addEventListener('click', () => h.onOnlineRetry(this.dom.joinCodeInput.value));
    this.dom.btnExit.addEventListener('click', h.onExit);
    this.dom.btnRematch.addEventListener('click', h.onRematch);
    document.getElementById('btn-victory-menu').addEventListener('click', h.onVictoryMenu);
  }

  copyWithFeedback(text, btn, originalText) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = originalText; }, 1200);
      }).catch(() => {});
    }
  }

  updateSoundIcon(muted) {
    this.dom.iconSoundOn.classList.toggle('hidden', muted);
    this.dom.iconSoundOff.classList.toggle('hidden', !muted);
  }

  updateCtrlLayoutLabel(singleLayout) {
    this.dom.btnCtrlToggle.textContent =
      singleLayout === 'split' ? '1P TOUCH: SPLIT THUMBS' : '1P TOUCH: SIDE PAIR';
  }

  updateMapPicker(selectedArenaIdx) {
    if (selectedArenaIdx < 0) {
      this.dom.mapTitle.textContent = 'ALL 9 MAPS (IN ORDER)';
      this.dom.mapSub.textContent = 'Plays Maps 1–9 in exact order • Tap < > to pick Map 1–9';
    } else {
      const a = ARENAS[selectedArenaIdx];
      this.dom.mapTitle.textContent = `MAP ${a.id}/9: ${a.name}`;
      this.dom.mapSub.textContent = a.desc;
    }
  }

  showHomeMenu() {
    this.dom.scorePill.classList.add('hidden');
    this.dom.waterAlert.classList.add('hidden');
    this.dom.btnExit.classList.add('hidden');
    this.dom.pingTag.classList.add('hidden');
    this.dom.victoryOverlay.classList.add('hidden');
    this.dom.onlineOverlay.classList.add('hidden');
    this.dom.menuOverlay.classList.remove('hidden');
  }

  showGameplayHUD(isOnline) {
    this.dom.menuOverlay.classList.add('hidden');
    this.dom.onlineOverlay.classList.add('hidden');
    this.dom.victoryOverlay.classList.add('hidden');
    this.dom.scorePill.classList.remove('hidden');
    this.dom.btnExit.classList.remove('hidden');
    this.dom.pingTag.classList.toggle('hidden', !isOnline);
    this.dom.waterAlert.classList.add('hidden');
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  showOnlineModal() {
    this.dom.menuOverlay.classList.add('hidden');
    this.dom.onlineOverlay.classList.remove('hidden');
  }

  setOnlineTabUI(tab) {
    this.dom.tabHost.classList.toggle('active', tab === 'host');
    this.dom.tabJoin.classList.toggle('active', tab === 'join');
    this.dom.panelHost.classList.toggle('hidden', tab !== 'host');
    this.dom.panelJoin.classList.toggle('hidden', tab !== 'join');
    this.dom.btnOnlineStart.disabled = true;
    this.dom.btnOnlineStart.textContent = tab === 'host' ? 'WAITING FOR OPPONENT...' : 'WAITING FOR HOST...';
    this.dom.onlineLobbyPing.textContent = '';
    this.dom.btnOnlineRetry.classList.add('hidden');
    if (tab === 'join') {
      this.dom.onlineStatusText.textContent = 'Enter friend room code to join.';
      this.dom.onlineStatus.className = 'status-pill';
      setTimeout(() => this.dom.joinCodeInput.focus(), 80);
    }
  }

  setRoomCode(code) {
    this.dom.hostRoomCode.textContent = code;
  }

  setJoinCodeValue(code) {
    this.dom.joinCodeInput.value = code;
  }

  setOnlineStatus(text, cls = '', showRetry = false) {
    this.dom.onlineStatusText.textContent = text;
    this.dom.onlineStatus.className = `status-pill ${cls}`;
    this.dom.btnOnlineRetry.classList.toggle('hidden', !showRetry);
  }

  setOnlineConnected(role) {
    this.dom.onlineStatusText.textContent = role === 'host' ? 'Player 2 Connected!' : 'Connected to Host!';
    this.dom.onlineStatus.className = 'status-pill connected';
    this.dom.btnOnlineRetry.classList.add('hidden');
    this.dom.btnOnlineStart.disabled = role !== 'host';
    this.dom.btnOnlineStart.textContent = role === 'host' ? 'START MATCH!' : 'WAITING FOR HOST...';
  }

  setOnlineDisconnected(reason) {
    this.dom.scorePill.classList.add('hidden');
    this.dom.waterAlert.classList.add('hidden');
    this.dom.btnExit.classList.add('hidden');
    this.dom.victoryOverlay.classList.add('hidden');
    this.dom.onlineOverlay.classList.remove('hidden');
    this.dom.onlineStatusText.textContent = reason;
    this.dom.onlineStatus.className = 'status-pill error';
    this.dom.btnOnlineRetry.classList.remove('hidden');
    this.dom.btnOnlineStart.disabled = true;
    this.dom.btnOnlineStart.textContent = 'WAITING FOR OPPONENT...';
  }

  setPing(ms) {
    this.dom.onlineLobbyPing.textContent = `${ms}ms`;
    this.dom.pingTag.textContent = `${ms}ms`;
  }

  updateScores(scores) {
    this.dom.scoreP1.textContent = String(scores[0]);
    this.dom.scoreP2.textContent = String(scores[1]);
  }

  updateWaterAlert(activeFight, roundElapsedMs, waterRising) {
    if (!activeFight) {
      this.dom.waterAlert.classList.add('hidden');
      return;
    }
    if (waterRising) {
      this.dom.waterAlert.textContent = 'WATER RISING!';
      this.dom.waterAlert.classList.remove('hidden', 'soon');
      return;
    }
    const remMs = WATER_RISE.DELAY_MS - roundElapsedMs;
    if (remMs <= WATER_RISE.WARN_BEFORE_MS && remMs > 0) {
      const secs = Math.ceil(remMs / 1000);
      this.dom.waterAlert.textContent = `FLOOD IN ${secs}...`;
      this.dom.waterAlert.classList.add('soon');
      this.dom.waterAlert.classList.remove('hidden');
    } else {
      this.dom.waterAlert.classList.add('hidden');
    }
  }

  showVictory(scores) {
    this.dom.waterAlert.classList.add('hidden');
    this.dom.victoryTitle.textContent = scores[0] >= WIN_SCORE ? 'RED WINS!' : 'BLUE WINS!';
    this.dom.victoryScore.textContent = `${scores[0]} • ${scores[1]}`;
    this.dom.victoryNote.textContent = '';
    this.dom.btnRematch.disabled = false;
    this.dom.btnRematch.textContent = 'PLAY AGAIN';
    this.dom.victoryOverlay.classList.remove('hidden');
  }

  setRematchWaiting() {
    this.dom.btnRematch.disabled = true;
    this.dom.btnRematch.textContent = 'WAITING...';
  }

  setVictoryNote(note) {
    this.dom.victoryNote.textContent = note;
  }
}
