// Random-play harness: plays whole games with random legal answers and checks invariants after every decision.
import { Session, randomAnswer } from '../public/engine/session.mjs';
import { mulberry32 } from '../public/engine/util.mjs';
import { ELEMENTS, POINTS, ENEMIES } from '../public/data.mjs';

export function checkInvariants(g) {
  const fail = (m) => { throw new Error(`invariant: ${m}`); };
  if (g.wounds < 0 || g.wounds > g.maxWounds) fail(`wounds ${g.wounds}`);
  if (g.turn < 1 || g.turn > 6) fail(`turn ${g.turn}`);
  if (g.round < 1 || g.round > 4) fail(`round ${g.round}`);
  if (g.level < 1 || g.level > 8) fail(`level ${g.level}`);
  for (const el of ELEMENTS) if (g.shards[el] < 0 || g.shards[el] > 5) fail(`shards ${el} ${g.shards[el]}`);
  for (const t of POINTS) if (g.pool[t] < 0 || !Number.isInteger(g.pool[t])) fail(`pool ${t} ${g.pool[t]}`);
  if (g.used > 3 + g.extra) fail(`used ${g.used} of ${3 + g.extra} abilities`);
  if (g.allies.length > g.capacity) fail(`allies ${g.allies.length} over capacity ${g.capacity}`);
  if (g.offer.length > 3) fail('offer over 3');
  // every enemy token is in exactly one place
  const seen = [];
  seen.push(...g.stacks.monster, ...g.stacks.mage, ...g.offer, ...g.xp.map((x) => x.id), ...g.skills.filter((s) => !s.prof).map((s) => s.id), ...g.allies.filter((a) => !a.prof).map((a) => a.id));
  for (const h of g.hexes.values()) if (h.enemy) seen.push(h.enemy.id);
  for (const f of g.city.enemies) if (!f.shade && f.alive) seen.push(f.id);
  const all = Object.keys(ENEMIES);
  if (seen.length !== all.length || new Set(seen).size !== all.length) fail(`token conservation: ${seen.length} placed, ${new Set(seen).size} distinct, of ${all.length}: ${[...seen].sort().join(' ')}`);
  if (!g.lum.mat.squares[g.marker]) fail(`marker ${g.marker}`);
}

export function playRandom(config, seed, { maxSteps = 4000, trace = false, pick = randomAnswer } = {}) {
  return new Promise((resolve, reject) => {
    const rnd = mulberry32(seed * 7919 + 13);
    let steps = 0; let s;
    const next = (prompt, game) => {
      try { checkInvariants(game); } catch (e) { return reject(e); }
      if (++steps > maxSteps) return resolve({ result: { won: false, reason: 'step limit' }, steps, game: s.game, session: s });
      let a;
      try { a = pick(prompt, rnd, game); } catch (e) { return reject(e); }
      if (trace) console.log(`[r${game.round} t${game.turn}] ${prompt.title} -> ${a}`);
      queueMicrotask(() => s.answer(a));
    };
    s = new Session({ config, seed }, {
      onPrompt: next,
      onOver: (result, game) => resolve({ result, steps, game, session: s }),
      onError: (err) => { err.message += ` (seed ${seed}, config ${JSON.stringify(config)})`; reject(err); },
    });
  });
}

export function randomConfig(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    luminary: pick(['courage', 'justice', 'temperance', 'wisdom']), profession: pick([null, 'P1', 'P2', 'P3', 'P4', 'P5']), profAs: pick(['ally', 'skill']),
    shade: pick(['S1', 'S2', 'S3', 'S4', 'S5']), shadeSide: pick(['a', 'b']), city: pick(['dusk2', 'doom2', 'doom3']), extraGoals: pick([0, 0, 1, 2]), dev: pick([{}, {}, { level: 3, shards: 2 }, { level: 5, shards: 3 }, { level: 8, shards: 5 }, { level: 8, shards: 5, reveal: true }, { level: 6, shards: 5, reveal: true }]),
  };
}

/** A rough heuristic player: heads north, explores, levels up, and takes kills and blocks when it can. */
export function botAnswer(p, rnd, g) {
  const o = p.options.filter((x) => !x.disabled);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const by = (re) => o.filter((x) => re.test(x.id));
  if (rnd() < 0.12) return randomAnswer(p, rnd);
  if (p.ctx === 'turn') {
    for (const re of [/^level$/, /^quest$/, /^escape$/, /^explore:/, /^recruit:/, /^buyheal$/]) { const m = by(re); if (m.length) return pick(m).id; }
    const brave = g.used === 0 && g.wounds < g.maxWounds - 4 && !g.injured;
    const fights = by(/^fight:/); if (fights.length && brave && rnd() < 0.8) return pick(fights).id;
    const moves = by(/^move:/).filter((x) => !x.fight || (brave && g.pool.move < 6) || x.hex === g.city.key);
    const cityMove = moves.find((x) => x.hex === g.city.key); if (cityMove) return cityMove.id;
    if (moves.length) { const best = Math.min(...moves.map((x) => +x.hex.split(',')[1])); const m = moves.filter((x) => +x.hex.split(',')[1] === best); if (best <= g.pos.r || rnd() < 0.3) return pick(m).id; }
    const gen = [...by(/^ab:/).filter((x) => !x.wound), ...by(/^ally:/).filter((x) => /move/.test(x.label)), ...by(/^skill:/)];
    if (gen.length && rnd() < 0.9) return pick(gen).id;
    return 'end';
  }
  if (p.ctx === 'combat') {
    for (const re of [/^kill:/, /^block:/, /^pay:/, /^intim:/, /^scorch:/]) { const m = by(re); if (m.length) return pick(m).id; }
    const ph = g.cmb.phase;
    if (ph === 'ranged' && rnd() < 0.7) return 'next';
    const want = ph === 'block' ? /block/ : /melee|ranged/;
    const gen = [...by(/^ab:/).filter((x) => !x.wound), ...by(/^ally:/).filter((x) => want.test(x.label)), ...by(/^skill:/), ...by(/^feint|^brute/)];
    if (gen.length && rnd() < 0.9) return pick(gen).id;
    const next = by(/^next$/); if (next.length) return 'next';
    return pick(by(/^hit:/)).id;
  }
  if (p.ctx === 'ability') {
    const want = g.cmb ? (g.cmb.phase === 'block' ? /block/ : g.cmb.phase === 'ranged' ? /ranged/ : /melee|ranged/) : /move/;
    const good = o.filter((x) => want.test(x.label) && !/wound/.test(x.pay || '') && x.kind !== 'std');
    if (good.length) return good[good.length - 1].id;
    const std = o.filter((x) => x.kind === 'std' && want.test(x.label)); if (std.length) return pick(std).id;
  }
  if (p.ctx === 'soak') { const a = o.filter((x) => x.id !== 'take'); if (a.length) return pick(a).id; }
  return randomAnswer(p, rnd);
}
