import { CAR_MODEL_IDS, PEER_PREFIX } from '../config/constants.js';
import { BODY_KEYS } from '../physics/vehicleController.js';
import { clamp } from '../utils/math.js';
import { MqttRelayLink, RELAY_BROKERS } from './mqttRelay.js';

const modelToIdx = (id) => {
  const i = CAR_MODEL_IDS.indexOf(id);
  return i >= 0 ? i : 0;
};
const idxToModel = (idx) => {
  if (typeof idx !== 'number' || !Number.isFinite(idx)) return CAR_MODEL_IDS[0];
  return CAR_MODEL_IDS[clamp(Math.floor(idx), 0, CAR_MODEL_IDS.length - 1)] || CAR_MODEL_IDS[0];
};

const BC_LOBBY_CHANNEL = 'unfair-crash-ahead-lobby';
const BC_ROOM_PREFIX = 'unfair-crash-ahead-room-';
const RELAY_TOPIC_ROOT = 'unfair-crash-ahead/v2/';
const PEER_SILENCE_TIMEOUT_MS = 15000;
const JOIN_TIMEOUT_MS = 18000;
const WIRE_PHASES = ['MENU', 'COUNTDOWN', 'FIGHT', 'ROUND_OVER', 'GAME_OVER'];

const phaseToWire = (ph) => {
  const i = WIRE_PHASES.indexOf(ph);
  return i >= 0 ? i : (ph || 0);
};
const wireToPhase = (v) => (typeof v === 'number' ? (WIRE_PHASES[v] || 'MENU') : (v || 'MENU'));

function encodeWireMsg(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  if (msg.t === 'input') {
    const m = (msg.l ? 1 : 0) | (msg.r ? 2 : 0) | (msg.j ? 4 : 0) |
      (msg.pl ? 8 : 0) | (msg.pr ? 16 : 0) | (msg.pj ? 32 : 0);
    return ['I', msg.ep || 1, msg.seq || 0, m, msg.jc || 0, msg.holdMs || 0];
  }
  if (msg.t === 'snap') {
    const i1 = msg.i1 || [0, 0, 0, 0];
    const i1m = (i1[0] ? 1 : 0) | (i1[1] ? 2 : 0) | (i1[3] ? 4 : 0);
    const flags = (msg.d1 ? 1 : 0) | (msg.d2 ? 2 : 0) | (msg.dr1 ? 4 : 0) | (msg.dr2 ? 8 : 0);
    const sw = Array.isArray(msg.sw) ? msg.sw : [];
    const arr = [
      'S', msg.ep || 1, msg.sq || 0, msg.ak || 0, msg.ai || 0,
      msg.m1 || 0, msg.m2 || 0,
      msg.sc ? msg.sc[0] : 0, msg.sc ? msg.sc[1] : 0,
      msg.rn || 1, phaseToWire(msg.ph), msg.bt || '',
      msg.rt || 0, msg.wy || 0,
      i1m, i1[2] || 0, flags,
      msg.hm1 || 0, msg.hm2 || 0, msg.ad1 || 0, msg.ad2 || 0,
      msg.lj1 ?? -99999, msg.lj2 ?? -99999,
      sw.length
    ];
    for (let i = 0; i < sw.length; i++) {
      arr.push(sw[i][0], sw[i][1]);
    }
    for (let i = 0; i < BODY_KEYS.length; i++) {
      const b = msg[BODY_KEYS[i][2]];
      if (b) arr.push(b[0], b[1], b[2], b[3], b[4], b[5]);
      else arr.push(0, 0, 0, 0, 0, 0);
    }
    return arr;
  }
  return msg;
}

function decodeWireMsg(raw) {
  if (!Array.isArray(raw)) return raw;
  const tag = raw[0];
  if (tag === 'I') {
    const m = raw[3] || 0;
    return {
      t: 'input', ep: raw[1], seq: raw[2],
      l: !!(m & 1), r: !!(m & 2), j: !!(m & 4),
      pl: !!(m & 8), pr: !!(m & 16), pj: !!(m & 32),
      jc: raw[4] || 0, holdMs: raw[5] || 0
    };
  }
  if (tag === 'S') {
    const i1m = raw[14] || 0;
    const flags = raw[16] || 0;
    const swLen = raw[23] || 0;
    let idx = 24;
    const sw = [];
    for (let i = 0; i < swLen; i++) {
      sw.push([raw[idx++], raw[idx++]]);
    }
    const snap = {
      t: 'snap', ep: raw[1], sq: raw[2], ak: raw[3], ai: raw[4],
      m1: raw[5], m2: raw[6], sc: [raw[7], raw[8]], rn: raw[9],
      ph: wireToPhase(raw[10]), bt: raw[11], rt: raw[12], wy: raw[13],
      i1: [i1m & 1, (i1m >> 1) & 1, raw[15], (i1m >> 2) & 1],
      d1: flags & 1, d2: (flags >> 1) & 1, dr1: (flags >> 2) & 1, dr2: (flags >> 3) & 1,
      hm1: raw[17], hm2: raw[18], ad1: raw[19], ad2: raw[20],
      lj1: raw[21], lj2: raw[22], sw
    };
    for (let i = 0; i < BODY_KEYS.length; i++) {
      snap[BODY_KEYS[i][2]] = [
        raw[idx++], raw[idx++], raw[idx++], raw[idx++], raw[idx++], raw[idx++]
      ];
    }
    return snap;
  }
  return raw;
}

// Public STUN servers (Google + Cloudflare + Twilio) for direct WebRTC hole punching.
// When a direct path is impossible (symmetric NAT / CGNAT / mobile data / firewalls),
// the game automatically falls back to the secure WebSocket internet relay (mqttRelay.js).
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['stun:global.stun.twilio.com:3478', 'stun:stun2.l.google.com:19302'] }
];

