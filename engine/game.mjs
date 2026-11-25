// Nightbreaker rules engine.
// Straight-line async code: every player decision goes through ask(), and all randomness through a seeded
// generator, so a game is fully reproducible from (config, seed, list of answers). Saving and undo replay that list.
import {
  ELEMENTS, EL_NAME, POINTS, POINT_NAME, CATEGORY, ENEMIES, ENEMY_NAME, ABILITY_TEXT, TOKENS, SKILLS, PROFESSIONS, GOALS, SHADES, QUESTS,
  NEED_NAME, NEED_TYPES, SOURCE_FACES, TILES, GREEN_TILES, CITY_TILES, BROWN_TILES, TERRAIN_COST, TERRAIN_NAME, SITE_NAME, PLACEMENTS,
  LUMINARIES, CITY_SETTINGS, GOAL_STRENGTH, ROUNDS,
} from '../data.mjs';
import { mulberry32, shuffle, sum, GameOver, cheapestSubset } from './util.mjs';

const DIRS = [[2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
export const K = (x, r) => `${x},${r}`;
const UNLOCK = { yellow: 1, white: 3, green: 5 };
const emptyPool = () => ({ move: 0, inf: 0, pm: 0, pr: 0, mm: 0, mr: 0, pb: 0, mb: 0 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeParts(parts) {
  return parts.map((p) => (POINT_NAME[p.t] ? `${p.n} ${POINT_NAME[p.t].toLowerCase()}`
    : p.t === 'save' ? 'save the source shard' : p.t === 'prec' ? 'precision' : p.t === 'feint' ? 'feint'
      : p.t === 'brute' ? `ignore ${p.n === 'phys' ? 'physical' : 'photonic'} resistance` : p.t)).join(' + ');
}

export class Game {
  /** @param config {luminary, profession, profAs, shade, shadeSide, city, extraGoals} */
  constructor(config, seed, io) {
    this.config = config; this.seed = seed; this.io = io;
    this.rnd = mulberry32(seed);
    this.info = 0; // count of hidden-information reveals (limits undo)
    this.logLines = [];
    this.result = null;
    this.cmb = null;
  }

  // ================================================================ io
  log(msg, cls = '') { this.logLines.push({ round: this.round || 0, turn: this.turn || 0, msg, cls }); this.io.onLog?.(msg, cls); }
  async choose(title, options, o = {}) {
    const prompt = { title, options, ctx: o.ctx || 'choice', detail: o.detail, info: this.info };
    const id = await this.io.ask(prompt, this);
    const pick = options.find((x) => x.id === id && !x.disabled);
    if (!pick) throw new Error(`Invalid answer ${JSON.stringify(id)} for prompt "${title}"`);
    return pick;
  }

  // ================================================================ queries
  get lum() { return LUMINARIES[this.config.luminary]; }
  get lv() { return this.lum.levels[this.level - 1]; }
  get armor() { return this.lv.armor; }
  get maxWounds() { return this.lum.wounds; }
  /** Position of the wound marker on a 10-heart track (Wisdom's shorter track starts one space in). */
  get woundPos() { return this.wounds + (this.maxWounds === 8 ? 1 : 0); }
  /** The last turn of the round the wound marker still allows. */
  get turnLimit() { return Math.max(1, 6 - Math.floor(this.woundPos / 2)); }
  get actionsLeft() { return 3 + this.extra - this.used; }
  get capacity() { return sum(this.lum.levels.slice(0, this.level), (l) => l.gain.filter((g) => g === 'ally').length); }
  get reputation() { return sum(this.rep, (q) => QUESTS[q.q][q.side].rep); }
  get xpTotal() { return sum(this.xp, (x) => this.xpValue(x)); }
  xpValue(x) { return ENEMIES[x.id].xp[x.doom ? 1 : 0]; }
  get shade() { return SHADES[this.config.shade]; }
  get shadeStats() { return this.shade.sides[this.config.shadeSide]; }
  get rating() { return this.shadeStats.str + CITY_SETTINGS[this.config.city].str + GOAL_STRENGTH[this.config.extraGoals || 0]; }
  get turnsRemaining() { return Math.max(0, this.turnLimit - this.turn) + (ROUNDS - this.round) * this.turnLimit; }
  here() { return this.hexes.get(K(this.pos.x, this.pos.r)) || null; }
  neighbors(x, r) { return DIRS.map(([dx, dr]) => this.hexes.get(K(x + dx, r + dr))).filter(Boolean); }
  adjacent(a, b) { return DIRS.some(([dx, dr]) => a.x + dx === b.x && a.r + dr === b.r); }
  hasSkill(name, ready = false) { return this.skills.some((s) => s.skill === name && (!ready || (!s.exhausted && !(SKILLS[name].kind === 'turn' && s.used)))); }
  readySkill(name) { return this.skills.find((s) => s.skill === name && !s.exhausted && !(SKILLS[name].kind === 'turn' && s.used)); }
  allyDef(a) { return a.prof ? PROFESSIONS[a.id] : TOKENS[a.id]; }
  allyName(a) { return a.prof ? PROFESSIONS[a.id].name : ENEMY_NAME[a.id]; }
  skillName(s) { return SKILLS[s.skill].name; }

  /** Stats of an enemy, with the modifiers of the current combat when `e` (its combat entry) is given. */
  stats(foe, e = null) {
    const base = foe.shade ? { ...this.shade, ...this.shadeStats, resist: [], xp: [0, 0] } : ENEMIES[foe.id];
    const mult = foe.doom ? 2 : 1;
    const abil = new Set(base.abil.filter((a) => !(e && e.ignored.has(a))));
    const resist = new Set(base.resist.filter((r) => !(e && e.bruted.has(r))));
    let hp = (base.hp - (e && e.mender ? 1 : 0)) * mult;
    if (e) {
      hp += e.hpBonus;
      if (this.cmb && this.cmb.E.some((o) => o !== e && !o.out && o.foe.shade && this.shade.abil.includes('inspiring') && !o.ignored.has('inspiring'))) hp += 2;
    }
    const hex = foe.key ? this.hexes.get(foe.key) : null;
    const siteFort = foe.kind === 'city' || (foe.kind === 'tower' && hex && hex.terrain === 'desert');
    let fort = (siteFort ? 1 : 0) + (abil.has('fortified') ? 1 : 0);
    if (abil.has('unfortified')) fort = 0;
    if (e) fort = Math.max(0, fort - e.fortIgnore);
    return {
      name: foe.shade ? this.shade.name : ENEMY_NAME[foe.id], type: base.type, atk: base.atk * mult, hp: Math.max(1, hp), abil, resist, fort,
      xp: foe.shade ? 0 : base.xp[foe.doom ? 1 : 0], doom: !!foe.doom, shade: !!foe.shade,
    };
  }

  // ================================================================ setup
  async run() {
    try {
      await this.setup();
      for (;;) await this.playTurn();
    } catch (err) {
      if (!(err instanceof GameOver)) throw err;
      this.result = { won: err.won, reason: err.reason, score: err.won ? this.score() : null };
      this.log(err.won ? 'Victory! The city has fallen.' : `Defeat: ${err.reason}.`, 'big');
      this.io.onOver?.(this.result, this);
    }
  }

  async setup() {
    const c = this.config;
    this.level = 1; this.wounds = 0; this.injured = false; this.turn = 1; this.round = 1; this.turnNo = 0;
    this.shards = { earth: 0, wind: 0, fire: 0 };
    this.source = { face: 0, used: false };
    this.marker = this.lum.mat.start;
    this.allies = []; this.skills = []; this.xp = []; this.rep = []; this.offer = []; this.goals = [];
    this.towers = 0; this.scorched = []; this.usedSites = new Set(); this.storm = null; this.bribed = false;
    this.stacks = {
      monster: shuffle(Object.values(ENEMIES).filter((e) => e.type === 'monster').map((e) => e.id), this.rnd),
      mage: shuffle(Object.values(ENEMIES).filter((e) => e.type === 'mage').map((e) => e.id), this.rnd),
    };
    this.questPile = shuffle(Object.keys(QUESTS), this.rnd);
    this.hexes = new Map(); this.tiles = [];
    // Tile stack: 3 easy tiles on top, then 3 hard tiles with the city tile among the bottom two.
    const green = shuffle([...GREEN_TILES], this.rnd).slice(0, 3);
    const brown = shuffle([...BROWN_TILES], this.rnd).slice(0, 2);
    const city = shuffle([...CITY_TILES], this.rnd)[0];
    this.tileStack = [...green, brown[0], ...shuffle([city, brown[1]], this.rnd)];
    this.city = { key: null, type: null, revealed: false, enemies: [], cleared: false };
    this.resetTurn();
    this.placeTile(this.tileStack.shift(), 0, 0);
    this.fillOffer();
    this.rollSource();

    const start = await this.choose('Choose where you enter the map', [
      { id: 'start:0', hex: K(0, 4), label: 'West' }, { id: 'start:2', hex: K(2, 4), label: 'Middle' }, { id: 'start:4', hex: K(4, 4), label: 'East' },
    ], { ctx: 'start' });
    this.pos = { x: +start.id.split(':')[1], r: 4 };

    // Level 1 benefits and the profession.
    const gains = this.lv.gain; const prof = c.profession ? PROFESSIONS[c.profession] : null;
    let profPlaced = false;
    if (prof) {
      const asAlly = gains.includes('ally') && (!gains.includes('skill') || c.profAs !== 'skill');
      if (asAlly) { this.allies.push({ id: prof.id, prof: true, exhausted: false, wounded: false }); profPlaced = 'ally'; }
      else { this.skills.push({ skill: prof.skill, id: prof.id, prof: true, exhausted: false, used: false }); profPlaced = 'skill'; }
      this.log(`${prof.name} joins you as ${profPlaced === 'ally' ? 'an ally' : 'your starting skill'}.`);
    }
    if (gains.includes('skill') && profPlaced !== 'skill') await this.gainSkill('Choose your starting skill');

    // Goals: with a profession draw 2 of the unused tokens and keep 1; extra goals are drawn at random.
    const pile = shuffle(Object.keys(GOALS).filter((g) => !prof || GOALS[g].token !== prof.id), this.rnd);
    if (prof) {
      const [a, b] = pile; this.info++;
      const pick = await this.choose('Choose your goal', [a, b].map((g) => ({ id: g, goal: g, label: GOALS[g].text })), { ctx: 'goal', detail: 'You must complete it, as well as defeat the city, to win.' });
      this.goals.push(pick.id); pile.splice(pile.indexOf(pick.id), 1); shuffle(pile, this.rnd);
    }
    for (let i = 0; i < (c.extraGoals || 0) && pile.length; i++) { this.goals.push(pile.shift()); this.info++; }
    for (const g of this.goals) this.log(`Goal: ${GOALS[g].text}.`);
    // Development and test overrides: start at a higher level or with shards.
    const dev = c.dev || {};
    for (let l = 2; l <= (dev.level || 1); l++) { this.level = l; for (const g of this.lv.gain) if (g === 'skill') await this.gainSkill(); }
    for (const el of ELEMENTS) this.shards[el] = Math.min(5, dev.shards || 0);
    if (dev.reveal) { // lay the whole map out northward and stand next to the city
      let or = 0; while (this.tileStack.length) { or -= 4; this.placeTile(this.tileStack.shift(), 0, or); }
      const c = this.hexes.get(this.city.key);
      const spot = this.neighbors(c.x, c.r).find((h) => this.moveCost(h) < 9 && !h.enemy && !h.quest && !this.isTower(h) && h.site !== 'storm');
      if (spot) { this.pos = { x: spot.x, r: spot.r }; this.reveal(); }
    }
    this.log(`${this.shade.name} waits in the city. Difficulty rating ${this.rating}.`);
  }

  // ================================================================ stacks, offer, source
  drawEnemy(type) {
    this.info++;
    if (this.stacks[type].length) return this.stacks[type].shift();
    const other = type === 'monster' ? 'mage' : 'monster';
    return this.stacks[other].length ? this.stacks[other].shift() : null;
  }
  returnToken(id) { this.stacks[ENEMIES[id].type].push(id); }
  fillOffer() {
    while (this.offer.length < 3) {
      const type = this.stacks.mage.length > this.stacks.monster.length ? 'mage' : 'monster';
      const id = this.drawEnemy(type);
      if (!id) break;
      this.offer.push(id);
    }
  }
  refreshOffer() { for (const id of this.offer) this.returnToken(id); this.offer = []; this.fillOffer(); }
  rollSource() { this.source = { face: Math.floor(this.rnd() * SOURCE_FACES.length), used: false }; this.info++; }
  get sourceFace() { return SOURCE_FACES[this.source.face]; }
  gainShard(el, n = 1) { const before = this.shards[el]; this.shards[el] = Math.min(5, before + n); if (this.shards[el] > before) this.log(`Gained ${this.shards[el] - before} ${el} shard.`); else this.log(`${cap(el)} shards are already at the maximum of 5.`); }
  async gainAnyShard(title = 'Gain a shard') {
    const pick = await this.choose(title, ELEMENTS.map((el) => ({ id: el, el, label: `${EL_NAME[el]} (${this.shards[el]})`, disabled: this.shards[el] >= 5 && ELEMENTS.some((o) => this.shards[o] < 5) })), { ctx: 'shard' });
    this.gainShard(pick.id);
  }

  // ================================================================ map
  placeTile(id, ox, or) {
    const def = TILES[id]; const tile = { id, ox, or, index: this.tiles.length };
    this.tiles.push(tile); this.info++;
    def.rows.forEach((row, r) => row.forEach((spec, i) => {
      const [terrain, site] = spec.split('+'); const x = ox + (r % 2 ? 1 : 0) + 2 * i;
      const hex = { k: K(x, or + r), x, r: or + r, tile: tile.index, hard: def.hard, terrain, site: site || null, enemy: null, quest: null, mark: null, spawned: false };
      if (site === 'wmonster' || site === 'wmage') {
        const eid = this.drawEnemy(site === 'wmonster' ? 'monster' : 'mage');
        if (eid) hex.enemy = { id: eid, doom: false, kind: 'wander', key: hex.k, alive: true };
      } else if (site === 'quest' && this.questPile.length) {
        hex.quest = { q: this.questPile.shift(), side: def.hard ? 'h' : 'e' };
      } else if (site === 'cmonster' || site === 'cmage') {
        this.city.key = hex.k; this.city.type = site === 'cmonster' ? 'monster' : 'mage';
      }
      this.hexes.set(hex.k, hex);
    }));
    this.log(`A new ${def.hard ? 'hard' : 'easy'} map tile is revealed.`);
    return tile;
  }
  tileKeys(ox, or) { const out = []; for (let r = 0; r < 4; r++) for (let i = 0; i < (r % 2 ? 2 : 3); i++) out.push([ox + (r % 2 ? 1 : 0) + 2 * i, or + r]); return out; }
  /** Where the next tile would go in direction `dir`, or null if you cannot explore that way from here. */
  exploreSpot(dir) {
    const here = this.here(); if (!here || !this.tileStack.length) return null;
    const t = this.tiles[here.tile]; const [dx, dr] = PLACEMENTS[dir]; const ox = t.ox + dx, or = t.or + dr;
    const cells = this.tileKeys(ox, or);
    if (cells.some(([x, r]) => this.hexes.has(K(x, r)))) return null;
    if (!cells.some(([x, r]) => this.adjacent(this.pos, { x, r }))) return null;
    return { ox, or };
  }
  isTower(hex) { return hex.site === 'tmonster' || hex.site === 'tmage'; }
  spawnTower(hex) {
    hex.spawned = true;
    const id = this.drawEnemy(hex.site === 'tmonster' ? 'monster' : 'mage');
    if (!id) return;
    hex.enemy = { id, doom: true, kind: 'tower', key: hex.k, alive: true };
    this.log(`${ENEMY_NAME[id]} (Doom) appears in the ${SITE_NAME[hex.site].toLowerCase()}.`);
  }
  /** Reveal what you can now see: towers on desert and hills, and the city's defenders. */
  reveal() {
    for (const h of this.neighbors(this.pos.x, this.pos.r)) {
      if (this.isTower(h) && !h.spawned && (h.terrain === 'desert' || h.terrain === 'hills')) this.spawnTower(h);
      if (h.k === this.city.key && !this.city.revealed) this.revealCity();
    }
  }
  revealCity() {
    const set = CITY_SETTINGS[this.config.city]; const c = this.city;
    c.revealed = true;
    c.enemies.push({ shade: true, id: this.shade.id, doom: false, kind: 'city', key: c.key, alive: true });
    for (let i = 0; i < set.count; i++) { const id = this.drawEnemy(c.type); if (id) c.enemies.push({ id, doom: set.doom, kind: 'city', key: c.key, alive: true }); }
    this.log(`The city's defenders are revealed: ${c.enemies.map((f) => this.stats(f).name).join(', ')}.`, 'big');
  }
  /** Living enemies you would have to fight on entering this hex (spawned or not). */
  foesAt(hex) {
    const out = [];
    if (hex.enemy && hex.enemy.alive && !hex.enemy.scorched) out.push(hex.enemy);
    if (hex.k === this.city.key) out.push(...this.city.enemies.filter((f) => f.alive && !f.scorched));
    return out;
  }
  moveCost(hex) {
    if (hex.quest) return QUESTS[hex.quest.q][hex.quest.side].move;
    const t = hex.terrain;
    if (t === 'lake') return this.hasSkill('lake') ? 2 : Infinity;
    if (t === 'mountain') return this.hasSkill('mountain') ? 2 : Infinity;
    let cost = TERRAIN_COST[t];
    if (t === 'hills' && this.isTower(hex)) cost = 4;
    if (this.wayfarer && this.wayfarer.mode === 'cost' && this.wayfarer.terrain === t) cost = Math.max(0, cost - 1);
    return cost;
  }
  /** Why you cannot leave your hex right now, or null. */
  held() {
    const h = this.here(); if (!h) return null;
    if (h.site === 'storm' && this.storm && !this.storm.escaped) return 'storm';
    if (h.quest && !this.bribed) return 'quest';
    return null;
  }

  // ================================================================ points
  clearPool() { this.pool = emptyPool(); }
  poolCat(cat) { return sum(POINTS.filter((t) => CATEGORY[t] === cat), (t) => this.pool[t]); }
  gain(t, n) {
    const cat = CATEGORY[t];
    // Generating a different point type loses what you had stored. Against a Slow attacker, move and block mix.
    const slowMix = this.cmb && this.cmb.phase === 'block' && this.cmb.pending.some((a) => !a.done && this.attacker(a).abil.has('slow'));
    for (const p of POINTS) {
      const c = CATEGORY[p];
      if (c === cat || !this.pool[p]) continue;
      if (slowMix && ((c === 'move' && cat === 'blk') || (c === 'blk' && cat === 'move'))) continue;
      this.pool[p] = 0;
    }
    this.pool[t] += n;
  }
  resetTurn() {
    this.used = 0; this.extra = 0; this.precision = false; this.meleeRanged = false; this.feints = 0; this.brutes = [];
    this.wayfarer = null; this.clearPool();
    for (const s of this.skills || []) s.used = false;
  }

  // ================================================================ wounds and healing
  wound(n, why = '') {
    if (n <= 0) return;
    this.wounds += n;
    this.log(`You take ${n} wound${n > 1 ? 's' : ''}${why ? ` (${why})` : ''}.`, 'bad');
    if (this.wounds >= this.maxWounds) { this.wounds = this.maxWounds; throw new GameOver(false, 'you were overcome by your wounds'); }
  }
  healCost(a) { return Math.max(1, Math.floor(this.allyDef(a).hp / 2)); }
  canHeal(points = 1) { return this.wounds > 0 || this.injured || this.allies.some((a) => a.wounded && this.healCost(a) <= points); }
  async heal(n) {
    while (n > 0) {
      const opts = [];
      if (this.wounds > 0) opts.push({ id: 'wound', label: 'Remove a wound' });
      if (this.injured) opts.push({ id: 'injury', label: 'Remove your injury' });
      this.allies.forEach((a, i) => { if (a.wounded && this.healCost(a) <= n) opts.push({ id: `ally:${i}`, ally: i, label: `Heal ${this.allyName(a)} (${this.healCost(a)})` }); });
      if (!opts.length) return;
      const pick = opts.length === 1 && opts[0].id !== 'injury' && !opts[0].id.startsWith('ally') ? opts[0]
        : await this.choose(`Healing: ${n} point${n > 1 ? 's' : ''}`, [...opts, { id: 'cancel', label: 'Skip the rest' }], { ctx: 'heal' });
      if (pick.id === 'cancel') return;
      if (pick.id === 'wound') { this.wounds--; n--; this.log('Healed 1 wound.', 'good'); }
      else if (pick.id === 'injury') { this.injured = false; n--; this.log('Your injury is healed.', 'good'); }
      else { const a = this.allies[+pick.id.split(':')[1]]; a.wounded = false; n -= this.healCost(a); this.log(`${this.allyName(a)} is healed.`, 'good'); }
    }
  }
  async exhaust(obj) {
    obj.exhausted = true;
    // Courage: "3 exhausted: -1 heart".
    if (this.lum.perk === 'exhaust3' && [...this.allies, ...this.skills].filter((x) => x.exhausted).length === 3 && this.wounds > 0) {
      this.wounds--; this.log('Courage: with 3 exhausted, you heal 1 wound.', 'good');
    }
  }

  // ================================================================ generating points
  reachable() { return this.lum.mat.arrows.filter((a) => a.from === this.marker && this.level >= UNLOCK[a.color]); }
  genOptions() {
    const o = [];
    if (this.actionsLeft > 0) for (const a of this.reachable()) o.push({ id: `ab:${a.to}`, sq: a.to, label: `Ability ${a.to}`, wound: a.wound });
    this.allies.forEach((a, i) => { if (!a.exhausted && !a.wounded) { const [t, n] = this.allyDef(a).eff; o.push({ id: `ally:${i}`, ally: i, label: `${this.allyName(a)}: ${n} ${POINT_NAME[t].toLowerCase()}` }); } });
    this.skills.forEach((s, i) => { if (this.skillUsable(s)) o.push({ id: `skill:${i}`, skill: i, label: this.skillName(s) }); });
    return o;
  }
  async doGen(id) {
    const [kind, arg] = id.split(':');
    if (kind === 'ab') return this.useAbility(arg);
    if (kind === 'ally') { const a = this.allies[+arg]; await this.exhaust(a); this.log(`${this.allyName(a)} is exhausted.`); const [t, n] = this.allyDef(a).eff; await this.applyParts([{ t, n }], { ally: true }); return true; }
    if (kind === 'skill') return this.useSkill(this.skills[+arg]);
    return false;
  }
  async moveMarker(arrow) {
    this.marker = arrow.to;
    if (arrow.wound) this.wound(1, 'a perilous path on your ability mat');
  }
  async useAbility(to) {
    const arrow = this.reachable().find((a) => a.to === to); const sq = this.lum.mat.squares[to];
    const opts = [];
    sq.basic.forEach((alt, i) => opts.push({ id: `b${i}`, label: cap(describeParts(alt)), kind: 'basic' }));
    const pays = [];
    if (sq.cost === 'wound') pays.push(['wound', 'take 1 wound']);
    else {
      if (!this.source.used && this.sourceFace.includes(sq.cost)) pays.push(['source', `${sq.cost} from the source`]);
      if (this.shards[sq.cost] > 0) pays.push(['stored', `a stored ${sq.cost} shard`]);
    }
    sq.boost.forEach((alt, i) => { for (const [p, text] of pays) opts.push({ id: `s${i}:${p}`, label: `${cap(describeParts(alt))}`, pay: text, cost: sq.cost, kind: 'boost' }); });
    if (!pays.length) sq.boost.forEach((alt, i) => opts.push({ id: `x${i}`, label: cap(describeParts(alt)), pay: `needs ${sq.cost === 'wound' ? 'a wound' : `a ${sq.cost} shard`}`, cost: sq.cost, kind: 'boost', disabled: true }));
    for (const t of ['move', 'inf', 'pb', 'pm']) opts.push({ id: `std:${t}`, label: `1 ${POINT_NAME[t].toLowerCase()}`, kind: 'std' });
    opts.push({ id: 'adv', label: 'Advance only', kind: 'std' }, { id: 'cancel', label: 'Cancel' });
    const pick = await this.choose(`Ability ${to}${arrow.wound ? ' (costs 1 wound to reach)' : ''}`, opts, { ctx: 'ability', detail: to });
    if (pick.id === 'cancel') return false;
    this.used++;
    await this.moveMarker(arrow);
    if (pick.id === 'adv') { this.log(`Advanced to ${to} without using it.`); return true; }
    if (pick.id.startsWith('std:')) { const t = pick.id.slice(4); this.log(`Ability ${to}: 1 ${POINT_NAME[t].toLowerCase()} (standard).`); await this.applyParts([{ t, n: 1 }], { ability: true, standard: true }); return true; }
    if (pick.id[0] === 'b') { const alt = sq.basic[+pick.id.slice(1)]; this.log(`Ability ${to}: ${describeParts(alt)}.`); await this.applyParts(alt, { ability: true }); return true; }
    const [alt, pay] = [sq.boost[+pick.id.slice(1).split(':')[0]], pick.id.split(':')[1]];
    if (pay === 'wound') this.wound(1, 'boosting an ability');
    else if (pay === 'source') this.source.used = true;
    else this.shards[sq.cost]--;
    this.log(`Ability ${to} boosted (${pick.pay}): ${describeParts(alt)}.`);
    await this.applyParts(alt, { ability: true });
    return true;
  }
  async applyParts(parts, src = {}) {
    for (const part of parts) {
      let { t, n } = part;
      if (POINT_NAME[t]) {
        if (src.ability && !src.standard && (t === 'pr' || t === 'mr') && this.readySkill('hunter')) n += 1;
        if (t === 'inf' && src.ability) {
          const conv = [['parley', 'pb'], ['parleyMagic', 'mb']].filter(([s]) => this.readySkill(s));
          if (conv.length) {
            const pick = await this.choose(`Change ${n} influence to block?`, [{ id: 'keep', label: `Keep ${n} influence` }, ...conv.map(([s, to]) => ({ id: s, label: `${n} ${POINT_NAME[to].toLowerCase()} (${SKILLS[s].name})` }))], { ctx: 'mod' });
            if (pick.id !== 'keep') { this.readySkill(pick.id).used = true; t = pick.id === 'parley' ? 'pb' : 'mb'; this.log(`${SKILLS[pick.id].name}: the influence becomes ${POINT_NAME[t].toLowerCase()}.`); }
          }
        }
        if ((t === 'pb' || t === 'mb') && (src.ability || src.ally)) {
          for (;;) {
            const opts = [{ id: 'keep', label: `Keep ${n} ${POINT_NAME[t].toLowerCase()}` }];
            if (this.readySkill('swap')) opts.push({ id: 'swap', label: `Change to ${POINT_NAME[t === 'pb' ? 'mb' : 'pb'].toLowerCase()} (Shift Guard)` });
            if (this.readySkill('bulwark')) opts.push({ id: 'bulwark', label: `Double to ${n * 2} (Bulwark)` });
            if (opts.length === 1) break;
            const pick = await this.choose('Modify this block?', opts, { ctx: 'mod' });
            if (pick.id === 'keep') break;
            if (pick.id === 'swap') { this.readySkill('swap').used = true; t = t === 'pb' ? 'mb' : 'pb'; this.log(`Shift Guard: now ${POINT_NAME[t].toLowerCase()}.`); }
            else { await this.exhaust(this.readySkill('bulwark')); n *= 2; this.log(`Bulwark: doubled to ${n}.`); }
          }
        }
        this.gain(t, n);
      } else if (t === 'save') {
        if (this.source.used) { this.log('The source is already spent; nothing to save.'); continue; }
        const face = this.sourceFace;
        const el = face.length === 1 ? face[0] : (await this.choose('Save which shard from the source?', face.map((e) => ({ id: e, el: e, label: EL_NAME[e] })), { ctx: 'shard' })).id;
        this.source.used = true; this.gainShard(el);
      } else if (t === 'prec') { this.precision = true; this.log('Your ranged attacks have precision this turn.'); }
      else if (t === 'feint') { this.feints++; this.log('Feint: you may ignore 1 ability on 1 enemy this turn.'); }
      else if (t === 'brute') { this.brutes.push(n); this.log(`Brute force: you may ignore ${n === 'phys' ? 'physical' : 'photonic'} resistance on 1 enemy this turn.`); }
    }
  }
  async advanceFree(optional) {
    const arrows = this.reachable(); if (!arrows.length) return;
    const opts = arrows.map((a) => ({ id: `adv:${a.to}`, sq: a.to, label: `Advance to ${a.to}`, wound: a.wound }));
    if (optional) opts.push({ id: 'cancel', label: 'Stay' });
    const pick = await this.choose('Advance your ability marker (free)', opts, { ctx: 'advance' });
    if (pick.id === 'cancel') return;
    await this.moveMarker(arrows.find((a) => a.to === pick.sq));
    this.log(`Ability marker advanced to ${pick.sq}.`);
  }

  // ================================================================ skills
  skillUsable(s) {
    const def = SKILLS[s.skill];
    if (s.exhausted || def.kind === 'passive' || def.mod) return false;
    if (def.kind === 'turn' && s.used) return false;
    if (def.kind === 'action' && this.actionsLeft <= 0) return false;
    const c = this.cmb;
    switch (s.skill) {
      case 'mend': return this.canHeal(2);
      case 'mender': return !!c && c.fresh;
      case 'darkwatcher': return !!c && c.fresh && c.E.some((e) => !e.out && !e.foe.shade && this.xp.some((x) => !!x.doom === !!e.foe.doom));
      case 'hunter': return !!c && c.phase !== 'block' && c.E.some((e) => !e.out && this.stats(e.foe, e).fort > 0);
      case 'scorchwright': return false; // offered as a combat option when its condition is met
      case 'wayfarer': return !c;
      default: return true;
    }
  }
  async useSkill(s) {
    const def = SKILLS[s.skill]; const c = this.cmb;
    const live = c ? c.E.filter((e) => !e.out) : [];
    const pickEnemy = async (title, list) => { const p = await this.choose(title, [...list.map((e) => ({ id: `e:${c.E.indexOf(e)}`, enemy: c.E.indexOf(e), label: this.stats(e.foe, e).name })), { id: 'cancel', label: 'Cancel' }], { ctx: 'target' }); return p.id === 'cancel' ? null : c.E[+p.id.slice(2)]; };
    // Choices that can be cancelled come before the cost is paid.
    let target = null, choice = null;
    if (s.skill === 'mender') { target = await pickEnemy('Mender: which enemy has -1 HP?', live); if (!target) return false; }
    if (s.skill === 'hunter') { target = await pickEnemy("Hunter: ignore which enemy's fortification?", live.filter((e) => this.stats(e.foe, e).fort > 0)); if (!target) return false; }
    if (s.skill === 'darkwatcher') {
      const opts = [];
      live.forEach((e) => { if (!e.foe.shade) this.xp.forEach((x, j) => { if (!!x.doom === !!e.foe.doom) opts.push({ id: `${c.E.indexOf(e)}:${j}`, enemy: c.E.indexOf(e), label: `${this.stats(e.foe, e).name} leaves, ${ENEMY_NAME[x.id]} takes its place` }); }); });
      choice = await this.choose('Darkwatcher: swap which enemy?', [...opts, { id: 'cancel', label: 'Cancel' }], { ctx: 'target' });
      if (choice.id === 'cancel') return false;
    }
    if (s.skill === 'guard') { choice = await this.choose('Guard', [{ id: 'pb', label: '2 physical block' }, { id: 'move', label: '2 move' }, { id: 'cancel', label: 'Cancel' }], { ctx: 'mod' }); if (choice.id === 'cancel') return false; }
    if (s.skill === 'ward') { choice = await this.choose('Ward', [{ id: 'pb', label: '3 physical block' }, { id: 'mb', label: '3 photonic block' }, { id: 'cancel', label: 'Cancel' }], { ctx: 'mod' }); if (choice.id === 'cancel') return false; }
    if (s.skill === 'wayfarer') {
      const t = await this.choose('Wayfarer: declare a terrain', [...Object.keys(TERRAIN_NAME).map((k) => ({ id: k, label: TERRAIN_NAME[k] })), { id: 'cancel', label: 'Cancel' }], { ctx: 'mod' });
      if (t.id === 'cancel') return false;
      const m = await this.choose(`Wayfarer: ${TERRAIN_NAME[t.id]}`, [{ id: 'cost', label: 'Costs 1 less to move into this turn' }, { id: 'shard', label: 'Gain 1 shard each time you move into it this turn' }, { id: 'cancel', label: 'Cancel' }], { ctx: 'mod' });
      if (m.id === 'cancel') return false;
      choice = { terrain: t.id, mode: m.id };
    }
    // Pay.
    if (def.kind === 'exhaust') await this.exhaust(s);
    else if (def.kind === 'turn') s.used = true;
    else if (def.kind === 'action') this.used++;
    this.log(`${def.name} used.`);
    switch (s.skill) {
      case 'stride': this.gain('move', 1); await this.advanceFree(false); break;
      case 'guard': this.gain(choice.id, 2); break;
      case 'ward': this.gain(choice.id, 3); break;
      case 'feint': this.feints++; break;
      case 'volley': case 'aim': this.gain('pr', 2); this.precision = true; break;
      case 'shardWind': case 'shardFire': case 'shardEarth': this.gainShard(def.el); await this.advanceFree(true); break;
      case 'surge': this.extra++; break;
      case 'longshot': this.meleeRanged = true; break;
      case 'mend': await this.heal(2); break;
      case 'wayfarer': this.wayfarer = choice; break;
      case 'mender': target.mender = true; this.log(`${this.stats(target.foe, target).name} is weakened.`); await this.heal(2); break;
      case 'hunter': target.fortIgnore++; this.log(`${this.stats(target.foe, target).name} loses a layer of fortification.`); break;
      case 'darkwatcher': {
        const [ei, xi] = choice.id.split(':').map(Number); const e = c.E[ei]; const x = this.xp[xi];
        [e.foe.id, x.id] = [x.id, e.foe.id];
        this.log(`${ENEMY_NAME[x.id]} slips away; ${ENEMY_NAME[e.foe.id]} takes its place.`);
        break;
      }
    }
    return true;
  }
  async gainSkill(title = 'Choose a skill') {
    this.fillOffer();
    if (!this.offer.length) { this.log('No skill tokens remain.'); return; }
    const pick = await this.choose(title, this.offer.map((id, i) => ({ id: `offer:${i}`, offer: i, label: SKILLS[TOKENS[id].skill].name, text: SKILLS[TOKENS[id].skill].text })), { ctx: 'skill' });
    const id = this.offer.splice(+pick.id.split(':')[1], 1)[0];
    this.skills.push({ skill: TOKENS[id].skill, id, exhausted: false, used: false });
    this.log(`New skill: ${SKILLS[TOKENS[id].skill].name}.`, 'good');
    this.fillOffer();
  }

  // ================================================================ the turn
  async playTurn() {
    this.turnNo++; this.resetTurn();
    this.log(`Round ${this.round}, turn ${this.turn}.`, 'turn');
    for (;;) {
      this.checkWin();
      const opts = this.turnOptions();
      const pick = await this.choose('Your turn', opts, { ctx: 'turn' });
      if (pick.id === 'end') break;
      await this.doTurnOption(pick);
    }
    await this.endTurn();
  }
  canStormXp() { const h = this.here(); return !!h && h.site === 'storm' && !h.mark && !!this.storm && this.storm.escaped && this.storm.turn === this.turnNo; }
  nextCost() { return this.level < 8 ? this.lum.levels[this.level].cost : Infinity; }
  canLevel() { return this.level < 8 && this.xpTotal + (this.canStormXp() ? this.pool.move : 0) >= this.nextCost(); }
  questPayable(hex) {
    const q = QUESTS[hex.quest.q][hex.quest.side]; const [need, n] = q.need;
    return sum(NEED_TYPES[need], (t) => this.pool[t]) >= n;
  }
  turnOptions() {
    const o = this.genOptions();
    const here = this.here(); const held = this.held();
    if (!held) {
      for (const [dx, dr] of DIRS) {
        const h = this.hexes.get(K(this.pos.x + dx, this.pos.r + dr)); if (!h) continue;
        const cost = this.moveCost(h);
        if (cost <= this.pool.move) o.push({ id: `move:${h.k}`, hex: h.k, label: `Move here (${cost})`, cost, fight: this.foesAt(h).length > 0 || (this.isTower(h) && !h.spawned) });
      }
      if (this.pool.move >= 2) for (const dir of Object.keys(PLACEMENTS)) { const spot = this.exploreSpot(dir); if (spot) o.push({ id: `explore:${dir}`, explore: dir, spot, label: `Explore ${dir} (2 move)` }); }
    }
    if (held === 'storm' && this.pool.move >= 2) o.push({ id: 'escape', label: 'Navigate the storm (2 move)', primary: true });
    if (here && here.quest) {
      const q = QUESTS[here.quest.q][here.quest.side];
      o.push({ id: 'quest', label: `Complete the side quest (${q.need[1]} ${NEED_NAME[q.need[0]]})`, primary: true, disabled: !this.questPayable(here) });
      if (!this.bribed) o.push({ id: 'bribe', label: `Bribe your way out (${q.shards.join(', ')})` });
    }
    // Fights: wandering enemies next to you, and anything left alive in your own hex.
    for (const h of this.neighbors(this.pos.x, this.pos.r)) if (h.enemy && h.enemy.kind === 'wander' && h.enemy.alive && !h.enemy.scorched && h.enemy.fought !== this.turnNo) o.push({ id: `fight:${h.k}`, hex: h.k, label: `Attack ${ENEMY_NAME[h.enemy.id]}` });
    if (here) { const foes = this.foesAt(here).filter((f) => f.fought !== this.turnNo); if (foes.length) o.push({ id: 'fight:here', label: here.k === this.city.key ? 'Assault the city' : `Attack ${this.stats(foes[0]).name}`, primary: true }); }
    if (here && (here.site === 'town' || here.site === 'caravan')) {
      const extra = here.site === 'caravan' ? 1 : 0;
      this.offer.forEach((id, i) => { const cost = TOKENS[id].cost + extra; if (cost <= this.pool.inf && this.capacity > 0) o.push({ id: `recruit:${i}`, offer: i, label: `Recruit ${ENEMY_NAME[id]} (${cost} influence)` }); });
      if (!here.mark && here.site === 'town' && this.pool.inf >= 2) {
        if (this.canHeal(1)) o.push({ id: 'buyheal', label: 'Buy 1 healing (2 influence)' });
        if (ELEMENTS.some((e) => this.shards[e] < 5)) o.push({ id: 'buyshard', label: 'Buy a shard (2 influence)' });
      }
      if (!here.mark && here.site === 'caravan' && (here.bought || 0) < 3 && this.xp.length && ELEMENTS.some((e) => this.shards[e] < 5)) o.push({ id: 'cvshard', label: 'Trade XP for shards' });
    }
    if (this.canLevel()) o.push({ id: 'level', label: `Level up to ${this.level + 1} (${this.nextCost()} XP)`, primary: true });
    o.push({ id: 'end', label: 'End turn' });
    return o;
  }
  async doTurnOption(pick) {
    const [kind, arg] = pick.id.split(':'); const here = this.here();
    if (await this.doGen(pick.id)) return;
    switch (kind) {
      case 'move': return this.moveTo(this.hexes.get(arg));
      case 'explore': {
        const spot = this.exploreSpot(arg); this.pool.move -= 2;
        this.log(`You explore ${arg}ward.`);
        this.placeTile(this.tileStack.shift(), spot.ox, spot.or); this.reveal(); return;
      }
      case 'escape': this.pool.move -= 2; this.storm.escaped = true; this.log('You navigate the storm.'); return;
      case 'quest': return this.completeQuest(here);
      case 'bribe': return this.bribe(here);
      case 'fight': {
        const foes = arg === 'here' ? this.foesAt(here).filter((f) => f.fought !== this.turnNo) : [this.hexes.get(arg).enemy];
        return this.combat(foes);
      }
      case 'recruit': return this.recruit(+arg, here);
      case 'buyheal': this.pool.inf -= 2; this.usedSites.add(here.k); this.log('You buy healing in town.'); return this.heal(1);
      case 'buyshard': this.pool.inf -= 2; this.usedSites.add(here.k); return this.gainAnyShard('Buy which shard?');
      case 'cvshard': return this.caravanTrade(here);
      case 'level': return this.levelUp();
    }
  }
  async moveTo(hex) {
    const from = { ...this.pos }; const cost = this.moveCost(hex);
    const near = this.neighbors(from.x, from.r).filter((h) => h.enemy && h.enemy.kind === 'wander' && h.enemy.alive && !h.enemy.scorched).map((h) => h.enemy);
    this.pool.move -= cost;
    this.pos = { x: hex.x, r: hex.r };
    this.storm = hex.site === 'storm' ? { key: hex.k, escaped: false, turn: this.turnNo } : null;
    this.bribed = false;
    this.log(`You move into ${hex.quest ? 'a side quest' : TERRAIN_NAME[hex.terrain].toLowerCase()}${hex.site && !hex.quest ? ` (${SITE_NAME[hex.site].toLowerCase()})` : ''} for ${cost}.`);
    if (this.wayfarer && this.wayfarer.mode === 'shard' && this.wayfarer.terrain === hex.terrain) await this.gainAnyShard('Wayfarer: gain a shard');
    this.reveal();
    if (this.isTower(hex) && !hex.spawned) this.spawnTower(hex);
    const foes = this.foesAt(hex);
    // Moving from one hex next to a wandering enemy to another hex next to it provokes it.
    for (const f of near) { const fh = this.hexes.get(f.key); if (fh !== hex && this.adjacent(fh, this.pos) && !foes.includes(f)) { foes.push(f); this.log(`${ENEMY_NAME[f.id]} is provoked!`, 'bad'); } }
    if (foes.length) await this.combat(foes);
  }
  async completeQuest(hex) {
    const q = QUESTS[hex.quest.q][hex.quest.side]; const [need, n] = q.need;
    let left = n; for (const t of NEED_TYPES[need]) { const use = Math.min(left, this.pool[t]); left -= use; }
    this.clearPool();
    this.rep.push(hex.quest); hex.quest = null; this.bribed = false;
    this.log(`Side quest complete: +${q.rep} reputation.`, 'good');
    for (const el of q.shards) this.gainShard(el);
  }
  async bribe(hex) {
    const q = QUESTS[hex.quest.q][hex.quest.side]; let short = 0;
    for (const el of q.shards) { if (this.shards[el] > 0) this.shards[el]--; else short++; }
    this.bribed = true;
    this.log(`You bribe your way out of the side quest${short ? `, ${short} shard${short > 1 ? 's' : ''} short` : ''}.`);
    this.wound(short, 'unpaid bribe');
  }
  async recruit(i, hex) {
    const id = this.offer[i]; const cost = TOKENS[id].cost + (hex.site === 'caravan' ? 1 : 0);
    if (this.allies.length >= this.capacity) {
      const pick = await this.choose('Your company is full. Disband an ally?', [...this.allies.map((a, j) => ({ id: `ally:${j}`, ally: j, label: `Disband ${this.allyName(a)}` })), { id: 'cancel', label: 'Cancel' }], { ctx: 'disband' });
      if (pick.id === 'cancel') return;
      const [gone] = this.allies.splice(+pick.id.split(':')[1], 1);
      if (!gone.prof) this.returnToken(gone.id);
      this.log(`${this.allyName(gone)} leaves your company.`);
    }
    this.pool.inf -= cost; this.offer.splice(i, 1);
    this.allies.push({ id, exhausted: false, wounded: false });
    this.log(`${ENEMY_NAME[id]} joins you for ${cost} influence.`, 'good');
  }
  async caravanTrade(hex) {
    const pick = await this.choose('Discard which XP token? (1 shard per XP, 3 at most per caravan)', [...this.xp.map((x, i) => ({ id: `xp:${i}`, xp: i, label: `${ENEMY_NAME[x.id]} (${this.xpValue(x)} XP)` })), { id: 'cancel', label: 'Cancel' }], { ctx: 'xp' });
    if (pick.id === 'cancel') return;
    const [x] = this.xp.splice(+pick.id.split(':')[1], 1); this.returnToken(x.id);
    const n = Math.min(this.xpValue(x), 3 - (hex.bought || 0));
    hex.bought = (hex.bought || 0) + n; this.usedSites.add(hex.k);
    for (let i = 0; i < n && ELEMENTS.some((e) => this.shards[e] < 5); i++) await this.gainAnyShard(`Caravan: shard ${i + 1} of ${n}`);
  }
  async levelUp() {
    const cost = this.nextCost(); const sel = new Set();
    for (;;) {
      const paid = sum([...sel], (i) => this.xpValue(this.xp[i])); const need = cost - paid;
      const opts = this.xp.map((x, i) => ({ id: `xp:${i}`, xp: i, on: sel.has(i), label: `${ENEMY_NAME[x.id]} (${this.xpValue(x)} XP)` }));
      if (need > 0 && this.canStormXp() && this.pool.move >= need) opts.push({ id: 'storm', label: `Pay the remaining ${need} with storm movement`, primary: true });
      opts.push({ id: 'confirm', label: need <= 0 ? `Level up${need < 0 ? ` (${-need} XP wasted)` : ''}` : `Level up (${need} more needed)`, primary: true, disabled: need > 0 }, { id: 'cancel', label: 'Cancel' });
      const pick = await this.choose(`Spend ${cost} XP for level ${this.level + 1}`, opts, { ctx: 'level', detail: `Chosen: ${paid} XP` });
      if (pick.id === 'cancel') return;
      if (pick.id.startsWith('xp:')) { const i = +pick.id.slice(3); if (sel.has(i)) sel.delete(i); else sel.add(i); continue; }
      if (pick.id === 'storm') { this.pool.move -= need; this.here().mark = 'black'; this.log(`The storm grants ${need} XP.`); }
      break;
    }
    const spent = [...sel].sort((a, b) => b - a).map((i) => this.xp.splice(i, 1)[0]);
    for (const x of spent) this.returnToken(x.id);
    this.level++;
    this.log(`You reach level ${this.level}! Armor ${this.armor}.`, 'big');
    for (const g of this.lv.gain) { if (g === 'skill') await this.gainSkill(); else this.log('You can lead one more ally.', 'good'); }
  }

  async endTurn() {
    // Scorchwright marks come due at the end of the turn after they were placed.
    for (const s of this.scorched.filter((x) => this.turnNo >= x.due)) { this.log(`${this.stats(s.foe).name} succumbs to the scorch mark.`, 'good'); this.defeatFoe(s.foe); }
    this.scorched = this.scorched.filter((x) => this.turnNo < x.due);
    this.checkWin();
    if (this.source.used) this.rollSource();
    const h = this.here();
    if (h) {
      if (h.site === 'heal' && this.canHeal(1)) { this.log('The healing garden restores you.'); await this.heal(1); }
      if (h.site === 'crystal') await this.gainAnyShard('Shard garden: gain a shard');
      if (h.terrain === 'lake' && this.hasSkill('lake')) this.gainShard('wind');
      if (h.terrain === 'mountain' && this.hasSkill('mountain')) this.gainShard('earth');
    }
    for (const k of this.usedSites) { const s = this.hexes.get(k); if (!s.mark) { s.mark = 'black'; this.log(`The ${SITE_NAME[s.site].toLowerCase()} is exhausted: no more healing or shards there.`); } }
    this.usedSites.clear();
    this.fillOffer();
    this.checkWin();
    const was = this.turn;
    const blocked = (t) => this.woundPos >= 2 * (7 - t);
    if (was >= 6 || blocked(was + 1)) return this.endRound();
    this.turn = was + 1;
  }
  endRound() {
    this.round++;
    if (this.round > ROUNDS) throw new GameOver(false, 'time has run out');
    this.turn = 1;
    this.rollSource();
    this.refreshOffer();
    for (const x of [...this.allies, ...this.skills]) x.exhausted = false;
    this.log(`Round ${this.round} begins. Allies and skills are refreshed.`, 'big');
  }

  // ================================================================ combat
  async combat(foes) {
    this.clearPool();
    const c = this.cmb = {
      E: foes.map((foe) => ({ foe, hpBonus: 0, mender: false, ignored: new Set(), bruted: new Set(), fortIgnore: 0, blocked: false, intimidated: false, out: false })),
      phase: 'ranged', fresh: true, woundsTaken: false, pending: [],
    };
    c.hidden = c.E.some((e) => this.stats(e.foe).abil.has('hidden'));
    for (const f of foes) f.fought = this.turnNo;
    this.log(`Combat: ${c.E.map((e) => this.stats(e.foe, e).name + (e.foe.doom ? ' (Doom)' : '')).join(', ')}.`, 'big');
    try {
      await this.attackPhase('ranged');
      if (this.live().length) await this.blockPhase();
      if (this.live().length) await this.attackPhase('melee');
      if (this.live().length) this.log('The combat ends. Surviving enemies recover.');
    } finally { this.cmb = null; this.clearPool(); }
    this.checkWin();
  }
  live() { return this.cmb.E.filter((e) => !e.out); }
  rangedOK(e) { const st = this.stats(e.foe, e); if (st.fort >= 2) return false; if (st.fort === 1 || st.abil.has('flying')) return this.precision; return true; }
  /** Effective attack of the stored points against a group of enemies in a phase. */
  attackValue(group, phase) {
    const sts = group.map((e) => this.stats(e.foe, e));
    const physHalf = sts.some((s) => s.resist.has('phys')), magHalf = sts.some((s) => s.resist.has('magic'));
    const flying = phase === 'melee' && sts.some((s) => s.abil.has('flying'));
    const groups = {};
    for (const t of ['pm', 'pr', 'mm', 'mr']) {
      const ranged = t === 'pr' || t === 'mr' || this.meleeRanged;
      if (phase === 'ranged' && !ranged) continue;
      let div = (t[0] === 'p' ? physHalf : magHalf) ? 2 : 1;
      if (flying && !ranged) div *= 2;
      groups[div] = (groups[div] || 0) + this.pool[t];
    }
    return sum(Object.entries(groups), ([div, n]) => Math.floor(n / div));
  }
  /** What actually attacks for a pending attack (Commander substitutes another enemy). */
  attacker(a) {
    if (a.fixed) return a.fixed;
    const st = this.stats(a.e.foe, a.e);
    if (a.sub) { const s = ENEMIES[a.sub]; return { name: `${ENEMY_NAME[a.sub]} (sent by ${st.name})`, atk: s.atk, type: s.type, abil: new Set(s.abil) }; }
    return { name: st.name, atk: st.atk, type: st.type, abil: st.abil };
  }
  blockNeed(att) { return att.atk * (att.abil.has('aggressive') ? 2 : 1); }
  blockValue(att) {
    const eff = att.type === 'monster' ? 'pb' : 'mb', ineff = att.type === 'monster' ? 'mb' : 'pb';
    return this.pool[eff] + Math.floor(this.pool[ineff] / 2) + (att.abil.has('slow') ? this.pool.move : 0);
  }
  combatTools() {
    const c = this.cmb; const o = [];
    const live = this.live();
    if (this.feints > 0 && live.some((e) => this.stats(e.foe, e).abil.size)) o.push({ id: 'feint', label: `Feint: ignore an ability (${this.feints})` });
    for (const r of new Set(this.brutes)) if (live.some((e) => this.stats(e.foe, e).resist.has(r))) o.push({ id: `brute:${r}`, label: `Brute force: ignore ${r === 'phys' ? 'physical' : 'photonic'} resistance` });
    if (c.phase !== 'melee') live.forEach((e) => {
      const st = this.stats(e.foe, e); const i = c.E.indexOf(e);
      const pendingDone = c.phase === 'block' && !c.pending.some((a) => a.e === e && !a.done);
      if (!st.shade && !e.intimidated && !pendingDone && this.reputation >= st.xp) o.push({ id: `intim:${i}`, enemy: i, label: `Intimidate (${st.xp} reputation)` });
    });
    return o;
  }
  async doCombatTool(pick) {
    const c = this.cmb; const [kind, arg] = pick.id.split(':');
    if (kind === 'feint') {
      const opts = [];
      this.live().forEach((e) => { for (const a of this.stats(e.foe, e).abil) opts.push({ id: `${c.E.indexOf(e)}:${a}`, enemy: c.E.indexOf(e), label: `${this.stats(e.foe, e).name}: ${ABILITY_TEXT[a][0]}` }); });
      const p = await this.choose('Feint: ignore which ability?', [...opts, { id: 'cancel', label: 'Cancel' }], { ctx: 'target' });
      if (p.id === 'cancel') return true;
      const [ei, ab] = p.id.split(':'); c.E[+ei].ignored.add(ab); this.feints--;
      if (ab === 'hidden') c.hidden = false;
      this.log(`Feint: ${p.label} is ignored.`);
      return true;
    }
    if (kind === 'brute') {
      const list = this.live().filter((e) => this.stats(e.foe, e).resist.has(arg));
      const p = await this.choose('Brute force: against which enemy?', [...list.map((e) => ({ id: `e:${c.E.indexOf(e)}`, enemy: c.E.indexOf(e), label: this.stats(e.foe, e).name })), { id: 'cancel', label: 'Cancel' }], { ctx: 'target' });
      if (p.id === 'cancel') return true;
      c.E[+p.id.slice(2)].bruted.add(arg); this.brutes.splice(this.brutes.indexOf(arg), 1);
      this.log(`Brute force: ${p.label}'s resistance is ignored.`);
      return true;
    }
    if (kind === 'intim') {
      const e = c.E[+arg]; const st = this.stats(e.foe, e);
      const pay = cheapestSubset(this.rep, (q) => QUESTS[q.q][q.side].rep, st.xp);
      for (const q of pay) { this.rep.splice(this.rep.indexOf(q), 1); this.questPile.push(q.q); }
      e.intimidated = true;
      const a = c.pending.find((x) => x.e === e); if (a) a.done = true;
      this.log(`You intimidate ${st.name}: it will not attack this combat.`, 'good');
      return true;
    }
    return false;
  }
  async attackPhase(phase) {
    const c = this.cmb; c.phase = phase;
    for (;;) {
      const live = this.live(); if (!live.length) return;
      const opts = [...this.genOptions(), ...this.combatTools()];
      const can = phase === 'ranged' ? live.filter((e) => this.rangedOK(e)) : live;
      for (let mask = 1; mask < 1 << can.length; mask++) {
        const g = can.filter((_, i) => mask & (1 << i));
        const need = sum(g, (e) => this.stats(e.foe, e).hp);
        if (this.attackValue(g, phase) >= need) opts.push({ id: `kill:${g.map((e) => c.E.indexOf(e)).join(',')}`, enemies: g.map((e) => c.E.indexOf(e)), label: `Defeat ${g.map((e) => this.stats(e.foe, e).name).join(' + ')}`, primary: true });
      }
      if (phase === 'melee' && this.readySkill('scorchwright')) live.forEach((e) => {
        const hp = this.stats(e.foe, e).hp; const v = this.attackValue([e], phase);
        if (e.blocked && v >= Math.ceil(hp / 2) && v < hp) opts.push({ id: `scorch:${c.E.indexOf(e)}`, enemy: c.E.indexOf(e), label: `Scorch ${this.stats(e.foe, e).name}` });
      });
      opts.push({ id: 'next', label: phase === 'ranged' ? 'To the block phase' : 'End the combat' });
      const pick = await this.choose(phase === 'ranged' ? 'Ranged phase' : 'Melee phase', opts, { ctx: 'combat' });
      if (pick.id === 'next') { c.fresh = false; this.clearPool(); return; }
      if (await this.doCombatTool(pick)) continue;
      if (pick.id.startsWith('kill:')) {
        c.fresh = false;
        const g = pick.enemies.map((i) => c.E[i]);
        const vengeful = g.filter((e) => this.stats(e.foe, e).abil.has('vengeful'));
        this.clearPool();
        for (const e of g) { e.out = true; this.log(`${this.stats(e.foe, e).name} is defeated!`, 'good'); this.defeatFoe(e.foe); }
        this.checkWin();
        for (const e of vengeful) {
          const others = this.live().length; if (!others) continue;
          const st = this.stats(e.foe, e);
          this.log(`${st.name}'s vengeance: an attack of ${2 * others}.`, 'bad');
          const saved = { phase: c.phase, pending: c.pending };
          c.phase = 'block'; c.pending = [{ fixed: { name: `${st.name}'s vengeance`, atk: 2 * others, type: st.type, abil: new Set() } }];
          await this.blockLoop();
          c.phase = saved.phase; c.pending = saved.pending;
        }
        continue;
      }
      if (pick.id.startsWith('scorch:')) {
        c.fresh = false;
        const e = c.E[pick.enemy]; await this.exhaust(this.readySkill('scorchwright'));
        e.out = true; e.foe.scorched = true; this.scorched.push({ foe: e.foe, due: this.turnNo + 1 }); this.clearPool();
        this.log(`${this.stats(e.foe, e).name} is scorch-marked: it will fall at the end of your next turn.`, 'good');
        continue;
      }
      const startSkill = /^skill:/.test(pick.id) && ['mender', 'darkwatcher'].includes(this.skills[+pick.id.split(':')[1]].skill);
      if (await this.doGen(pick.id) && !startSkill) c.fresh = false;
    }
  }
  async blockPhase() {
    const c = this.cmb; c.phase = 'block'; c.fresh = false; this.clearPool();
    if (this.injured) this.wound(1, 'your injury');
    c.pending = this.live().filter((e) => !e.intimidated).map((e) => {
      const a = { e, done: false }; const st = this.stats(e.foe, e);
      if (st.abil.has('commander') && this.stacks[st.type].length) {
        const i = Math.floor(this.rnd() * this.stacks[st.type].length); this.info++;
        a.sub = this.stacks[st.type][i];
        this.log(`${st.name} commands ${ENEMY_NAME[a.sub]} to attack in its place.`);
      }
      return a;
    });
    await this.blockLoop();
    // Wounds past your turn marker cost extra, once, after all attacks.
    if (c.woundsTaken && this.woundPos > 0) {
      const col = 7 - Math.ceil(this.woundPos / 2);
      if (col < this.turn) this.wound(this.turn - col, 'your wounds passed your turn marker');
    }
    c.pending = [];
  }
  async blockLoop() {
    const c = this.cmb;
    for (;;) {
      const todo = c.pending.filter((a) => !a.done); if (!todo.length) return;
      const opts = [...this.genOptions(), ...this.combatTools()];
      for (const a of todo) {
        const att = this.attacker(a); const i = c.pending.indexOf(a); const ei = a.e ? c.E.indexOf(a.e) : undefined;
        if (att.abil.has('thief')) {
          const pay = cheapestSubset(this.xp, (x) => this.xpValue(x), att.atk);
          opts.push({ id: `pay:${i}`, enemy: ei, label: `Pay off ${att.name} (discard ${att.atk} XP)`, primary: true, disabled: !pay });
        } else {
          const need = this.blockNeed(att);
          opts.push({ id: `block:${i}`, enemy: ei, label: `Block ${att.name} (${need})`, primary: true, disabled: this.blockValue(att) < need });
        }
        opts.push({ id: `hit:${i}`, enemy: ei, label: `Take the hit from ${att.name} (${this.woundsFor(att)} wound${this.woundsFor(att) === 1 ? '' : 's'})`, danger: true });
      }
      const pick = await this.choose('Block phase', opts, { ctx: 'combat' });
      if (await this.doCombatTool(pick)) continue;
      const [kind, arg] = pick.id.split(':');
      if (kind === 'block' || kind === 'pay') {
        const a = c.pending[+arg]; const att = this.attacker(a);
        if (kind === 'pay') { for (const x of cheapestSubset(this.xp, (v) => this.xpValue(v), att.atk)) { this.xp.splice(this.xp.indexOf(x), 1); this.returnToken(x.id); } this.log(`You pay off ${att.name} with XP.`); }
        else { this.clearPool(); this.log(`You block ${att.name}.`, 'good'); }
        a.done = true; if (a.e) a.e.blocked = true;
        if (att.abil.has('anomaly') && this.canHeal(1)) { this.log('Anomaly: you heal 1.'); await this.heal(1); }
      } else if (kind === 'hit') {
        const a = c.pending[+arg]; await this.takeHit(a); a.done = true;
      } else await this.doGen(pick.id);
    }
  }
  hitDamage(att) { return att.atk * (att.abil.has('poison') ? 2 : 1); }
  woundsFor(att) { return Math.ceil(this.hitDamage(att) / this.armor); }
  async takeHit(a) {
    const c = this.cmb; const att = this.attacker(a);
    let dmg = this.hitDamage(att);
    this.log(`${att.name} hits for ${dmg}${att.abil.has('poison') ? ' (poison)' : ''}.`, 'bad');
    for (;;) {
      const soak = this.allies.map((al, i) => ({ al, i })).filter(({ al }) => !al.wounded);
      if (dmg <= 0 || !soak.length) break;
      const w = Math.ceil(dmg / this.armor);
      const pick = await this.choose(`${dmg} damage: ${w} wound${w > 1 ? 's' : ''} at armor ${this.armor}`, [
        ...soak.map(({ al, i }) => ({ id: `ally:${i}`, ally: i, label: `${this.allyName(al)} absorbs ${this.allyDef(al).hp}` })),
        { id: 'take', label: `Take ${w} wound${w > 1 ? 's' : ''}`, danger: true },
      ], { ctx: 'soak' });
      if (pick.id === 'take') break;
      const al = this.allies[+pick.id.split(':')[1]]; al.wounded = true; dmg -= this.allyDef(al).hp;
      this.log(`${this.allyName(al)} is wounded absorbing ${this.allyDef(al).hp} damage.`);
    }
    if (att.abil.has('deadly') && !this.injured) { this.injured = true; this.log('Deadly: you are injured.', 'bad'); }
    if (c.hidden && a.e) { a.e.hpBonus++; this.log(`Hidden: ${att.name} gains +1 HP for this combat.`); }
    if (dmg > 0) { c.woundsTaken = true; this.wound(Math.ceil(dmg / this.armor)); }
    if (att.abil.has('trap')) {
      const over = this.turn + 1 > this.turnLimit;
      if (this.turn < 6) this.turn++;
      this.log('Trap: your turn marker advances.', 'bad');
      if (over) this.wound(1, 'pushed past your turn limit');
    }
  }
  /** An enemy leaves the map for good: XP, marks, and the city. */
  defeatFoe(foe) {
    foe.alive = false; foe.scorched = false;
    if (!foe.shade) this.xp.push({ id: foe.id, doom: !!foe.doom });
    if (foe.kind === 'city') { if (this.city.enemies.every((f) => !f.alive)) { this.city.cleared = true; this.log('The city is cleared!', 'big'); } return; }
    const hex = this.hexes.get(foe.key);
    if (hex.enemy === foe) hex.enemy = null;
    if (foe.kind === 'tower') { hex.mark = 'red'; this.towers++; }
  }

  // ================================================================ goals, winning, score
  goalStatus(g) {
    switch (g) {
      case 'turns': return [this.turnsRemaining >= 2, `${this.turnsRemaining} turns remaining`];
      case 'reputation': return [this.reputation >= 6, `${this.reputation} of 6 reputation`];
      case 'tiles': { const marked = new Set([...this.hexes.values()].filter((h) => h.mark).map((h) => h.tile)).size; return [!this.tileStack.length && marked >= 5, `${this.tileStack.length} tiles unrevealed, ${marked} of 5 tiles marked`]; }
      case 'towers': return [this.towers >= 4, `${this.towers} of 4 towers`];
      case 'shards': { const n = sum(ELEMENTS, (e) => this.shards[e]); return [n >= 5, `${n} of 5 shards`]; }
    }
    return [false, ''];
  }
  checkWin() { if (this.city.cleared && this.goals.every((g) => this.goalStatus(g)[0])) throw new GameOver(true, 'the city has fallen'); }
  score() {
    const marks = [...this.hexes.values()].filter((h) => h.mark === 'black' && (h.site === 'town' || h.site === 'caravan')).length;
    const lines = [
      ['Turns remaining x2', 2 * this.turnsRemaining], ['Unspent reputation', this.reputation], ['Towers defeated', this.towers],
      ['Difficulty rating', this.rating], ['Exhausted towns and caravans', -marks], ['Wounds (1 per 2)', -Math.floor(this.wounds / 2)], ['Wounded allies', -this.allies.filter((a) => a.wounded).length],
    ];
    return { lines, total: sum(lines, (l) => l[1]) };
  }
}
