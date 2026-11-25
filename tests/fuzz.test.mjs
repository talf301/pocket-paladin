// Whole games with random and heuristic players, checking invariants after every decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playRandom, randomConfig, botAnswer } from './fuzz.mjs';
import { mulberry32 } from '../public/engine/util.mjs';

const N = +(process.env.FUZZ_SEEDS || 150);
for (const [name, opts] of [['random', {}], ['heuristic', { pick: botAnswer }]]) {
  test(`${N} ${name} games finish without errors`, async () => {
    const ends = {};
    for (let seed = 1; seed <= N; seed++) {
      const r = await playRandom(randomConfig(mulberry32(seed)), seed, opts);
      assert.notEqual(r.result.reason, 'step limit', `seed ${seed} did not finish`);
      ends[r.result.won ? 'won' : r.result.reason] = (ends[r.result.won ? 'won' : r.result.reason] || 0) + 1;
    }
    console.log(name, ends);
  });
}
