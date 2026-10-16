'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { attach } = require('./ws.js');
const { Game } = require('./game.js');
const { COLORS, MAPS } = require('./public/data.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
});

/* ---------- rooms ---------- */
const rooms = new Map();
let nextId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } }
const cleanName = (n, fb) => (String(n || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14)) || fb;
const send = (conn, msg) => { if (conn && !conn.closed) conn.send(JSON.stringify(msg)); };

function makeRoom(code) {
  const room = { code, host: null, conns: new Map(), info: new Map(), order: [], inMatch: false,
    settings: { target: 5, cards: 'losers', maps: MAPS.map((m, i) => i) } };
  room.game = new Game((id, msg) => send(room.conns.get(id), msg));
  return room;
}
function roomMsg(room) {
  return { t: 'room', code: room.code, host: room.host, settings: room.settings, inMatch: room.inMatch,
    players: room.order.map(id => room.info.get(id)) };
}
function broadcast(room, msg) { const s = JSON.stringify(msg); for (const c of room.conns.values()) if (!c.closed) c.send(s); }
function pushRoom(room) { broadcast(room, roomMsg(room)); }

function addToRoom(room, conn, name) {
  const used = new Set([...room.info.values()].map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[0];
  room.conns.set(conn.id, conn); room.order.push(conn.id);
  room.info.set(conn.id, { id: conn.id, name: cleanName(name, 'Player ' + room.order.length), color, type: 'stick' });
  if (!room.host) room.host = conn.id;
  conn.room = room;
  send(conn, { t: 'joined', id: conn.id, code: room.code });
  pushRoom(room);
}

function leave(conn) {
  const room = conn.room; if (!room) return;
  conn.room = null;
  room.conns.delete(conn.id); room.info.delete(conn.id); room.order = room.order.filter(id => id !== conn.id);
  if (room.inMatch) {
    room.game.removePlayer(conn.id);
    const left = room.game.players.filter(p => p.connected);
    if (left.length < 2 && room.game.phase !== 'end') { room.game.phase = 'end'; room.game.winner = left[0] ? left[0].id : null; room.game.cp = null; }
  }
  if (!room.conns.size) { rooms.delete(room.code); return; }
  if (room.host === conn.id) room.host = room.order[0];
  pushRoom(room);
}

function handle(conn, m) {
  if (!m || typeof m !== 'object') return;
  const room = conn.room;
  switch (m.t) {
    case 'create': {
      if (room) return;
      const r = makeRoom(newCode()); rooms.set(r.code, r); addToRoom(r, conn, m.name); break;
    }
    case 'join': {
      if (room) return;
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(conn, { t: 'err', m: 'No room with that code.' });
      if (r.inMatch) return send(conn, { t: 'err', m: 'That match has already started.' });
      if (r.order.length >= 4) return send(conn, { t: 'err', m: 'That room is full (4 players).' });
      addToRoom(r, conn, m.name); break;
    }
    case 'profile': {
      if (!room || room.inMatch) return;
      const me = room.info.get(conn.id);
      if (typeof m.name === 'string') me.name = cleanName(m.name, me.name);
      if (m.type === 'stick' || m.type === 'blob') me.type = m.type;
      if (typeof m.color === 'string' && COLORS.includes(m.color) && ![...room.info.values()].some(p => p.id !== conn.id && p.color === m.color)) me.color = m.color;
      pushRoom(room); break;
    }
    case 'settings': {
      if (!room || room.host !== conn.id) return;
      const s = room.settings;
      if (!room.inMatch && [3, 5, 7].includes(m.target)) s.target = m.target;
      if (['off', 'losers', 'everyone'].includes(m.cards)) s.cards = m.cards;
      if (Array.isArray(m.maps)) { const mm = [...new Set(m.maps.filter(i => Number.isInteger(i) && MAPS[i]))]; if (mm.length) s.maps = mm; }
      if (room.inMatch) { room.game.settings.cards = s.cards; room.game.settings.maps = s.maps; }
      pushRoom(room); break;
    }
    case 'start': {
      if (!room || room.host !== conn.id || room.inMatch) return;
      if (room.order.length < 2) return send(conn, { t: 'err', m: 'You need at least 2 players to start.' });
      room.inMatch = true;
      room.game.start(room.order.map(id => room.info.get(id)), JSON.parse(JSON.stringify(room.settings)));
      pushRoom(room); break;
    }
    case 'in': if (room && room.inMatch) room.game.setInput(conn.id, m); break;
    case 'pick': if (room && room.inMatch) room.game.pickCard(conn.id, m.i | 0); break;
    case 'lobby': {
      if (!room || room.host !== conn.id) return;
      room.inMatch = false; room.game.reset(); pushRoom(room); break;
    }
    case 'kick': {
      if (!room || room.host !== conn.id || room.inMatch) return;
      const t = room.conns.get(m.id); if (t && t !== conn) { send(t, { t: 'err', m: 'The host removed you from the room.' }); t.close(); } break;
    }
    default: break;
  }
}

attach(server, conn => {
  conn.id = 'p' + (nextId++); conn.room = null;
  conn.on('message', raw => { if (raw.length > 4096) return; let m; try { m = JSON.parse(raw); } catch (e) { return; } handle(conn, m); });
  conn.on('close', () => leave(conn));
});

let last = Date.now(), tick = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(.05, (now - last) / 1000); last = now; tick++;
  for (const room of rooms.values()) {
    if (!room.inMatch) continue;
    room.game.step(dt);
    if (tick % 2 === 0) broadcast(room, room.game.snapshot());
  }
}, 1000 / 60);
setInterval(() => { for (const room of rooms.values()) for (const c of room.conns.values()) c.ping(); }, 25000);

server.listen(PORT, () => console.log('Last Stick Standing running on port ' + PORT));
module.exports = { server };
