// Minimal MQTT 3.1.1 (QoS 0) client over secure WebSockets.
// Used as an internet relay fallback so two players on completely different
// networks (mobile data / CGNAT / symmetric NAT / strict firewalls) can always
// play, even when a direct WebRTC peer-to-peer path cannot be established.

// Ordered by preference (measured latency / delivery reliability). The host
// picks the most preferred broker on which the joining player's hello arrived.
export const RELAY_BROKERS = Object.freeze([
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
]);

const enc = new TextEncoder();
const dec = new TextDecoder();

function encodeLength(len) {
  const out = [];
  do {
    let byte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) byte |= 0x80;
    out.push(byte);
  } while (len > 0);
  return out;
}

function utf8Field(str) {
  const b = enc.encode(str);
  return [b.length >> 8, b.length & 0xff, ...b];
}

function packet(typeByte, body) {
  const head = [typeByte, ...encodeLength(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

export class MqttRelayLink {
  constructor(url, clientId, { onReady, onMessage, onClose }) {
    this.url = url;
    this.clientId = clientId;
    this.onReady = onReady;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
    this.ready = false;
    this.closed = false;
    this.buf = new Uint8Array(0);
    this.subs = [];
    this.pingTimer = null;
    this.nextPid = 1;
  }

  connect(topics) {
    this.subs = topics;
    try {
      this.ws = new WebSocket(this.url, ['mqtt']);
    } catch (_) {
      this._shutdown();
      return;
    }
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      const body = [
        ...utf8Field('MQTT'),
        0x04,             // protocol level 3.1.1
        0x02,             // clean session
        0x00, 0x1e,       // keep-alive 30s
        ...utf8Field(this.clientId)
      ];
      this._write(packet(0x10, body));
    };
    this.ws.onmessage = (ev) => this._onData(new Uint8Array(ev.data));
    this.ws.onerror = () => this._shutdown();
    this.ws.onclose = () => this._shutdown();
  }

  _write(bytes) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(bytes);
      return true;
    } catch (_) {
      return false;
    }
  }

  bufferedAmount() {
    return this.ws ? this.ws.bufferedAmount : 0;
  }

  publish(topic, obj) {
    if (!this.ready) return false;
    const payload = enc.encode(JSON.stringify(obj));
    const t = utf8Field(topic);
    const body = new Uint8Array(t.length + payload.length);
    body.set(t, 0);
    body.set(payload, t.length);
    return this._write(packet(0x30, body));
  }

  _onData(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    while (this.buf.length >= 2) {
      let mult = 1;
      let len = 0;
      let i = 1;
      let byte;
      do {
        if (i >= this.buf.length) return; // incomplete length
        byte = this.buf[i++];
        len += (byte & 0x7f) * mult;
        mult *= 128;
      } while (byte & 0x80);
      if (this.buf.length < i + len) return; // incomplete packet
      const type = this.buf[0] >> 4;
      const body = this.buf.subarray(i, i + len);
      this._handlePacket(type, body);
      this.buf = this.buf.slice(i + len);
    }
  }

  _handlePacket(type, body) {
    if (type === 2) { // CONNACK
      if (body[1] !== 0) { this._shutdown(); return; }
      const sub = [];
      const pid = this.nextPid++;
      sub.push(pid >> 8, pid & 0xff);
      for (const topic of this.subs) sub.push(...utf8Field(topic), 0x00);
      this._write(packet(0x82, sub));
      return;
    }
    if (type === 9) { // SUBACK
      if (this.ready) return;
      this.ready = true;
      this.readyAt = performance.now();
      this.pingTimer = setInterval(() => this._write(new Uint8Array([0xc0, 0x00])), 20000);
      if (this.onReady) this.onReady(this);
      return;
    }
    if (type === 3) { // PUBLISH (QoS 0)
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.subarray(2, 2 + tlen));
      let msg = null;
      try { msg = JSON.parse(dec.decode(body.subarray(2 + tlen))); } catch (_) { return; }
      if (this.onMessage) this.onMessage(topic, msg, this);
    }
  }

  _shutdown() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
      try { this.ws.close(); } catch (_) {}
    }
    if (this.onClose) this.onClose(this);
  }

  close() {
    if (this.ws && this.ws.readyState === 1) this._write(new Uint8Array([0xe0, 0x00])); // DISCONNECT
    this._shutdown();
  }
}
