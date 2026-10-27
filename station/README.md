# Station

The station is the React browser app for Kriah Listener. A child reads and sees marks on the previous line. Teachers get groups, reading maps, roster controls and printable packets.

From the repo root, with station dependencies installed:

```bash
npm --prefix station run dev
```

Open http://localhost:5173/?mock for invented children and fixed simulated grades. The header shows Demo. No microphone, API keys or server are needed. Any PIN of 4 to 12 digits opens the mock teacher screens. `npm run demo` runs the same dev server. See the [root README](../README.md#run-it) for the real server.

| Screen | Hash route |
| --- | --- |
| Who's reading | `#/` |
| Child home | `#/child/<childId>` |
| Read, including checkpoint and level change | `#/read` |
| End of turn | `#/done` |
| Class groups | `#/teacher` |
| Child reading map and turn log | `#/teacher/child/<childId>` |
| Roster | `#/teacher/roster` |
| Child packet | `#/teacher/packet/child/<childId>` |
| Skill packet | `#/teacher/packet/skill/<encodedSkillId>/<level>` |
| Developer trace, with PIN and trace enabled | `#/trace/<turnId>` |

Skill ids use URL encoding, for example `vowel%3Asheva_na`; levels are 1 to 6. Mock bookmarks include `?mock` before the hash, for example `/?mock#/child/bim`. Mock Read and Done bookmarks can open without a saved turn. Live reading requires a started turn; live Done requires a finished turn.

Run tests from the repo root:

```bash
npm run test:station
```

This uses local Vitest and jsdom. It needs no model calls or network. Build with `npm --prefix station run build -- --configLoader native`.
