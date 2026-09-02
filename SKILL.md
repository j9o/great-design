---
name: great-design
description: Use when building or restyling any UI that has to look designed rather than generated — a landing page, a marketing or demo surface, a new admin page, "make it world-class", "this looks like AI slop", "explore some directions" — and whenever a design was produced in one pass and never scored by an independent critic. Web UI built by a coding agent; not for a single-token tweak or motion-only work.
---

# Great Design

## Overview

At every step a model picks the consensus answer, so two independent runs of one brief produce the same page (measured: same ground hex, palette, type pairing, section order). Great design is a non-consensus answer, executed with restraint, judged by someone who did not build it.

Three stages: **Discover** (variety in, before code), **Define** (an ambitious brief, then frozen), **Deliver** (critic loop, removal pass, AI-tell sweep). After Anshu Chimala, "How to turn your AI into a world-class designer", Lenny's Newsletter, 2026-09-01 (its technique 7, "Remove AI tells", is paywalled; the tells list here is ours).

## How to use

Invoke `/great-design` with a one-line brief, or describe the surface; the description also self-triggers. Give it the surface and audience, the constraints that matter (assets, fonts, design system, which data may appear on the page), and whether you will be around to pick between rendered directions. With you: three rendered options, then a refine pass. Without you: three written directions, the furthest from the default gets built. You get back the rejected default, the brief, the last critic score with its open findings, and desktop plus phone screenshots. Scores of 6 to 7 are normal for constrained work; the loop stops by budget, not by chasing 9. Expect 20 to 85 minutes and most of the tokens in critic rounds, so use it for pages people judge by eye, not for a token tweak. It will not invent data or names the source lacks, and internal metrics reach the page only when the brief says so.

## When to use

A new page, surface or demo people will judge by eye; any restyle; "looks generic", "AI slop", "world-class", "options"; any surface that has not been through the critic loop, however good it looks to you.

Neighbours: `frontend-design` gives aesthetic vocabulary, load it only when no design system governs the surface (it contradicts a system on every axis). `/design-shotgun` renders options for a user to choose. `make-interfaces-feel-better` once before the first critic round; `emil-design-eng` for motion. `/design-review` and `/web-design-guidelines` stay the pre-push gates and still run after the loop.

## Stage 1: Discover

1. **Ground.** Find the design system that governs *this surface* (`DESIGN.md`, `docs/DESIGN_SYSTEM.md`, the closest shipped component). An admin app's system does not govern a consumer brand page. Ground copy in real facts (product docs, vault, existing site); never invent data, names or numbers the source lacks, and treat internal metrics and prices as page copy only when the brief says so.
2. **Seed.** `openssl rand -hex 32`. Fix the reading before looking at the string (hex "words": `1eaf` → leaf; or byte-to-option: `byte 0 mod 8` → palette family), then derive the direction in writing, before code.
   - No governing system: palette family, type pairing, composition, texture, motion posture, the one thing a viewer will remember.
   - Inside a system: composition, density, what leads the hierarchy, copy posture, cards vs hairlines, what to leave out, where the memorable thing lives.
   - The seed is inspiration only; it appears in neither the design nor the summary.
3. **Divergence check.** Write the default answer for this brief in one line, what an unprompted run makes (inside a system: the closest shipped page, line for line). If the seed's direction is the default, reseed. One "premium dining invitation" brief defaulted to warm near-black, bone serif, mono labels, one ember accent, a ledger, roman numerals, a pull quote; two unprompted runs produced exactly that.
4. **Options.** User can choose: three seeds, three directions rendered (`/design-shotgun` or three screenshotted HTML variants), reactions, refine. User cannot choose: three seeds, one paragraph each, build the one furthest from the default, name the rejected default in the report. Never render a direction you rejected in writing.

## Stage 2: Define

The build brief, for you or an implementer subagent, in this order:

1. **World**: a concrete reference, never adjectives ("a printed invitation found in a dark room", "a 1928 asymmetric poster split down the middle"). "Modern, clean, premium" is not a direction.
2. **The one thing to remember.**
3. **The rule you break, and the rule you keep so it still looks good.**
4. **Constraints**: assets, fonts, design system, the data that exists.
5. **The rejected default**, written down so nobody drifts back to it.

With a user in the loop: list directions wide not deep, visualize favorites, record reactions ("more of X, not Y"), write the final prompt from those.

**Once written, the world and the memorable thing are frozen.** Critics judge execution of the concept, not the concept; a finding that needs a different concept goes into the report, not the page.

## Stage 3: Deliver

### The critic loop

Each round, in this order:

