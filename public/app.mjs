// Nightbreaker touch interface. Draws the table from the engine's state and answers its prompts.
import { Session, randomAnswer } from './engine/session.mjs';
import { K } from './engine/game.mjs';
import { mulberry32 } from './engine/util.mjs';
import { TUTORIAL } from './tutorial.mjs';
import {
  ELEMENTS, EL_NAME, POINTS, POINT_NAME, ENEMIES, ENEMY_NAME, ABILITY_TEXT, RESIST_TEXT, TOKENS, SKILLS, PROFESSIONS, GOALS, SHADES, QUESTS,
  NEED_NAME, SOURCE_FACES, TILES, TERRAIN_NAME, SITE_NAME, LUMINARIES, CITY_SETTINGS, GOAL_STRENGTH, ROUNDS, ratingName, REFERENCE_CARDS,
} from './data.mjs';

const SAVE_KEY = 'nightbreaker-save-v1', CONFIG_KEY = 'nightbreaker-config-v1';
const HW = 50, S = 57.735, RH = 86.6025; // map units: a hex is 100 wide
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const state = {
  screen: 'title', session: null, game: null, prompt: null, panel: 'mat', info: null, result: null,
  view: { x: 0, y: 0, z: 0.66 }, centerKey: '', matOpen: true,
  config: { luminary: 'courage', profession: null, profAs: 'ally', shade: 'S1', shadeSide: 'b', city: 'dusk2', extraGoals: 0 },
};
try { Object.assign(state.config, JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')); } catch (e) { /* ignore */ }

// ================================================================ session
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
function startSession(save) {
  state.result = null; state.info = null; state.centerKey = ''; state.panel = 'mat';
  state.session = new Session(save, {
    onPrompt(prompt, game) {
      state.rawPrompt = prompt; state.game = game; state.screen = 'game';
      const step = tutStep();
      state.prompt = step ? { ...prompt, options: prompt.options.map((o) => (o.id === step.pick ? o : { ...o, disabled: true })) } : prompt;
      if (step && step.where === 'mat') state.panel = 'mat';
      if (state.session.config.tutorial && !step && state.session.answers.length === TUTORIAL.steps.length) state.info = tutorialDone();
      persist(); render();
    },
    onLog(msg, cls) { if (cls === 'good' || cls === 'bad' || cls === 'big') toast(msg, cls); },
    onOver(result, game) { state.result = result; state.game = game; state.prompt = null; state.screen = 'game'; localStorage.removeItem(SAVE_KEY); render(); },
    onError(err) { console.error(err); toast(`Error: ${err.message}`, 'bad'); },
  });
  state.game = state.session.game;
}
/** The tutorial step for the decision being asked, or null. */
function tutStep() { const s = state.session; return s && s.config.tutorial && !state.result ? TUTORIAL.steps[s.answers.length] || null : null; }
function coach() {
  const step = tutStep(); if (!step) return '';
  return `<div class="coach"><div class="ctext">${step.say}</div><div class="cfoot"><span>Tutorial ${state.session.answers.length + 1} / ${TUTORIAL.steps.length}</span><button data-act="skiptut">Skip tutorial</button></div></div>`;
}
function tutorialDone() {
  return `<div class="sheet-body rules"><h3>Tutorial complete</h3>${TUTORIAL.after.map((t) => `<p>${t}</p>`).join('')}<div class="olist"><button class="btn primary" data-act="close">Play on</button></div></div>`;
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.session.toSave())); } catch (e) { /* storage full or disabled */ } }
function answer(id) { if (!state.session || !state.session.prompt) return; state.info = null; state.session.answer(id); }
function newGame() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  startSession({ config: { ...state.config }, seed: (Math.random() * 2 ** 31) | 0, answers: [] });
}

// ================================================================ toasts
function toast(msg, cls = '') {
  const box = $('#toasts'); const el = document.createElement('div');
  el.className = `toast ${cls}`; el.textContent = msg; box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('gone'), 2600); setTimeout(() => el.remove(), 3100);
}

// ================================================================ small pieces
const icon = (t) => `<img class="ic" src="img/el/${t}.png" alt="${esc(POINT_NAME[t] || t)}">`;
const elIcon = (el) => `<img class="eli" src="img/el/${el}.webp" alt="${el}">`;
const foeImg = (foe) => (foe.shade ? `img/shade/${foe.id}${state.game.config.shadeSide}.webp` : `img/enemy/${foe.id}.webp`);
const tokenImg = (x) => `img/ally/${x.id}.webp`;
function btn(o, extra = '') {
  return `<button class="btn ${o.primary ? 'primary' : ''} ${o.danger ? 'danger' : ''} ${o.on ? 'on' : ''} ${extra}" data-opt="${esc(o.id)}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}${o.pay ? `<small>${esc(o.pay)}</small>` : ''}${o.text ? `<small>${esc(o.text)}</small>` : ''}</button>`;
}
function abilityChips(st, e) {
  let h = '';
  if (st.doom) h += '<span class="chip doom">Doom</span>';
  if (st.shade) h += '<span class="chip shade">Shade</span>';
  for (const r of st.resist) h += `<span class="chip res">${esc(RESIST_TEXT[r][0])}</span>`;
  for (const a of st.abil) h += `<span class="chip">${esc(ABILITY_TEXT[a][0])}</span>`;
  if (st.fort && !st.abil.has('fortified')) h += '<span class="chip">Fortified site</span>';
  if (st.fort >= 2) h += '<span class="chip res">Double fortified</span>';
  if (e) { if (e.blocked) h += '<span class="chip ok">Blocked</span>'; if (e.intimidated) h += '<span class="chip ok">Intimidated</span>'; if (e.mender) h += '<span class="chip ok">Weakened</span>'; }
  return h;
}
function foeInfo(foe, e = null) {
  const g = state.game; const st = g.stats(foe, e);
  let h = `<div class="info-head"><img class="bigtok" src="${foeImg(foe)}"><div><h3>${esc(st.name)}</h3><p>${cap(st.type)} · ${st.doom ? 'Doom (double attack and HP)' : st.shade ? `Shade, strength ${g.shadeStats.str}` : 'Dusk'}</p>
    <p class="statline">Attack <b>${st.atk}</b> (${st.type === 'monster' ? 'physical' : 'photonic'}) · HP <b>${st.hp}</b>${st.shade ? '' : ` · XP <b>${st.xp}</b>`}</p></div></div>`;
  for (const r of st.resist) h += `<p><b>${esc(RESIST_TEXT[r][0])}.</b> ${esc(RESIST_TEXT[r][1])}</p>`;
  for (const a of st.abil) h += `<p><b>${esc(ABILITY_TEXT[a][0])}.</b> ${esc(ABILITY_TEXT[a][1])}</p>`;
  if (st.fort === 1 && !st.abil.has('fortified')) h += '<p><b>Fortified site.</b> No attacks in the ranged phase unless your ranged attacks have precision.</p>';
  if (st.fort >= 2) h += '<p><b>Double fortified.</b> Cannot be attacked in the ranged phase at all.</p>';
  return h;
}
function tokenInfo(id, prof) {
  const d = prof ? PROFESSIONS[id] : TOKENS[id]; const sk = SKILLS[d.skill];
  return `<div class="info-head"><img class="bigtok" src="img/ally/${id}.webp"><div><h3>${esc(prof ? d.name : ENEMY_NAME[id])}</h3>
    <p class="statline">As an ally: ${prof ? '' : `cost <b>${d.cost}</b> influence · `}<b>${d.eff[1]} ${esc(POINT_NAME[d.eff[0]].toLowerCase())}</b> · HP <b>${d.hp}</b></p></div></div>
    <p><b>As a skill: ${esc(sk.name)}.</b> ${esc(sk.text)}</p>`;
}
function questInfo(q) {
  const d = QUESTS[q.q][q.side];
  return `<div class="info-head"><img class="bigtok hexy" src="img/quest/${q.q}${q.side}.webp"><div><h3>Side quest</h3>
    <p class="statline">Move cost <b>${d.move}</b> · complete with <b>${d.need[1]} ${esc(NEED_NAME[d.need[0]])}</b></p>
    <p class="statline">Reward: <b>${d.rep}</b> reputation and ${d.shards.map(elIcon).join(' ')}</p></div></div>
    <p>You cannot leave until you complete it or bribe your way out by paying its shard reward (1 wound for each shard you cannot pay).</p>`;
}

