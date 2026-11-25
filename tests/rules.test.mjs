// Rules tests: each drives the engine with a scripted list of answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/engine/game.mjs';
import { Session } from '../public/engine/session.mjs';
import { LUMINARIES, TILES, ENEMIES, TOKENS, SKILLS, QUESTS } from '../public/data.mjs';
import { playRandom, botAnswer } from './fuzz.mjs';

const BASE = { luminary: 'courage', profession: null, profAs: 'ally', shade: 'S1', shadeSide: 'b', city: 'dusk2', extraGoals: 0 };
/** A game that has finished setup. `script` answers later prompts: ids, or functions of the prompt. */
async function mk(config = {}, seed = 1) {
  const script = []; const seen = [];
  const g = new Game({ ...BASE, ...config }, seed, { ask: async (p) => { seen.push(p); if (!script.length) throw new Error(`no scripted answer for "${p.title}": ${p.options.map((o) => o.id).join(' ')}`); const a = script.shift(); return typeof a === 'function' ? a(p) : a; } });
  script.push('start:2'); if (LUMINARIES[g.config.luminary].levels[0].gain.includes('skill') && !(g.config.profession && g.config.profAs === 'skill')) script.push('offer:0');
  if (g.config.profession) script.push((p) => p.options[0].id);
  await g.setup(); g.resetTurn(); g.turnNo = 1;
  return { g, script, seen, last: () => seen[seen.length - 1] };
}
const foe = (id, o = {}) => ({ id, doom: false, kind: 'wander', key: null, alive: true, ...o });
const has = (p, id) => p.options.some((o) => o.id === id && !o.disabled);
/** Take a token out of wherever setup put it, so a test can use it as an enemy. */
function pull(g, id) { for (const k of ['monster', 'mage']) g.stacks[k] = g.stacks[k].filter((x) => x !== id); g.offer = g.offer.filter((x) => x !== id); for (const h of g.hexes.values()) if (h.enemy && h.enemy.id === id) h.enemy = null; }

test('data: every tile has 10 hexes and every token a known skill', () => {
  for (const t of Object.values(TILES)) assert.deepEqual(t.rows.map((r) => r.length), [3, 2, 3, 2]);
  for (const t of Object.values(TOKENS)) assert.ok(SKILLS[t.skill], t.skill);
  assert.equal(Object.keys(ENEMIES).length, 20); assert.equal(Object.keys(QUESTS).length, 7);
  for (const l of Object.values(LUMINARIES)) { assert.equal(Object.keys(l.mat.squares).length, 9); assert.equal(l.levels.length, 8); for (const a of l.mat.arrows) assert.ok(l.mat.squares[a.from] && l.mat.squares[a.to]); }
});

test('setup: tile stack is 3 easy then 3 hard with the city in the last two', async () => {
  for (let seed = 1; seed < 30; seed++) {
    const { g } = await mk({}, seed); const all = [g.tiles[0].id, ...g.tileStack];
    assert.deepEqual(all.map((id) => TILES[id].hard), [false, false, false, true, true, true]);
    assert.ok(all.slice(4).some((id) => id === 'b1' || id === 'b3')); assert.ok(!['b1', 'b3'].includes(all[3]));
    assert.equal(g.offer.length, 3);
  }
});

test('points: generating a different type loses stored points', async () => {
  const { g } = await mk();
  g.gain('move', 4); g.gain('move', 2); assert.equal(g.pool.move, 6);
  g.gain('inf', 2); assert.equal(g.pool.move, 0); assert.equal(g.pool.inf, 2);
  g.gain('pb', 2); g.gain('mb', 3); assert.equal(g.pool.pb + g.pool.mb, 5); assert.equal(g.pool.inf, 0);
  g.gain('pm', 1); g.gain('mr', 2); assert.equal(g.pool.pm + g.pool.mr, 3); assert.equal(g.pool.pb, 0);
});

