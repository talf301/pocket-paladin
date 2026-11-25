// Nightbreaker (Pocket Paladin redevelopment), print-and-play 1.3.
// Everything here is transcribed by hand from the printed components.

export const ELEMENTS = ['earth', 'wind', 'fire'];
export const EL_NAME = { earth: 'Earth', wind: 'Wind', fire: 'Fire' };

// Point types. pm/pr = physical melee/ranged attack, mm/mr = photonic (magic) melee/ranged attack,
// pb/mb = physical/photonic block.
export const POINTS = ['move', 'inf', 'pm', 'pr', 'mm', 'mr', 'pb', 'mb'];
export const POINT_NAME = { move: 'Move', inf: 'Influence', pm: 'Physical melee', pr: 'Physical ranged', mm: 'Photonic melee', mr: 'Photonic ranged', pb: 'Physical block', mb: 'Photonic block' };
export const CATEGORY = { move: 'move', inf: 'inf', pm: 'atk', pr: 'atk', mm: 'atk', mr: 'atk', pb: 'blk', mb: 'blk' };

// ---------------------------------------------------------------- enemy tokens
// xp: [as a Dusk enemy, as a Doom enemy]. Doom enemies have double attack and HP.
const E = (id, type, atk, hp, xp, abil = [], resist = []) => ({ id, type, atk, hp, xp, abil, resist });
export const ENEMIES = Object.fromEntries([
  E('T1', 'monster', 4, 4, [4, 10], ['aggressive', 'slow']),
  E('T2', 'monster', 3, 3, [2, 6], ['deadly'], ['phys']),
  E('T3', 'monster', 4, 3, [3, 9], ['flying']),
  E('T4', 'monster', 3, 5, [3, 8], ['trap']),
  E('T5', 'monster', 6, 3, [4, 11], [], ['phys']),
  E('T6', 'monster', 3, 3, [3, 8], ['aggressive', 'deadly']),
  E('T7', 'monster', 4, 4, [3, 9], ['poison'], ['magic']),
  E('T8', 'monster', 2, 3, [2, 5], ['fortified']),
  E('T9', 'monster', 3, 2, [2, 6], ['flying']),
  E('T10', 'monster', 3, 4, [4, 11], ['poison', 'fortified'], ['magic']),
  E('T11', 'mage', 2, 4, [3, 8], ['aggressive', 'anomaly'], ['magic']),
  E('T12', 'mage', 3, 3, [2, 5], ['unfortified', 'anomaly']),
  E('T13', 'mage', 5, 3, [3, 8], ['slow'], ['phys']),
  E('T14', 'mage', 3, 4, [3, 8], ['aggressive']),
  E('T15', 'mage', 3, 4, [4, 11], ['poison', 'deadly'], ['magic']),
  E('T16', 'mage', 4, 2, [2, 6], ['flying']),
  E('T17', 'mage', 3, 6, [4, 11], ['trap']),
  E('T18', 'mage', 2, 4, [3, 8], [], ['magic']),
  E('T19', 'mage', 4, 5, [4, 10], ['unfortified']),
  E('T20', 'mage', 2, 3, [2, 6], ['trap', 'deadly'], ['phys']),
].map((e) => [e.id, e]));

// The tokens carry no names; these are this app's labels for the art.
export const ENEMY_NAME = {
  T1: 'Ember Colossus', T2: 'Shield Knight', T3: 'Night Wraith', T4: 'Deep Leviathan', T5: 'Black Rider', T6: 'Shadow Wolf', T7: 'Storm Reaver', T8: 'Iron Sentinel', T9: 'Ash Drake', T10: 'Thorn Beast',
  T11: 'Blood Cultist', T12: 'Spectral Hound', T13: 'Bone Necromancer', T14: 'Hooded Assassin', T15: 'Dune Sorcerer', T16: 'Fallen Seraph', T17: 'Plague Lich', T18: 'Blade Dervish', T19: 'Void Seer', T20: 'Tide Warlock',
};