1. **Stop editing, then screenshot.** `node ~/.claude/skills/great-design/shoot.cjs <url|file> <out-prefix>`: desktop and phone PNGs, fonts confirmed (it prints them), reveals fired, motion off. gstack `$B screenshot` works too. Screenshot any state that matters (hover, dirty, empty, error). Look at the PNGs yourself first: fix what you can see, re-shoot, then dispatch. The critic is for what you cannot see. A critic run while edits continue reviews a page that no longer exists.
2. **Dispatch the critic**: a fresh subagent on the most capable model available (`model: "opus"`), given the PNGs and the brief (surface, audience, purpose, constraints, design system, the world). Behaviour a screenshot hides ("Save fills only when a value changes") may be stated as a fact. Not the source, not the previous round's findings or score, not what you fixed, not the target score.
3. **Critic returns**, in order: first impression in three lines; five gaps ranked by impact, each with the exact fix; overdone patterns and anything that reads generated; a score out of 10 with one sentence.
4. **Adjudicate against the brief, never against the previous critic.** A fresh critic contradicts the last one (cards vs no cards, add a rule vs delete it); the brief breaks the tie, and where the brief is silent your own eye decides and the decision is added to the brief as a fact, so the next critic inherits it. Reject what violates a constraint, fabricates content, or changes the concept. Apply the rest.
5. **Back to 1, within budget.** Done when a critic who was never told the threshold scores 9 or higher. Budget: two rounds, plus one verification round after the removal pass; a further round only while the last one moved the score; four in all. Stop early when the top finding in two consecutive rounds needs something a constraint forbids (photography you cannot have, data that does not exist). Any stop below 9 reports the last score and the open findings. One round is a review, not the loop.

Critic prompt:

```
You are a design critic at a studio whose work you would sign. These are screenshots of <surface> for <audience and purpose>. The concept is fixed: <world, one line>. Judge how well it is executed, not whether it should be a different concept. The designer's constraints: <assets, fonts, design system, data>. <Behaviour facts a screenshot hides, if any.>
Judge the composition (hierarchy, rhythm, density, where the eye goes first) and the details (type, spacing, alignment, color discipline). Call out overdone patterns, decoration doing the job of content, and anything that reads generated rather than designed.
Return, in order: (1) first impression, three lines; (2) the five biggest gaps ranked by impact, each with the exact fix; (3) a score out of 10 with one sentence, where 10 is work you would sign, 7 is competent and forgettable, 5 reads generated. Be opinionated and specific.
```

### Removal pass

After the loop, list every element on screen and ask of each: what does it communicate that nothing else here does? Remove glows, decorative gradients, colored highlights on text, labels restating the visible, badges that never change, sections kept for rhythm, custom controls where native ones exist, any second accent. The memorable thing and the texture that defines the world are not decoration; they stay. Re-screenshot; if the page changed materially, one more critic round, inside the four-round cap. Less on the screen communicates more.

### AI tells

`/design-review` carries the ten-item blacklist (purple gradients, three-column icon grid, centered everything, uniform radius, blobs, emoji, colored left borders, generic hero copy, cookie-cutter rhythm, system-ui). Seen in unprompted runs, add: the same roman-plus-italic headline formula on every heading; fragment triples ("One chef. One seating. One night."); a drifting radial glow standing in for imagery; pill buttons on a hairline system; a decorative seal or badge that reads as a notification; a "01 / 02 / 03" rail; warm near-black plus bone serif as the reflexive "luxury" answer.

### Imagery and motion

A flat page whose brief allows imagery gets generated or real images, not gradients and shapes standing in for them. Keys live in a gitignored `.env.agents` or run through `op run`, never in a prompt or code. Video (fal.ai): looping clips rendered over the page background then matted out; keyframe interpolation between product states for scroll-scrubbed transitions. Article techniques, not yet exercised here.

## Quick reference

| Step | Do | Never |
|------|----|-------|
| Ground | The system governing this surface; real facts | The repo's system by reflex; invented data |
| Direction | Seed, fixed reading, derive in writing, divergence check | Pick "in your head" from two mental options |
| Options | Three seeds; render only when the user will choose | Show one and call it the answer |
| Brief | World, memorable thing, rule broken, constraints, rejected default; then frozen | "Modern, clean, premium"; relitigating the concept each round |
| Screenshot | After edits stop; desktop and phone; states that matter; your own look first | While still editing; dispatching with a bug you already saw |
| Critic | Fresh context, PNGs and brief, strongest model, facts not fixes | Source, prior findings, fixed-list, target score |
| Adjudicate | Against the brief; your eye where it is silent, then written into the brief | Against the previous critic |
| Stop | 9+; else two rounds plus post-removal, more only while the score moves, four max; report the score | A 6/10 accepted after one round; five rounds of one finding |
| Removal | Every element justified or gone; the signature stays | Deleting the memorable thing; CSS-only "simplification" |

## Red flags

- "I considered alternatives" with nothing written down or rendered.
- "The critic said 6/10, I applied its fixes" and no re-score.
- A critic prompt containing `<script>`, a fix list, last round's findings, or "aim for 9/10".
- A third round because the critic changed, not because the score moved.
- The removal pass deleted the thing the brief said to remember.
- Any of the tells above in your own output.
