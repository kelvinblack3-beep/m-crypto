# How this app is built

This is a **newly** app: a native-feeling Expo (React Native) app built from a fixed
design system, not improvised per screen. It is pre-wired with **HeroUI Native**
(components) + **Uniwind** (Tailwind v4 styling) + a locked **design token** set +
**Zustand + MMKV** for state. Do not re-scaffold it and do not add a second UI kit.

## Working-prototype fast path (the default for straightforward requests)

Ship the smallest complete, usable version first and let the user iterate. For a simple
new app, screen, or focused change, this `AGENTS.md` contains enough context for the first
coherent edit. The write-time hook and anti-slop lint enforce the hard structural rules.

- Do **not** inventory `rules/`, read the whole scaffold, or preload every UI skill.
- After scaffolding, start with the target route. Read that route only when its contents are
  not already available, then begin `Write` or `Edit` immediately.
- For a simple first draft, do not open `rules/`, query component docs, or load UI skills
  before the first edit. The scaffold primitives and examples are enough. Defer the full
  design-system pass to a later polish iteration.
- Implement the core interaction, run typecheck and anti-slop lint once, build the native
  preview, verify the core flow, and return the working prototype.
- Do not add secondary screens, speculative architecture, animation, or decorative polish
  unless the user explicitly requested it.

## Rule files for targeted follow-up work

For complex work, explicit polish, or a later iteration, read only the matching rule in
`rules/` before the relevant `.ts`/`.tsx` edit. Never pre-read the whole directory.

| When you are…                                                  | Read this rule first             |
| -------------------------------------------------------------- | -------------------------------- |
| Deciding where a file goes, splitting components, placing hooks/types | `rules/file-organization.md` |
| Creating/editing a component, hook, or utility                 | `rules/component-declaration.md` |
| Using any UI component (button, input, row, sheet, …)          | `rules/component-usage.md`       |
| Styling anything (className, spacing, colors, safe areas)      | `rules/styling.md`               |
| Writing conditional rendering in JSX                           | `rules/rendering.md`             |
| Writing branching logic in any function body                   | `rules/control-flow.md`          |
| Rendering a list, collection, or scrollable content            | `rules/list-rendering.md`        |
| App state, persistence, seeding data, stores                   | `rules/state-management.md`      |
| Remote data / calling an API (only when the user asks)         | `rules/data-fetching.md`         |
| Adding ANY animation                                           | `rules/animations.md`            |
| Writing or editing user-facing copy                            | `rules/copywriting.md`           |

## Folder structure

```
src/
├── app/              ← Expo Router routes — every .tsx here IS a screen (UI, default export)
├── components/       ← scaffold primitives (Section, Card, ListRow, Segmented, …)
├── features/<f>/     ← domain modules: components/ hooks/ store/ utils/ types/
├── hooks/            ← cross-feature hooks
├── lib/              ← motion.ts (animation tokens) confirm.ts storage.ts (MMKV) cn.ts
└── constants/        ← theme.ts — the ONE file allowed to carry raw color values
```

- Screen files in `src/app/` hold the screen's JSX; screen LOGIC goes in a feature hook
  (`src/features/<f>/hooks/use-<screen>-screen.ts`). Never put non-route files in `src/app/`.
- App data lives in ONE Zustand store per domain (`features/<f>/store/<f>-store.ts`,
  types in `features/<f>/types/`) persisted with MMKV via `@/lib/storage`. Screens RENDER
  from the store, controls MUTATE it, data SURVIVES reload — never `useState` copies,
  never data hardcoded in JSX. Seed realistic data on first launch.
- **Local-first**: no backend, accounts, or auth unless the user explicitly asks.

## Skill loading after the working prototype

The fast path above does not preload all three skills. For an explicit polish pass, a complex
multi-screen UI, or when the user asks for design-system fidelity, load and follow all three:

1. `heroui:heroui-native` — the component library: which component to use, its
   props, and how to theme it. Query its MCP/docs for exact component APIs.
2. `uniwind:uniwind` — the styling engine: `className`, the token utilities, the
   `accent-*` rule for native color props, theming via CSS variables.
3. `newly:native-design` — the taste layer: anti-slop rules, the token mandate,
   and the self-audit checklist you must pass before declaring a screen done.

## The styling rule (non-negotiable)

- **Default — HeroUI Native components, styled with Uniwind `className` + design
  tokens.** This is how every normal component/screen is built, for consistency.
- **StyleSheet is a fallback, only** for Expo/native components that Uniwind cannot
  style (NativeTabs, `@expo/ui` SwiftUI/Compose, glass/blur, other native-prop
  surfaces). Style those with their native props or `StyleSheet`.