function randomHex(nBytes) {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
    this.fastConn = null;
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

    // Native WebRTC DataChannels signaled directly over MQTT relay (eliminates slow PeerJS wait)
    this.nativePc = null;
    this.nativeCtrlDc = null;
    this.nativeFastDc = null;
    this.nativeIceQueue = [];
    this.nativeRemoteDescSet = false;
    this.nativeOfferTimer = null;

    // Internet relay fallback (works across any two networks)
    this.relayId = randomHex(6);
    this.relayLinks = [];
    this.relayLink = null;
    this.relayPeerId = null;
    this.relayPeerReady = false;
    this.p2pPeerRid = null;
    this.relayHelloTimer = null;
    this.relayPickTimer = null;
    this.relayCandidates = [];
    this.relayPendingPeer = null;
    this.lastRelaySnapAt = 0;
    this.lastRemoteAt = 0;

    this.matchEpoch = 1;
    this.remoteInput = { seq: 0, l: false, r: false, j: false, jump: false, holdMs: 0 };
    this.remoteInputAt = 0;
    this.lastHostP1Input = { l: false, r: false, jump: false, holdMs: 0 };
    this.hostInputPredictTicks = 0;
    this.inputSeq = 0;
    this.inputSendTick = 0;
    this.releaseBurstLeft = 0;
    this.lastInputSent = { l: false, r: false, j: false };
    this.jumpPressCount = 0;
    this.prevClientJ = false;
    this.lastRemoteJumpCount = 0;
    this.pendingRemoteJumpTicks = 0;
    this._latestRemoteJ = false;
    this.pendingInputs = [];
    this.pendingSnapshot = null;
    this.lastSeq = 0;
    this.lastSnapPhase = '';
    this.lastSnapDeadMask = -1;
    this.rxSnapLastSq = 0;
    this.rxSnapExpected = 0;
    this.rxSnapRecv = 0;
    this.pktLossPct = 0;
    this._lastRelayFailoverAt = 0;

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

  _hasP2P() {
    return !!(
      (this.nativeCtrlDc && this.nativeCtrlDc.readyState === 'open') ||
      (this.conn && this.conn.open)
    );
  }

  isConnected() {
    return !!(this.localPeerReady || this._hasP2P() || this.relayPeerReady);
  }

  transportName() {
    if (this.localPeerReady) return 'local';
    if (this._hasP2P()) return 'p2p';
    if (this.relayPeerReady) return 'relay';
    return 'none';
  }

  _relayAlive() {
    return this.relayPeerReady || this.relayLinks.some((l) => !l.closed);
  }

  _sendRaw(msg, fast = false) {
    if (this.localPeerReady && this.localChan) {
      try {
        this.localChan.postMessage({ _from: this.role, payload: msg });
        return true;
      } catch (_) {}
    }
    const wire = encodeWireMsg(msg);
    if (fast && this.nativeFastDc && this.nativeFastDc.readyState === 'open') {
      try {
        if (this.nativeFastDc.bufferedAmount < 12288) {
          this.nativeFastDc.send(JSON.stringify(wire));
          return true;
        }
      } catch (_) {}
    }
    if (this.nativeCtrlDc && this.nativeCtrlDc.readyState === 'open') {
      try {
        if (!fast || this.nativeCtrlDc.bufferedAmount < 24576) {
          this.nativeCtrlDc.send(JSON.stringify(wire));
          return true;
        }
      } catch (_) {}
    }
    if (fast && this.fastConn && this.fastConn.open) {
      try {
        const dc = this.fastConn.dataChannel || this.fastConn._dc;
        if (!dc || dc.bufferedAmount < 16384) {
          this.fastConn.send(msg);
          return true;
        }
      } catch (_) {}
    }
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
        return true;
      } catch (_) {}
    }
    if (this.relayPeerReady && this.relayLink && !this.relayLink.closed) {
      return this.relayLink.publish(this._relayPeerTopic(), { f: this.relayId, k: 'd', p: wire });
    }
    return false;
  }

  // ---------- Internet relay (MQTT over WSS) ----------
  _relayBase() {
    return RELAY_TOPIC_ROOT + this.roomCode;
  }

  _relayPeerTopic() {
    return this.role === 'host'
      ? `${this._relayBase()}/c/${this.relayPeerId}`
      : `${this._relayBase()}/h`;
  }

  _startRelay() {
    this._stopRelay(false);
    if (typeof WebSocket === 'undefined' || !this.roomCode) return;
    const role = this.role;
    const myTopic = role === 'host' ? `${this._relayBase()}/h` : `${this._relayBase()}/c/${this.relayId}`;
    for (const url of RELAY_BROKERS) {
      const link = new MqttRelayLink(url, `uca${this.relayId}${role === 'host' ? 'h' : 'c'}`, {
        onReady: (l) => this._onRelayReady(l),
        onMessage: (topic, msg, l) => this._onRelayMessage(msg, l),
        onClose: (l) => this._onRelayClosed(l)
      });
      link._measuredRtt = 0;
      this.relayLinks.push(link);
      link.connect([myTopic]);
    }
    if (role === 'client') {
      if (this.relayHelloTimer) clearInterval(this.relayHelloTimer);
      this.relayHelloTimer = setInterval(() => {
        if (this.relayPeerReady) { clearInterval(this.relayHelloTimer); this.relayHelloTimer = null; return; }
        const now = Math.round(performance.now());
        for (const l of this.relayLinks) {
          if (l.ready) {
            l.publish(`${this._relayBase()}/h`, {
              f: this.relayId, k: 'hello', cts: now, rtt: l._measuredRtt || 0
            });
          }
        }
      }, 240);
    }
  }

  _stopRelay(sendBye) {
    if (this.relayHelloTimer) { clearInterval(this.relayHelloTimer); this.relayHelloTimer = null; }
    if (this.relayPickTimer) { clearTimeout(this.relayPickTimer); this.relayPickTimer = null; }
    this.relayCandidates = [];
    this.relayPendingPeer = null;
    if (sendBye && this.relayPeerReady && this.relayLink && this.relayPeerId) {
      try { this.relayLink.publish(this._relayPeerTopic(), { f: this.relayId, k: 'bye' }); } catch (_) {}
    }
    const links = this.relayLinks;
    this.relayLinks = [];
    for (const l of links) { l.onClose = null; l.close(); }
    this.relayLink = null;
    this.relayPeerId = null;
    this.relayPeerReady = false;
  }

  _onRelayReady(link) {
    if (this.role === 'host') {
      if (!this.isConnected()) {
        this.cb.onStatus(`Hosting ${this.roomCode} — waiting for player`, 'neutral', false);
      }
    } else if (!this.relayPeerReady) {
      link.publish(`${this._relayBase()}/h`, {
        f: this.relayId, k: 'hello', cts: Math.round(performance.now()), rtt: 0
      });
    }
  }

  _lockRelayLink(link) {
    this.relayLink = link;
    for (const l of this.relayLinks) {
      if (l !== link) { l.onClose = null; l.close(); }
    }
    this.relayLinks = [link];
  }

  _commitRelayHostPick() {
    this.relayPickTimer = null;
    const cands = this.relayCandidates.filter((c) => !c.link.closed);
    this.relayCandidates = [];
    const peer = this.relayPendingPeer;
    this.relayPendingPeer = null;
    if (!cands.length || this.relayPeerReady || this.role !== 'host') return;
    if (this.isConnected() && peer !== this.p2pPeerRid) return;
    cands.sort((a, b) => {
      const ar = a.rtt > 0 ? a.rtt : 9999;
      const br = b.rtt > 0 ? b.rtt : 9999;
      if (Math.abs(ar - br) > 20) return ar - br;
      const dt = a.arrivedAt - b.arrivedAt;
      if (Math.abs(dt) > 35) return dt;
      return RELAY_BROKERS.indexOf(a.link.url) - RELAY_BROKERS.indexOf(b.link.url);
    });
    const best = cands[0].link;
    this.relayPeerId = peer;
    this._lockRelayLink(best);
    this.relayPeerReady = true;
    best.publish(this._relayPeerTopic(), { f: this.relayId, k: 'welcome' });
    this._markConnected();
    this._startNativeP2PHost();
  }

  _onRelayMessage(msg, link) {
    if (!msg || typeof msg !== 'object' || !msg.f || msg.f === this.relayId) return;

    if (this.role === 'host') {
      if (msg.k === 'hello') {
        if (this.relayPeerReady) {
          if (msg.f === this.relayPeerId && link === this.relayLink) {
            link.publish(this._relayPeerTopic(), { f: this.relayId, k: 'welcome' });
          } else if (msg.f !== this.relayPeerId) {
            link.publish(`${this._relayBase()}/c/${msg.f}`, { f: this.relayId, k: 'busy' });
          }
          return;
        }
        if (this.isConnected() && msg.f !== this.p2pPeerRid) {
          link.publish(`${this._relayBase()}/c/${msg.f}`, { f: this.relayId, k: 'busy' });
          return;
        }
        // Echo probe timestamp so Client measures true 4-hop RTT on each broker
        if (typeof msg.cts === 'number' && !msg.rtt) {
          link.publish(`${this._relayBase()}/c/${msg.f}`, { f: this.relayId, k: 'hprobe', cts: msg.cts });
        }
        if (this.relayPendingPeer && this.relayPendingPeer !== msg.f) return;
        this.relayPendingPeer = msg.f;
        let cand = this.relayCandidates.find((c) => c.link === link);
        if (!cand) {
          cand = { link, arrivedAt: performance.now(), rtt: msg.rtt > 0 ? msg.rtt : 0 };
          this.relayCandidates.push(cand);
        } else if (msg.rtt > 0) {
          cand.rtt = msg.rtt;
        }
        // Fast shortcut if a sub-125ms broker completed its RTT probe; otherwise wait up to 420ms
        if (cand.rtt > 0 && cand.rtt <= 125 && this.relayPickTimer) {
          clearTimeout(this.relayPickTimer);
          this.relayPickTimer = setTimeout(() => this._commitRelayHostPick(), 65);
        } else if (!this.relayPickTimer) {
          this.relayPickTimer = setTimeout(() => this._commitRelayHostPick(), 420);
        }
        return;
      }
    } else if (msg.k === 'hprobe') {
      if (!this.relayPeerReady && link.ready && typeof msg.cts === 'number') {
        const rtt = Math.max(1, Math.round(performance.now() - msg.cts));
        link._measuredRtt = link._measuredRtt ? Math.round(link._measuredRtt * 0.4 + rtt * 0.6) : rtt;
        link.publish(`${this._relayBase()}/h`, {
          f: this.relayId, k: 'hello', cts: Math.round(performance.now()), rtt: link._measuredRtt
        });
      }
      return;
    } else if (msg.k === 'welcome') {
      if (this.relayPeerReady) return;
      this.relayPeerId = msg.f;
      this._lockRelayLink(link);
      this.relayPeerReady = true;
      if (this.relayHelloTimer) { clearInterval(this.relayHelloTimer); this.relayHelloTimer = null; }
      this._markConnected();
      return;
    } else if (msg.k === 'busy') {
      if (!this.isConnected()) {
        if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
        this._stopRelay(false);
        this.cb.onStatus('That room already has 2 players.', 'error', true);
      }
      return;
    }

    if (!this.relayPeerReady || msg.f !== this.relayPeerId) return;
    if (msg.k === 'd') {
      this._handleMessage(msg.p);
    } else if (msg.k === 'sig') {
      this._handleNativeSig(msg);
    } else if (msg.k === 'bye') {
      this.relayPeerReady = false;
      if (!this.isConnected()) {
        this.destroy();
        this.cb.onDisconnected('Opponent disconnected.');
      }
    }
  }

  _sendSig(s, data) {
    if (!this.relayPeerReady || !this.relayLink || this.relayLink.closed) return;
    this.relayLink.publish(this._relayPeerTopic(), { f: this.relayId, k: 'sig', s, ...data });
  }

  _closeNativeP2P() {
    if (this.nativeOfferTimer) { clearTimeout(this.nativeOfferTimer); this.nativeOfferTimer = null; }
    const oldFast = this.nativeFastDc;
    const oldCtrl = this.nativeCtrlDc;
    const oldPc = this.nativePc;
    this.nativeFastDc = null;
    this.nativeCtrlDc = null;
    this.nativePc = null;
    this.nativeIceQueue = [];
    this.nativeRemoteDescSet = false;
    if (oldFast) { try { oldFast.close(); } catch (_) {} }
    if (oldCtrl) { try { oldCtrl.close(); } catch (_) {} }
    if (oldPc) { try { oldPc.close(); } catch (_) {} }
  }

  _closePeerJsFallback() {
    const oldFast = this.fastConn;
    const oldConn = this.conn;
    this.fastConn = null;
    this.conn = null;
    if (oldFast) { try { oldFast.close(); } catch (_) {} }
    if (oldConn) { try { oldConn.close(); } catch (_) {} }
    if (this.peer) {
      const p = this.peer;
      this.peer = null;
      try { p.destroy(); } catch (_) {}
    }
  }

  _bindNativeDc(pc, dc, isFast) {
    if (isFast) this.nativeFastDc = dc;
    else this.nativeCtrlDc = dc;

    dc.onopen = () => {
      if (this.nativePc !== pc) return;
      if (isFast ? this.nativeFastDc !== dc : this.nativeCtrlDc !== dc) return;
      if (this.localPeerReady) { try { dc.close(); } catch (_) {} return; }
      if (this.nativeOfferTimer) { clearTimeout(this.nativeOfferTimer); this.nativeOfferTimer = null; }
      if (!isFast) {
        if (this.connectedFired && this.relayPeerReady) {
          this.cb.onStatus('Connected! (direct P2P)', 'connected', false);
        }
        this._markConnected();
        this._closePeerJsFallback();
      }
      this._resetPingAndProbe();
    };
    dc.onmessage = (ev) => {
      if (this.nativePc !== pc || this.localPeerReady) return;
      if (isFast ? this.nativeFastDc !== dc : this.nativeCtrlDc !== dc) return;
      try {
        const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        this._handleMessage(msg);
      } catch (_) {}
    };
    dc.onclose = () => {
      if (isFast && this.nativeFastDc === dc) this.nativeFastDc = null;
      if (!isFast && this.nativeCtrlDc === dc) {
        this.nativeCtrlDc = null;
        if (!this.isConnected() && this.connectedFired) {
          this.destroy();
          this.cb.onDisconnected('Opponent disconnected.');
        }
      }
    };
    dc.onerror = () => {
      if (isFast && this.nativeFastDc === dc) this.nativeFastDc = null;
      if (!isFast && this.nativeCtrlDc === dc) this.nativeCtrlDc = null;
    };
  }

  _createNativePc() {
    if (typeof RTCPeerConnection === 'undefined') return null;
    this._closeNativeP2P();
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
      this.nativePc = pc;
      pc.onicecandidate = (ev) => {
        if (ev.candidate && this.nativePc === pc && this.relayPeerReady && this.relayLink) {
          this._sendSig('ice', { c: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate });
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (this.nativePc !== pc) return;
        const st = pc.iceConnectionState;
        if ((st === 'failed' || st === 'closed') && !this._hasP2P()) {
          this._closeNativeP2P();
        }
      };
      return pc;
    } catch (_) {
      return null;
    }
  }

  async _startNativeP2PHost() {
    if (this.role !== 'host' || this.localPeerReady || this._hasP2P() || this.nativePc) return;
    const pc = this._createNativePc();
    if (!pc) return;
    try {
      const ctrlDc = pc.createDataChannel('ctrl', { ordered: true });
      const fastDc = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      this._bindNativeDc(pc, ctrlDc, false);
      this._bindNativeDc(pc, fastDc, true);
      const offer = await pc.createOffer();
      if (this.nativePc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.nativePc !== pc) return;
      this._sendSig('offer', { sdp: pc.localDescription.sdp });
      this.nativeOfferTimer = setTimeout(() => {
        this.nativeOfferTimer = null;
        if (this.nativePc === pc && !this.nativeRemoteDescSet && pc.localDescription) {
          this._sendSig('offer', { sdp: pc.localDescription.sdp });
        }
      }, 550);
    } catch (_) {
      if (this.nativePc === pc) this._closeNativeP2P();
    }
  }

  async _handleNativeSig(msg) {
    if (this.localPeerReady || this._hasP2P()) return;
    try {
      if (msg.s === 'offer' && this.role === 'client') {
        if (this.nativePc && this.nativeRemoteDescSet) return;
        const pc = this._createNativePc();
        if (!pc) return;
        pc.ondatachannel = (ev) => {
          if (this.nativePc !== pc) return;
          const dc = ev.channel;
          this._bindNativeDc(pc, dc, dc.label === 'fast');
        };
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        if (this.nativePc !== pc) return;
        this.nativeRemoteDescSet = true;
        for (const c of this.nativeIceQueue.splice(0)) {
          await pc.addIceCandidate(c).catch(() => {});
        }
        const ans = await pc.createAnswer();
        if (this.nativePc !== pc) return;
        await pc.setLocalDescription(ans);
        if (this.nativePc !== pc) return;
        this._sendSig('ans', { sdp: pc.localDescription.sdp });
      } else if (msg.s === 'ans' && this.role === 'host') {
        const pc = this.nativePc;
        if (!pc || this.nativeRemoteDescSet) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        if (this.nativePc !== pc) return;
        this.nativeRemoteDescSet = true;
        for (const c of this.nativeIceQueue.splice(0)) {
          await pc.addIceCandidate(c).catch(() => {});
        }
      } else if (msg.s === 'ice' && msg.c) {
        const pc = this.nativePc;
        if (!pc || !this.nativeRemoteDescSet) {
          this.nativeIceQueue.push(msg.c);
          return;
        }
        await pc.addIceCandidate(msg.c).catch(() => {});
      }
    } catch (_) {}
  }

  _onRelayClosed(link) {
    this.relayLinks = this.relayLinks.filter((l) => l !== link);
    if (link === this.relayLink) {
      const wasReady = this.relayPeerReady;
      this.relayLink = null;
      this.relayPeerReady = false;
      if (wasReady && !this.isConnected()) {
        this.destroy();
        this.cb.onDisconnected('Internet relay connection lost.');
      }
    }
  }

  resetRoundInput() {
    this.remoteInput = { seq: this.remoteInput.seq || 0, l: false, r: false, j: false, jump: false, holdMs: 0 };
    this.remoteInputAt = 0;
    this.lastHostP1Input = { l: false, r: false, jump: false, holdMs: 0 };
    this.hostInputPredictTicks = 0;
    this.releaseBurstLeft = 0;
    this.lastInputSent = { l: false, r: false, j: false };
    this.prevClientJ = false;
    this.pendingRemoteJumpTicks = 0;
    this._latestRemoteJ = false;
    this.pendingInputs = [];
  }

  resetPredictionState(nextEpoch = null) {
    if (typeof nextEpoch === 'number') this.matchEpoch = nextEpoch;
    this.remoteInput = { seq: 0, l: false, r: false, j: false, jump: false, holdMs: 0 };
    this.remoteInputAt = 0;
    this.lastHostP1Input = { l: false, r: false, jump: false, holdMs: 0 };
    this.hostInputPredictTicks = 0;
    this.inputSeq = 0;
    this.inputSendTick = 0;
    this.releaseBurstLeft = 0;
    this.lastInputSent = { l: false, r: false, j: false };
    this.jumpPressCount = 0;
    this.prevClientJ = false;
    this.lastRemoteJumpCount = 0;
    this.pendingRemoteJumpTicks = 0;
    this._latestRemoteJ = false;
    this.pendingInputs = [];
    this.pendingSnapshot = null;
    this.lastSeq = 0;
    this.lastSnapPhase = '';
    this.lastSnapDeadMask = -1;
    this.rxSnapLastSq = 0;
    this.rxSnapExpected = 0;
    this.rxSnapRecv = 0;
    this.pktLossPct = 0;
  }

  tickHostWatchdog() {
    const isRelay = this.transportName() === 'relay';
    const staleLimit = (isRelay || this.pingMs > 120)
      ? clamp((this.pingMs || 180) * 2.5, 520, 1400)
      : 460;
    if ((this.remoteInput.l || this.remoteInput.r || this.remoteInput.j) && this.remoteInputAt > 0) {
      if (performance.now() - this.remoteInputAt > staleLimit) {
        this.remoteInput.l = false;
        this.remoteInput.r = false;
        this.remoteInput.j = false;
        this.remoteInput.jump = false;
        this.remoteInput.holdMs = 0;
        this._latestRemoteJ = false;
        this.pendingRemoteJumpTicks = 0;
      }
    }
    if (this.pendingRemoteJumpTicks > 0) {
      this.remoteInput.j = true;
      this.remoteInput.jump = true;
      this.pendingRemoteJumpTicks -= 1;
    } else if (!this._latestRemoteJ && (this.remoteInput.j || this.remoteInput.jump)) {
      this.remoteInput.j = false;
      this.remoteInput.jump = false;
    }
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
    this._closeNativeP2P();
    this._stopRelay(true);
    this._closePeerJsFallback();
    this.role = null;
    this.connectedFired = false;
    this.p2pPeerRid = null;
    this.pendingReliable.clear();
    this.seenEids.clear();
    this.matchEpoch = 1;
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
    this.lastRemoteAt = performance.now();
    const via = this.transportName();
    const label = via === 'relay' ? ' (internet relay)' : via === 'p2p' ? ' (direct P2P)' : '';
    this.cb.onStatus(`Connected!${label}`, 'connected', false);
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

    // Internet relay runs in parallel with WebRTC: whichever connects first wins,
    // and a later direct P2P DataChannel automatically takes over sending.
    this._startRelay();

    const startPeer = (PeerCtor) => {
      if (this.peer || this.localPeerReady || this.role !== prevRole || this.roomCode !== prevCode) return;
      const opts = {
        debug: 0,
        config: { iceServers: ICE_SERVERS }
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
        // Direct P2P unavailable (signaling blocked / host unreachable): keep waiting on the relay
        if (this._relayAlive()) return;
        if (this.dialTimer) { clearTimeout(this.dialTimer); this.dialTimer = null; }
        const msg = (err && err.type === 'peer-unavailable')
          ? 'Room not found or Host disconnected.'
          : `Connection error: ${(err && (err.type || err.message)) || 'unknown'}`;
        this.cb.onStatus(msg, 'error', true);
      });
    };

    if (typeof window.Peer !== 'undefined') {
      startPeer(window.Peer);
    } else if (typeof document !== 'undefined') {
      const peerTag = document.querySelector('script[src*="peerjs"]');
      if (peerTag) {
        peerTag.addEventListener('load', () => {
          if (typeof window.Peer !== 'undefined') startPeer(window.Peer);
        }, { once: true });
      }
    }
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
        if (conn.label === 'fast' || conn.reliable === false) {
          this._attachFastConnection(conn);
          return;
        }
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
      const conn = this.peer.connect(PEER_PREFIX + normalized, {
        label: 'ctrl',
        serialization: 'json',
        reliable: true,
        metadata: { rid: this.relayId }
      });
      this._attachConnection(conn);
      const fastConn = this.peer.connect(PEER_PREFIX + normalized, {
        label: 'fast',
        serialization: 'json',
        reliable: false,
        metadata: { rid: this.relayId }
      });
      this._attachFastConnection(fastConn);
    });
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = setTimeout(() => {
      this.dialTimer = null;
      if (!this.isConnected()) {
        this._stopRelay(false);
        if (this.peer) { try { this.peer.destroy(); } catch (_) {} this.peer = null; }
        this.cb.onStatus('Room not found. Check the code and make sure the host is waiting.', 'error', true);
      }
    }, JOIN_TIMEOUT_MS);
  }

  _attachFastConnection(conn) {
    if (!conn) return;
    if (this.fastConn && this.fastConn !== conn) {
      try { this.fastConn.close(); } catch (_) {}
    }
    this.fastConn = conn;
    conn.on('data', (msg) => {
      if (this.fastConn !== conn || this.localPeerReady) return;
      this._handleMessage(msg);
    });
    conn.on('close', () => { if (this.fastConn === conn) this.fastConn = null; });
    conn.on('error', () => { if (this.fastConn === conn) this.fastConn = null; });
  }

  _attachConnection(conn) {
    this.conn = conn;
    if (this.role === 'host' && conn.metadata && conn.metadata.rid) this.p2pPeerRid = conn.metadata.rid;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      if (this.localPeerReady || (this.nativeCtrlDc && this.nativeCtrlDc.readyState === 'open')) {
        try { conn.close(); } catch (_) {}
        return;
      }
      if (this.connectedFired && this.relayPeerReady) {
        this.cb.onStatus('Connected! (upgraded to direct P2P)', 'connected', false);
      }
      this._markConnected();
      this._resetPingAndProbe();
    });
    conn.on('iceStateChanged', (state) => {
      if (this.conn !== conn) return;
      if (state === 'failed' && !this.isConnected()) {
        if (this._relayAlive()) return; // relay fallback will carry the match
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
      if (this.relayPeerReady) { this.conn = null; return; } // keep playing over relay
      this.destroy();
      this.cb.onDisconnected('Opponent disconnected.');
    });
    conn.on('error', () => {
      if (this.conn !== conn || this.localPeerReady) return;
      if (this.relayPeerReady) { this.conn = null; return; }
      this.destroy();
      this.cb.onDisconnected('Peer connection lost.');
    });
  }

  _sendPing() {
    if (!this.isConnected()) return;
    const tr = this.localPeerReady ? 3 : (this._hasP2P() ? 2 : 1);
    this._sendRaw({ t: 'ping', ts: performance.now(), v: tr }, true);
  }

  _resetPingAndProbe() {
    this.pingMs = 0;
    this._sendPing();
  }

  _startTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this._sendPing();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return;
      if (!this.localPeerReady && performance.now() - this.lastRemoteAt > PEER_SILENCE_TIMEOUT_MS) {
        this.destroy();
        this.cb.onDisconnected('Opponent connection lost.');
        return;
      }
      this._sendPing();
    }, 1000);

    if (this.reliableTimer) clearInterval(this.reliableTimer);
    this.reliableTimer = setInterval(() => {
      if (!this.isConnected() || this.pendingReliable.size === 0) return;
      const now = performance.now();
      const retryMs = Math.max(150, (this.pingMs || 80) + 70);
      for (const [eid, entry] of this.pendingReliable.entries()) {
        if (entry.attempts >= 30) {
          this.pendingReliable.delete(eid);
          continue;
        }
        if (now - entry.lastSent >= retryMs) {
          entry.lastSent = now;
          entry.attempts += 1;
          this._sendRaw(entry.msg);
        }
      }
    }, 100);
  }

  sendReliable(type, payload = {}) {
    if (!this.isConnected()) return;
    const eid = ++this.nextEvtId;
    const msg = { t: type, _eid: eid, ...payload };
    this.pendingReliable.set(eid, { msg, lastSent: performance.now(), attempts: 1 });
    this._sendRaw(msg);
  }

  _handleMessage(raw) {
    const msg = decodeWireMsg(raw);
    if (!msg || typeof msg !== 'object') return;
    this.lastRemoteAt = performance.now();
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
        if (this.isConnected()) this._sendRaw({ t: 'pong', ts: msg.ts, v: msg.v || 0 }, true);
        break;
      case 'pong': {
        const curTr = this.localPeerReady ? 3 : (this._hasP2P() ? 2 : 1);
        if (msg.v && msg.v !== curTr) break;
        const rtt = Math.max(1, Math.round(performance.now() - msg.ts));
        if (rtt > 5000) break;
        this.pingMs = this.pingMs > 0 ? Math.round(this.pingMs * 0.35 + rtt * 0.65) : rtt;
        this.cb.onPing(this.pingMs);
        break;
      }
      case 'input': {
        if (typeof msg.ep === 'number' && msg.ep !== this.matchEpoch) return;
        const seq = msg.seq || 0;
        const jc = msg.jc || 0;
        if (jc > this.lastRemoteJumpCount) {
          this.lastRemoteJumpCount = jc;
          this.pendingRemoteJumpTicks = Math.max(this.pendingRemoteJumpTicks, 1);
        }
        if (seq >= this.remoteInput.seq || seq === 0) {
          this._latestRemoteJ = !!msg.j;
          const effJ = this._latestRemoteJ || this.pendingRemoteJumpTicks > 0;
          this.remoteInput = { seq, l: !!msg.l, r: !!msg.r, j: effJ, jump: effJ, holdMs: msg.holdMs || 0 };
          this.remoteInputAt = performance.now();
        }
        break;
      }
      case 'match_start':
        if (typeof msg.ep === 'number' && msg.ep < this.matchEpoch) return;
        this.resetPredictionState(typeof msg.ep === 'number' ? msg.ep : this.matchEpoch);
        this.cb.onMatchStart(msg.ai || 0, idxToModel(msg.m1), idxToModel(msg.m2));
        break;
      case 'request_start':
        if (this.role === 'host' && this.cb.onStartRequested) this.cb.onStartRequested();
        break;
      case 'snap': {
        if (!Number.isFinite(msg.sq)) return;
        if (typeof msg.ep === 'number') {
          if (msg.ep < this.matchEpoch) return;
          if (msg.ep > this.matchEpoch) {
            this.resetPredictionState(msg.ep);
          }
        }
        if (msg.sq <= this.lastSeq) return;
        if (this.rxSnapLastSq > 0 && msg.sq > this.rxSnapLastSq) {
          this.rxSnapExpected += (msg.sq - this.rxSnapLastSq);
          this.rxSnapRecv += 1;
          if (this.rxSnapExpected >= 25) {
            this.pktLossPct = Math.max(0, Math.round(((this.rxSnapExpected - this.rxSnapRecv) / this.rxSnapExpected) * 100));
            this.rxSnapExpected *= 0.5;
            this.rxSnapRecv *= 0.5;
          }
        }
        this.rxSnapLastSq = msg.sq;
        this.lastSeq = msg.sq;
        this.pendingSnapshot = msg;
        if (this.cb.onSnapshotPacket) this.cb.onSnapshotPacket(msg);
        break;
      }
      case 'evt':
        if (msg.kind === 'rematch_start') {
          this.resetPredictionState(typeof msg.ep === 'number' ? msg.ep : (this.matchEpoch + 1));
        }
        this.cb.onGameEvent(msg);
        break;
      case 'rematch':
        this.cb.onRematchSignal();
        break;
    }
  }

  flushClientRelease() {
    if (!this.isConnected()) return;
    if (this.lastInputSent.l || this.lastInputSent.r || this.lastInputSent.j) {
      const seq = ++this.inputSeq;
      const pl = this.lastInputSent.l, pr = this.lastInputSent.r, pj = this.lastInputSent.j;
      this.lastInputSent = { l: false, r: false, j: false };
      this.prevClientJ = false;
      this.releaseBurstLeft = 3;
      this._sendRaw({
        t: 'input', ep: this.matchEpoch, seq,
        l: false, r: false, j: false, pl, pr, pj,
        jc: this.jumpPressCount, holdMs: 0
      }, true);
    }
  }

  queueClientInput(inp) {
    const seq = ++this.inputSeq;
    const l = !!(inp && inp.l);
    const r = !!(inp && inp.r);
    const j = !!(inp && inp.jump);
    const holdMs = (inp && inp.holdMs) || 0;
    const risingJump = j && !this.prevClientJ;
    if (risingJump) this.jumpPressCount++;
    this.prevClientJ = j;

    const cmd = { seq, l, r, j, jump: j, holdMs };
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > 75) this.pendingInputs.shift();

    if (this.isConnected()) {
      this.inputSendTick++;
      const changed = l !== this.lastInputSent.l || r !== this.lastInputSent.r || j !== this.lastInputSent.j;
      if (changed && !l && !r && !j) this.releaseBurstLeft = 3;
      const relayOnly = this.transportName() === 'relay';
      const heldSend = (l || r || j) && (this.inputSendTick % (relayOnly ? 3 : 2) === 0);
      const releaseEcho = !l && !r && !j && this.releaseBurstLeft > 0;
      const idleHeartbeat = this.inputSendTick % (relayOnly ? 8 : 4) === 0;
      if (changed || risingJump || heldSend || releaseEcho || idleHeartbeat) {
        if (releaseEcho) this.releaseBurstLeft--;
        const pl = this.lastInputSent.l, pr = this.lastInputSent.r, pj = this.lastInputSent.j;
        this.lastInputSent = { l, r, j };
        this._sendRaw({
          t: 'input', ep: this.matchEpoch, seq,
          l, r, j, pl, pr, pj,
          jc: this.jumpPressCount, holdMs
        }, true);
      }
    }
    return cmd;
  }

  sendMatchStart(arenaIndex, p1Model = 'roadster', p2Model = 'roadster') {
    const nextEp = this.matchEpoch + 1;
    this.resetPredictionState(nextEp);
    this.sendReliable('match_start', {
      ai: arenaIndex,
      ep: nextEp,
      m1: modelToIdx(p1Model),
      m2: modelToIdx(p2Model)
    });
  }

  sendRematchStart(arenaIndex, p1Model = 'roadster', p2Model = 'roadster') {
    const nextEp = this.matchEpoch + 1;
    this.resetPredictionState(nextEp);
    this.sendReliable('evt', {
      kind: 'rematch_start',
      ai: arenaIndex,
      ep: nextEp,
      m1: modelToIdx(p1Model),
      m2: modelToIdx(p2Model)
    });
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
    const pack = (b) => [
      Math.round(b.position.x * 10) / 10,
      Math.round(b.position.y * 10) / 10,
      Math.round(b.velocity.x * 100) / 100,
      Math.round(b.velocity.y * 100) / 100,
      Math.round(b.angle * 1000) / 1000,
      Math.round(b.angularVelocity * 1000) / 1000
    ];
    const p1 = meta.p1Input;
    const payload = {
      t: 'snap',
      ep: this.matchEpoch,
      sq: this.lastSeq,
      ak: this.remoteInput.seq,
      ai: sim.arenaIndex,
      m1: modelToIdx(sim.p1Model),
      m2: modelToIdx(sim.p2Model),
      sc: [meta.scores[0], meta.scores[1]],
      rn: meta.roundNumber,
      ph: meta.phase,
      bt: meta.bannerText,
      rt: Math.round(sim.roundElapsedMs),
      wy: Math.round(sim.waterCrestY * 10) / 10,
      i1: p1 ? [p1.l ? 1 : 0, p1.r ? 1 : 0, p1.holdMs || 0, p1.jump ? 1 : 0] : [0, 0, 0, 0],
      d1: sim.p1Car.dead ? 1 : 0,
      d2: sim.p2Car.dead ? 1 : 0,
      dr1: sim.p1Car.driving ? 1 : 0,
      dr2: sim.p2Car.driving ? 1 : 0,
      hm1: Math.round(sim.p1Car.accelHoldMs || 0),
      hm2: Math.round(sim.p2Car.accelHoldMs || 0),
      ad1: sim.p1Car.accelDir || 0,
      ad2: sim.p2Car.accelDir || 0,
      lj1: Math.round(sim.p1Car.lastJumpAtMs || -99999),
      lj2: Math.round(sim.p2Car.lastJumpAtMs || -99999),
      sw: sim.seesaws.map((s) => [
        Math.round(s.body.angle * 1000) / 1000,
        Math.round(s.body.angularVelocity * 1000) / 1000
      ])
    };
    for (const [carKey, bodyKey, shortKey] of BODY_KEYS) {
      payload[shortKey] = pack(sim[carKey][bodyKey]);
    }
    return payload;
  }

  sendHostSnapshot(sim, meta) {
    if (!this.isConnected()) return;
    const via = this.transportName();
    const deadMask = (sim.p1Car?.dead ? 1 : 0) | (sim.p2Car?.dead ? 2 : 0);
    const important = meta.phase !== this.lastSnapPhase || deadMask !== this.lastSnapDeadMask;
    if (via === 'p2p') {
      const dc = (this.nativeFastDc && this.nativeFastDc.readyState === 'open')
        ? this.nativeFastDc
        : (this.nativeCtrlDc && this.nativeCtrlDc.readyState === 'open')
          ? this.nativeCtrlDc
          : (() => {
            const ch = (this.fastConn && this.fastConn.open) ? this.fastConn : this.conn;
            return ch ? (ch.dataChannel || ch._dc) : null;
          })();
      if (dc && dc.bufferedAmount > 20480) return;
    } else if (via === 'relay') {
      // ~21Hz compact wire snapshots during fight, ~10Hz in static phases unless state changes
      const now = performance.now();
      const interval = meta.phase === 'FIGHT' ? 48 : 95;
      if (!important && now - this.lastRelaySnapAt < interval) return;
      if (this.relayLink && this.relayLink.bufferedAmount() > 24576) return;
      this.lastRelaySnapAt = now;
    }
    this.lastSnapPhase = meta.phase;
    this.lastSnapDeadMask = deadMask;
    this._sendRaw(this.buildHostSnapshot(sim, meta), true);
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
    if (Array.isArray(snap.i1)) {
      this.lastHostP1Input = { l: !!snap.i1[0], r: !!snap.i1[1], holdMs: snap.i1[2] || 0, jump: !!snap.i1[3] };
    } else {
      this.lastHostP1Input = snap.i1 || { l: false, r: false, jump: false, holdMs: 0 };
    }
    this.hostInputPredictTicks = 0;

    const beforeP1 = sim.captureCarPose(sim.p1Car);
    const beforeP2 = sim.captureCarPose(sim.p2Car);

    // Step 1: Snap rigid bodies + water height to authoritative host snapshot
    sim.applyNetState(snap);

    // Step 2: Rewind/replay unacknowledged local client inputs scaled dynamically to actual RTT
    const estRttTicks = this.pingMs > 0 ? clamp(Math.round(this.pingMs / 16.7), 2, 28) : 4;
    const oneWayTicks = clamp(Math.round(estRttTicks * 0.5), 1, 14);
    if (snap.ph === 'FIGHT' && this.pendingInputs.length > 0) {
      const hasActiveInput = this.pendingInputs.some((c) => c.l || c.r || c.j);
      const replayCap = hasActiveInput ? clamp(estRttTicks + 4, 12, 30) : clamp(oneWayTicks + 2, 3, 14);
      const maxReplay = Math.min(this.pendingInputs.length, replayCap);
      const startIdx = this.pendingInputs.length - maxReplay;
      const p1HoldLimit = (!sim.p1Car?.dead && !sim.p2Car?.dead) ? clamp(Math.round(oneWayTicks * 0.75), 2, 7) : 3;
      const coast = { l: false, r: false, jump: false, holdMs: 0 };
      const savedOnJump = sim.onJump;
      sim.onJump = null;
      for (let i = startIdx; i < this.pendingInputs.length; i++) {
        const p1Step = (i - startIdx) < p1HoldLimit ? this.lastHostP1Input : coast;
        sim.step(p1Step, this.pendingInputs[i], true, false);
      }
      sim.onJump = savedOnJump;
    }

    // Step 3: Progressive error convergence scaled to jitter without cycling teleports
    const smoothErr = (car, beforePose) => {
      if (!beforePose || !car || snap.ph !== 'FIGHT') return;
      const err = Math.hypot(car.chassis.position.x - beforePose.c.x, car.chassis.position.y - beforePose.c.y);
      if (err > 0.05 && err < 115) {
        const alpha = err < 6 ? 0.25 : err < 26 ? 0.42 : 0.65;
        sim.blendCarPose(car, beforePose, alpha);
      }
    };
    smoothErr(sim.p2Car, beforeP2);
    smoothErr(sim.p1Car, beforeP1);
    return true;
  }
}
