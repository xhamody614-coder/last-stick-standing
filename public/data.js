/* Shared game data. Loaded by the server (require) and the browser (window.DATA). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 960, H = 540;

  // Closed arenas get a ceiling and side walls so bullets can bounce.
  const closedShell = [
    { x: 0, y: -40, w: 960, h: 64, s: 1 },
    { x: -40, y: -40, w: 40, h: 640, s: 1 },
    { x: 960, y: -40, w: 40, h: 640, s: 1 }
  ];

  const MAPS = [
    { name: 'Crossroads', open: true, spawns: [[90, 500], [870, 500], [190, 390], [770, 390]], rects: [
      { x: 0, y: 500, w: 390, h: 40, s: 1 }, { x: 570, y: 500, w: 390, h: 40, s: 1 },
      { x: 140, y: 390, w: 170, h: 14 }, { x: 650, y: 390, w: 170, h: 14 },
      { x: 395, y: 300, w: 170, h: 14 }, { x: 30, y: 270, w: 110, h: 14 },
      { x: 820, y: 270, w: 110, h: 14 }, { x: 395, y: 170, w: 170, h: 14 } ] },
    { name: 'Tower', open: true, spawns: [[100, 500], [860, 500], [180, 410], [780, 410]], rects: [
      { x: 0, y: 500, w: 960, h: 40, s: 1 }, { x: 80, y: 410, w: 200, h: 14 },
      { x: 680, y: 410, w: 200, h: 14 }, { x: 380, y: 340, w: 200, h: 14 },
      { x: 140, y: 250, w: 170, h: 14 }, { x: 650, y: 250, w: 170, h: 14 },
      { x: 400, y: 170, w: 160, h: 14 } ] },
    { name: 'Islands', open: true, spawns: [[140, 430], [820, 430], [480, 370], [240, 260]], rects: [
      { x: 40, y: 430, w: 240, h: 22, s: 1 }, { x: 680, y: 430, w: 240, h: 22, s: 1 },
      { x: 350, y: 370, w: 260, h: 22, s: 1 }, { x: 170, y: 260, w: 150, h: 14 },
      { x: 640, y: 260, w: 150, h: 14 }, { x: 400, y: 170, w: 160, h: 14 } ] },
    { name: 'Bunker', open: false, spawns: [[80, 500], [880, 500], [260, 390], [700, 390]], rects: closedShell.concat([
      { x: 0, y: 500, w: 960, h: 40, s: 1 }, { x: 200, y: 390, w: 120, h: 24, s: 1 },
      { x: 640, y: 390, w: 120, h: 24, s: 1 }, { x: 420, y: 300, w: 120, h: 24, s: 1 },
      { x: 60, y: 250, w: 100, h: 24, s: 1 }, { x: 800, y: 250, w: 100, h: 24, s: 1 },
      { x: 420, y: 170, w: 120, h: 24, s: 1 } ]) },
    { name: 'Pinball', open: false, spawns: [[80, 500], [880, 500], [150, 400], [810, 400]], rects: closedShell.concat([
      { x: 0, y: 500, w: 960, h: 40, s: 1 }, { x: 440, y: 370, w: 80, h: 130, s: 1 },
      { x: 380, y: 240, w: 200, h: 22, s: 1 }, { x: 80, y: 400, w: 140, h: 22, s: 1 },
      { x: 740, y: 400, w: 140, h: 22, s: 1 }, { x: 60, y: 290, w: 120, h: 22, s: 1 },
      { x: 780, y: 290, w: 120, h: 22, s: 1 }, { x: 250, y: 150, w: 110, h: 22, s: 1 },
      { x: 600, y: 150, w: 110, h: 22, s: 1 } ]) },
    { name: 'Cage', open: false, spawns: [[100, 500], [860, 500], [200, 420], [760, 420]], rects: closedShell.concat([
      { x: 0, y: 500, w: 960, h: 40, s: 1 }, { x: 160, y: 420, w: 80, h: 20, s: 1 },
      { x: 400, y: 420, w: 160, h: 20, s: 1 }, { x: 720, y: 420, w: 80, h: 20, s: 1 },
      { x: 60, y: 320, w: 100, h: 20, s: 1 }, { x: 280, y: 320, w: 100, h: 20, s: 1 },
      { x: 580, y: 320, w: 100, h: 20, s: 1 }, { x: 800, y: 320, w: 100, h: 20, s: 1 },
      { x: 160, y: 220, w: 80, h: 20, s: 1 }, { x: 400, y: 220, w: 160, h: 20, s: 1 },
      { x: 720, y: 220, w: 80, h: 20, s: 1 }, { x: 280, y: 120, w: 100, h: 20, s: 1 },
      { x: 580, y: 120, w: 100, h: 20, s: 1 } ]) }
  ];

  const WEAPONS = {
    pistol:  { name: 'Pistol',   dmg: 16, cd: .32, spd: 780,  ammo: 14, pellets: 1, spread: .02, size: 4, kb: 150, len: 18, rec: 50,  color: '#ffd166', life: 1.6 },
    smg:     { name: 'SMG',      dmg: 7,  cd: .075, spd: 840, ammo: 36, pellets: 1, spread: .09, size: 3, kb: 55,  len: 22, rec: 25,  color: '#9bd1ff', life: 1.4 },
    shotgun: { name: 'Shotgun',  dmg: 9,  cd: .72, spd: 720,  ammo: 6,  pellets: 6, spread: .24, size: 3, kb: 110, len: 26, rec: 160, color: '#f08a8a', life: .5 },
    sniper:  { name: 'Sniper',   dmg: 52, cd: 1.0, spd: 1500, ammo: 4,  pellets: 1, spread: 0,   size: 4, kb: 420, len: 34, rec: 120, color: '#c3a6ff', life: 1.2 },
    rocket:  { name: 'Rocket',   dmg: 34, cd: 1.1, spd: 520,  ammo: 3,  pellets: 1, spread: 0,   size: 7, kb: 760, len: 28, rec: 200, color: '#9fe39a', life: 3, explosive: true, radius: 95 },
    grenade: { name: 'Grenade',  dmg: 30, cd: .9,  spd: 520,  ammo: 4,  pellets: 1, spread: .03, size: 6, kb: 640, len: 20, rec: 90,  color: '#e0c97a', life: 1.7, explosive: true, radius: 85, grav: 900, bounce: 4, fuse: true },
    bouncer: { name: 'Bouncer',  dmg: 14, cd: .38, spd: 600,  ammo: 14, pellets: 1, spread: .03, size: 5, kb: 140, len: 20, rec: 40,  color: '#ff9bd6', life: 3.2, bounce: 4 },
    flame:   { name: 'Flamer',   dmg: 3.4, cd: .035, spd: 380, ammo: 90, pellets: 1, spread: .2, size: 6, kb: 22,  len: 22, rec: 6,   color: '#ff7a3d', life: .34, pierce: true },
    revolver:{ name: 'Revolver', dmg: 34, cd: .6,  spd: 1000, ammo: 6,  pellets: 1, spread: .01, size: 4, kb: 260, len: 20, rec: 90,  color: '#d9d9d9', life: 1.2 }
  };
  const WKEYS = ['pistol', 'pistol', 'pistol', 'smg', 'smg', 'shotgun', 'shotgun', 'sniper', 'rocket', 'grenade', 'bouncer', 'flame', 'revolver'];

  const CARDS = [
    { id: 'hollow', name: 'Hollow Points', tag: 'DMG', txt: '+30% bullet damage' },
    { id: 'rapid', name: 'Rapid Fire', tag: 'RATE', txt: '+30% fire rate' },
    { id: 'iron', name: 'Iron Skin', tag: 'HP', txt: '+40 max health' },
    { id: 'ricochet', name: 'Ricochet', tag: 'BOUNCE', txt: 'Bullets bounce off surfaces twice' },
    { id: 'feet', name: 'Light Feet', tag: 'SPEED', txt: '+18% run speed' },
    { id: 'spring', name: 'Spring Legs', tag: 'JUMP', txt: 'One extra jump in the air' },
    { id: 'hot', name: 'Hot Loads', tag: 'VELOCITY', txt: '+40% bullet speed' },
    { id: 'leech', name: 'Leech', tag: 'LIFESTEAL', txt: 'Heal 25% of the damage you deal' },
    { id: 'fat', name: 'Fat Rounds', tag: 'SIZE', txt: 'Bigger bullets and +10% damage' },
    { id: 'wind', name: 'Second Wind', tag: 'REGEN', txt: 'Regain 4 health per second' },
    { id: 'pockets', name: 'Deep Pockets', tag: 'AMMO', txt: '+60% ammo in picked-up guns' },
    { id: 'padding', name: 'Padding', tag: 'ARMOR', txt: 'Take 25% less damage' },
    { id: 'knuckles', name: 'Iron Knuckles', tag: 'PUNCH', txt: 'Punches hit twice as hard' },
    { id: 'seeker', name: 'Seeker', tag: 'HOMING', txt: 'Bullets curve toward the nearest enemy' },
    { id: 'twin', name: 'Twin Shot', tag: 'MULTI', txt: 'Every shot fires one extra bullet' },
    { id: 'glass', name: 'Glass Cannon', tag: 'RISK', txt: '+60% damage, 30 less max health' }
  ];

  // Same weapons and cards for both; only body and movement feel differ.
  const CHARS = {
    stick: { name: 'Stick fighter', w: 18, h: 44, run: 235, ag: 14, aa: 6,  jump: 700, grav: 1,    kb: 1.25, shoulder: 19 },
    blob:  { name: 'Blob fighter',  w: 28, h: 28, run: 270, ag: 24, aa: 13, jump: 720, grav: 1.15, kb: .8,   shoulder: 14 }
  };

  const COLORS = ['#ff8a4c', '#46d9c3', '#ffd447', '#c58cff', '#ff6f91', '#7bd96b', '#6fb4ff', '#f2f2f2'];

  return { W, H, MAPS, WEAPONS, WKEYS, CARDS, CHARS, COLORS };
});