export const ABILITY_TEXT = {
  aggressive: ['Aggressive', "Requires 2x block to block this enemy's attack."],
  deadly: ['Deadly', 'If the attack is not blocked you are injured: take 1 automatic wound in each combat until you remove the injury with 1 healing.'],
  fortified: ['Fortified', 'No attacks in the ranged phase unless your ranged attacks have precision. Double fortified: no attacks in the ranged phase at all.'],
  unfortified: ['Unfortified', 'Not fortified, even in a tower or city.'],
  flying: ['Flying', 'Cannot be attacked in the ranged phase unless your ranged attacks have precision. Non-ranged attacks in the melee phase are halved.'],
  poison: ['Poison', 'If its attack is unblocked it deals 2x its attack value.'],
  slow: ['Slow', 'You may spend movement points to block this enemy.'],
  trap: ['Trap', "If you do not block this enemy's attack, advance your turn marker 1 space. Take 1 wound for every turn space this pushes you past your limit."],
  anomaly: ['Anomaly', "Heal 1 immediately if you block this enemy's attack."],
  thief: ['Thief', "Blocking this enemy's attack requires discarding XP instead of spending block points."],
  vengeful: ['Vengeful', 'After you defeat this enemy, face an attack equal to twice the number of other living enemies.'],
  inspiring: ['Inspiring', 'Other enemies in this combat have +2 HP while this enemy is in play.'],
  hidden: ['Hidden', "All enemies in this combat (even after this enemy is defeated): if you do not block the enemy's attack, it gains +1 HP for this combat."],
  commander: ['Commander', "In the block phase a random enemy of the same type attacks in place of this enemy's attack."],
};
export const RESIST_TEXT = { phys: ['Physical resistance', 'Your physical attacks against this enemy are halved.'], magic: ['Photonic resistance', 'Your photonic attacks against this enemy are halved.'] };

// ---------------------------------------------------------------- ally and skill sides of the enemy tokens
// ally: recruitment cost, effect [point type, value], HP.
const A = (id, cost, type, n, hp, skill) => ({ id, cost, eff: [type, n], hp, skill });
export const TOKENS = Object.fromEntries([
  A('T1', 7, 'pb', 6, 6, 'lake'),
  A('T2', 4, 'pb', 4, 4, 'swap'),
  A('T3', 4, 'move', 4, 3, 'stride'),
  A('T4', 7, 'move', 5, 7, 'parley'),
  A('T5', 2, 'pm', 2, 1, 'shardWind'),
  A('T6', 4, 'mm', 3, 3, 'mountain'),
  A('T7', 3, 'pm', 4, 4, 'guard'),
  A('T8', 8, 'pm', 7, 6, 'feint'),
  A('T9', 2, 'move', 3, 2, 'volley'),
  A('T10', 5, 'pr', 3, 3, 'shardFire'),
  A('T11', 5, 'mm', 4, 3, 'ward'),
  A('T12', 5, 'move', 5, 5, 'surge'),
  A('T13', 6, 'inf', 5, 3, 'longshot'),
  A('T14', 7, 'mm', 5, 4, 'shardEarth'),
  A('T15', 4, 'mb', 5, 3, 'bulwark'),
  A('T16', 3, 'pb', 4, 2, 'guard'),
  A('T17', 3, 'mr', 2, 3, 'parleyMagic'),
  A('T18', 2, 'mb', 3, 3, 'aim'),
  A('T19', 3, 'inf', 3, 2, 'mend'),
  A('T20', 3, 'move', 4, 2, 'mend'),
].map((t) => [t.id, t]));

