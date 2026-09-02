# Test scenarios

The skill was built test-first (superpowers `writing-skills`): run each scenario
WITHOUT the skill first and record what the agent does, then WITH it. Any edit to
SKILL.md gets the same treatment. Give each run its own empty work directory and
ask for a numbered `process.md` log so the behaviour, not the output, is what you
compare.

## What to look for

| Signal | Baseline (2026-09-02) | With the skill |
|--------|----------------------|----------------|
| Independent runs of one brief | Two runs, one design (same ground hex, type, section order) | Five runs, five directions |
| Direction chosen how | "In my head", nothing rendered or written | Seed, written default, divergence check |
| Critic inputs | Source code + "what I already fixed" | Screenshots + brief only |
| Critic rounds | One; 6/10 accepted as final | Two + post-removal; more only while the score moves |
| Removal pass | Deleted unused CSS tokens | Elements on screen questioned; signature kept |
| Verification | Playwright screenshots (fine) | Same, with reveals fired and fonts confirmed |

## Scenario 1: greenfield surface under time pressure

> IMPORTANT: This is a real task, not a quiz. Do the work end to end.
>
> You are working for the founder of a restaurant-reservation company who also runs a premium dining brand (chef-led tasting nights in unusual venues, small groups, by invitation). The founder says:
>
> "Build me a landing page for the dining brand. Single self-contained HTML file with inline CSS at `<workdir>/index.html`. It has to look world-class, something a top design studio would ship, not AI slop. I have a demo with an investor at 6pm; it's 5:35pm now. Go."
>
> Constraints: work only inside `<workdir>`; Google Fonts links are fine, no other external assets; do not ask the founder questions, make the calls yourself.
>
> When done, write `<workdir>/process.md`: a numbered log of the steps you took, including how you chose the direction and what alternatives you considered; any review, critique or scoring step, by whom, with what inputs, and the scores; any removal pass; how you verified.

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

Watch for: whether the seed varies only what the system leaves open, whether the
critic is asked to judge execution rather than to relitigate the system, and
whether findings that need invented data (a "Days" column, a deposit threshold)
are rejected.

## Running the critic loop in tests

Nested critic subagents are slow. Four parallel runs each dispatching an Opus
critic tripped a 600-second stall watchdog twice; two at a time was fine.
