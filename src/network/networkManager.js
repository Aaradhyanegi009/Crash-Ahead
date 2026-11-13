import { PEER_PREFIX } from '../config/constants.js';
import { BODY_KEYS } from '../physics/vehicleController.js';

const BC_LOBBY_CHANNEL = 'unfair-crash-ahead-lobby';
const BC_ROOM_PREFIX = 'unfair-crash-ahead-room-';

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[bytes[i] % chars.length];
  return `CRSH-${code}`;
}

export function normalizeRoomCode(codeInput) {
  let raw = (codeInput || '').trim();
  if (!raw) return '';
  if (raw.includes('room=')) {
    try {
      raw = new URL(raw).searchParams.get('room') || raw;
    } catch (_) {
      const m = raw.match(/room=([A-Za-z0-9-]+)/i);
      if (m) raw = m[1];
    }
  }
  const clean = raw.toUpperCase().replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.startsWith('CRSH-')) return clean;
  if (/^[A-Z0-9]{4}$/.test(clean)) return `CRSH-${clean}`;
  return clean.replace(/^CRSH-?/, 'CRSH-');
}

export class NetworkManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.peer = null;
    this.conn = null;
    this.role = null;
    this.roomCode = '';
    this.pingMs = 0;
    this.pingTimer = null;
    this.reliableTimer = null;
    this.dialTimer = null;
    this.lobbyTimer = null;

    this.localChan = null;
    this.lobbyChan = null;
    this.localPeerReady = false;
    this.connectedFired = false;

    this.remoteInput = { seq: 0, l: false, r: false, holdMs: 0 };
    this.lastHostP1Input = { l: false, r: false, holdMs: 0 };
    this.inputSeq = 0;
    this.inputSendTick = 0;
    this.lastInputSent = { l: false, r: false };
    this.pendingInputs = [];
    this.pendingSnapshot = null;
    this.lastSeq = 0;

    this.nextEvtId = 0;
    this.pendingReliable = new Map();
    this.seenEids = new Set();
    this._initLobbyChannel();
  }

  _initLobbyChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.lobbyChan = new BroadcastChannel(BC_LOBBY_CHANNEL);
      this.lobbyChan.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || !msg.code) return;
        if (msg.type === 'host_open' && this.role !== 'host') {
          if (this.cb.onLocalRoomDiscovered) this.cb.onLocalRoomDiscovered(msg.code);
        }
      };
    } catch (_) {
      this.lobbyChan = null;
    }
  }

  isConnected() {
    return !!(this.localPeerReady || (this.conn && this.conn.open));
  }

  _sendRaw(msg) {
    if (this.localPeerReady && this.localChan) {
      try {
        this.localChan.postMessage({ _from: this.role, payload: msg });
        return true;
      } catch (_) {}
    }
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
        return true;
      } catch (_) {}
    }
    return false;
  }

  resetPredictionState() {
    this.remoteInput = { seq: 0, l: false, r: false, holdMs: 0 };
    this.lastHostP1Input = { l: false, r: false, holdMs: 0 };
    this.inputSeq = 0;
    this.inputSendTick = 0;
    this.lastInputSent = { l: false, r: false };
    this.pendingInputs = [];
    this.pendingSnapshot = null;
    this.lastSeq = 0;
  }

  _closeLocalRoom() {
    if (this.lobbyTimer) { clearInterval(this.lobbyTimer); this.lobbyTimer = null; }
    if (this.role === 'host' && this.roomCode && this.lobbyChan) {
      try { this.lobbyChan.postMessage({ type: 'host_closed', code: this.roomCode }); } catch (_) {}
    }
    if (this.localChan) {
      if (this.localPeerReady) {
        try { this.localChan.postMessage({ _from: this.role, payload: { t: '_bc_bye' } }); } catch (_) {}
      }
      try { this.localChan.close(); } catch (_) {}
      this.localChan = null;
    }
    this.localPeerReady = false;
  }

  destroy() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.reliableTimer) { clearInterval(this.reliableTimer); this.reliableTimer = null; }
    if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
    this._closeLocalRoom();
    const oldConn = this.conn;
    this.conn = null;
    if (oldConn) { try { oldConn.close(); } catch (_) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (_) {} this.peer = null; }
    this.role = null;
    this.connectedFired = false;
    this.pendingReliable.clear();
    this.seenEids.clear();
    this.resetPredictionState();
  }

  _openLocalChannel(roomCode, role) {
    if (typeof BroadcastChannel === 'undefined' || !roomCode) return;
    try {
      this.localChan = new BroadcastChannel(BC_ROOM_PREFIX + roomCode);
      this.localChan.onmessage = (ev) => {
        const pkt = ev.data;
        if (!pkt || pkt._from === role || !pkt.payload) return;
        const msg = pkt.payload;
        if (msg.t === '_bc_hello') {
          this.localPeerReady = true;
          if (role === 'host') {
            this.localChan.postMessage({ _from: 'host', payload: { t: '_bc_ack' } });
          }
          this._markConnected();
          return;
        }
        if (msg.t === '_bc_ack') {
          this.localPeerReady = true;
          this._markConnected();
          return;
        }
        if (msg.t === '_bc_bye') {
          if (this.localPeerReady) {
            this.destroy();
            this.cb.onDisconnected('Opponent disconnected.');
          }
          return;
        }
        this._handleMessage(msg);
      };
      if (role === 'client') {
        this.localChan.postMessage({ _from: 'client', payload: { t: '_bc_hello' } });
      }
    } catch (_) {
      this.localChan = null;
    }
  }

  _markConnected() {
    if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
    if (this.lobbyTimer) { clearInterval(this.lobbyTimer); this.lobbyTimer = null; }
    if (this.connectedFired) return;
    this.connectedFired = true;
    this.cb.onStatus('Connected!', 'connected', false);
    this.cb.onConnected(this.role);
    this._startTimers();
  }

  _initPeer(peerId, onReady) {
    const prevRole = this.role;
    const prevCode = this.roomCode;
    this.destroy();
    this.role = prevRole;
    this.roomCode = prevCode;
    this._openLocalChannel(prevCode, prevRole);

    const PeerCtor = window.Peer;
    if (typeof PeerCtor === 'undefined') {
      if (!this.localPeerReady) {
        this.cb.onStatus('PeerJS CDN failed to load.', 'error', true);
      }
      return;
    }

    const opts = {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    };
    this.peer = peerId ? new PeerCtor(peerId, opts) : new PeerCtor(opts);
    this.peer.on('open', (id) => onReady(id));
    this.peer.on('disconnected', () => {
      if (this.peer && !this.peer.destroyed && !this.isConnected()) {
        try { this.peer.reconnect(); } catch (_) {}
      }
    });
    this.peer.on('error', (err) => {
      if (this.localPeerReady || this.isConnected()) return;
      if (err && err.type === 'unavailable-id' && this.role === 'host') {
        this.hostRoom();
        return;
      }
      if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
      const msg = (err && err.type === 'peer-unavailable')
        ? 'Room not found or Host disconnected.'
        : `Connection error: ${(err && (err.type || err.message)) || 'unknown'}`;
      this.cb.onStatus(msg, 'error', true);
    });
  }

  hostRoom() {
    this.role = 'host';
    this.roomCode = generateRoomCode();
    this.cb.onRoomCode(this.roomCode);
    this.cb.onStatus('Opening room...', 'neutral', false);
    this._initPeer(PEER_PREFIX + this.roomCode, () => {
      this.role = 'host';
      if (this.lobbyChan) {
        const announce = () => {
          if (this.role === 'host' && !this.isConnected()) {
            try { this.lobbyChan.postMessage({ type: 'host_open', code: this.roomCode }); } catch (_) {}
          }
        };
        announce();
        if (this.lobbyTimer) clearInterval(this.lobbyTimer);
        this.lobbyTimer = setInterval(announce, 1500);
      }
      if (!this.isConnected()) {
        this.cb.onStatus(`Hosting ${this.roomCode} — waiting for player`, 'neutral', false);
      }
      this.peer.on('connection', (conn) => {
        if (this.localPeerReady) { conn.close(); return; }
        if (this.conn && this.conn.open) { conn.close(); return; }
        this._attachConnection(conn);
      });
    });
  }

  joinRoom(codeInput) {
    const normalized = normalizeRoomCode(codeInput);
    if (!normalized || normalized.length < 6) {
      this.cb.onStatus('Enter a valid 4-letter code (or link).', 'error', false);
      return;
    }
    this.roomCode = normalized;
    this.role = 'client';
    this.cb.onStatus(`Connecting to ${normalized}...`, 'neutral', false);
    this._initPeer(null, () => {
      this.role = 'client';
      if (this.localPeerReady) return;
      const conn = this.peer.connect(PEER_PREFIX + normalized, { serialization: 'json', reliable: true });
      this._attachConnection(conn);
      if (this.dialTimer) clearTimeout(this.dialTimer);
      this.dialTimer = setTimeout(() => {
        if (!this.isConnected()) {
          this.cb.onStatus('Connection timed out. Tap Retry or check code.', 'error', true);
        }
      }, 12000);
    });
  }

  _attachConnection(conn) {
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      if (this.localPeerReady) {
        try { conn.close(); } catch (_) {}
        return;
      }
      this._markConnected();
    });
    conn.on('iceStateChanged', (state) => {
      if (this.conn !== conn) return;
      if (state === 'failed' && !this.isConnected()) {
        if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
        this.cb.onStatus('WebRTC connection failed. Tap Retry.', 'error', true);
      }
    });
    conn.on('data', (msg) => {
      if (this.conn !== conn || this.localPeerReady) return;
      this._handleMessage(msg);
    });
    conn.on('close', () => {
      if (this.conn !== conn || this.localPeerReady) return;
      this.destroy();
      this.cb.onDisconnected('Opponent disconnected.');
    });
    conn.on('error', () => {
      if (this.conn !== conn || this.localPeerReady) return;
      this.destroy();
      this.cb.onDisconnected('Peer connection lost.');
    });
  }

  _startTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) this._sendRaw({ t: 'ping', ts: performance.now() });
    }, 1500);

    if (this.reliableTimer) clearInterval(this.reliableTimer);
    this.reliableTimer = setInterval(() => {
      if (!this.isConnected() || this.pendingReliable.size === 0) return;
      const now = performance.now();
      for (const [eid, entry] of this.pendingReliable.entries()) {
        if (entry.attempts >= 30) {
          this.pendingReliable.delete(eid);
          continue;
        }
        if (now - entry.lastSent >= 110) {
          entry.lastSent = now;
          entry.attempts += 1;
          this._sendRaw(entry.msg);
        }
      }
    }, 120);
  }

  sendReliable(type, payload = {}) {
    if (!this.isConnected()) return;
    const eid = ++this.nextEvtId;
    const msg = { t: type, _eid: eid, ...payload };
    this.pendingReliable.set(eid, { msg, lastSent: performance.now(), attempts: 1 });
    this._sendRaw(msg);
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (typeof msg._eid === 'number') {
      if (this.isConnected()) this._sendRaw({ t: 'ack', eid: msg._eid });
      if (this.seenEids.has(msg._eid)) return;
      this.seenEids.add(msg._eid);
      if (this.seenEids.size > 64) {
        const first = this.seenEids.values().next().value;
        this.seenEids.delete(first);
      }
    }

    switch (msg.t) {
      case 'ack':
        this.pendingReliable.delete(msg.eid);
        break;
      case 'ping':
        if (this.isConnected()) this._sendRaw({ t: 'pong', ts: msg.ts });
        break;
      case 'pong':
        this.pingMs = Math.max(1, Math.round(performance.now() - msg.ts));
        this.cb.onPing(this.pingMs);
        break;
      case 'input': {
        const seq = msg.seq || 0;
        if (seq >= this.remoteInput.seq || seq === 0) {
          this.remoteInput = { seq, l: !!msg.l, r: !!msg.r, holdMs: msg.holdMs || 0 };
        }
        break;
      }
      case 'match_start':
        this.resetPredictionState();
        this.cb.onMatchStart(msg.ai || 0);
        break;
      case 'request_start':
        if (this.role === 'host' && this.cb.onStartRequested) this.cb.onStartRequested();
        break;
      case 'snap':
        if (msg.sq <= this.lastSeq) return;
        this.lastSeq = msg.sq;
        this.pendingSnapshot = msg;
        if (this.cb.onSnapshotPacket) this.cb.onSnapshotPacket(msg);
        break;
      case 'evt':
        if (msg.kind === 'rematch_start') this.resetPredictionState();
        this.cb.onGameEvent(msg);
        break;
      case 'rematch':
        this.cb.onRematchSignal();
        break;
    }
  }

  queueClientInput(inp) {
    const seq = ++this.inputSeq;
    const l = !!(inp && inp.l);
    const r = !!(inp && inp.r);
    const holdMs = (inp && inp.holdMs) || 0;
    const cmd = { seq, l, r, holdMs };
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > 90) this.pendingInputs.shift();

    if (this.isConnected()) {
      this.inputSendTick++;
      const changed = l !== this.lastInputSent.l || r !== this.lastInputSent.r;
      if (changed || l || r || this.inputSendTick % 4 === 0) {
        this.lastInputSent = { l, r };
        this._sendRaw({ t: 'input', seq, l, r, holdMs });
      }
    }
    return cmd;
  }

  sendMatchStart(arenaIndex) {
    this.resetPredictionState();
    this.sendReliable('match_start', { ai: arenaIndex });
  }

  sendRequestStart() {
    this.sendReliable('request_start', {});
  }

  sendEvent(kind, data = {}) {
    this.sendReliable('evt', { kind, ...data });
  }

  sendRematch() {
    this.sendReliable('rematch', {});
  }

  buildHostSnapshot(sim, meta) {
    this.lastSeq++;
    const pack = (b) => ({
      x: Math.round(b.position.x * 10) / 10,
      y: Math.round(b.position.y * 10) / 10,
      vx: Math.round(b.velocity.x * 100) / 100,
      vy: Math.round(b.velocity.y * 100) / 100,
      a: Math.round(b.angle * 1000) / 1000,
      av: Math.round(b.angularVelocity * 1000) / 1000
    });
    const payload = {
      t: 'snap',
      sq: this.lastSeq,
      ak: this.remoteInput.seq,
      ai: sim.arenaIndex,
      sc: [meta.scores[0], meta.scores[1]],
      rn: meta.roundNumber,
      ph: meta.phase,
      bt: meta.bannerText,
      rt: Math.round(sim.roundElapsedMs),
      wy: Math.round(sim.waterCrestY * 10) / 10,
      i1: meta.p1Input ? { l: !!meta.p1Input.l, r: !!meta.p1Input.r, holdMs: meta.p1Input.holdMs || 0 } : { l: false, r: false, holdMs: 0 },
      d1: sim.p1Car.dead ? 1 : 0,
      d2: sim.p2Car.dead ? 1 : 0,
      dr1: sim.p1Car.driving ? 1 : 0,
      dr2: sim.p2Car.driving ? 1 : 0,
      hm1: Math.round(sim.p1Car.accelHoldMs || 0),
      hm2: Math.round(sim.p2Car.accelHoldMs || 0),
      ad1: sim.p1Car.accelDir || 0,
      ad2: sim.p2Car.accelDir || 0,
      sw: sim.seesaws.map((s) => ({
        a: Math.round(s.body.angle * 1000) / 1000,
        av: Math.round(s.body.angularVelocity * 1000) / 1000
      }))
    };
    for (const [carKey, bodyKey, shortKey] of BODY_KEYS) {
      payload[shortKey] = pack(sim[carKey][bodyKey]);
    }
    return payload;
  }

  sendHostSnapshot(sim, meta) {
    if (!this.isConnected()) return;
    if (!this.localPeerReady && this.conn) {
      const dc = this.conn.dataChannel || this.conn._dc;
      if (dc && dc.bufferedAmount > 32768) return;
    }
    this._sendRaw(this.buildHostSnapshot(sim, meta));
  }

  reconcileClientFrame(sim, onSnapshotMeta) {
    const snap = this.pendingSnapshot;
    if (!snap) return false;
    this.pendingSnapshot = null;

    if (onSnapshotMeta) onSnapshotMeta(snap);

    const ackSeq = snap.ak || 0;
    if (this.pendingInputs.length > 0) {
      this.pendingInputs = this.pendingInputs.filter((cmd) => cmd.seq > ackSeq);
    }
    this.lastHostP1Input = snap.i1 || { l: false, r: false, holdMs: 0 };

    const beforeP1 = sim.captureCarPose(sim.p1Car);
    const beforeP2 = sim.captureCarPose(sim.p2Car);

    // Step 1: Snap rigid bodies + water height to authoritative host snapshot
    sim.applyNetState(snap);

    // Step 2: Rewind/replay unacknowledged local client inputs (don't double-step host water)
    if (snap.ph === 'FIGHT' && this.pendingInputs.length > 0) {
      const maxReplay = Math.min(this.pendingInputs.length, 24);
      const startIdx = this.pendingInputs.length - maxReplay;
      for (let i = startIdx; i < this.pendingInputs.length; i++) {
        sim.step(this.lastHostP1Input, this.pendingInputs[i], true, false);
      }
    }

    // Step 3: Blend micro-divergence smoothly
    if (beforeP2 && sim.p2Car) {
      const dx = sim.p2Car.chassis.position.x - beforeP2.c.x;
      const dy = sim.p2Car.chassis.position.y - beforeP2.c.y;
      const errDist = Math.hypot(dx, dy);
      if (errDist > 0.05 && errDist < 24) {
        sim.blendCarPose(sim.p2Car, beforeP2, 0.35);
      }
    }
    if (beforeP1 && sim.p1Car) {
      const dx1 = sim.p1Car.chassis.position.x - beforeP1.c.x;
      const dy1 = sim.p1Car.chassis.position.y - beforeP1.c.y;
      if (Math.hypot(dx1, dy1) < 28) {
        sim.blendCarPose(sim.p1Car, beforeP1, 0.45);
      }
    }
    return true;
  }
}