test('abilities: only unlocked arrows, 3 uses a turn, boost paid from the source or a stored shard', async () => {
  const { g, script, last } = await mk();
  assert.deepEqual(g.reachable().map((a) => a.to).sort(), ['D', 'F', 'H']); // Courage starts on G; G>E is green
  g.level = 5; assert.ok(g.reachable().some((a) => a.to === 'E')); g.level = 1;
  g.source = { face: 2, used: false }; g.shards.fire = 1; // source shows fire; F is boosted with fire
  script.push((p) => { assert.ok(has(p, 's0:source') && has(p, 's0:stored')); return 's0:source'; });
  await g.useAbility('F');
  assert.equal(g.pool.inf, 4); assert.equal(g.source.used, true); assert.equal(g.shards.fire, 1); assert.equal(g.marker, 'F'); assert.equal(g.used, 1);
  script.push((p) => { assert.ok(!has(p, 's0:source')); return 'std:move'; }); await g.useAbility('H'); assert.equal(g.pool.move, 1); assert.equal(g.pool.inf, 0);
  script.push('adv'); await g.useAbility('D'); assert.equal(g.used, 3);
  assert.ok(!g.genOptions().some((o) => o.id.startsWith('ab:')));
  assert.ok(last());
});

test('wounds: attack divided by armor, rounded up; poison doubles; allies absorb their HP', async () => {
  const { g, script } = await mk(); pull(g, 'T7'); pull(g, 'T5'); pull(g, 'T1');
  script.push('next', (p) => p.options.find((o) => o.id.startsWith('hit')).id, 'next');
  await g.combat([foe('T7')]); // attack 4, poison: 8 damage at armor 2
  assert.equal(g.wounds, 4);
  g.wounds = 0; g.allies.push({ id: 'T1', exhausted: true, wounded: false }); // HP 6, exhausted allies can still absorb
  script.push('next', (p) => p.options.find((o) => o.id.startsWith('hit')).id, 'ally:0', 'next');
  await g.combat([foe('T5')]); // attack 6, ally absorbs 6
  assert.equal(g.wounds, 0); assert.equal(g.allies[0].wounded, true);
});

test('block: all or nothing, unmatched block counts half, aggressive doubles the need', async () => {
  const { g, script } = await mk(); pull(g, 'T13'); pull(g, 'T1');
  script.push('next', (p) => { // Bone Necromancer: mage, attack 5
    g.gain('pb', 9); return 'hit:0'; }, (p) => { assert.ok(!has(p, 'block:0'), '9 physical block counts 4 against a photonic attack of 5'); g.gain('mb', 1); return 'ally:x'; });
  await assert.rejects(g.combat([foe('T13'), foe('T1')]));
  g.pool.pb = 6; g.pool.mb = 2; // 6 physical counts 3, plus 2 photonic
  assert.equal(g.blockValue({ type: 'mage', abil: new Set() }), 5);
  assert.equal(g.blockNeed({ atk: 4, abil: new Set(['aggressive']) }), 8);
  g.pool.move = 3; assert.equal(g.blockValue({ type: 'mage', abil: new Set(['slow']) }), 8);
});

test('attack: resistance halves, flying halves melee, groups add HP', async () => {
  const { g } = await mk();
  const E = (id, o) => ({ foe: foe(id, o), hpBonus: 0, mender: false, ignored: new Set(), bruted: new Set(), fortIgnore: 0 });
  g.cmb = { E: [], phase: 'melee', pending: [] };
  g.pool.pm = 5; g.pool.mm = 4;
  assert.equal(g.attackValue([E('T2')], 'melee'), 2 + 4); // physical resistance
  assert.equal(g.attackValue([E('T7')], 'melee'), 5 + 2); // photonic resistance
  assert.equal(g.attackValue([E('T2'), E('T7')], 'melee'), 2 + 2);
  g.pool.pr = 3; assert.equal(g.attackValue([E('T3')], 'melee'), Math.floor(9 / 2) + 3); // flying: non-ranged halved
  assert.equal(g.attackValue([E('T4')], 'ranged'), 3); // only ranged points count in the ranged phase
  g.meleeRanged = true; assert.equal(g.attackValue([E('T4')], 'ranged'), 12);
  const e = E('T2'); e.bruted.add('phys'); assert.equal(g.attackValue([e], 'melee'), 12);
  g.cmb = null;
});