// kind: passive | turn (once a turn) | exhaust | action (costs one of your abilities for the turn)
export const SKILLS = {
  lake: { kind: 'passive', name: 'Lakewalker', text: 'You may move into lakes for 2 movement. If you end your turn on a lake, gain 1 wind shard.' },
  mountain: { kind: 'passive', name: 'Mountaineer', text: 'You may move into mountains for 2 movement. If you end your turn on a mountain, gain 1 earth shard.' },
  swap: { kind: 'turn', name: 'Shift Guard', text: 'Once a turn, change 1 block ability (even an ally ability) from physical to photonic, or vice versa.', mod: true },
  parley: { kind: 'turn', name: 'Stand Firm', text: 'Once a turn, change 1 influence ability to physical block.', mod: true },
  parleyMagic: { kind: 'turn', name: 'Radiant Word', text: 'Once a turn, change 1 influence ability to photonic block.', mod: true },
  bulwark: { kind: 'exhaust', name: 'Bulwark', text: 'Exhaust to double the value of a block ability (even an ally ability).', mod: true },
  stride: { kind: 'turn', name: 'Stride', text: 'Once a turn, gain 1 move and advance your ability marker 1 space without spending an action.' },
  guard: { kind: 'turn', name: 'Guard', text: 'Once a turn, gain physical block 2 or move 2.' },
  ward: { kind: 'turn', name: 'Ward', text: 'Once a turn, gain 3 physical or photonic block.' },
  feint: { kind: 'exhaust', name: 'Feint', text: 'Exhaust to ignore 1 ability on 1 enemy this turn.' },
  volley: { kind: 'action', name: 'Volley', text: 'Spend an action to gain 2 physical ranged attack; all your ranged attacks this turn have precision.' },
  aim: { kind: 'exhaust', name: 'Take Aim', text: 'Exhaust to gain 2 physical ranged attack; all your ranged attacks this turn have precision.' },
  shardWind: { kind: 'exhaust', name: 'Wind Shard', text: 'Exhaust to gain 1 wind shard. You may also advance your ability marker without spending an action.', el: 'wind' },
  shardFire: { kind: 'exhaust', name: 'Fire Shard', text: 'Exhaust to gain 1 fire shard. You may also advance your ability marker without spending an action.', el: 'fire' },
  shardEarth: { kind: 'exhaust', name: 'Earth Shard', text: 'Exhaust to gain 1 earth shard. You may also advance your ability marker without spending an action.', el: 'earth' },
  surge: { kind: 'exhaust', name: 'Surge', text: 'Exhaust to get +1 action this turn.' },
  longshot: { kind: 'exhaust', name: 'Long Shot', text: 'Exhaust to make all your melee attacks ranged this turn (photonic or physical).' },
  mend: { kind: 'exhaust', name: 'Mend', text: 'Exhaust to heal 2.' },
  // profession skills
  mender: { kind: 'exhaust', name: 'Mender', text: 'Exhaust at the beginning of a combat: heal 2 and the target enemy has -1 printed HP.', combat: true },
  scorchwright: { kind: 'exhaust', name: 'Scorchwright', text: 'Exhaust during a combat, after you have blocked the target enemy and dealt it at least half as many wounds as its HP. Mark it: at the end of your next turn it is defeated. Until then it is out of play.', combat: true },
  wayfarer: { kind: 'exhaust', name: 'Wayfarer', text: 'Exhaust and declare a terrain type. For the rest of the turn it costs 1 less to move into, OR every time you move into it this turn gain 1 shard of your choice.' },
  hunter: { kind: 'exhaust', name: 'Hunter', text: "While this skill is ready, ability track abilities that generate ranged attack generate +1. You may exhaust it to ignore 1 enemy's fortified status or fortified ability.", combat: true },
  darkwatcher: { kind: 'exhaust', name: 'Darkwatcher', text: 'Exhaust when entering a combat to swap a Dusk enemy saved as XP for a Dusk enemy in the combat, or a Doom enemy saved as XP for a Doom enemy in the combat.', combat: true },
};