// ================================================================ map
function tileCells(ox, or) { const out = []; for (let r = 0; r < 4; r++) for (let i = 0; i < (r % 2 ? 2 : 3); i++) out.push([ox + (r % 2 ? 1 : 0) + 2 * i, or + r]); return out; }
function hexStyle(x, r) { return `left:${x * HW - HW}px;top:${r * RH - S}px`; }
function renderMap() {
  const g = state.game, p = state.prompt; const opts = p ? p.options.filter((o) => !o.disabled) : [];
  const byHex = {}; for (const o of opts) if (o.hex) (byHex[o.hex] = byHex[o.hex] || []).push(o);
  let h = '';
  for (const t of g.tiles) h += `<img class="tile" src="img/tile/${t.id}.webp" style="left:${t.ox * HW - HW}px;top:${t.or * RH - S}px" draggable="false">`;
  for (const o of opts) if (o.spot) {
    const back = TILES[g.tileStack[0]].hard ? 'hard' : 'easy';
    for (const [x, r] of tileCells(o.spot.ox, o.spot.or)) h += `<div class="hx ghost ${back}" data-opt="${o.id}" style="${hexStyle(x, r)}"></div>`;
    h += `<div class="ghost-label" data-opt="${o.id}" style="left:${(o.spot.ox + 2) * HW}px;top:${(o.spot.or + 1.5) * RH}px">Explore<br><b>2</b> ${icon('move')}</div>`;
  }
  const drawn = new Set();
  for (const hex of g.hexes.values()) {
    drawn.add(hex.k);
    const os = byHex[hex.k] || []; const move = os.find((o) => o.id.startsWith('move:')); const fight = os.find((o) => o.id.startsWith('fight:'));
    let inner = '';
    if (hex.quest) inner += `<img class="qtok" src="img/quest/${hex.quest.q}${hex.quest.side}.webp" draggable="false">`;
    if (hex.enemy && hex.enemy.alive) inner += `<img class="etok ${hex.enemy.doom ? 'doom' : ''} ${hex.enemy.scorched ? 'scorched' : ''}" src="${foeImg(hex.enemy)}" draggable="false">`;
    if (hex.k === g.city.key && g.city.revealed) inner += `<div class="citytoks">${g.city.enemies.filter((f) => f.alive).map((f) => `<img class="${f.doom ? 'doom' : ''}" src="${foeImg(f)}">`).join('')}</div>`;
    if (hex.mark) inner += `<i class="cube ${hex.mark}"></i>`;
    if (move) inner += `<b class="cost ${move.fight ? 'fight' : ''}">${move.cost}</b>`;
    h += `<div class="hx ${move ? 'go' : ''} ${fight || (move && move.fight) ? 'foe' : ''} ${os.length ? 'opt' : ''}" data-hex="${hex.k}" style="${hexStyle(hex.x, hex.r)}">${inner}</div>`;
  }
  for (const k of Object.keys(byHex)) if (!drawn.has(k)) { const [x, r] = k.split(',').map(Number); h += `<div class="hx go opt start" data-hex="${k}" style="${hexStyle(x, r)}"><b class="cost">${esc(byHex[k][0].label)}</b></div>`; }
  if (g.pos) {
    const here = g.here(); const shift = here && ((here.enemy && here.enemy.alive) || here.quest || here.k === g.city.key) ? 26 : 0;
    h += `<div class="hero" style="left:${g.pos.x * HW}px;top:${g.pos.r * RH + shift}px;background-image:url(img/mat/${g.lum.id}-portrait.webp)"></div>`;
  }
  return `<div class="map" id="map"><div class="world" id="world">${h}</div><div class="stackinfo" data-act="market">${g.tileStack.length ? `Tiles left: ${g.tileStack.map((id) => `<i class="${TILES[id].hard ? 'hard' : 'easy'}"></i>`).join('')}` : 'All tiles revealed'}</div><button class="recenter" data-act="recenter" aria-label="Centre on hero">&#9678;</button></div>`;
}
function applyView(animate = false) {
  const w = $('#world'); if (!w) return;
  w.style.transition = animate ? 'transform .35s ease' : 'none';
  w.style.transform = `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.z})`;
}
function centerOnHero(animate = true) {
  const m = $('#map'); const g = state.game; if (!m || !g) return;
  const r = m.getBoundingClientRect(); const pos = g.pos || { x: 2, r: 3.3 };
  state.view.x = r.width / 2 - pos.x * HW * state.view.z; state.view.y = r.height * 0.62 - pos.r * RH * state.view.z;
  applyView(animate);
}

