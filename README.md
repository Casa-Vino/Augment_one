# Augment

A cyberpunk squad-management game where building your agents *is* the game. Inspired by Bullfrog's *Syndicate* and the augmentation systems of *Deus Ex: Mankind Divided*.

Design a team, take a contract, let the mission play out, read the debrief, rebuild.

## Play

- **Latest:** https://casa-vino.github.io/Augment_one/
- **Earlier versions** stay playable at `/v1/`, `/v2/` and so on. They are linked at the bottom of the HQ screen.
- **On a phone:** open the link, then use “Add to Home Screen” (iPhone, Safari) or “Install app” (Android, Chrome). It runs full-screen like an app and works offline after the first visit.

Each version has its own save, so trying an old version never overwrites your current campaign. A v1 save is carried over into v2 the first time v2 runs.

### Run locally

```sh
npm install
npm run dev        # http://localhost:5173
```

## Versions

Every finished version is kept on a `release/vN` branch. On each push to `main`, the GitHub Actions workflow runs the tests and builds the latest game at the site root. It also builds each `release/vN` branch into `/vN/` and deploys everything to GitHub Pages.

| Version | What it added |
| --- | --- |
| v1 | The core loop: augments, budgets, missions, forecast, debrief. |
| v2 | Optional lore and codex; personalities, earned traits and bonds; non-lethal missions; rival operatives you can capture and recruit; installable app. |
| v3 | City map of eight districts with influence and control; sleeper agents; the Night Market Calyx run; animated after-action replays in every debrief. |
| v4 | Augment art: a technical plate for every augment with maker, model and lore; an anatomical body figure that shows every fitted augment, with live preview while inspecting. |

## How it plays

- **Six body slots** per agent: neural, optics, torso, arms, legs, skin. 25 augments, some locked behind research.
- **Every augment has a price**:
  - *Energy*: powered augments drain energy each phase (double in combat) and shut down when it runs out.
  - *Rejection*: total load over the agent's tolerance risks rejection episodes, unless you pay for a dose of Calyx, the suppressant.
  - *Signature*: loud builds get the team spotted and draw enemy fire.
- **Synergies** between certain augments, found by experimenting.
- **Mission drugs**: intelligence, perception and adrenaline sliders per agent, followed by a crash.
- **Injuries stick**: downed agents can lose a limb (fix it by fitting that slot); agents left behind are gone.
- **Four mission types** (infiltration, assassination, data heist, VIP extraction), each testing a different mix of stealth, combat, hacking and speed.
- **Analyst forecast**: the planning screen runs the real simulation 120 times with your exact squad and orders and shows the success rate.

### The team (v2)

- **Personalities**: every agent starts with one (lone wolf, team player, idealist, cautious, tinkerer, chatterbox).
- **Earned traits**: perks such as Ghost (three quiet missions), Steady hands, Pack mule, Survivor, Peacekeeper and Iron will. One mild quirk, Jumpy, fades after a clean mission.
- **Bonds**: agents who go in together become Trusted, then Inseparable. They get a bonus together and fight harder if their partner goes down.

### The quiet way (v2)

- **Rules of engagement**: lethal or non-lethal per mission. Non-lethal takedowns are harder without arc gloves, sedative mist or the Peacekeeper trait.
- **No bodies, more rewards**: clean contracts raise *standing*, earn extra research and collect a client's no-deaths bonus.
- **Rival operatives** from Black Lantern sometimes share the site. Avoid, eliminate or capture them. Captives can be released, debriefed for research, or offered a place on the team with their augments.

### The city (v3)

- **Districts**: every contract sits in one of eight districts. Success builds influence; at 100% the district is yours and pays every turn.
- **Sleepers**: embed an agent in a district to build influence and skim funds from the inside. Exposure risk grows each turn they stay; burned sleepers come home hurt or go missing.
- **The Night Market**: a once-a-turn, push-your-luck Calyx smuggling run. Bank the haul or push on.

### After-action reports (v3)

Every debrief opens with an isometric, night-time reconstruction of the mission, drawn from events the simulation records: route, patrols, takedowns, alarm, hacks, the rival and the extraction van. Watch-only, with play, pause, speed and skip.

### Lore (v2, optional)

Client briefings, rival intercepts, agent biographies and a codex that fills in as you meet corporations and rivals. You can switch it off in the codex.

## Code layout

| Path | What it is |
| --- | --- |
| `src/sim/data.ts` | All content: augments, synergies, research, missions, prices. Balance changes go here. |
| `src/sim/agent.ts` | Derives an agent's stats and budgets from their augments and drugs. |
| `src/sim/mission.ts` | Seeded, deterministic mission resolution that also writes the debrief log. |
| `src/sim/campaign.ts` | Campaign state and player actions (install, research, recruit, deploy, captives), traits and bonds. Pure functions. |
| `src/sim/lore.ts` | Codex entries, biographies and briefing lines. No effect on the simulation. |
| `src/ui/replay.ts` | Canvas renderer for the after-action replay. |
| `src/ui/augart.ts` | SVG augment plates and the anatomical body figure. |
| `src/ui/` | Browser UI, plain TypeScript with no framework. |
| `scripts/balance.ts` | Runs thousands of missions with preset teams and prints success rates. |
| `tests/` | Vitest unit tests for the simulation. |

The simulation has no UI dependencies, so it can be tested and balanced headlessly:

```sh
npm test
npm run balance          # 400 runs per cell
npm run balance -- 2000  # more runs
```

## Roadmap

- **Optional tactics**: player control layered over the replay.