// ---------------------------------------------------------------- professions and goals (two sides of the same token)
export const PROFESSIONS = {
  P1: { id: 'P1', name: 'Darkwatcher', eff: ['pb', 3], hp: 2, skill: 'darkwatcher', goal: 'turns' },
  P2: { id: 'P2', name: 'Hunter', eff: ['pr', 1], hp: 2, skill: 'hunter', goal: 'reputation' },
  P3: { id: 'P3', name: 'Wayfarer', eff: ['move', 2], hp: 2, skill: 'wayfarer', goal: 'tiles' },
  P4: { id: 'P4', name: 'Scorchwright', eff: ['mb', 2], hp: 5, skill: 'scorchwright', goal: 'towers' },
  P5: { id: 'P5', name: 'Mender', eff: ['mm', 2], hp: 3, skill: 'mender', goal: 'shards' },
};
export const GOALS = {
  turns: { token: 'P1', text: 'Finish with at least 2 turns remaining' },
  reputation: { token: 'P2', text: 'Finish with at least 6 reputation' },
  tiles: { token: 'P3', text: 'All map tiles revealed and a mark on at least 5 tiles' },
  towers: { token: 'P4', text: 'Defeat at least 4 towers' },
  shards: { token: 'P5', text: 'Finish with at least 5 shards' },
};

// ---------------------------------------------------------------- shades (side a is the front of the sheet)
const S = (id, name, type, abil, a, b) => ({ id, name, type, abil, sides: { a, b } });
export const SHADES = {
  S1: S('S1', 'Greed', 'monster', ['thief', 'poison'], { atk: 4, hp: 6, str: 2 }, { atk: 3, hp: 5, str: 1 }),
  S2: S('S2', 'Envy', 'mage', ['hidden'], { atk: 5, hp: 8, str: 3 }, { atk: 3, hp: 7, str: 2 }),
  S3: S('S3', 'Wrath', 'mage', ['vengeful', 'inspiring'], { atk: 7, hp: 10, str: 4 }, { atk: 6, hp: 8, str: 3 }),
  S4: S('S4', 'Pride', 'monster', ['commander'], { atk: 6, hp: 10, str: 4 }, { atk: 8, hp: 13, str: 5 }),
  S5: S('S5', 'Sloth', 'monster', ['slow', 'deadly', 'trap'], { atk: 11, hp: 9, str: 4 }, { atk: 7, hp: 8, str: 3 }),
};

// ---------------------------------------------------------------- side quests
// e = white signpost side (easy tiles), h = yellow signpost side (hard tiles).
// need: [what you pay, how much]. patk/matk accept melee or ranged points of that kind.
const Q = (id, e, h) => ({ id, e, h });
const side = (move, need, n, rep, shards) => ({ move, need: [need, n], rep, shards });
export const QUESTS = Object.fromEntries([
  Q('Q1', side(4, 'matk', 3, 2, ['fire', 'earth']), side(5, 'pb', 5, 4, ['earth', 'wind'])),
  Q('Q2', side(3, 'move', 2, 1, ['wind']), side(4, 'move', 4, 3, ['wind', 'fire'])),
  Q('Q3', side(1, 'inf', 3, 1, ['earth']), side(2, 'mb', 5, 3, ['earth', 'earth'])),
  Q('Q4', side(3, 'mb', 4, 2, ['wind', 'fire']), side(4, 'patk', 6, 4, ['earth', 'fire'])),
  Q('Q5', side(3, 'pb', 3, 2, ['fire']), side(4, 'inf', 8, 4, ['wind', 'earth', 'fire'])),
  Q('Q6', side(2, 'patk', 4, 2, ['earth']), side(3, 'inf', 5, 3, ['fire', 'fire'])),
  Q('Q7', side(2, 'inf', 2, 1, ['wind']), side(3, 'matk', 4, 3, ['wind', 'wind'])),
].map((q) => [q.id, q]));
export const NEED_NAME = { move: 'move', inf: 'influence', pb: 'physical block', mb: 'photonic block', patk: 'physical attack', matk: 'photonic attack' };
export const NEED_TYPES = { move: ['move'], inf: ['inf'], pb: ['pb'], mb: ['mb'], patk: ['pm', 'pr'], matk: ['mm', 'mr'] };

