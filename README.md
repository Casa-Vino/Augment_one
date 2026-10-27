# Augment

A cyberpunk squad-management game where building your agents *is* the game. Inspired by Bullfrog's *Syndicate* and the augmentation systems of *Deus Ex: Mankind Divided*.

Design a team, take a contract, let the mission play out, read the debrief, rebuild.

## Play

```sh
npm install
npm run dev        # http://localhost:5173
```

Or build a static site with `npm run build` (output in `dist/`). The included GitHub Actions workflow tests, builds and deploys to GitHub Pages on every push to `main`. To turn it on, open the repo's **Settings → Pages** and set **Source** to **GitHub Actions**.

## How it plays

- **Six body slots** per agent: neural, optics, torso, arms, legs, skin. 22 augments, some locked behind research.
- **Every augment has a price**:
  - *Energy*: powered augments drain energy each phase (double in combat) and shut down when it runs out.
  - *Rejection*: total load over the agent's tolerance risks rejection episodes, unless you pay for a suppressant dose.
  - *Signature*: loud builds get the team spotted and draw enemy fire.
- **Synergies** between certain augments, found by experimenting.
- **Mission drugs**: intelligence, perception and adrenaline sliders per agent, followed by a crash.
- **Injuries stick**: downed agents can lose a limb (fix it by fitting that slot); agents left behind are gone.
- **Four mission types** (infiltration, assassination, data heist, VIP extraction), each testing a different mix of stealth, combat, hacking and speed.
- **Analyst forecast**: the planning screen runs the real simulation 120 times with your exact squad and shows the success rate.

## Code layout

| Path | What it is |
| --- | --- |
| `src/sim/data.ts` | All content: augments, synergies, research, missions, prices. Balance changes go here. |
| `src/sim/agent.ts` | Derives an agent's stats and budgets from their augments and drugs. |
| `src/sim/mission.ts` | Seeded, deterministic mission resolution that also writes the debrief log. |
| `src/sim/campaign.ts` | Campaign state and player actions (install, research, recruit, deploy). Pure functions. |
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

1. **Core loop (this version)**: text and UI only.
2. **Watchable replay**: draw the same seeded simulation on a 2D isometric map.
3. **Optional tactics**: player control layered over the replay.
