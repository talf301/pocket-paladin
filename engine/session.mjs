// A play session: runs the engine, feeding it recorded answers first (replay) and then live ones.
import { Game } from './game.mjs';

export const ENGINE_VERSION = 2; // 2: 'skip' replaces 'cancel' where the choice keeps an effect
const MAIN = new Set(['turn', 'combat', 'start']);

export class Session {
  /** @param save {config, seed, answers[]} */
  constructor(save, hooks = {}) {
    this.config = save.config; this.seed = save.seed; this.answers = save.answers ? save.answers.slice() : [];
    this.hooks = hooks; this.prompt = null; this.marks = []; this.error = null;
    this._start();
  }
  _start() {
    this.cursor = 0; this.prompt = null; this.marks = []; this.replaying = this.answers.length > 0;
    const self = this; const game = (this.game = new Game(this.config, this.seed, {
      ask(prompt) {
        if (self.game !== game) return new Promise(() => {}); // an abandoned run (after undo)
        self.marks[self.cursor] = { info: prompt.info, ctx: prompt.ctx };
        if (self.cursor < self.answers.length) return Promise.resolve(self.answers[self.cursor++]);
        self.replaying = false;
        return new Promise((resolve) => { self.prompt = prompt; self._resolve = resolve; queueMicrotask(() => { if (self.prompt === prompt) self.hooks.onPrompt?.(prompt, game); }); });
      },
      onLog(msg, cls) { if (!self.replaying && self.game === game) self.hooks.onLog?.(msg, cls); },
      onOver(result) { if (self.game !== game) return; self.prompt = null; self.hooks.onOver?.(result, game); },
    }));
    this.done = game.run().catch((err) => { if (self.game !== game) return; self.error = err; self.prompt = null; self.hooks.onError?.(err); });
  }
  answer(id) {
    if (!this.prompt) return;
    const resolve = this._resolve; this.prompt = null; this._resolve = null;
    this.answers.push(id); this.cursor++;
    this.hooks.onAnswer?.(this);
    resolve(id);
  }
  /**
   * Undo steps back one whole action: to the latest earlier decision made on the main turn or combat prompt,
   * skipping the follow-up choices (which effect, which shard, which target) that belong to it. It never goes
   * back past a point where hidden information was revealed. Returns the number of answers to keep, or -1.
   */
  undoTarget() {
    const n = this.answers.length;
    if (!this.prompt || n === 0) return -1;
    const now = this.marks[n].info;
    for (let k = n - 1; k >= 0 && this.marks[k].info === now; k--) if (MAIN.has(this.marks[k].ctx)) return k;
    return this.marks[n - 1].info === now ? n - 1 : -1; // inside a follow-up right after a reveal: one step
  }
  /** True when undo would return to the main prompt this follow-up came from (so backing out need not be recorded). */
  canBackOut() { const k = this.undoTarget(); return k >= 0 && MAIN.has(this.marks[k].ctx) && !MAIN.has(this.prompt.ctx); }
  canUndo() { return this.undoTarget() >= 0; }
  undo() { const k = this.undoTarget(); if (k < 0) return false; this.answers.length = k; this._start(); return true; }
  toSave() { return { v: ENGINE_VERSION, config: this.config, seed: this.seed, answers: this.answers }; }
}

/** Pick a random legal answer for a prompt (used by tests and the demo bot). */
export function randomAnswer(p, rnd) {
  let o = p.options.filter((x) => !x.disabled);
  const real = o.filter((x) => x.id !== 'cancel' && x.id !== 'end');
  if (real.length && rnd() < 0.9) o = real;
  return o[Math.floor(rnd() * o.length)].id;
}
