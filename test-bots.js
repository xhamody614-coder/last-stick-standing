// Headless smoke test: 4 bot clients play a full match against the real server.
process.env.PORT = 3111;
const { server } = require('./server.js');
const url = 'ws://127.0.0.1:3111';
const mkClient = (name) => new Promise(res => {
  const ws = new WebSocket(url); const c = { ws, name, id: null, snap: null, room: null, opts: null, phases: new Set(), cardsSeen: 0, err: [] };
  ws.onopen = () => res(c);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') { c.id = m.id; c.code = m.code; }
    else if (m.t === 'room') c.room = m;
    else if (m.t === 'err') c.err.push(m.m);
    else if (m.t === 'cardopts') { c.opts = m.opts; c.cardsSeen++; setTimeout(() => ws.send(JSON.stringify({ t: 'pick', i: 0 })), 300); }
    else if (m.t === 'snap') { c.snap = m; c.phases.add(m.ph); }
  };
});
const send = (c, m) => c.ws.send(JSON.stringify(m));
(async () => {
  const cs = [];
  for (let i = 0; i < 4; i++) cs.push(await mkClient('Bot' + i));
  send(cs[0], { t: 'create', name: 'Host' }); await new Promise(r => setTimeout(r, 200));
  for (let i = 1; i < 4; i++) { send(cs[i], { t: 'join', code: cs[0].code, name: 'Bot' + i }); await new Promise(r => setTimeout(r, 100)); }
  send(cs[1], { t: 'profile', type: 'blob' }); send(cs[3], { t: 'profile', type: 'blob', color: '#ffd447' });
  send(cs[0], { t: 'settings', target: 3, cards: 'losers' });
  // a 5th client should be rejected
  const extra = await mkClient('X'); send(extra, { t: 'join', code: cs[0].code }); await new Promise(r => setTimeout(r, 200));
  console.log('room players', cs[0].room.players.map(p => p.name + ':' + p.type + ':' + p.color).join(' | '), '| extra err:', extra.err);
  send(cs[0], { t: 'start' }); await new Promise(r => setTimeout(r, 100));
  const t0 = Date.now(); let ended = false, rounds = 0, lastRd = 0;
  const timer = setInterval(() => {
    for (const c of cs) {
      const s = c.snap; if (!s) continue;
      const me = s.pl.find(p => p.id === c.id); if (!me || !me.al) { send(c, { t: 'in', l: 0, r: 0, j: 0, f: 0, a: 0 }); continue; }
      let best = null, bd = 1e9; for (const o of s.pl) if (o.id !== c.id && o.al) { const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      let tx = best.x, ty = best.y, keep = me.w ? 220 : 26;
      if (!me.w && s.cr.length) { const cr = s.cr.reduce((a, b) => Math.abs(b[1] - me.x) < Math.abs(a[1] - me.x) ? b : a); tx = cr[1]; ty = cr[2]; keep = 0; }
      const a = Math.atan2(best.y - me.y, best.x - me.x), dx = tx - me.x;
      const l = dx < -keep - 10 ? 1 : 0, r = dx > keep + 10 ? 1 : 0;
      send(c, { t: 'in', l, r, j: ((Math.random() < .03 || (ty < me.y - 50 && Math.abs(dx) < 140)) && (Date.now() % 200 < 100)) ? 1 : 0, f: 1, a });
    }
    const s = cs[0].snap;
    if (s && (Date.now()-t0)%5000<40) console.log(Math.round((Date.now()-t0)/1000), s.ph, 'rd', s.rd, 'map', s.mp, s.pl.map(p=>[p.x,p.y,p.hp,p.al,p.w].join(',')).join(' | '), 'cr', s.cr.length, 'bl', s.bl.length);
    if (s) { if (s.rd !== lastRd) { lastRd = s.rd; rounds++; } if (s.ph === 'end') { ended = true; } }
    if (ended || Date.now() - t0 > 170000) {
      clearInterval(timer);
      const s = cs[0].snap;
      console.log('ended', ended, 'rounds', rounds, 'phases', [...cs[0].phases].join(','), 'cardsSeen', cs.map(c => c.cardsSeen).join(','), 'wins', s.pl.map(p => p.wn).join(','), 'winner', s.win, 'cards', s.pl.map(p => p.c.length).join(','));
      console.log('secs', Math.round((Date.now() - t0) / 1000), 'last snap bytes', JSON.stringify(s).length);
      process.exit(0);
    }
  }, 33);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
