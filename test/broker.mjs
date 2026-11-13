// A local MQTT broker with a WebSocket listener, for testing the relay transport without the internet.
import http from 'node:http';
import { Aedes } from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';

// delay (ms) holds every published message back before it is passed on, to stand in for the
// distance to a real public relay (about 0.25 to 0.3 s one way from Korea, measured 2026-11-14).
export async function startBroker(port = 0, { delay = 0 } = {}) {
  const aedes = await Aedes.createBroker();
  if (delay > 0) aedes.authorizePublish = (client, packet, cb) => { setTimeout(() => cb(null), delay); };
  const stats = { pub: [], errors: [], clients: 0 };
  aedes.on('publish', (packet, client) => {
    if (client) stats.pub.push({ topic: packet.topic, from: client.id, bytes: packet.payload.length, at: Date.now() });
  });
  aedes.on('client', () => { stats.clients++; });
  aedes.on('clientError', (c, err) => stats.errors.push(`clientError ${c && c.id}: ${err.message}`));
  aedes.on('connectionError', (c, err) => stats.errors.push(`connectionError: ${err.message}`));

  let httpServer = null;
  let wss = null;
  let socks = new Set();
  let at = port;
  const listen = async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ server: httpServer, handleProtocols: (protocols) => (protocols.has('mqtt') ? 'mqtt' : false) });
    socks = new Set();
    wss.on('connection', (ws, req) => {
      socks.add(ws);
      ws.on('close', () => socks.delete(ws));
      ws.on('error', () => {});
      const stream = createWebSocketStream(ws);
      stream.on('error', () => {});
      aedes.handle(stream, req);
    });
    await new Promise((r) => httpServer.listen(at, '127.0.0.1', r));
    at = httpServer.address().port;
  };
  await listen();

  return {
    get url() { return `ws://127.0.0.1:${at}`; },
    get port() { return at; },
    aedes,
    stats,
    // send something to every subscriber as if a stranger had published it
    inject(topic, payload, retain = false) {
      return new Promise((r) => aedes.publish({ cmd: 'publish', topic, payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), qos: 0, retain }, r));
    },
    // drop every connection abruptly, keep listening
    kick() {
      for (const s of socks) s.terminate();
    },
    // go dark: connections die and new ones are refused
    async down() {
      for (const s of socks) s.terminate();
      wss.close();
      await new Promise((r) => httpServer.close(r));
      httpServer = null;
    },
    async up() {
      if (!httpServer) await listen();
    },
    async stop() {
      if (httpServer) await this.down();
      await new Promise((r) => aedes.close(r));
    },
  };
}
