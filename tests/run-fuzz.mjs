// node tests/run-fuzz.mjs [games] [bot|random]
import { playRandom, randomConfig, botAnswer } from './fuzz.mjs';
import { mulberry32 } from '../public/engine/util.mjs';
const n = +(process.argv[2] || 200); const mode = process.argv[3] || 'bot';
const stats = { fail: 0 }; const add = (k, v = 1) => { stats[k] = (stats[k] || 0) + v; }; const max = (k, v) => { stats[k] = Math.max(stats[k] || 0, v); };
for (let seed = 1; seed <= n; seed++) {
  const cfg = randomConfig(mulberry32(seed));
  try {
    const r = await playRandom(cfg, seed, mode === 'bot' ? { pick: botAnswer } : {});
    add(r.result.won ? 'won' : r.result.reason); add('steps', r.steps); max('maxLevel', r.game.level); max('maxTiles', r.game.tiles.length); max('maxTowers', r.game.towers); max('maxRep', r.game.reputation);
    if (r.game.city.revealed) add('cityRevealed'); if (r.game.city.cleared) add('cityCleared'); add('levels', r.game.level); add('skills', r.game.skills.length); add('alliesRecruited', r.game.allies.length);
  } catch (e) { console.log('FAIL seed', seed, e.stack.split('\n').slice(0, 6).join('\n')); if (++stats.fail > 3) break; }
}
console.log(stats);