// ================================================================ combat view
function renderCombat() {
  const g = state.game, c = g.cmb, p = state.prompt; const opts = p ? p.options : [];
  const phases = ['ranged', 'block', 'melee'];
  let h = `<div class="combat"><div class="phases">${phases.map((ph) => `<span class="${c.phase === ph ? 'on' : ''}">${cap(ph)}</span>`).join('<i>&rsaquo;</i>')}</div><div class="foes n${c.E.length}">`;
  c.E.forEach((e, i) => {
    const st = g.stats(e.foe, e); const mine = opts.filter((o) => o.enemy === i || (o.enemies && o.enemies.length === 1 && o.enemies[0] === i));
    const pend = c.pending.find((a) => a.e === e && !a.done); const att = pend ? g.attacker(pend) : null;
    let meter = '';
    if (!e.out) {
      if (c.phase === 'block' && att) { const need = g.blockNeed(att); meter = `<div class="meter"><span>Block</span><b class="${g.blockValue(att) >= need ? 'ok' : ''}">${g.blockValue(att)} / ${need}</b></div>`; }
      else if (c.phase !== 'block') { const ok = c.phase === 'melee' || g.rangedOK(e); meter = ok ? `<div class="meter"><span>Attack</span><b class="${g.attackValue([e], c.phase) >= st.hp ? 'ok' : ''}">${g.attackValue([e], c.phase)} / ${st.hp}</b></div>` : '<div class="meter"><span>No ranged attacks</span></div>'; }
    }
    h += `<div class="foe ${e.out ? 'out' : ''} ${e.foe.scorched ? 'scorched' : ''}">
      <div class="ftop" data-act="foe:${i}"><img class="ftok" src="${foeImg(e.foe)}">${pend && pend.sub ? `<img class="fsub" src="img/enemy/${pend.sub}.webp">` : ''}
        <div class="fname">${esc(st.name)}</div>
        <div class="fstat"><span class="atk ${st.type}">${att ? att.atk : st.atk}</span><span class="hp">${st.hp}</span></div></div>
      <div class="chips">${e.out ? `<span class="chip ok">${e.foe.scorched ? 'Scorched' : 'Defeated'}</span>` : abilityChips(att ? { ...st, abil: att.abil } : st, e)}</div>
      ${meter}<div class="fbtns">${mine.map((o) => btn({ ...o, label: o.id.startsWith('kill') ? 'Defeat' : o.id.startsWith('block') ? 'Block' : o.id.startsWith('hit') ? o.label.replace(/^Take the hit from .*\((.*)\)$/, 'Take $1') : o.id.startsWith('pay') ? `Pay ${att.atk} XP` : o.label.replace(/ \(.*/, '') })).join('')}</div></div>`;
  });
  return `${h}</div></div>`;
}

