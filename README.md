# great-design

A [Claude Code](https://claude.com/claude-code) skill: the build procedure for UI that has to look designed rather than generated. Adapted from Anshu Chimala's ["How to turn your AI into a world-class designer"](https://www.lennysnewsletter.com/p/how-to-turn-your-ai-into-a-world) (Lenny's Newsletter, September 2026) and rebuilt test-first against what a coding agent actually does when asked for "world-class" design.

The problem it addresses: at every step a model picks the consensus answer, so two independent runs of one brief produce the same page. The skill puts variety in before code (seed strings, a written-down default to diverge from), freezes an ambitious brief, then runs a screenshot-only critic loop on a fresh subagent, a removal pass, and an AI-tells sweep.

## Install

```bash
git clone https://github.com/j9o/great-design ~/.claude/skills/great-design
# while the repo is private: gh repo clone j9o/great-design ~/.claude/skills/great-design
```

Claude Code picks it up right away as `/great-design` (restart only if `~/.claude/skills/` did not exist before the clone). The screenshot helper needs Node 20+ (Playwright's floor) and Playwright with Chromium, resolved from the project you run it in, from the skill directory, or from a global install:

```bash
npm i -g playwright && npx playwright install chromium   # add --with-deps on Linux
```

If Playwright is not found, `shoot.cjs` exits with code 2 and prints that command. Update with `git -C ~/.claude/skills/great-design pull`; uninstall by deleting the directory.

**Optional companions.** The skill runs alone. When installed, it uses Anthropic's `frontend-design` for aesthetic vocabulary where no design system governs the surface, `make-interfaces-feel-better` for a polish pass, and gstack's `/design-shotgun` and `/design-review` plus Vercel's `web-design-guidelines` as pre-push gates. The critic loop and the screenshot helper are self-contained.

## How to use

Invoke `/great-design` with a one-line brief, or just describe the surface; the skill's description also triggers on its own. Give it the surface and audience, the constraints that matter, and whether you will be around to pick between rendered directions. The "How to use" section at the top of `SKILL.md` says what comes back and what it costs.

## What's inside

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill: Discover, Define, Deliver, the critic prompt, quick reference, red flags |
| `shoot.cjs` | `node shoot.cjs <url-or-file> <out-prefix> [widths]`: full-page 2x PNGs at 1440 and 390, waits for web fonts, scrolls every scroll container to fire reveal animations, emulates reduced motion |
| `tests/smoke.cjs` | `npm test`: renders the fixture and checks the PNGs and the argument validation |
| `LICENSE` | MIT, covering this repository's text and code, not the source article |
| `tests/scenarios.md` | The two pressure scenarios the skill was tested against, and what to compare |
| `tests/fixtures/reservations-settings.html` | A deliberately generated-looking admin page for the design-system scenario |

## Why these rules

Measured on the same brief, same model, same deadline pressure (2026-09-02):

- Without the skill, two runs produced the same page: same ground hex, bone serif, mono labels, ledger, roman numerals, pull quote. With it, five runs produced five directions.
- Every baseline run fed its critic the source code plus a list of what was already fixed, ran one round, and accepted 6/10 as final.
- Fresh critics plateau around 6 to 7 and contradict each other round to round; rounds after the second rarely moved the score. Hence the budget: two rounds plus a post-removal check, more only while the score moves, four at most.
- One removal pass under critic pressure deleted the element the brief said to remember. The concept is now frozen after the brief and the signature is protected.
- Runs took 20 to 85 minutes each, the spread being the number of critic rounds. Run logs and renders stayed local; nothing under `tests/` is a recorded result.

## Editing the skill

Treat SKILL.md like code: run a scenario from `tests/scenarios.md` without the change, then with it, and keep the change only if the behaviour moved. `npm test` covers the helper. Technique 7 of the source article ("Remove AI tells") is paywalled and was not used; the tells list in the skill comes from the test runs.

## License

MIT. It covers this repository's text and code, not the article it adapts.

## Credits

Procedure after Anshu Chimala. Built by Juan Caviglia with Claude Code.