test('fortification: fortified needs precision, double fortified cannot be attacked at range', async () => {
  const { g } = await mk();
  const E = (f) => ({ foe: f, hpBonus: 0, mender: false, ignored: new Set(), bruted: new Set(), fortIgnore: 0 });
  g.cmb = { E: [], phase: 'ranged', pending: [] };
  const plain = E(foe('T4')), fort = E(foe('T8')), city = E(foe('T4', { kind: 'city' })), cityFort = E(foe('T8', { kind: 'city' })), unf = E(foe('T12', { kind: 'city' })), fly = E(foe('T3'));
  assert.deepEqual([plain, fort, city, cityFort, unf, fly].map((e) => g.rangedOK(e)), [true, false, false, false, true, false]);
  g.precision = true;
  assert.deepEqual([plain, fort, city, cityFort, unf, fly].map((e) => g.rangedOK(e)), [true, true, true, false, true, true]);
  cityFort.fortIgnore = 1; assert.equal(g.rangedOK(cityFort), true); // Hunter removes one layer
  g.cmb = null;
});

test('doom enemies have double attack and HP and the higher XP', async () => {
  const { g } = await mk();
  const st = g.stats(foe('T4', { doom: true })); assert.deepEqual([st.atk, st.hp, st.xp], [6, 10, 8]);
  const sh = g.stats({ shade: true, id: 'S1', kind: 'city', key: null }); assert.deepEqual([sh.atk, sh.hp, sh.fort], [3, 5, 1]);
});

test('turn limit: every 2 wounds block a turn space; Wisdom has 8 wounds starting a space in', async () => {
  const { g } = await mk();
  const limits = []; for (let w = 0; w < 10; w++) { g.wounds = w; limits.push(g.turnLimit); }
  assert.deepEqual(limits, [6, 6, 5, 5, 4, 4, 3, 3, 2, 2]);
  const { g: w } = await mk({ luminary: 'wisdom' });
  const wl = []; for (let i = 0; i < 8; i++) { w.wounds = i; wl.push(w.turnLimit); }
  assert.deepEqual(wl, [6, 5, 5, 4, 4, 3, 3, 2]);
});

test('round ends when the next turn space is blocked; game is lost after round 4', async () => {
  const { g } = await mk();
  g.wounds = 4; g.turn = 4; await g.endTurn(); assert.deepEqual([g.round, g.turn], [2, 1]);
  g.turn = 3; await g.endTurn(); assert.deepEqual([g.round, g.turn], [2, 4]);
  g.round = 4; g.turn = 4; await assert.rejects(g.endTurn(), /time has run out/);
});

test('wounds past the turn marker cost extra wounds once per block phase', async () => {
  const { g, script } = await mk(); pull(g, 'T5');
  g.turn = 6; // attack 6 at armor 2: 3 wounds, marker above turn 5: 1 extra
  script.push('next', (p) => p.options.find((o) => o.id.startsWith('hit')).id, 'next');
  await g.combat([foe('T5')]); assert.equal(g.wounds, 4);
});

test('level up: XP tokens are spent whole, the level benefit is gained', async () => {
  const { g, script } = await mk(); pull(g, 'T1'); pull(g, 'T2');
  g.xp.push({ id: 'T2', doom: false }, { id: 'T1', doom: false }); // 2 + 4 XP, level 2 costs 2
  assert.ok(g.canLevel());
  script.push('xp:1', 'confirm', 'offer:0'); await g.levelUp();
  assert.equal(g.level, 2); assert.equal(g.armor, 3); assert.equal(g.skills.length, 1); assert.equal(g.xpTotal, 2);
});