// ---------------------------------------------------------------- source shard
export const SOURCE_FACES = [['wind'], ['earth'], ['fire'], ['earth', 'wind'], ['wind', 'fire'], ['earth', 'fire']];

// ---------------------------------------------------------------- map tiles
// Pointy-top hexes in rows of 3, 2, 3, 2 from north to south. Each hex is "terrain" or "terrain+site".
// Terrain: grass hills forest desert waste mountain lake.
// Sites: town caravan storm crystal (shard garden) heal (healing garden) quest (compass rose)
//        wmonster wmage (banners: wandering enemies) tmonster tmage (towers) cmonster cmage (city).
const T = (id, hard, ...rows) => ({ id, hard, rows: rows.map((r) => r.split(' ')) });
export const TILES = Object.fromEntries([
  T('g1', false, 'hills+tmonster mountain hills+town', 'grass+caravan forest+storm', 'lake desert grass+wmage', 'grass+wmonster grass'),
  T('g2', false, 'desert+wmonster mountain grass+storm', 'forest+town grass', 'mountain grass+wmage forest+caravan', 'grass hills'),
  T('g3', false, 'hills+town grass+crystal hills+tmage', 'mountain forest+wmonster', 'hills+quest desert+heal lake', 'grass+wmage grass'),
  T('g4', false, 'hills+wmage grass+crystal forest+tmonster', 'grass lake', 'forest+quest forest+caravan lake', 'grass grass+wmonster'),
  T('g5', false, 'desert+town lake grass', 'hills+tmage grass+heal', 'grass+wmage mountain hills+quest', 'forest grass+wmonster'),
  T('b1', true, 'forest+town hills grass+cmonster', 'waste mountain', 'desert+storm waste+caravan forest+tmage', 'forest+tmonster desert+quest'),
  T('b2', true, 'forest+wmage forest+town lake', 'lake hills+tmonster', 'desert+quest waste waste+crystal', 'desert+tmage hills+caravan'),
  T('b3', true, 'grass+cmage hills+town forest+tmage', 'waste+storm desert', 'desert+tmonster waste forest+quest', 'hills+caravan waste+wmage'),
  T('b4', true, 'desert+wmonster hills desert', 'waste+caravan forest+tmage', 'hills+tmonster lake forest+town', 'desert waste+quest'),
  T('b5', true, 'desert+quest waste+town desert', 'desert+tmonster waste', 'mountain forest+caravan mountain', 'hills+tmage hills'),
].map((t) => [t.id, t]));
export const GREEN_TILES = ['g1', 'g2', 'g3', 'g4', 'g5'];
export const CITY_TILES = ['b1', 'b3'];
export const BROWN_TILES = ['b2', 'b4', 'b5'];
export const TERRAIN_COST = { grass: 2, hills: 3, forest: 3, desert: 3, waste: 4 };
export const TERRAIN_NAME = { grass: 'Grassland', hills: 'Hills', forest: 'Forest', desert: 'Desert', waste: 'Wasteland', mountain: 'Mountains', lake: 'Lake' };
export const SITE_NAME = { town: 'Town', caravan: 'Caravan', storm: 'Storm', crystal: 'Shard Garden', heal: 'Healing Garden', quest: 'Side Quest', wmonster: 'Wandering Monster', wmage: 'Wandering Mage', tmonster: 'Monster Tower', tmage: 'Mage Tower', cmonster: 'Monster City', cmage: 'Mage City' };
// Where a new tile may go relative to the tile you stand on, in doubled-x hex coordinates [dx, drow].
export const PLACEMENTS = { north: [0, -4], left: [-5, -1], right: [5, -1] };

