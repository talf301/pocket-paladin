# Nightbreaker

An unofficial, rules-enforced digital version of *Nightbreaker*, the redevelopment of *Pocket Paladin*, the micro solo adventure game by Joe Klipfel (Mythfield Games). It is a static web app built for iPhone: open it in Safari, choose Share → Add to Home Screen, and it runs full screen.

The app is built from the playtest print-and-play files: the Pocket Paladin rulebook 1.6, the Nightbreaker change notes, and the 1.3 print-and-play PDF. All art shown in the app is cut from that PDF. The art is unreleased playtest material, so keep this repository private.

## What is implemented

- The 4 luminaries (Courage, Justice, Temperance, Wisdom) with their ability mats, level tracks and wound tracks.
- All 20 enemy tokens with their ally and skill sides, the 5 Shades (both sides), the 5 professions and goals, the 7 side quests (both sides), and the 10 map tiles.
- Setup, the tile stack and exploring north, left and right; wandering enemies, towers, the city, towns, caravans, storms, gardens and side quests.
- Combat with ranged, block and melee phases, grouping, resistances, every enemy and Shade ability, intimidation, and wounds against the turn track.
- Difficulty rating (Shade strength, city strength, extra goals) and the end-of-game score.
- Saving after every decision, and undo back to the last point where hidden information was revealed.

Not implemented: the Bonus Map and tunnels from the Pocket Paladin rulebook (the Nightbreaker tiles have neither), and Epic mode (removed in 1.3).

## Run it

```sh
python3 -m http.server 8471 --bind 127.0.0.1    # from the repository root; then open http://localhost:8471/public/
node --test tests/*.test.mjs                     # rules tests and random-play fuzzing
FUZZ_SEEDS=1000 node --test tests/fuzz.test.mjs  # more random games
node tests/run-fuzz.mjs 800 bot                  # statistics from heuristic games
```

To play on an iPhone on the same network, serve `public/` on all interfaces (`python3 -m http.server 8471 --directory public`) and open `http://<mac-name>.local:8471`. Offline play needs HTTPS (the service worker only registers there); over plain HTTP the app still works while the Mac is serving it, and the saved game lives on the phone.

`tools/frame.html` shows the app in an iPhone-sized frame and `tools/shot.sh` screenshots it with headless Chrome. Query parameters for development: `?cfg={...setup overrides}&seed=N` starts a game, `&auto=N&botseed=S` plays N random decisions, `&until=combat` stops at a combat, `&panel=company` opens a tab. `cfg.dev` can set `{level, shards, reveal}` to start stronger or with the whole map laid out.

To rebuild the art from the print-and-play PDF:

```sh
pdfimages -png "Nightbreaker PNP 1.3 - Flip on Long Edge.pdf" PAGES/p
uv run --no-project --with pillow --with numpy python -I tools/extract.py PAGES public/img
```

## How it works

- `public/data.mjs` holds every component, transcribed by hand from the print-and-play sheets: enemy stats, ally and skill sides, Shades, side quests, the tiles' terrain and sites, and each luminary's ability squares, arrows and levels. `tools/hexcolors.py` checks the transcribed terrain against the tile art.
- `public/engine/game.mjs` is the rules engine. It is straight-line async code: every player decision goes through `choose()`, and all randomness comes from a seeded generator. A game is fully determined by its setup, its seed and the list of answers. Saving stores that list; resuming and undo replay it.
- `public/app.mjs` draws the table and answers the engine's prompts. Every prompt is a list of legal options; the interface shows them on the map, the ability mat, the tokens or as buttons, so an illegal move cannot be made.
- `public/sw.js` caches the app and its art for offline play.

## Rulings

Rule sources in order of authority: the reference cards and printed components, then the Nightbreaker change notes, then the Pocket Paladin 1.6 rulebook. Where they are silent or disagree the app does this:

- **Version.** 1.3 components with the 1.4 note on towns: at the end of a turn in which you bought shards or healing at a town, or traded at a caravan, it is marked exhausted. Recruiting is still allowed there.
- **Tile placement.** A tile is 10 hexes in rows of 3, 2, 3, 2. A new tile goes directly north of the tile you stand on, or left or right of it and one hex row further north. You may explore when your hex touches a hex of the new tile's position.
- **Towers.** Desert tower: the enemy is fortified and appears when you are adjacent. Hills tower: appears when you are adjacent and the hex costs 4. Forest tower: appears only when you move in. Towers on other terrain appear when you move in and are not fortified.
- **Wandering enemies** can be attacked from an adjacent hex, once per turn each. Moving between two hexes adjacent to one provokes it. You may also move into its hex, which starts the fight.
- **No retreat.** After a failed combat you stay where you are. You may attack what is left in your hex again on a later turn (each enemy fights at most once per turn).
- **Stored points.** Points of one kind (move, influence, attack, block) add up from any mix of abilities, allies and skills. Generating a different kind, or finishing a block, a defeat or a side quest, loses what is left. The rulebook's rule about consecutive ability squares is covered by this, since any non-matching ability in between clears the store.
- **Slow.** While a Slow enemy's attack is pending, move and block points are kept together and both count against it.
- **Block phase.** You choose the order in which you face the attacks. The extra wounds for passing your turn marker are counted once, after all attacks. An injury deals its automatic wound at the start of the block phase.
- **Intimidate** can be used in the ranged or block phase, before the enemy's attack is resolved. Shades cannot be intimidated (they have no XP value). Reputation is spent as whole side quest tokens.
- **Wisdom's wound track** has 8 hearts and starts one space in, so the first wound already blocks turn 6.
- **Courage's mat** reads "3 exhausted: -1 heart": when a third ally or skill becomes exhausted, heal 1.
- **Wisdom's wound arrows.** Following an arrow marked with a broken heart costs 1 wound.
- **Standard points** from an ability never get the Hunter's +1.
- **Thief (Greed).** Blocking means discarding XP tokens worth at least the attack; the app picks the cheapest set.
- **Vengeful (Wrath).** The attack of twice the other living enemies is photonic, can be blocked, and comes immediately.
- **Commander (Pride).** In the block phase a random token of Pride's type is looked at in the enemy stack; its attack value and abilities replace Pride's for that attack. It is not doubled and returns to the stack.
- **Hidden (Envy).** Uses the 1.3 text: each enemy in the combat that you fail to block gains +1 HP for that combat.
- **Scorchwright.** In the melee phase, if you blocked the enemy and your attack is at least half its HP, you may mark it. It leaves the fight and is defeated (with XP) at the end of your next turn.
- **Storm XP** is spent straight into a level up on the turn you move in; the storm is then marked.
- **Caravan.** Discard one XP token for one shard per XP on it, 3 shards at most per caravan.
- **Enemy names.** The tokens have none; the names in the app are labels for the art.

## Publishing

The site is the `public/` directory.