test('movement: terrain costs, impassable terrain, required stops', async () => {
  const { g, script } = await mk({}, 3);
  const hex = (t, site) => [...g.hexes.values()].find((h) => h.terrain === t && (site === undefined || h.site === site));
  for (const h of g.hexes.values()) { const c = g.moveCost(h); if (h.quest) continue; if (h.terrain === 'lake' || h.terrain === 'mountain') assert.equal(c, Infinity); else assert.equal(c, { grass: 2, hills: g.isTower(h) ? 4 : 3, forest: 3, desert: 3, waste: 4 }[h.terrain]); }
  g.skills.push({ skill: 'lake', id: 'T1' }); const lake = hex('lake'); if (lake) assert.equal(g.moveCost(lake), 2);
  assert.ok(script);
});

test('storm: 2 move to leave, and extra move may pay for a level up only on the turn you arrive', async () => {
  const { g, script } = await mk({}, 1);
  const storm = { k: '9,9', x: 9, r: 9, tile: 0, terrain: 'grass', site: 'storm', enemy: null, quest: null, mark: null };
  g.hexes.set(storm.k, storm); g.pos = { x: 7, r: 9 }; g.pool.move = 9;
  await g.moveTo(storm); assert.equal(g.held(), 'storm'); assert.equal(g.pool.move, 7);
  assert.ok(!g.turnOptions().some((o) => o.id.startsWith('move:')));
  await g.doTurnOption({ id: 'escape' }); assert.equal(g.held(), null); assert.equal(g.pool.move, 5);
  assert.ok(g.canLevel()); // level 2 costs 2
  script.push('storm', 'offer:0'); await g.levelUp();
  assert.equal(g.level, 2); assert.equal(g.pool.move, 3); assert.equal(storm.mark, 'black'); assert.ok(!g.canStormXp());
});

test('side quest: complete for reputation and shards, or bribe out with wounds for missing shards', async () => {
  const { g } = await mk();
  const hex = { k: '9,9', x: 9, r: 9, tile: 0, terrain: 'grass', site: 'quest', enemy: null, quest: { q: 'Q4', side: 'e' }, mark: null };
  g.hexes.set(hex.k, hex); g.questPile = g.questPile.filter((q) => q !== 'Q4'); g.pos = { x: 7, r: 9 }; g.pool.move = 3;
  assert.equal(g.moveCost(hex), 3); await g.moveTo(hex); assert.equal(g.held(), 'quest');
  g.gain('mb', 4); await g.completeQuest(hex);
  assert.equal(g.reputation, 2); assert.deepEqual([g.shards.wind, g.shards.fire], [1, 1]); assert.equal(g.held(), null);
  hex.quest = { q: 'Q5', side: 'h' }; g.bribed = false; // reward wind, earth, fire: we hold wind and fire
  await g.bribe(hex); assert.equal(g.wounds, 1); assert.equal(g.held(), null);
});

test('intimidate costs reputation equal to the XP reward; the enemy does not attack', async () => {
  const { g, script } = await mk(); pull(g, 'T2');
  g.rep.push({ q: 'Q1', side: 'e' }); // 2 reputation; Shield Knight is worth 2
  script.push((p) => p.options.find((o) => o.id.startsWith('intim')).id, 'next', 'next');
  await g.combat([foe('T2')]);
  assert.equal(g.wounds, 0); assert.equal(g.reputation, 0);
});

