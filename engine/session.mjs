// A play session: runs the engine, feeding it recorded answers first (replay) and then live ones.
import { Game } from './game.mjs';

export const ENGINE_VERSION = 1;

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
        self.marks[self.cursor] = prompt.info;
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
  /** Undo is allowed while no hidden information has been revealed since the previous decision. */
  canUndo() { const n = this.answers.length; return !!this.prompt && n > 0 && this.marks[n - 1] === this.marks[n]; }
  undo() { if (!this.canUndo()) return false; this.answers.pop(); this._start(); return true; }
  toSave() { return { v: ENGINE_VERSION, config: this.config, seed: this.seed, answers: this.answers }; }
}

/** Pick a random legal answer for a prompt (used by tests and the demo bot). */
export function randomAnswer(p, rnd) {
  let o = p.options.filter((x) => !x.disabled);
  const real = o.filter((x) => x.id !== 'cancel' && x.id !== 'end');
  if (real.length && rnd() < 0.9) o = real;
  return o[Math.floor(rnd() * o.length)].id;
}