- Never reach for raw `StyleSheet` on a HeroUI or plain RN view as a shortcut.
- **Single-line inputs carry a fixed leading.** Tailwind `text-*` classes set a
  line-height that pushes single-line `TextInput` text off vertical center (the
  classic iOS misalignment). Give every input part `leading-none`; normal leading
  only on multiline `TextArea`s.

## Layout & interaction primitives (use them — the lint enforces it)

These exist so the recurring layout/interaction defects are **structurally impossible**.
Hand-rolling them instead is the #1 source of the big-top-gap / cut-off-header / dead-chevron
bugs, so `scripts/anti-slop-lint.mjs` **fails the build** when you do.

- **The screen root** — every route is ONE safe-area padded container that fits the content:
  scrolling content → `<ScrollView className="flex-1 bg-background"
  contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6">`; a long list →
  the same classes on a `FlatList` (title via `ListHeaderComponent`); a form →
  `KeyboardAwareScrollView`; a fixed layout → the same classes on a `<View>`. The large
  title is the first child (`text-3xl font-bold text-foreground`). The safe-area utility
  classes are the ONE inset mechanism — **never** `SafeAreaView`, `useSafeAreaInsets`, or
  `contentInsetAdjustmentBehavior` in a screen (that double-counts: the giant-top-gap /
  cut-off-header bug; the lint fails it). Every `NativeTabs.Trigger` carries
  `disableAutomaticContentInsets` for the same reason: expo-router otherwise adds its own
  native inset on top of these classes (lint-enforced). Outside the tab bar (pushed/modal screens), end
  with `pb-safe-offset-4` instead of `-22`. See `rules/list-rendering.md`.
- **`<Section title="…">`** (`src/components/section.tsx`) — each labeled section (uppercase label +
  content). Put `<Section>`s **directly inside the screen root's `gap-6` container**; the gap between
  them comes from that container, so the vertical rhythm is identical everywhere.
- **`<Card>`** (`src/components/card.tsx`) — **every** card. Content → `<Card>…</Card>`; a list of rows
  → `<Card list><ListRow/>…</Card>` (the card supplies the padding + hairline dividers, each row its own
  vertical padding). **Never** hand-roll a card (a `bg-surface` + `rounded-2xl` + padding View) — that's
  how padding drifts screen to screen; the lint fails it.
- **`<ListRow onPress={…}>`** (`src/components/list-row.tsx`) — build **every** tappable row with it
  (settings rows, list items, history items, "see details"). It shows a chevron **only** when
  there's an `onPress`, so a chevron is never a dead "fake button". A bare chevron icon fails the lint.
- For any **other** pressable surface, use **`<Pressable>`** (`src/components/pressable.tsx`,
  HeroUI press animation + selection haptic), not a bare React Native `Pressable`.
- **Spacing for every container**: a raw `<View>` is for grouping — put the space **between**
  its children with `gap-…` on the View, inner padding with `p-…`, always from the scale
  (`gap-2/3/4/6`, `p-4`, `px-5`). **Never margins** for spacing (use `gap` on the parent),
  **never** arbitrary values (`p-[17px]`). The write-time hook and the lint reject both.
  (Negative margins for a full-bleed element and `mx-auto` are the only allowed margins.)
- **`<Segmented>`** (`src/components/segmented.tsx`) — every small either/or-of-a-few choice
  (theme, units, a filter). It's the **native** platform segmented control, accent-tinted.
  Never hand-roll segmented pills.
- **Haptics on every tap** — `<ListRow>` and `<Pressable>` fire it for you. For a HeroUI
  `<Button>`, call `pressHaptic()` (from `@/components/pressable`) at the start of `onPress`.
  For a different haptic: `import { Presets } from 'react-native-pulsar'`.
- **Animate with restraint** — read `rules/animations.md` before ANY animation. Use built-in
  motion (Accordion, Switch, Dialog animate themselves); every animation uses the motion
  tokens (`src/lib/motion.ts`) — never ad-hoc duration/easing numbers. **Springs are
  dial-gated** (calm/standard: timing-only; lively: critically damped `springs.*` tokens
  only) and `Bounce*` is banned on every dial — the lint + hook enforce per-dial. Designed
  moments follow the `newly:motion-design` skill. When in doubt, don't animate.
- **Confirm destructive actions** — every delete/remove/clear/reset goes through
  `confirmDelete({ onConfirm })` (`src/lib/confirm.ts`). **Never delete on tap** — the lint
  and the verify pass both catch a delete with no confirm.
- **Soft scroll edges** — when a scroll area cuts content off hard at an edge (an inner list,
  a horizontal chips row, a scrollable sheet), wrap it in HeroUI's `ScrollShadow`:
  `<ScrollShadow LinearGradientComponent={LinearGradient}>…</ScrollShadow>`
  (from `heroui-native` + `expo-linear-gradient`, both pre-installed).