// ---------------------------------------------------------------- luminaries
// Ability squares A..I. Each has a basic (top) and boosted (bottom) effect; an effect is a list of alternatives
// (the printed "/"), each a list of parts. Part types: the point types, plus
// save (store the source shard), prec (precision), feint, brute:phys|magic (ignore that resistance on 1 enemy).
// cost: earth | wind | fire | wound.
const P = (s) => s.split(' / ').map((alt) => alt.split(' ').map((p) => { const [t, n] = p.split(':'); return { t, n: /^\d+$/.test(n) ? +n : n }; }));
const SQ = (id, x, y, basic, cost, boost) => ({ id, x, y, basic: P(basic), cost, boost: P(boost) });
const POS = { A: [0.177, 0.21], B: [0.486, 0.207], C: [0.734, 0.217], D: [0.282, 0.452], E: [0.704, 0.454], F: [0.166, 0.748], G: [0.395, 0.721], H: [0.614, 0.746], I: [0.828, 0.748] };
const mat = (squares, start, arrows) => ({ start, squares: Object.fromEntries(squares.map(([id, basic, cost, boost]) => [id, SQ(id, POS[id][0], POS[id][1], basic, cost, boost)])), arrows });
// Arrows: 'A>B' one way, 'A=B' both ways, a trailing '!' means following it costs 1 wound.
const ARROWS = (y, w, g) => [...y.split(' ').map((a) => [a, 'yellow']), ...w.split(' ').map((a) => [a, 'white']), ...g.split(' ').map((a) => [a, 'green'])]
  .flatMap(([a, color]) => { const wound = a.endsWith('!'); const [, from, op, to] = a.match(/^(\w)([>=])(\w)/); const out = [{ from, to, color, wound }]; if (op === '=') out.push({ from: to, to: from, color, wound }); return out; });

const LEVELS = (s) => s.split(' ').map((l, i) => { const [cost, armor, gain] = l.split('/'); return { level: i + 1, cost: +cost, armor: +armor, gain: gain.split('+'), color: i < 2 ? 'yellow' : i < 4 ? 'white' : 'green' }; });