// ================================================================ hud, party, panels
function renderTop() {
  const g = state.game; const limit = g.turnLimit; const next = g.level < 8 ? g.lum.levels[g.level].cost : null;
  let turns = ''; for (let t = 1; t <= 6; t++) turns += `<i class="${t === g.turn ? 'now' : t < g.turn ? 'past' : ''} ${t > limit ? 'lost' : ''}">${t}</i>`;
  let hearts = ''; for (let i = 0; i < g.maxWounds; i++) hearts += `<i class="${i < g.wounds ? 'hit' : ''}"></i>`;
  return `<header class="top"><button class="ibtn" data-act="menu" aria-label="Menu">&#9776;</button>
    <div class="tracks" data-act="hero"><div class="row1"><span class="round">Round <b>${g.round}</b>/${ROUNDS}</span><span class="turns">${turns}</span></div>
      <div class="row2"><span class="hearts ${g.injured ? 'injured' : ''}">${hearts}</span><span class="stat">Lv <b>${g.level}</b></span><span class="stat">Armor <b>${g.armor}</b></span><span class="stat">XP <b>${g.xpTotal}</b>${next ? `/${next}` : ''}</span><span class="stat">&#9733; <b>${g.reputation}</b></span></div></div>
    <button class="ibtn" data-act="undo" ${state.session && state.session.canUndo() ? '' : 'disabled'} aria-label="Undo">&#8630;</button></header>`;
}
function renderHud() {
  const g = state.game;
  const pool = POINTS.filter((t) => g.pool[t] > 0).map((t) => `<span class="pt">${icon(t)}<b>${g.pool[t]}</b></span>`).join('') || '<span class="muted">No points stored</span>';
  const flags = `${g.precision ? `<span class="pt flag">${icon('prec')}</span>` : ''}${g.meleeRanged ? '<span class="pt flag">Melee&rarr;ranged</span>' : ''}${g.feints ? `<span class="pt flag">Feint ${g.feints}</span>` : ''}${g.brutes.length ? `<span class="pt flag">Brute ${g.brutes.length}</span>` : ''}`;
  let pips = ''; for (let i = 0; i < 3 + g.extra; i++) pips += `<i class="${i < g.used ? 'used' : ''}"></i>`;
  const src = SOURCE_FACES[g.source.face].map(elIcon).join('<em>/</em>');
  return `<div class="hud"><div class="pool">${pool}${flags}</div><div class="res">
    <span class="pips" title="Abilities left">${pips}</span>
    ${ELEMENTS.map((el) => `<span class="shard">${elIcon(el)}<b>${g.shards[el]}</b></span>`).join('')}
    <span class="source ${g.source.used ? 'used' : ''}" data-act="source"><small>Source</small>${src}</span></div></div>`;
}
function renderParty() {
  const g = state.game, p = state.prompt; const opts = p ? p.options.filter((o) => !o.disabled) : [];
  let h = '';
  g.allies.forEach((a, i) => { const o = opts.find((x) => x.ally === i); h += `<div class="tok ally ${a.exhausted ? 'exh' : ''} ${a.wounded ? 'wnd' : ''} ${o ? 'use' : ''}" ${o ? `data-opt="${o.id}"` : `data-act="ally:${i}"`} style="background-image:url(${tokenImg(a)})"><small>Ally</small></div>`; });
  for (let i = g.allies.length; i < g.capacity; i++) h += '<div class="tok slot"><small>Ally slot</small></div>';
  g.skills.forEach((s, i) => { const o = opts.find((x) => x.skill === i); const d = SKILLS[s.skill]; h += `<div class="tok skill ${s.exhausted ? 'exh' : ''} ${d.kind === 'turn' && s.used ? 'exh' : ''} ${o ? 'use' : ''}" ${o ? `data-opt="${o.id}"` : `data-act="skill:${i}"`} style="background-image:url(${tokenImg(s)})"><small>${esc(d.name)}</small></div>`; });
  if (!h) h = '<span class="muted">No allies or skills yet</span>';
  return `<div class="party">${h}</div>`;
}
function renderMat() {
  const g = state.game, p = state.prompt; const mat = g.lum.mat; const opts = p ? p.options.filter((o) => !o.disabled) : [];
  let h = '';
  for (const sq of Object.values(mat.squares)) {
    const o = opts.find((x) => x.sq === sq.id);
    h += `<div class="sq ${g.marker === sq.id ? 'here' : ''} ${o ? 'go' : ''} ${o && o.wound ? 'wound' : ''}" ${o ? `data-opt="${o.id}"` : `data-act="sq:${sq.id}"`} style="left:${sq.x * 100}%;top:${sq.y * 100}%"></div>`;
  }
  const lv = g.level; const legend = `<div class="legend"><span class="y">Yellow</span><span class="w ${lv >= 3 ? '' : 'off'}">White${lv >= 3 ? '' : ' at level 3'}</span><span class="g ${lv >= 5 ? '' : 'off'}">Green${lv >= 5 ? '' : ' at level 5'}</span></div>`;
  return `<div class="mat" style="background-image:url(img/mat/${g.lum.id}.webp)">${h}${legend}</div>`;
}
function renderCompany() {
  const g = state.game; let h = '<div class="list">';
  h += '<h4>Goals</h4>';
  h += `<div class="row"><div class="rt"><b>Defeat the city</b><span>${g.city.cleared ? 'Done' : g.city.revealed ? `${g.city.enemies.filter((f) => f.alive).length} defenders remain` : `${g.shade.name} and ${CITY_SETTINGS[g.config.city].label.toLowerCase()} wait there`}</span></div><i class="tick ${g.city.cleared ? 'on' : ''}"></i></div>`;
  for (const goal of g.goals) { const [ok, text] = g.goalStatus(goal); h += `<div class="row"><img class="mini" src="img/goal/${GOALS[goal].token}.webp"><div class="rt"><b>${esc(GOALS[goal].text)}</b><span>${esc(text)}</span></div><i class="tick ${ok ? 'on' : ''}"></i></div>`; }
  h += '<h4>Allies</h4>';
  if (!g.allies.length) h += `<p class="muted">None. Capacity ${g.capacity}.</p>`;
  g.allies.forEach((a, i) => { const d = g.allyDef(a); h += `<div class="row" data-act="ally:${i}"><img class="mini" src="${tokenImg(a)}"><div class="rt"><b>${esc(g.allyName(a))}</b><span>${d.eff[1]} ${esc(POINT_NAME[d.eff[0]].toLowerCase())} · HP ${d.hp}${a.wounded ? ' · wounded' : a.exhausted ? ' · exhausted' : ''}</span></div></div>`; });
  h += '<h4>Skills</h4>';
  if (!g.skills.length) h += '<p class="muted">None yet.</p>';
  g.skills.forEach((s, i) => { const d = SKILLS[s.skill]; h += `<div class="row" data-act="skill:${i}"><img class="mini" src="${tokenImg(s)}"><div class="rt"><b>${esc(d.name)}${s.exhausted ? ' (exhausted)' : ''}</b><span>${esc(d.text)}</span></div></div>`; });
  h += `<h4>XP tokens (${g.xpTotal})</h4>`;
  h += g.xp.length ? `<div class="tokrow">${g.xp.map((x) => `<span class="xpt"><img src="img/enemy/${x.id}.webp" class="${x.doom ? 'flip' : ''}"><b>${g.xpValue(x)}</b></span>`).join('')}</div>` : '<p class="muted">Defeat enemies to earn XP.</p>';
  h += `<h4>Reputation (${g.reputation})</h4>`;
  h += g.rep.length ? `<div class="tokrow">${g.rep.map((q) => `<span class="xpt"><img src="img/quest/${q.q}${q.side}.webp"><b>${QUESTS[q.q][q.side].rep}</b></span>`).join('')}</div>` : '<p class="muted">Complete side quests to earn reputation. Spend it in combat to intimidate enemies.</p>';
  return `${h}</div>`;
}
function renderMarket() {
  const g = state.game, p = state.prompt; const opts = p ? p.options.filter((o) => !o.disabled) : [];
  let h = '<div class="list"><h4>The offer</h4><p class="muted">Recruit these as allies with influence at towns and caravans, or take one as a skill when you level up.</p>';
  g.offer.forEach((id, i) => {
    const d = TOKENS[id]; const o = opts.find((x) => x.offer === i);
    h += `<div class="row" data-act="offer:${i}"><img class="mini big" src="img/ally/${id}.webp"><div class="rt"><b>${esc(ENEMY_NAME[id])}</b><span>Ally (${d.cost}): ${d.eff[1]} ${esc(POINT_NAME[d.eff[0]].toLowerCase())}, HP ${d.hp}</span><span>Skill: ${esc(SKILLS[d.skill].text)}</span></div>${o ? btn({ ...o, label: 'Recruit', primary: true }) : ''}</div>`;
  });
  h += `<h4>The map</h4><p>${g.tileStack.length ? `${g.tileStack.length} tiles left to explore: ${g.tileStack.map((id) => (TILES[id].hard ? 'hard' : 'easy')).join(', ')}. The city is on one of the last two.` : 'All tiles are revealed.'}</p>
    <p>Enemy tokens left: ${g.stacks.monster.length} monsters, ${g.stacks.mage.length} mages.</p></div>`;
  return h;
}
function renderLog() { return `<div class="list log">${state.game.logLines.slice(-80).reverse().map((l) => `<p class="${l.cls}">${esc(l.msg)}</p>`).join('')}</div>`; }
function renderPanel() {
  const tabs = [['mat', 'Abilities'], ['company', 'Company'], ['market', 'Offer'], ['log', 'Log']];
  const body = state.panel === 'mat' ? renderMat() : state.panel === 'company' ? renderCompany() : state.panel === 'market' ? renderMarket() : renderLog();
  return `<section class="panel p-${state.panel}"><nav class="tabs">${tabs.map(([id, name]) => `<button class="${state.panel === id ? 'on' : ''}" data-act="tab:${id}">${name}</button>`).join('')}</nav><div class="pbody">${body}</div></section>`;
}
function renderPrompt() {
  const p = state.prompt; const g = state.game;
  if (!p) return '<footer class="prompt"></footer>';
  const board = (o) => o.sq || o.hex || o.spot || o.ally !== undefined || o.skill !== undefined || o.offer !== undefined || o.enemy !== undefined || (o.enemies && o.enemies.length === 1);
  const list = p.options.filter((o) => !board(o));
  const hint = p.ctx === 'turn' ? (g.actionsLeft > 0 ? 'Tap a glowing ability, ally or hex.' : 'No abilities left this turn.') : '';
  return `<footer class="prompt">${coach()}<div class="ptitle"><b>${esc(p.title)}</b><span>${esc(hint)}</span></div><div class="pbtns">${list.map((o) => btn(o, o.id === 'end' || o.id === 'next' ? 'endbtn' : '')).join('')}</div></footer>`;
}