test('shade abilities: thief, inspiring, vengeful, hidden', async () => {
  const { g, script } = await mk({ shade: 'S1' }); pull(g, 'T1'); pull(g, 'T2');
  const shade = { shade: true, id: 'S1', kind: 'city', key: null, alive: true };
  g.xp.push({ id: 'T1', doom: false }); // 4 XP against Greed's attack of 3
  script.push('next', (p) => { assert.ok(!p.options.some((o) => o.id.startsWith('block'))); return 'pay:0'; }, 'next');
  await g.combat([shade]); assert.equal(g.xp.length, 0); assert.equal(g.wounds, 0);

  const { g: w, script: ws } = await mk({ shade: 'S3', shadeSide: 'b' }); pull(w, 'T4');
  const wrath = { shade: true, id: 'S3', kind: 'city', key: null, alive: true }; const other = foe('T4', { kind: 'city' });
  w.city.enemies = [wrath, other];
  let other2;
  ws.push('next', (p) => { assert.equal(w.stats(other, w.cmb.E[1]).hp, 7, 'inspiring gives +2 HP'); return 'hit:0'; }, () => { w.pool.pm = 8; return 'hit:1'; },
    // kill Wrath in melee: a vengeance attack of 2 (1 other living enemy), and the other enemy loses its +2 HP
    'kill:0', (p) => { assert.match(p.options.find((o) => o.id.startsWith('hit')).label, /vengeance/); other2 = w.stats(other, w.cmb.E[1]).hp; return p.options.find((o) => o.id.startsWith('hit')).id; }, 'next');
  await w.combat([wrath, other]);
  assert.equal(w.wounds, 3 + 2 + 1); assert.equal(other2, 5); assert.equal(wrath.alive, false);

  const { g: e, script: es } = await mk({ shade: 'S2', shadeSide: 'b' });
  const envy = { shade: true, id: 'S2', kind: 'city', key: null, alive: true }; e.city.enemies = [envy];
  es.push('next', 'hit:0', (p) => { assert.equal(e.stats(envy, e.cmb.E[0]).hp, 8); return 'next'; });
  await e.combat([envy]);
});

test('no retreat: a failed combat leaves you in the hex and the enemy at full strength', async () => {
  const { g, script } = await mk({}, 3);
  const h = [...g.hexes.values()].find((x) => x.enemy); const from = g.neighbors(h.x, h.r).find((n) => !n.enemy && g.moveCost(n) < 9 && !n.quest);
  g.pos = { x: from.x, r: from.r }; g.pool.move = 9;
  script.push('next', (p) => p.options.find((o) => o.id.startsWith('hit')).id, (p) => (p.title === 'Melee phase' ? 'next' : p.options[p.options.length - 1].id), 'next');
  await g.moveTo(h).catch(() => {});
  assert.deepEqual(g.pos, { x: h.x, r: h.r }); assert.ok(h.enemy.alive);
});

test('winning needs the city cleared and every goal met', async () => {
  const { g } = await mk({ profession: 'P1' });
  g.city.cleared = true; const goal = g.goals[0];
  if (!g.goalStatus(goal)[0]) g.checkWin();
  g.goals = ['shards']; g.checkWin(); g.shards.fire = 5; assert.throws(() => g.checkWin(), /city has fallen/);
});

test('save and undo: a game replays exactly from its answers', async () => {
  const r = await playRandom({ ...BASE, dev: { level: 3, shards: 2 } }, 42, { pick: botAnswer, maxSteps: 120 });
  const save = JSON.parse(JSON.stringify(r.session.toSave()));
  const snap = (g) => JSON.stringify([g.wounds, g.level, g.pos, g.pool, g.shards, g.marker, g.turn, g.round, g.xp, g.offer, g.stacks, [...g.hexes.keys()]]);
  const again = await new Promise((res, rej) => { const s = new Session(save, { onPrompt: () => res(s), onOver: () => res(s), onError: rej }); });
  assert.equal(snap(again.game), snap(r.game));
  if (again.canUndo()) { const n = again.answers.length; again.undo(); await new Promise((res) => setTimeout(res, 5)); assert.equal(again.answers.length, n - 1); assert.ok(again.prompt); }
});
