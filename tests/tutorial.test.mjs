// The tutorial script must stay playable: every step's pick has to be a legal option of the decision it belongs to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../public/engine/session.mjs';
import { TUTORIAL } from '../public/tutorial.mjs';

test('tutorial: every scripted step is legal and the lesson plays out as told', async () => {
  const titles = [];
  const game = await new Promise((resolve, reject) => {
    let i = 0; let s;
    s = new Session({ config: TUTORIAL.config, seed: TUTORIAL.seed, answers: [] }, {
      onPrompt(p, g) {
        if (i >= TUTORIAL.steps.length) return resolve(g);
        const step = TUTORIAL.steps[i];
        const ok = p.options.some((o) => o.id === step.pick && !o.disabled);
        if (!ok) return reject(new Error(`step ${i} (${step.pick}) is not offered by "${p.title}": ${p.options.map((o) => (o.disabled ? `(${o.id})` : o.id)).join(' ')}`));
        titles.push(p.title); i++;
        queueMicrotask(() => s.answer(step.pick));
      },
      onOver: () => reject(new Error('the tutorial game ended')), onError: reject,
    });
  });
  assert.equal(game.level, 2); assert.equal(game.armor, 3); assert.equal(game.wounds, 0);
  assert.deepEqual(game.skills.map((s) => s.skill), ['mend']);
  assert.equal(game.xp.length, 0); assert.deepEqual(game.pos, { x: 1, r: 3 });
  assert.deepEqual([game.round, game.turn], [1, 3]); assert.equal(game.hexes.get('3,3').enemy, null);
  assert.ok(titles.includes('Block phase') && titles.includes('Melee phase'));
});
