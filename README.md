# great-design

A [Claude Code](https://claude.com/claude-code) skill: the build procedure for UI that has to look designed rather than generated. Adapted from Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, September 2026) and rebuilt test-first against what a coding agent actually does when asked for "world-class" design.

The problem it addresses: at every step a model picks the consensus answer, so two independent runs of one brief produce the same page. The skill puts variety in before code (seed strings, a written-down default to diverge from), freezes an ambitious brief, then runs a screenshot-only critic loop on a fresh subagent, a removal pass, and an AI-tells sweep.

## Install

```bash
git clone https://github.com/j9o/great-design ~/.claude/skills/great-design
```

Claude Code picks it up on the next session as `/great-design`. The screenshot helper needs Node 18+ and Playwright, resolved from the project you run it in or from a global install:

```bash
npm i -g playwright && npx playwright install chromium
```

## How to use

Invoke `/great-design` with a one-line brief, or just describe the surface; the skill's description also triggers on its own. Give it the surface and audience, the constraints that matter (assets, fonts, design system, which data may appear on the page), and whether you will be around to pick between rendered directions. With you: three rendered options, then a refine pass. Without you: three written directions, the furthest from the default gets built.

You get back the rejected default, the brief, the last critic score with its open findings, and desktop plus phone screenshots. Scores of 6 to 7 are normal for constrained work; the loop stops by budget, not by chasing 9. Expect 20 to 85 minutes per surface, most of it in critic rounds, so use it for pages people judge by eye, not for a token tweak.

## What's inside

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill: Discover, Define, Deliver, the critic prompt, quick reference, red flags |
| `shoot.cjs` | `node shoot.cjs <url-or-file> <out-prefix> [widths]`: full-page 2x PNGs at 1440 and 390, waits for web fonts, scrolls to fire reveal animations, disables motion |
| `tests/scenarios.md` | The two pressure scenarios the skill was tested against, and what to compare |
| `tests/fixtures/reservations-settings.html` | A deliberately generated-looking admin page for the design-system scenario |

## Why these rules

Measured on the same brief, same model, same deadline pressure (2026-09-02):

- Without the skill, two runs produced the same page: same ground hex, bone serif, mono labels, ledger, roman numerals, pull quote. With it, five runs produced five directions.
- Every baseline run fed its critic the source code plus a list of what was already fixed, ran one round, and accepted 6/10 as final.
- Fresh critics plateau around 6 to 7 and contradict each other round to round; rounds after the second rarely moved the score. Hence the budget: two rounds plus a post-removal check, more only while the score moves, four at most.
- One removal pass under critic pressure deleted the element the brief said to remember. The concept is now frozen after the brief and the signature is protected.

## Editing the skill

Treat SKILL.md like code: run a scenario from `tests/scenarios.md` without the change, then with it, and keep the change only if the behaviour moved. Technique 7 of the source article ("Remove AI tells") is paywalled and was not used; the tells list in the skill comes from the test runs.

## Credits

Procedure after Anshu Chimala. Built by Juan Caviglia with Claude Code.
