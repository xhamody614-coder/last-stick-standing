'use strict';
// Server-side authoritative game simulation for one room.
const D = require('./public/data.js');
const { W, H, MAPS, WEAPONS, WKEYS, CARDS, CHARS } = D;
const TAU = Math.PI * 2, GRAV = 1750;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = v => Math.round(v * 10) / 10;

const newStats = () => ({ dmg: 1, rate: 1, hp: 0, bounce: 0, bspd: 1, bsize: 1, vamp: 0, regen: 0, speed: 1, jumps: 0, ammo: 1, reduce: 0, brawl: 1, homing: 0, twin: 0 });
const FX = {
  hollow: s => { s.dmg *= 1.3; }, rapid: s => { s.rate *= 1.3; }, iron: s => { s.hp += 40; },
  ricochet: s => { s.bounce += 2; }, feet: s => { s.speed *= 1.18; }, spring: s => { s.jumps += 1; },
  hot: s => { s.bspd *= 1.4; }, leech: s => { s.vamp += .25; }, fat: s => { s.bsize *= 1.7; s.dmg *= 1.1; },
  wind: s => { s.regen += 4; }, pockets: s => { s.ammo *= 1.6; }, padding: s => { s.reduce += (1 - s.reduce) * .25; },
  knuckles: s => { s.brawl *= 2; }, seeker: s => { s.homing += 1.6; }, twin: s => { s.twin += 1; },
  glass: s => { s.dmg *= 1.6; s.hp -= 30; }
};

class Game {
  constructor(send) { this.send = send || (() => {}); this.reset(); }

  reset() {
    this.phase = 'lobby'; this.players = []; this.bullets = []; this.crates = []; this.ev = [];
    this.round = 0; this.target = 5; this.settings = { target: 5, cards: 'losers', maps: [0, 1, 2, 3, 4, 5] };
    this.lastMap = -1; this.mapIdx = 0; this.map = MAPS[0]; this.cd = 0; this.ending = false; this.endT = 0;
    this.msg = ''; this.msgT = 0; this.winner = null; this.cp = null; this.nid = 1; this.dropT = 3;
  }

  start(infos, settings) {
    this.reset(); this.settings = settings; this.target = settings.target;
    this.players = infos.map((p, i) => this.mkPlayer(p, i));
    this.resetRound();
  }

  mkPlayer(info, i) {
    const type = CHARS[info.type] ? info.type : 'stick', c = CHARS[type];
    return { id: info.id, slot: i, name: info.name, color: info.color, type, c, w: c.w, h: c.h, wins: 0, st: newStats(), cards: [],
      in: { l: 0, r: 0, j: 0, f: 0, a: 0 }, pj: 0, connected: true, alive: true, hp: 100, maxhp: 100, x: 0, y: 0, vx: 0, vy: 0,
      weapon: null, cd: 0, face: 1, aim: 0, jumpBuf: 0, coyote: 0, onGround: false, jumpsLeft: 0, hurtT: 0, punchT: 0, g: c.grav };
  }

  setInput(id, m) {
    const p = this.players.find(q => q.id === id); if (!p) return;
    p.in.l = m.l ? 1 : 0; p.in.r = m.r ? 1 : 0; p.in.j = m.j ? 1 : 0; p.in.f = m.f ? 1 : 0;
    if (Number.isFinite(m.a)) p.in.a = clamp(m.a, -7, 7);
  }

  removePlayer(id) {
    const p = this.players.find(q => q.id === id); if (!p) return;
    p.connected = false; if (p.alive) { p.alive = false; p.hp = 0; p.weapon = null; }
    if (this.cp) { this.cp.elig.delete(id); this.checkCardsDone(); }
  }

