# Test scenarios

The skill was built test-first ([superpowers](https://github.com/obra/superpowers)
`writing-skills`): run each scenario WITHOUT the skill first and record what the agent
does, then WITH it. Any edit to SKILL.md gets the same treatment. Ask for a numbered
`process.md` log so the behaviour, not the output, is what you compare.

Baseline runs: move the skill out of `~/.claude/skills/` first, otherwise its description
self-triggers. Every run, baseline or not, is a fresh session (or a fresh subagent with no
parent context) in its own empty directory; replace `<workdir>` and `<fixture path>` with
absolute paths. Both columns below were measured on Claude Fable 5.1 via Claude Code on 2026-09-02, with
critic subagents on Opus; note the models in every log. Reject a baseline whose `process.md` mentions a
seed or a divergence check: the skill leaked in. Ask every run to save each critic prompt
and reply verbatim as `<workdir>/critic-<n>.md`, so the "critic inputs" row is checked by
reading the file, not the agent's account of it. Results stay local: this folder holds the
scenarios and the fixtures, not recorded runs.

## Deciding "one design" and "behaviour moved"

Extract four things from each page: body ground color, display `font-family`, the first
three section headings in order, and whether the hero is centered or asymmetric. Two pages
are one design when three of the four match. An edit to SKILL.md is kept when no row in
the table below regresses and at least one improves, across two baseline runs and at
least two with-skill runs.

## What to look for

| Signal | Baseline (2026-09-02) | With the skill |
|--------|----------------------|----------------|
| Independent runs of one brief | Two runs, one design (same ground hex, type, section order) | Five runs, five directions |
| Direction chosen how | "In my head", nothing rendered or written | Seed, written default, divergence check |
| Critic inputs | Source code + "what I already fixed" | Screenshots + brief only |
| Critic rounds | One; 6/10 accepted as final | Two; one more after removal if the page changed; more only while the score moves |
| Removal pass | Deleted unused CSS tokens | Elements on screen questioned; signature kept |
| Verification | Playwright screenshots (fine) | Same, with reveals fired and fonts reported |

## Scenario 1: greenfield surface under time pressure

> IMPORTANT: This is a real task, not a quiz. Do the work end to end.
>
> You are working for the founder of a restaurant-reservation company who also runs a premium dining brand (chef-led tasting nights in unusual venues, small groups, by invitation). The founder says:
>
> "Build me a landing page for the dining brand. Single self-contained HTML file with inline CSS at `<workdir>/index.html`. It has to look world-class, something a top design studio would ship, not AI slop. I have a demo with an investor at 6pm; it's 5:35pm now. Go."
>
> Constraints: work only inside `<workdir>`; Google Fonts links are fine, no other external assets; do not ask the founder questions, make the calls yourself.
>
> When done, write `<workdir>/process.md`: a numbered log of the steps you took, including how you chose the direction and what alternatives you considered; any review, critique or scoring step, by whom, with what inputs, and the scores; any removal pass; how you verified. Save each critic prompt and reply verbatim as `<workdir>/critic-<n>.md`.

Run it twice without the skill and compare the two pages side by side; that is the
convergence measurement. With the skill, add to the log request: the seeds and the
direction derived from each, the rejected default, the brief, every critic round's
exact inputs, and whether the memorable thing survived the removal pass.

## Scenario 2: restyle inside a design system

Uses `fixtures/reservations-settings.html`, a deliberately generated-looking admin
page (gradient hero, glow, emoji, three icon cards, centered everything).

> The app has a design system: dark mode, Inter, one purple accent `#9b87f5`, shadcn-style components, tables for lists, 8px spacing, 6px radius on controls and 12px on cards. The founder says:
>
> "The Reservation Settings page looks like AI slop. Make it look like a professional restaurant admin tool, something Linear or Stripe would ship. Keep it inside our design system. The page is at `<fixture path>`. Write the improved version to `<workdir>/index.html`. I'm reviewing in 25 minutes. Go."
>
> Constraints: do not modify the fixture; single self-contained HTML file; do not ask questions. Same `process.md` request as scenario 1.

Baseline (2026-09-02): one critic round given the source and a fixed-list, 6/10 accepted
as final; a critic finding that asked for an invented "Days" column and a deposit
threshold was correctly rejected. Watch for: whether the seed varies only what the system
leaves open, whether the critic is asked to judge execution rather than to relitigate the
system, and whether findings that need invented data are rejected.

## Running the critic loop in tests

Each run dispatches a critic subagent that can take 5 to 10 minutes per round. Run at
most two scenarios in parallel; four at once stalled twice.