export const LUMINARIES = {
  courage: {
    id: 'courage', name: 'Courage', wounds: 10, perk: 'exhaust3',
    blurb: 'A stalwart defender. Starts with an ally slot. Whenever a third ally or skill becomes exhausted, heal 1.',
    levels: LEVELS('0/2/ally 2/3/skill 5/3/ally 6/4/skill 12/4/ally 13/5/skill 14/5/ally 16/6/skill'),
    mat: mat([
      ['A', 'pb:2 / pm:2', 'earth', 'move:3'], ['B', 'mb:4 / pb:4', 'wind', 'mr:4'], ['C', 'mb:12 / pb:12', 'fire', 'mm:7'],
      ['D', 'move:2', 'wind', 'inf:4'], ['E', 'move:6', 'wound', 'mm:8'],
      ['F', 'mb:3', 'fire', 'inf:4'], ['G', 'move:1 save:1', 'fire', 'pm:4'], ['H', 'move:2', 'earth', 'mb:4 / mm:4'], ['I', 'move:4', 'earth', 'inf:7'],
    ], 'G', ARROWS('A=F D>A A>G D=G G>F G>H F=H H>D', 'A>B B>G I>A H>I', 'C>B C>D G>E E>H I>C')),
  },
  justice: {
    id: 'justice', name: 'Justice', wounds: 10,
    blurb: 'A relentless striker who can force through resistances. Starts with an ally slot.',
    levels: LEVELS('0/2/ally 3/3/skill 5/4/ally 8/4/skill 12/5/ally 14/5/skill 16/6/ally 17/6/skill'),
    mat: mat([
      ['A', 'move:2', 'earth', 'inf:4'], ['B', 'move:3 brute:magic', 'wind', 'inf:4'], ['C', 'mb:8', 'fire', 'pb:8 / pm:8'],
      ['D', 'mb:3 / pb:3', 'fire', 'move:3'], ['E', 'move:4', 'wound', 'pm:9'],
      ['F', 'move:2', 'fire', 'mm:4 / mr:2'], ['G', 'inf:2 / pm:2', 'wind', 'pb:4'], ['H', 'mr:2', 'wound', 'pm:5'], ['I', 'pm:3 brute:phys', 'earth', 'move:4 / mr:4'],
    ], 'H', ARROWS('A=F F>D D>A A>G D>G G>F G>H H>F H>D', 'A>B B>G H>I I>F', 'B>C E>A D>E C>H E>H C>I')),
  },
  temperance: {
    id: 'temperance', name: 'Temperance', wounds: 10,
    blurb: 'A precise ranged fighter. Starts with a skill.',
    levels: LEVELS('0/2/skill 3/3/ally 5/3/skill 7/4/ally 12/4/skill 14/5/ally 15/5/skill 17/6/ally'),
    mat: mat([
      ['A', 'move:2', 'earth', 'pr:3'], ['B', 'pr:3', 'wind', 'mb:6 / pb:6'], ['C', 'mb:8 / pb:8', 'fire', 'mm:6'],
      ['D', 'move:2', 'wind', 'inf:4'], ['E', 'move:7', 'wound', 'pm:9'],
      ['F', 'pm:2', 'fire', 'mm:4 prec:1'], ['G', 'pb:2', 'wind', 'move:4'], ['H', 'inf:2', 'earth', 'pb:4 / pm:4'], ['I', 'pm:2 / move:4', 'earth', 'inf:6'],
    ], 'D', ARROWS('A=F D>A A>G D=G G>F G>H F=H H>D', 'A>B B>H I>A H>I', 'C>B C>D G>E E>H I>C')),
  },
  wisdom: {
    id: 'wisdom', name: 'Wisdom', wounds: 8,
    blurb: 'A frail sage of photonic power. Starts with both a skill and an ally slot, but has only 8 wounds.',
    levels: LEVELS('0/2/skill+ally 3/3/skill 5/3/ally 7/4/skill 12/4/ally 14/5/ally 15/5/skill 17/6/ally'),
    mat: mat([
      ['A', 'mb:2 / pb:2', 'fire', 'move:4'], ['B', 'inf:4', 'earth', 'pr:4'], ['C', 'inf:5', 'fire', 'mb:8 / mm:8'],
      ['D', 'inf:2', 'earth', 'move:3'], ['E', 'move:4 / mm:4', 'wind', 'pm:3 feint:1'],
      ['F', 'move:2 / mm:2', 'wind', 'mb:4 / mm:4'], ['G', 'inf:2 / mr:2', 'wind', 'inf:4'], ['H', 'move:2', 'fire', 'pm:4'], ['I', 'mb:6 / mm:6', 'earth', 'move:7'],
    ], 'F', ARROWS('F>A A=D D>F A>G D=G G>F G=H F>H H>D', 'D>B A>E B>G E>H', 'D>C C>F H>I I>B I>E! E>C!')),
  },
};

export const CITY_SETTINGS = {
  dusk2: { label: '2 Dusk enemies', count: 2, doom: false, str: 0 },
  doom2: { label: '2 Doom enemies', count: 2, doom: true, str: 3 },
  doom3: { label: '3 Doom enemies', count: 3, doom: true, str: 6 },
};
export const GOAL_STRENGTH = [0, 4, 9];
export const ROUNDS = 4;
export function ratingName(n) { return n >= 12 ? 'Expert' : n >= 8 ? 'Hard' : n >= 5 ? 'Normal' : 'Easy'; }

export const REFERENCE_CARDS = ['R11-5', 'R12-5', 'R11-3', 'R12-1', 'R11-2', 'R12-2', 'R11-1', 'R12-3', 'R11-6', 'R11-4', 'R12-6', 'R12-4'];