  /* ---------- rounds ---------- */
  resetRound() {
    this.round++;
    const allowed = (this.settings.maps && this.settings.maps.length ? this.settings.maps : MAPS.map((m, i) => i)).filter(i => MAPS[i]);
    let mi, guard = 0;
    do { mi = allowed[Math.floor(Math.random() * allowed.length)]; } while (mi === this.lastMap && allowed.length > 1 && guard++ < 20);
    this.lastMap = mi; this.mapIdx = mi; this.map = MAPS[mi];
    this.bullets = []; this.crates = []; this.ending = false; this.cp = null; this.msg = '';
    this.players.forEach(p => {
      const s = this.map.spawns[p.slot % 4];
      p.maxhp = Math.max(40, 100 + p.st.hp); p.hp = p.maxhp; p.x = s[0]; p.y = s[1] - p.h; p.vx = p.vy = 0;
      p.alive = p.connected; p.weapon = null; p.cd = .3; p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
      p.jumpsLeft = p.st.jumps; p.hurtT = 0; p.punchT = 0; p.pj = 0;
    });
    this.spawnCrate(); this.spawnCrate();
    this.dropT = rnd(4, 6); this.cd = 3; this.phase = 'countdown';
    this.ev.push({ k: 'round' });
  }

  finishRound() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length !== 1) { this.msg = 'DRAW'; this.resetRound(); this.msg = 'DRAW'; return; }
    const w = alive[0]; w.wins++;
    if (w.wins >= this.target) { this.phase = 'end'; this.winner = w.id; return; }
    const mode = this.settings.cards;
    if (mode === 'off') { this.resetRound(); return; }
    const elig = new Set(this.players.filter(p => p.connected && (mode === 'everyone' || p.id !== w.id)).map(p => p.id));
    if (!elig.size) { this.resetRound(); return; }
    this.phase = 'cards';
    this.cp = { elig, picked: new Set(), opts: {}, t: 15 };
    for (const id of elig) {
      const pool = CARDS.map((c, i) => i), opts = [];
      for (let i = 0; i < 3; i++) opts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      this.cp.opts[id] = opts;
      this.send(id, { t: 'cardopts', opts });
    }
  }

  pickCard(id, i) {
    if (this.phase !== 'cards' || !this.cp || !this.cp.elig.has(id) || this.cp.picked.has(id)) return;
    const opts = this.cp.opts[id]; if (!opts || !(i >= 0 && i < opts.length)) return;
    const p = this.players.find(q => q.id === id); if (!p) return;
    const idx = opts[i]; FX[CARDS[idx].id](p.st); p.cards.push(idx);
    this.cp.picked.add(id); this.ev.push({ k: 'card', id });
    this.checkCardsDone();
  }

  checkCardsDone() {
    if (this.phase !== 'cards' || !this.cp) return;
    for (const id of this.cp.elig) if (!this.cp.picked.has(id)) return;
    this.resetRound();
  }

  /* ---------- physics ---------- */
  moveBody(b, dt) {
    const hw = b.w / 2, rects = this.map.rects;
    b.vy = Math.min(b.vy + GRAV * (b.g || 1) * dt, 1250);
    b.x += b.vx * dt;
    if (b.x < hw) { b.x = hw; if (b.vx < 0) b.vx = 0; } else if (b.x > W - hw) { b.x = W - hw; if (b.vx > 0) b.vx = 0; }
    for (const r of rects) {
      if (!r.s) continue;
      if (b.x + hw > r.x && b.x - hw < r.x + r.w && b.y + b.h > r.y + 2 && b.y < r.y + r.h) {
        b.x = b.x < r.x + r.w / 2 ? r.x - hw : r.x + r.w + hw; b.vx = 0;
      }
    }
    const prevBottom = b.y + b.h;
    b.y += b.vy * dt; b.onGround = false;
    for (const r of rects) {
      if (b.x + hw > r.x && b.x - hw < r.x + r.w && b.y + b.h > r.y && b.y < r.y + r.h) {
        if (b.vy >= 0 && prevBottom <= r.y + 6) { b.y = r.y - b.h; b.vy = 0; b.onGround = true; }
        else if (r.s && b.vy < 0) { b.y = r.y + r.h; b.vy = 0; }
      }
    }
  }

  /* ---------- combat ---------- */
  hurt(p, amt, kx, ky, owner) {
    if (!p.alive) return;
    amt *= (1 - p.st.reduce);
    p.hp -= amt; p.vx += kx * p.c.kb; p.vy += ky * p.c.kb; p.hurtT = .12;
    this.ev.push({ k: 'hit', id: p.id, x: r1(p.x), y: r1(p.y), a: Math.round(amt) });
    if (owner != null && owner !== p.id) {
      const o = this.players.find(q => q.id === owner);
      if (o && o.alive && o.st.vamp > 0) o.hp = Math.min(o.maxhp, o.hp + amt * o.st.vamp);
    }
    if (p.hp <= 0) this.kill(p, kx, ky);
  }

  kill(p, kx, ky) {
    p.alive = false; p.hp = 0; p.weapon = null;
    this.ev.push({ k: 'die', id: p.id, x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx + kx * .5), vy: Math.round(p.vy + ky * .5) });
  }

  explode(x, y, owner, dmg, r, kb) {
    this.ev.push({ k: 'boom', x: Math.round(x), y: Math.round(y), r });
    for (const p of this.players) {
      if (!p.alive) continue;
      const dx = p.x - x, dy = (p.y + p.h / 2) - y, d = Math.max(1, Math.hypot(dx, dy));
      if (d < r + 14) {
        const f = 1 - Math.min(1, d / (r + 14));
        this.hurt(p, dmg * f * (p.id === owner ? .5 : 1), dx / d * kb * f, dy / d * kb * f - 160 * f, owner);
      }
    }
  }

  shoot(p) {
    const wd = p.weapon ? WEAPONS[p.weapon.t] : null;
    if (!wd) { this.punch(p); return; }
    p.cd = wd.cd / p.st.rate;
    const n = wd.pellets + p.st.twin, sy = p.y + p.c.shoulder, sx = p.x, off = wd.len + (p.type === 'blob' ? 14 : 0);
    if (this.bullets.length > 500) this.bullets.splice(0, 50);
    for (let i = 0; i < n; i++) {
      let a = p.aim + rnd(-1, 1) * wd.spread;
      if (wd.pellets === 1 && n > 1) a += (i - (n - 1) / 2) * .07;
      const sp = wd.spd * p.st.bspd * (wd.pellets > 1 ? rnd(.9, 1.1) : 1);
      this.bullets.push({ id: this.nid++, x: sx + Math.cos(p.aim) * off, y: sy + Math.sin(p.aim) * off, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: wd.dmg * p.st.dmg, size: wd.size * p.st.bsize, o: p.id, bn: p.st.bounce + (wd.bounce || 0), bounced: 0, life: wd.life, kb: wd.kb,
        ex: !!wd.explosive, fuse: !!wd.fuse, rad: wd.radius || 0, hm: p.st.homing, g: wd.grav || 0, pierce: !!wd.pierce, hits: null, col: wd.color });
    }
    p.vx -= Math.cos(p.aim) * wd.rec; p.vy -= Math.sin(p.aim) * wd.rec * .25;
    this.ev.push({ k: 'shot', w: p.weapon.t, x: r1(sx + Math.cos(p.aim) * off), y: r1(sy + Math.sin(p.aim) * off), a: r1(p.aim) });
    if (--p.weapon.ammo <= 0) { this.ev.push({ k: 'empty', id: p.id, x: r1(p.x), y: r1(p.y) }); p.weapon = null; }
  }

  punch(p) {
    p.cd = .4 / p.st.rate; p.punchT = .16;
    this.ev.push({ k: 'punch', x: r1(p.x), y: r1(p.y) });
    const x0 = p.x, x1 = p.x + p.face * (p.type === 'blob' ? 46 : 44), l = Math.min(x0, x1), r = Math.max(x0, x1);
    for (const o of this.players) {
      if (o === p || !o.alive) continue;
      if (o.x + o.w / 2 > l && o.x - o.w / 2 < r && o.y + o.h > p.y - 4 && o.y < p.y + p.h + 4) this.hurt(o, 12 * p.st.brawl, p.face * 400, -190, p.id);
    }
  }

  stepPlayer(p, dt, canAct) {
    if (!p.alive) return;
    const i = p.in;
    if (i.j && !p.pj) p.jumpBuf = .14; p.pj = i.j;
    const dir = canAct ? (i.r - i.l) : 0;
    if (canAct) { p.aim = i.a; p.face = Math.cos(p.aim) >= 0 ? 1 : -1; }
    const sp = p.c.run * p.st.speed;
    p.vx += (dir * sp - p.vx) * Math.min(1, (p.onGround ? p.c.ag : p.c.aa) * dt);
    p.jumpBuf -= dt; p.cd -= dt; p.hurtT -= dt; p.punchT -= dt;
    p.coyote = p.onGround ? .1 : p.coyote - dt;
    if (canAct && p.jumpBuf > 0) {
      if (p.coyote > 0) { p.vy = -p.c.jump; p.coyote = 0; p.jumpBuf = 0; this.ev.push({ k: 'jump', x: r1(p.x), y: r1(p.y + p.h) }); }
      else if (p.jumpsLeft > 0) { p.vy = -p.c.jump * .92; p.jumpsLeft--; p.jumpBuf = 0; this.ev.push({ k: 'jump', x: r1(p.x), y: r1(p.y + p.h) }); }
    }
    if (canAct && i.f && p.cd <= 0) this.shoot(p);
    if (p.st.regen) p.hp = Math.min(p.maxhp, p.hp + p.st.regen * dt);
    this.moveBody(p, dt);
    if (p.onGround) p.jumpsLeft = p.st.jumps;
    if (p.y > H + 70) this.kill(p, 0, 0);
  }

  updateBullets(dt) {
    const rects = this.map.rects;
    for (const b of this.bullets) {
      if (b.hm > 0) {
        let best = null, bd = 1e9;
        for (const o of this.players) if (o.alive && o.id !== b.o) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; best = o; } }
        if (best) {
          const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y + best.h / 2 - b.y, best.x - b.x);
          let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const na = cur + clamp(da, -b.hm * dt, b.hm * dt); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      if (b.g) b.vy += b.g * dt;
      b.life -= dt;
      const steps = 3, sdt = dt / steps;
      for (let s = 0; s < steps && !b.dead; s++) {
        const px = b.x, py = b.y;
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        for (const r of rects) {
          if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
            if (b.ex && !b.fuse) { this.explode(b.x, b.y, b.o, b.dmg, b.rad, b.kb); b.dead = true; }
            else if (b.bn > 0) {
              b.x = px; b.y = py;
              if (px <= r.x || px >= r.x + r.w) b.vx *= -1; else b.vy *= -1;
              if (b.fuse) { b.vx *= .8; b.vy *= .8; }
              b.bn--; b.bounced++; this.ev.push({ k: 'spark', x: r1(b.x), y: r1(b.y), c: b.col });
            } else if (b.ex) { this.explode(b.x, b.y, b.o, b.dmg, b.rad, b.kb); b.dead = true; }
            else { this.ev.push({ k: 'spark', x: r1(b.x), y: r1(b.y), c: b.col }); b.dead = true; }
            break;
          }
        }
        if (b.dead) break;
        for (const p of this.players) {
          if (!p.alive || (p.id === b.o && !b.bounced)) continue;
          if (b.hits && b.hits.has(p.id)) continue;
          if (b.x > p.x - p.w / 2 - b.size && b.x < p.x + p.w / 2 + b.size && b.y > p.y - b.size && b.y < p.y + p.h + b.size) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            if (b.ex) { this.explode(b.x, b.y, b.o, b.dmg, b.rad, b.kb); b.dead = true; break; }
            this.hurt(p, b.dmg, b.vx / sp * b.kb, b.vy / sp * b.kb * .5 - 60, b.o);
            if (b.pierce) { if (!b.hits) b.hits = new Set(); b.hits.add(p.id); } else { b.dead = true; break; }
          }
        }
      }
      if (!b.dead && b.life <= 0) { if (b.ex) this.explode(b.x, b.y, b.o, b.dmg, b.rad, b.kb); b.dead = true; }
      if (b.x < -80 || b.x > W + 80 || b.y > H + 100 || b.y < -400) b.dead = true;
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  spawnCrate() {
    const rs = this.map.rects.filter(r => r.w >= 80 && r.y > 60 && r.y < 480), r = rs[Math.floor(Math.random() * rs.length)] || this.map.rects[0];
    this.crates.push({ id: this.nid++, x: rnd(r.x + 24, r.x + r.w - 24), y: this.map.open ? -30 : 34, w: 24, h: 24, vx: 0, vy: 0, onGround: false, g: 1, t: WKEYS[Math.floor(Math.random() * WKEYS.length)] });
  }

  updateCrates(dt) {
    for (const c of this.crates) {
      this.moveBody(c, dt);
      for (const p of this.players) {
        if (!p.alive || c.got) continue;
        if (Math.abs(p.x - c.x) < (p.w + c.w) / 2 + 2 && Math.abs((p.y + p.h / 2) - (c.y + c.h / 2)) < (p.h + c.h) / 2) {
          p.weapon = { t: c.t, ammo: Math.ceil(WEAPONS[c.t].ammo * p.st.ammo) };
          c.got = true; this.ev.push({ k: 'pick', id: p.id, w: c.t, x: r1(p.x), y: r1(p.y) });
        }
      }
    }
    this.crates = this.crates.filter(c => !c.got && c.y < H + 40);
  }

  /* ---------- tick ---------- */
  step(dt) {
    if (this.phase === 'countdown') {
      this.cd -= dt;
      this.players.forEach(p => this.stepPlayer(p, dt, false));
      this.updateCrates(dt);
      if (this.cd <= 0) { this.phase = 'play'; this.msg = 'FIGHT'; this.msgT = .7; this.ev.push({ k: 'go' }); }
    } else if (this.phase === 'play') {
      let sdt = dt;
      if (this.ending) { sdt = dt * .45; this.endT -= dt; if (this.endT <= 0) { this.finishRound(); return; } }
      if (this.msgT > 0) this.msgT -= dt; else if (this.msg === 'FIGHT') this.msg = '';
      this.players.forEach(p => this.stepPlayer(p, sdt, true));
      this.updateBullets(sdt); this.updateCrates(sdt);
      this.dropT -= sdt;
      if (this.dropT <= 0) { if (this.crates.length < 3) this.spawnCrate(); this.dropT = rnd(4.5, 7); }
      if (!this.ending && this.players.filter(p => p.alive).length <= 1) { this.ending = true; this.endT = 1.7; }
    } else if (this.phase === 'cards' && this.cp) {
      this.cp.t -= dt;
      if (this.cp.t <= 0) {
        for (const id of [...this.cp.elig]) if (!this.cp.picked.has(id) && this.phase === 'cards') this.pickCard(id, Math.floor(Math.random() * 3));
      }
    }
  }

  snapshot() {
    const ev = this.ev.slice(0, 60); this.ev = this.ev.slice(60);
    const s = { t: 'snap', ph: this.phase, cd: r1(Math.max(0, this.cd)), msg: this.msg, rd: this.round, mp: this.mapIdx, tg: this.target,
      pl: this.players.map(p => ({ id: p.id, x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), hp: Math.round(p.hp), mh: p.maxhp,
        al: p.alive ? 1 : 0, fc: p.face, am: r1(p.aim), w: p.weapon ? p.weapon.t : null, ac: p.weapon ? p.weapon.ammo : 0, og: p.onGround ? 1 : 0,
        pt: p.punchT > 0 ? 1 : 0, hu: p.hurtT > 0 ? 1 : 0, wn: p.wins, c: p.cards })),
      bl: this.bullets.map(b => [b.id, Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), r1(b.size), b.col, b.ex ? 1 : 0]),
      cr: this.crates.map(c => [c.id, Math.round(c.x), Math.round(c.y), c.t]),
      ev };
    if (this.ending) s.en = 1;
    if (this.phase === 'end') s.win = this.winner;
    if (this.phase === 'cards' && this.cp) s.cp = { el: [...this.cp.elig], pk: [...this.cp.picked], t: Math.ceil(this.cp.t) };
    return s;
  }
}

module.exports = { Game };