// ================================================================ sheets
function sheetForPrompt() {
  const p = state.prompt, g = state.game; if (!p || p.ctx === 'turn' || p.ctx === 'combat' || p.ctx === 'start') return null;
  let head = '';
  if (p.ctx === 'ability') {
    const sq = g.lum.mat.squares[p.detail]; const W = 620, H = W * 882 / 1183;
    head = `<div class="sqcrop" style="background-image:url(img/mat/${g.lum.id}.webp);background-size:${W}px ${H}px;background-position:${-(sq.x * W - 48)}px ${-(sq.y * H - 48)}px"></div>`;
    const groups = [['basic', 'Basic'], ['boost', 'Boosted'], ['std', 'Instead']];
    return `<div class="sheet-body ability">${coach()}${head}<h3>${esc(p.title)}</h3>${groups.map(([k, name]) => { const os = p.options.filter((o) => o.kind === k); return os.length ? `<h5>${name}</h5><div class="olist ${k}">${os.map((o) => btn(o, k === 'boost' ? `cost-${o.cost}` : '')).join('')}</div>` : ''; }).join('')}<div class="olist">${btn(p.options.find((o) => o.id === 'cancel'))}</div></div>`;
  }
  if (p.ctx === 'skill') head = `<div class="offer3">${p.options.map((o) => `<div class="pickcard ${o.disabled ? 'dis' : ''}" ${o.disabled ? '' : `data-opt="${o.id}"`}><img src="img/ally/${g.offer[o.offer]}.webp"><b>${esc(o.label)}</b><small>${esc(o.text)}</small></div>`).join('')}</div>`;
  if (p.ctx === 'goal') head = `<div class="offer3">${p.options.map((o) => `<div class="pickcard ${o.disabled ? 'dis' : ''}" ${o.disabled ? '' : `data-opt="${o.id}"`}><img src="img/goal/${GOALS[o.goal].token}.webp"><b>${esc(o.label)}</b></div>`).join('')}</div>`;
  if (p.ctx === 'shard') head = `<div class="offer3">${p.options.map((o) => `<div class="pickcard el ${o.disabled ? 'dis' : ''}" ${o.disabled ? '' : `data-opt="${o.id}"`}><img src="img/el/${o.el}.webp"><b>${esc(o.label)}</b></div>`).join('')}</div>`;
  const body = head || `<div class="olist">${p.options.map((o) => btn(o)).join('')}</div>`;
  return `<div class="sheet-body">${coach()}<h3>${esc(p.title)}</h3>${p.detail && p.ctx !== 'ability' ? `<p class="muted">${esc(p.detail)}</p>` : ''}${body}</div>`;
}
function hexSheet(k) {
  const g = state.game, p = state.prompt; const hex = g.hexes.get(k); const os = p ? p.options.filter((o) => o.hex === k && !o.disabled) : [];
  if (!hex) return os.length === 1 ? answer(os[0].id) : null;
  const plain = os.length === 1 && !os[0].fight && !os[0].id.startsWith('fight:') && !hex.quest;
  if (plain) return answer(os[0].id);
  let h = `<h3>${esc(TERRAIN_NAME[hex.terrain])}${hex.site ? ` · ${esc(SITE_NAME[hex.site])}` : ''}</h3>`;
  const cost = g.moveCost(hex);
  h += `<p class="muted">${cost === Infinity ? 'You cannot move here.' : `Costs ${cost} move to enter.`}${hex.mark === 'red' ? ' Tower defeated.' : hex.mark === 'black' ? ' Marked: exhausted.' : ''}</p>`;
  h += siteText(hex);
  if (hex.quest) h += questInfo(hex.quest);
  if (hex.enemy && hex.enemy.alive) h += foeInfo(hex.enemy);
  if (hex.k === g.city.key && g.city.revealed) for (const f of g.city.enemies.filter((x) => x.alive)) h += foeInfo(f);
  h += `<div class="olist">${os.map((o) => btn({ ...o, primary: true, label: o.id.startsWith('move') && o.fight ? `Move in and fight (${o.cost} move)` : o.label })).join('')}<button class="btn" data-act="close">Close</button></div>`;
  state.info = `<div class="sheet-body">${h}</div>`; render();
}
function siteText(hex) {
  const t = {
    town: 'Spend influence here: recruit allies at their printed cost, buy healing or shards for 2 influence each. Buying healing or shards exhausts the town at the end of the turn.',
    caravan: 'Recruit allies at +1 cost. Trade XP for shards, 1 each, 3 at most. Trading exhausts the caravan at the end of the turn.',
    storm: 'You must spend 2 move to navigate the storm before leaving. On the turn you move in you may then spend extra move as XP, but only to level up at once.',
    crystal: 'End your turn here to gain 1 shard of your choice.', heal: 'End your turn here to heal 1.',
    tmonster: 'A Doom monster holds this tower (double attack and HP, higher XP).', tmage: 'A Doom mage holds this tower (double attack and HP, higher XP).',
    cmonster: 'The city. Defeat the Shade and its monsters to win. All its defenders are fortified.', cmage: 'The city. Defeat the Shade and its mages to win. All its defenders are fortified.',
    wmonster: 'A wandering monster. You may attack it from an adjacent hex. Moving between two hexes next to it provokes it.', wmage: 'A wandering mage. You may attack it from an adjacent hex. Moving between two hexes next to it provokes it.',
  }[hex.site] || '';
  const terr = hex.site && hex.site[0] === 't' ? { desert: 'Desert tower: the enemy is fortified and appears when you are adjacent.', forest: 'Forest tower: the enemy appears only when you assault the tower.', hills: 'Hills tower: the enemy appears when you are adjacent; the hex costs 4 to enter.' }[hex.terrain] : '';
  return (t ? `<p>${t}</p>` : '') + (terr ? `<p>${terr}</p>` : '');
}
function heroSheet() {
  const g = state.game; const wis = g.maxWounds === 8;
  const lvX = [160, 290, 423, 555, 687, 818, 949, 1080], turnX = [215, 355, 494, 634, 774, 912], roundX = [590, 688, 786, 886];
  const std = [[1018, 470], [950, 548], [880, 470], [810, 548], [742, 470], [672, 548], [602, 470], [532, 548], [462, 470], [394, 548], [323, 470]];
  const wsd = [[975, 545], [895, 480], [828, 548], [758, 480], [690, 548], [620, 480], [550, 548], [480, 480], [410, 548]];
  const wp = (wis ? wsd : std)[g.wounds];
  const cube = (x, y, cls) => `<i class="tcube ${cls}" style="left:${x / 12.24}%;top:${y / 8.82}%"></i>`;
  const sc = g.score();
  state.info = `<div class="sheet-body hero-sheet"><div class="hero-head"><div class="portrait" style="background-image:url(img/mat/${g.lum.id}-portrait.webp)"></div><div><h3>${esc(g.lum.name)}</h3><p class="muted">${esc(g.lum.blurb)}</p></div></div>
    <div class="tracks-img" style="background-image:url(img/mat/${g.lum.id}-tracks.webp)">${cube(roundX[g.round - 1], 122, 'gold')}${cube(lvX[g.level - 1], 330, 'gold')}${cube(turnX[g.turn - 1], 680, 'white')}${cube(wp[0], wp[1], g.injured ? 'red' : 'black')}</div>
    <p class="muted">Turn limit this round: ${g.turnLimit}. Each pair of wounds blocks one more turn space from the right.${g.injured ? ' You are injured: 1 automatic wound in each combat until you heal it.' : ''}</p>
    <h4>If you won now</h4><table class="score">${sc.lines.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v}</td></tr>`).join('')}<tr class="tot"><td>Score</td><td>${sc.total}</td></tr></table>
    <div class="olist"><button class="btn" data-act="close">Close</button></div></div>`;
  render();
}
function menuSheet() {
  state.info = `<div class="sheet-body"><h3>Nightbreaker</h3><div class="olist">
    <button class="btn" data-act="hero">Hero sheet</button><button class="btn" data-act="reference">Reference cards</button>
    <button class="btn" data-act="tutorial">Restart as guided tutorial</button>
    <button class="btn" data-act="rules">How to play</button>
    <button class="btn danger" data-act="abandon">Abandon this game</button><button class="btn" data-act="close">Close</button></div></div>`;
  render();
}
function referenceSheet() {
  state.info = `<div class="sheet-body wide"><h3>Reference cards</h3><div class="refs">${REFERENCE_CARDS.map((r) => `<img src="img/ref/${r}.webp" loading="lazy">`).join('')}</div><div class="olist"><button class="btn" data-act="close">Close</button></div></div>`;
  render();
}
const RULES_HTML = `<h3>How to play</h3>
<p><b>Goal.</b> Cross the map northward, grow stronger, and defeat the Shade and its defenders in the city within 4 rounds. If you play with a goal, you must also complete it.</p>
<p><b>Your turn.</b> Use up to 3 abilities. Each use moves your marker along an unlocked arrow on your ability mat to a new square; you then take its basic (top) effect for free, its boosted (bottom) effect by paying the shown shard (from the source once a turn, or a stored shard) or a wound, or 1 standard point (move, influence, physical block or physical melee). Allies and skills add more.</p>
<p><b>Points</b> are stored only while you keep generating the same kind. Generating a different kind, or finishing a block or attack, loses the rest.</p>
<p><b>Moving.</b> Grass 2, hills, forest and desert 3, wasteland 4. Stand next to the edge of your tile and spend 2 move to explore north, left or right.</p>
<p><b>Combat.</b> Ranged phase (ranged attacks only; fortified and flying enemies need precision), then block each enemy's attack in full or take it (wounds = attack divided by your armor, rounded up; allies may absorb their HP), then the melee phase with all attacks. Block and attack are all or nothing. Unmatched block type counts half. Resistances halve matching attacks. You do not retreat after a failed combat; the enemy recovers fully.</p>
<p><b>Wounds and time.</b> Every 2 wounds remove a turn from each round. Wounds that pass your turn marker in a block phase cost extra wounds. A full wound track, or the end of round 4, loses the game.</p>
<p><b>Sites.</b> Tap any hex to read what it does. Tap an enemy for its abilities. The reference cards are in the menu.</p>`;

// ================================================================ screens
function renderTitle() {
  const save = loadSave();
  return `<div class="title" style="background-image:linear-gradient(180deg,rgba(14,19,36,.2),rgba(14,19,36,.95) 78%),url(img/mat/courage-portrait.webp)">
    <div class="tbox"><h1>Nightbreaker</h1><p class="sub">A Pocket Paladin adventure</p>
    ${save ? '<button class="btn primary big" data-act="continue">Continue</button>' : ''}
    <button class="btn ${save ? '' : 'primary'} big" data-act="setup">New game</button>
    <button class="btn big" data-act="tutorial">Guided tutorial</button>
    <button class="btn big" data-act="rules">How to play</button>
    <p class="credit">Game design by Joe Klipfel, Mythfield Games. Unofficial digital version of the print-and-play playtest files (1.3).</p></div></div>`;
}
function renderSetup() {
  const c = state.config; const lum = LUMINARIES[c.luminary]; const shade = SHADES[c.shade];
  const rating = shade.sides[c.shadeSide].str + CITY_SETTINGS[c.city].str + GOAL_STRENGTH[c.extraGoals];
  const seg = (key, items) => `<div class="seg">${items.map(([v, label]) => `<button class="${String(c[key]) === String(v) ? 'on' : ''}" data-set="${key}:${v}">${label}</button>`).join('')}</div>`;
  const prof = c.profession ? PROFESSIONS[c.profession] : null;
  const both = lum.levels[0].gain.length === 2;
  const profAs = prof ? (lum.levels[0].gain.includes('ally') && (!both || c.profAs !== 'skill') ? 'ally' : 'skill') : null;
  return `<div class="setup"><header><button class="ibtn" data-act="title">&lsaquo;</button><h2>New game</h2></header><div class="scroll">
    <h4>Luminary</h4><div class="lums">${Object.values(LUMINARIES).map((l) => `<button class="lum ${c.luminary === l.id ? 'on' : ''}" data-set="luminary:${l.id}" style="background-image:linear-gradient(180deg,transparent 45%,rgba(10,14,28,.92)),url(img/mat/${l.id}-portrait.webp)"><b>${l.name}</b></button>`).join('')}</div>
    <p class="desc">${esc(lum.blurb)}</p>
    <h4>Profession <small>optional</small></h4><div class="toks"><button class="ptok none ${!c.profession ? 'on' : ''}" data-set="profession:">None</button>${Object.values(PROFESSIONS).map((p) => `<button class="ptok ${c.profession === p.id ? 'on' : ''}" data-set="profession:${p.id}" style="background-image:url(img/ally/${p.id}.webp)"></button>`).join('')}</div>
    <p class="desc">${prof ? `<b>${prof.name}</b> joins as ${profAs === 'ally' ? `an ally: ${prof.eff[1]} ${POINT_NAME[prof.eff[0]].toLowerCase()}, HP ${prof.hp}` : `your starting skill: ${esc(SKILLS[prof.skill].text)}`}. You also draw 2 goals and keep 1.` : 'No profession and no goal: just defeat the city.'}</p>
    ${prof && both ? seg('profAs', [['ally', 'As my ally'], ['skill', 'As my skill']]) : ''}
    <h4>Shade</h4><div class="toks">${Object.values(SHADES).map((s) => `<button class="ptok ${c.shade === s.id ? 'on' : ''}" data-set="shade:${s.id}" style="background-image:url(img/shade/${s.id}${c.shade === s.id ? c.shadeSide : 'a'}.webp)"></button>`).join('')}</div>
    ${seg('shadeSide', ['a', 'b'].sort((x, y) => shade.sides[x].str - shade.sides[y].str).map((s) => [s, `Strength ${shade.sides[s].str}`]))}
    <p class="desc"><b>${shade.name}</b>: attack ${shade.sides[c.shadeSide].atk}, HP ${shade.sides[c.shadeSide].hp}. ${shade.abil.map((a) => `<b>${ABILITY_TEXT[a][0]}.</b> ${esc(ABILITY_TEXT[a][1])}`).join(' ')}</p>
    <h4>City defenders <small>plus the Shade</small></h4>${seg('city', Object.entries(CITY_SETTINGS).map(([k, v]) => [k, `${v.label}<small>+${v.str}</small>`]))}
    <h4>Extra goals</h4>${seg('extraGoals', [[0, 'None'], [1, '1<small>+4</small>'], [2, '2<small>+9</small>']])}
    <div class="rating">Difficulty rating <b>${rating}</b> · ${ratingName(rating)}</div>
    </div><footer><button class="btn primary big" data-act="begin">Begin</button></footer></div>`;
}
function renderOver() {
  const r = state.result, g = state.game;
  let h = `<div class="sheet-body over"><h2>${r.won ? 'Victory' : 'Defeat'}</h2><p>${r.won ? `${esc(g.shade.name)} is broken and the night lifts.` : `${cap(esc(r.reason))}.`}</p>`;
  if (r.score) h += `<table class="score">${r.score.lines.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v}</td></tr>`).join('')}<tr class="tot"><td>Score</td><td>${r.score.total}</td></tr></table><p class="muted">${ratingName(g.rating)} difficulty.</p>`;
  return `${h}<div class="olist"><button class="btn primary" data-act="setup">New game</button><button class="btn" data-act="hideover">Look at the board</button></div></div>`;
}
function renderGame() {
  const g = state.game;
  const stage = g.cmb ? renderCombat() : renderMap();
  const step = tutStep();
  return `<div class="game ${step ? `tutoring w-${step.where}` : ''}">${renderTop()}<main class="stage">${stage}</main>${renderHud()}${renderParty()}${renderPanel()}${renderPrompt()}</div>`;
}
function render() {
  const app = $('#app'); const sheet = $('#sheet');
  const pscroll = $('.pbody') ? $('.pbody').scrollTop : 0;
  if (state.screen === 'title') app.innerHTML = renderTitle();
  else if (state.screen === 'setup') app.innerHTML = renderSetup();
  else if (state.game && state.game.hexes) {
    app.innerHTML = renderGame();
    if ($('.pbody')) $('.pbody').scrollTop = pscroll;
    const g = state.game; const key = `${g.pos ? K(g.pos.x, g.pos.r) : ''}|${g.tiles.length}|${!!g.cmb}|${$('#map') ? Math.round($('#map').getBoundingClientRect().height) : 0}`;
    if ($('#map')) { if (key !== state.centerKey) { const first = !state.centerKey; state.centerKey = key; centerOnHero(!first); } else applyView(); }
  }
  const html = state.info || (state.screen === 'game' ? (state.result && !state.hideOver ? renderOver() : sheetForPrompt()) : null);
  sheet.className = `sheet ${html ? '' : 'hidden'} ${state.info ? 'closable' : ''}`;
  sheet.innerHTML = html || '';
}

