---
name: ui-refactor-verification
description: How to safely extract or unify near-duplicate Svelte/Tailwind UI in OpenLove (theme components, settings/onboarding selectors) and how to actually verify "zero visual impact" claims with Playwright in this app, including its specific gotchas (page.clock breaking Modal's entrance transition, canvas-confetti not being CSS-animation-driven, reactive-effect re-entrancy). Use before touching src/lib/components/themes/*, src/lib/components/shared/*, src/lib/components/settings/*, src/lib/components/onboarding/*, or any time you're about to claim a Svelte component refactor doesn't change what's on screen. Triggers on "extract component", "unify duplicate", "shared component", "pixel diff", "visual regression", "screenshot test", "zero UI impact".
---

# Verifying Svelte/Tailwind UI Refactors

OpenLove has several places where near-identical UI is hand-duplicated across two contexts
(the Modern/Cover theme cards; the Settings/Onboarding bond-type, theme, and color-mode
pickers). Unifying these into shared components is good — but "near-identical" is doing a
lot of work in that sentence, and claiming a refactor has "zero UI impact" is a claim that
needs verifying, not asserting.

## Before extracting: diff the markup line-by-line first

Every one of this codebase's "same-looking" duplicated UI blocks turned out to differ in at
least one Tailwind token when actually compared side-by-side — padding, icon size,
`backdrop-blur-md`, `shrink-0`, `min-w-0`, text size, even which icon shows at all. Examples
already found:

- `ModernTheme`'s stat cards use `p-4`/`text-xl`/`h-5 w-5` icons; `CoverTheme`'s use
  `p-3.5`/`text-lg`/`h-4 w-4` icons plus `backdrop-blur-md` and `min-w-0` Cover's don't have.
- `SettingsSheet`'s theme picker shows no icon and an inline checkmark; `OnboardingFlow`'s
  shows a per-theme icon and a circular checkmark badge — genuinely different layouts, not
  just sizing.
- Even a first draft of a new shared `ThemeSelector` component hardcoded a label
  ("UI Style Theme") that Settings shows but Onboarding's original markup never did at all.

**Before writing a shared component**, read both original call sites in full and note every
difference, however small. Build the shared component with an explicit `variant`/`layout`
prop (and a `showLabel` prop where one caller shows a label the other doesn't) that
reproduces *both* originals exactly — never collapse a difference you haven't explicitly
decided is safe to drop. If in doubt whether two blocks are really identical, they aren't;
diff them again.

## After extracting: verify with an actual pixel diff, not an eyeball check

A visual "looks the same to me" review is not suf­ficient evidence for a "zero UI impact"
claim on this codebase. Use Playwright + `pixelmatch`:

1. Reach the state you want to screenshot deterministically (via the onboarding flow or
   Settings, with fixed input values — names, dates, toggles).
2. Freeze time with **`page.clock.setFixedTime(ms)`** — not `page.clock.install()` followed
   by `pauseAt()`. The full `install()` API also virtualizes `requestAnimationFrame`, which
   silently breaks anything that depends on real rAF ticking — concretely,
   `Modal.svelte`'s entrance transition uses a double-nested `requestAnimationFrame` to
   flip `isVisible = true`, and under a fully-paused clock that never fires, leaving the
   modal permanently transformed off-screen. This surfaces as a confusing Playwright error
   ("element is outside of the viewport") that looks like a selector problem but isn't.
   `setFixedTime` only stubs `Date.now()`/`new Date()` and leaves real timers (including
   rAF) running, which is all a stable screenshot actually needs.
3. Inject a stylesheet to kill CSS animations/transitions before each screenshot:
   `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s
   !important; }`. This stops things like the spinning Clock icon from landing at a
   wall-clock-dependent rotation angle.
4. **`canvas-confetti` is immune to step 3** — it's a canvas/JS particle simulation, not a
   CSS animation, and its particle positions are randomized per burst. No stylesheet trick
   stops it, and it will never diff-match between two separate runs. If your flow triggers
   it (finishing onboarding, a successful bond import), wait several real seconds
   (`page.waitForTimeout(5000)` was sufficient in practice) for it to fully decay before
   any screenshot meant for comparison.
5. Capture the same set of states before and after your change, then diff each pair with
   `pixelmatch`/`pngjs` and require 0 differing pixels (at a small threshold, e.g. `0.1`)
   before calling a refactor visually clean. A quantitative 0 is a real result; "looks
   right" in a screenshot you skimmed is not.

## While decomposing a large component: trace state ownership before moving it

When splitting a big `.svelte` file into smaller pieces (as done for `SettingsSheet.svelte`
and `OnboardingFlow.svelte`), don't assume a piece of `$state` belongs with the markup that
happens to render it. Before moving it into a new child component, check whether anything
*outside* that markup also reads or reacts to it:

- `OnboardingFlow`'s footer button label reads `installSuccess`, even though the markup
  that *sets* `installSuccess` lives in the PWA-install step — that state had to stay in
  the parent and be passed down as a prop, not move into the step component.
- A component that will only ever be mounted under a specific condition (e.g. a
  `MilestonesList` only ever rendered inside `{#if !isNewBond}`) can safely drop the
  `isNewBond` branches/guards it inherited from the original inline markup — they're dead
  code at its only real call site once the parent's conditional does the gating instead.

Get this wrong and either the refactor silently breaks a value another part of the UI
depends on, or you carry forward defensive guards that no longer do anything, obscuring
what the code actually needs.