## The token mandate

- Use design tokens, never hand-rolled values. Colors come from token utilities
  (`bg-background`, `text-foreground`, `bg-surface`, `border-border`, `bg-accent`,
  …) defined in `src/global.css` — **never raw hex** in components.
- Spacing/radii/type come from the Tailwind scale (`px-4`, `gap-3`, `rounded-2xl`,
  `text-lg`) — **never magic numbers** sprinkled per screen.
- The app's identity lives in `src/global.css` (tokens) and `design/` (DESIGN.md +
  dials). To change the look ("warmer", "more playful"), edit the **tokens**, not
  individual screens.

## Component source ladder

1. Scaffold primitive (`src/components/`) → use it (Section, Card, ListRow, Segmented, …).
2. HeroUI Native component → the default for general components.
3. HeroUI lacks it (navigation/tabs, pickers, native flourishes) → an Expo native
   component (Expo Router + NativeTabs, `@expo/ui`, `expo-symbols`, `expo-glass-effect`,
   haptics). Never a second general-purpose UI kit.

## Code style

- TypeScript strict; typed routes. Prefer `interface` for object types; avoid `any`
  (use `unknown`); `T[]` over `Array<T>`; acronyms keep casing (`userID`, `apiURL`).
- Guard clauses + early returns — never `if/else` chains (`rules/control-flow.md`);
  ternary `? : null`, never `&&`, in JSX (`rules/rendering.md`).
- One component per file; `interface`/`type` declarations live in `<feature>/types/`
  (component prop types stay inline); no barrel `index.ts` files.
- React Compiler is ON: no `useMemo`/`useCallback`/`memo`; Reanimated shared values
  use `.set()`/`.get()`, never `.value`.
- Comments only where logic is genuinely non-obvious — never narrate what code does.

## Verify before you call it done

Run `bun run typecheck` after every change set and fix every
finding — a screen with raw hex, magic spacing, or a hand-rolled primitive is NOT done.

## Expo specifics

Expo has changed — read the exact versioned docs at
https://docs.expo.dev/versions/v57.0.0/ before using an Expo API, and prefer the
Expo MCP when available.

## App identity in app.json (the display name only)

You may set **`expo.name`**, the display name. Change nothing else in `app.json`.

Never touch `expo.slug`, `expo.scheme`, `expo.ios.bundleIdentifier` or
`expo.android.package` — not even to match a new display name. Renaming the app
means editing `expo.name` and stopping there. The `name` in `package.json` is not
a native input and costs nothing, but it is not what anyone sees either, so leave
it alone as well.

The reason is not style. This app is running on a pre-built native binary shared
by every new Newly project, which is why a preview appears in a couple of minutes
instead of ten. The slug, the scheme and both package ids are compiled into that
binary: it registers `exp+expo-base` as its launch URL and `app.newly.preview` as
its package. Change any of them on disk and the project no longer matches the
shared binary, so the next preview is a full native build of around nine minutes,
and the running preview is torn down and replaced partway through. Changing the
display name alone costs nothing, because it is deliberately excluded from the
match.

The same applies to every other key in `app.json` — `version`, `orientation`,
`icon`, `userInterfaceStyle`, `plugins`, `ios.infoPlist`, `android.permissions`,
anything under `extra`. All of them trigger that rebuild. Only `expo.name` does
not. Adding a native dependency does too, and that one is often worth it; editing
identity to match a name is not.

If the user asks for a real bundle identifier, a custom URL scheme, or anything
else in this list, do it — they are asking for the app, not for a fast preview —
but tell them the next preview will take several minutes to rebuild, so the wait
is expected rather than a fault.

This one is checked, not just asked for. While the project is still on the shared
binary, a write that changes `expo.slug`, `expo.scheme`,
`expo.ios.bundleIdentifier` or `expo.android.package` is held the first time and
comes back naming the field and the cost. Nothing is reverted and nothing is
refused twice: make the identical edit again and it is applied. So if you were
only renaming the app, drop back to `expo.name`; if the user genuinely asked for
that identifier, repeat the edit and warn them about the rebuild.

## Analytics

This app is pre-wired with Newly first-party analytics (`@newly/sdk-react-native`).
The root layout initializes it from `src/lib/newly-analytics.json` when the project
has an ingest key. Newly writes that file; do not edit it, delete it, or move the
settings into `app.json` `expo.extra` — everything under `extra` is a native input,
so a value there costs this app the shared pre-built binary and a full rebuild.
For product analytics, funnels, or retention measurement, load
`measure:newly-analytics` and call `Newly.analytics.track/identify/screen/flush`.
Do not install PostHog just to track generated-app events unless the user
explicitly asks for PostHog or the app is already on that provider.