// ================================================================ input
document.addEventListener('click', (e) => {
  if (drag.moved) { drag.moved = false; return; }
  const t = e.target.closest('[data-opt],[data-act],[data-set],[data-hex]');
  if (!t) { if (e.target.id === 'sheet' && state.info) { state.info = null; render(); } return; }
  if (t.disabled) return;
  if (t.dataset.opt) return answer(t.dataset.opt);
  if (t.dataset.hex) return hexSheet(t.dataset.hex);
  if (t.dataset.set) { const [k, v] = t.dataset.set.split(':'); state.config[k] = k === 'extraGoals' ? +v : v === '' ? null : v; return render(); }
  const [act, arg] = t.dataset.act.split(':'); const g = state.game;
  switch (act) {
    case 'title': state.screen = 'title'; state.info = null; return render();
    case 'setup': state.screen = 'setup'; state.info = null; state.result = null; state.hideOver = false; return render();
    case 'begin': return newGame();
    case 'tutorial': state.info = null; return startSession({ config: { ...TUTORIAL.config }, seed: TUTORIAL.seed, answers: [] });
    case 'skiptut': state.session.config.tutorial = false; state.prompt = state.rawPrompt; persist(); toast('Tutorial off. The game is yours.'); return render();
    case 'continue': return startSession(loadSave());
    case 'close': state.info = null; return render();
    case 'tab': state.panel = arg; return render();
    case 'menu': return menuSheet();
    case 'hero': return heroSheet();
    case 'market': state.panel = 'market'; return render();
    case 'reference': return referenceSheet();
    case 'rules': state.info = `<div class="sheet-body rules">${RULES_HTML}<div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render();
    case 'abandon': localStorage.removeItem(SAVE_KEY); state.session = null; state.screen = 'title'; state.info = null; return render();
    case 'hideover': state.hideOver = true; return render();
    case 'undo': if (state.session.undo()) toast('Undone'); return;
    case 'recenter': return centerOnHero(true);
    case 'source': state.info = `<div class="sheet-body"><h3>The source</h3><p>Once a turn you may pay for a boosted ability with a shard shown on the source instead of a stored one. ${g.source.used ? 'It is spent this turn and will be rolled again at the end of the turn.' : `It shows ${SOURCE_FACES[g.source.face].map((x) => EL_NAME[x]).join(' or ')}.`}</p><img class="srcimg" src="img/el/source.webp"><div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render();
    case 'ally': { const a = g.allies[+arg]; state.info = `<div class="sheet-body">${tokenInfo(a.id, a.prof)}<p class="muted">${a.wounded ? 'Wounded: cannot be used or absorb damage until healed.' : a.exhausted ? 'Exhausted until the next round.' : 'Ready.'}</p><div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render(); }
    case 'skill': { const s = g.skills[+arg]; state.info = `<div class="sheet-body">${tokenInfo(s.id, s.prof)}<div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render(); }
    case 'offer': state.info = `<div class="sheet-body">${tokenInfo(g.offer[+arg], false)}<div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render();
    case 'foe': { const en = g.cmb.E[+arg]; state.info = `<div class="sheet-body">${foeInfo(en.foe, en)}<div class="olist"><button class="btn" data-act="close">Close</button></div></div>`; return render(); }
    case 'sq': {
      const sq = g.lum.mat.squares[arg]; const from = g.lum.mat.arrows.filter((a) => a.to === arg).map((a) => `${a.from} (${a.color}${a.wound ? ', costs a wound' : ''})`);
      toast(g.marker === arg ? 'Your ability marker is here.' : `Reached from ${from.join(', ') || 'nowhere'}.`); return;
    }
  }
});
// Map pan and pinch zoom.
const drag = { pts: new Map(), moved: false, last: null, dist: 0 };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#map')) return; drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.start = { x: e.clientX, y: e.clientY }; drag.moved = false; drag.dist = 0; });
document.addEventListener('pointermove', (e) => {
  if (!drag.pts.has(e.pointerId)) return;
  const prev = drag.pts.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY };
  const pts = [...drag.pts.values()];
  if (pts.length === 1) {
    if (!drag.moved && Math.hypot(cur.x - drag.start.x, cur.y - drag.start.y) < 7) return;
    drag.moved = true; state.view.x += cur.x - prev.x; state.view.y += cur.y - prev.y;
  } else if (pts.length === 2) {
    drag.pts.set(e.pointerId, cur); const [a, b] = [...drag.pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.dist) {
      const r = $('#map').getBoundingClientRect(); const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      const z = Math.max(0.4, Math.min(1.8, state.view.z * d / drag.dist)); const k = z / state.view.z;
      state.view.x = cx - (cx - state.view.x) * k; state.view.y = cy - (cy - state.view.y) * k; state.view.z = z;
    }
    drag.dist = d; drag.moved = true;
  }
  drag.pts.set(e.pointerId, cur); applyView();
});
const endDrag = (e) => { drag.pts.delete(e.pointerId); drag.dist = 0; if (!drag.pts.size) setTimeout(() => { drag.moved = false; }, 0); };
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
document.addEventListener('wheel', (e) => {
  if (!e.target.closest('#map')) return; e.preventDefault();
  const r = $('#map').getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
  const z = Math.max(0.4, Math.min(1.8, state.view.z * (e.deltaY < 0 ? 1.1 : 0.9))); const k = z / state.view.z;
  state.view.x = cx - (cx - state.view.x) * k; state.view.y = cy - (cy - state.view.y) * k; state.view.z = z; applyView();
}, { passive: false });
window.addEventListener('resize', () => { if (state.screen === 'game') { state.centerKey = ''; render(); } });

// ================================================================ boot
const q = new URLSearchParams(location.search);
if (q.has('tutorial')) {
  startSession({ config: { ...TUTORIAL.config }, seed: TUTORIAL.seed, answers: TUTORIAL.steps.slice(0, +q.get('tutorial')).map((x) => x.pick) });
  if (q.get('click')) setTimeout(() => { for (const sel of q.get('click').split(';')) { const el = document.querySelector(sel); if (el) el.click(); } }, 300);
} else if (q.has('cfg')) { // development: ?cfg={...}&seed=1&auto=20&panel=company starts a game and plays `auto` random decisions
  const cfg = { ...state.config, ...JSON.parse(q.get('cfg')) }; const auto = +(q.get('auto') || 0); const rnd = mulberry32(+(q.get('botseed') || 7));
  if (q.has('panel')) state.panel = q.get('panel');
  startSession({ config: cfg, seed: +(q.get('seed') || 1), answers: [] });
  const panel = q.get('panel');
  const fixed = q.has('ans') ? q.get('ans').split('|') : [];
  let n = 0; const step = () => {
    if (panel) state.panel = panel;
    if (fixed.length && state.session.prompt) { answer(fixed.shift()); return setTimeout(step, 0); }
    const stop = q.get('until'); const hit = stop && state.prompt && (stop === 'combat' ? !!state.game.cmb && state.game.cmb.phase === (q.get('phase') || 'block') : state.prompt.ctx === stop);
    if (q.get('open') && !(n < auto && state.session.prompt && !hit)) { if (q.get('open') === 'hero') return heroSheet(); if (q.get('open') === 'ref') return referenceSheet(); }
    if (n++ < auto && state.session.prompt && !hit) { answer(randomAnswer(state.session.prompt, rnd)); setTimeout(step, 0); } else render();
  };
  setTimeout(step, 0);
} else { if (q.get('screen')) state.screen = q.get('screen'); render(); }
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
    const art = [
      ...Object.keys(ENEMIES).flatMap((id) => [`img/enemy/${id}.webp`, `img/ally/${id}.webp`]), ...Object.keys(PROFESSIONS).flatMap((id) => [`img/ally/${id}.webp`, `img/goal/${id}.webp`]),
      ...Object.keys(SHADES).flatMap((id) => [`img/shade/${id}a.webp`, `img/shade/${id}b.webp`]), ...Object.keys(QUESTS).flatMap((id) => [`img/quest/${id}e.webp`, `img/quest/${id}h.webp`]),
      ...Object.keys(TILES).map((id) => `img/tile/${id}.webp`), 'img/tile/back-easy.webp', 'img/tile/back-hard.webp',
      ...Object.keys(LUMINARIES).flatMap((id) => [`img/mat/${id}.webp`, `img/mat/${id}-portrait.webp`, `img/mat/${id}-tracks.webp`]),
      ...ELEMENTS.map((el) => `img/el/${el}.webp`), 'img/el/source.webp', ...[...POINTS, 'prec', 'save'].map((t) => `img/el/${t}.png`), ...REFERENCE_CARDS.map((r) => `img/ref/${r}.webp`),
    ];
    reg.active && reg.active.postMessage({ precache: art });
  }).catch(() => {});
}
