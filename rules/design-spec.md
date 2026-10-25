# Design Spec Rules

## Impact: HIGH

This app's visual identity and screens were designed on the canvas and approved by the
user before you ever touched code. `design/spec.json` and `design/DESIGN.md` are the
locked, authoritative record of that approval. Building a screen means transcribing it,
not reinterpreting it.

## `design/DESIGN.md` is the source you read

`DESIGN.md` renders `spec.json` into a per-screen breakdown. Each screen gets its own
section:

```
## Today

- **Route:** /
- **Purpose:** the daily loop
- **Scroll:** yes
- **Safe area:** yes

- home.title: Text(value="Today", role="title")
- home.stack: Stack(direction="vertical")
  - home.stack.row: Stack(direction="horizontal")
    - home.stack.row.icon: Icon(name="check")
```

Each node line is `id: Component(prop="value", count=3)`: the component name is one of
the design vocabulary primitives (Screen, Stack, Text, Button, Card, ListItem, and so
on), string prop values are quoted, numbers and booleans are bare, and children are
indented two spaces deeper than their parent, one level per nesting depth. The tree
order in the file is the tree order to build. A node line can end with a `(note:
...)` suffix: one line of build intent for a case the tree alone leaves ambiguous
(read it and follow it), never extra copy to render or a prop you invent for the node.

## Build node for node

- Walk the tree top to bottom, left to right, and build exactly the nodes listed, in
  that structure. A node's `id` is there so you and the design doc can both refer to
  the same element. Do not add, drop, merge, or reorder nodes, and do not invent a
  screen, section, or control that is not in the tree.
- Map each vocabulary component to its HeroUI Native (or scaffold primitive)
  equivalent per the usual component ladder in `AGENTS.md`. `Stack` becomes a `View`
  with the given `direction`/`gap`/`align`/`justify`, `Text` becomes a `<Text>` with
  the given `value` and `role`, and so on. The prop values on the node ARE the content
  and configuration to use: a `value="Today"` prop is the copy to render, not a
  placeholder to rewrite.
- `scroll` and `safeArea` on the screen section set how the screen root is built: a
  scrolling screen still uses the safe-area padded `ScrollView` pattern in `AGENTS.md`,
  a non-scrolling one uses the same classes on a fixed `View`.

## The screen's on-screen title is NavBar.title, never the screen's name

A screen carries BOTH a `name` (plus `feature` and `state`) and, usually, a `NavBar`
node with a `title`. They are not the same thing and they are frequently different:

- `name`, `feature`, `state` are CANVAS labels. They title the artboard in the design
  review so a human can find "Today / Overview" among a dozen frames. They are never
  app copy, and none of them may appear anywhere in the built UI.
- `NavBar.title` is the words the user reads at the top of the running screen.

A screen named "Today" whose `NavBar` says `title="Matcha"` renders **Matcha**. Using
the screen name instead ships a header the user never approved, and it is silent: the
build looks plausible and only the person who wrote the design notices the app is
labelled with the designer's filing system.

## A large title sits under the status bar, not under a second inset

The most common visual miss is a screen opening with a tall empty band above its large
title, so the built screen does not match the design frame, where the title sits just
below the status bar. The cause is always the same: the top inset applied twice.

The screen root's safe-area utility classes (`pt-safe-offset-2`) are the ONE inset
mechanism, on both platforms. Do not add a second one, and do not remove the first:

- Never `SafeAreaView`, `useSafeAreaInsets` arithmetic, or `contentInsetAdjustmentBehavior`
  in a screen. `rules/styling.md` covers this and the lint fails it.
- Never drop `pt-safe-offset-2` to "fix" a gap you see on iOS. That gap comes from the
  native inset expo-router applies by default, which `src/components/app-tabs.tsx` already
  switches off with `disableAutomaticContentInsets` on every `NativeTabs.Trigger`. Android
  has no equivalent native top inset, so a screen missing the class ships its title jammed
  under the status bar there, which is the same bug pointing the other way.
- If a real header shows the title (`NavBar.title` as a `Stack.Screen` option), the header
  owns that space and the scroll content adds no top inset of its own.

Compare the built screen against the design frame before calling it done: the gap above
the title is the first thing a reviewer sees and the most common miss.

## Spacing, radius and gap are STEPS, not pixels

A `padding="4"` or `gap="5"` on a node is four or five steps on the design's density
scale, not four or five pixels. Build them with the scale utilities (`p-4`, `gap-5`),
never as raw pixel values: read as pixels a whole screen collapses, and read as steps
when the design meant pixels it explodes. A value written with a unit (`"24px"`) is the
exception and means exactly that. `radius` also takes the named corner steps (`sm`,
`md`, `lg`, `xl`, `2xl`, and `full` for a capsule).

## Variants are HeroUI's own names

A `variant` prop carries HeroUI's vocabulary (`solid`, `bordered`, `flat`, `faded`,
`light`, `shadow`), so pass it straight through to the HeroUI component rather than
translating it. `variant="bordered"` is an outlined control, not a filled one.

## Four components HeroUI Native does not ship

The design vocabulary is deliberately cross-platform, but three of its components have
no HeroUI Native equivalent and one is easy to confuse with its sibling. Build them
this way rather than improvising:

- **Progress** — HeroUI Native has no progress indicator. Draw it with
  `@shopify/react-native-skia` and animate the value with Reanimated on the UI thread,
  adding Gesture Handler only if the control is draggable. It is DETERMINATE and always
  carries a `value`.
- **Spinner** — the indeterminate sibling, and this one IS a HeroUI Native component
  (`spinner`). It means "working" and takes no value. Never build a Progress where the
  design asked for a Spinner, or vice versa.
- **Chart** — no cross-platform chart exists (HeroUI Native has none, and `@expo/ui`
  ships `Chart` under `swift-ui` only, so iOS-only). Draw it with Skia, like Progress.
  Its `values` are a comma-separated string and an EMPTY slot is a real gap in the data,
  not a zero: draw it as a muted stub, because a day with no reading and a day with a
  reading of zero are different facts.
- **SegmentedControl** — no HeroUI Native equivalent. Use `SegmentedControl` from
  `@expo/ui/community/segmented-control`, a real native control on both platforms.
- **Badge** — no HeroUI Native equivalent either. Build it as a small `Chip`.

Everything else in the vocabulary maps to a HeroUI Native component of the same or an
obvious name (`Text` → `text`, `ListItem` → `list-group`, `TextField` → `text-field`,
`Sheet` → `bottom-sheet`, `Divider` → `separator`), or is a plain `View` when it is
layout rather than a component (`Screen`, `Stack`, `Grid`, `Spacer`, `Overlay`).
`NavBar` and `TabBar` are Expo Router's header and NativeTabs, not HeroUI at all.

## Colors come from tokens, never literals

Every color referenced in the design (accents, backgrounds, status colors) was written
into `src/global.css` between the `@newly:tokens` markers when the design was locked.
Read colors from those token utilities (`bg-accent`, `text-foreground`, …), exactly as
`rules/styling.md` requires. Never paste a hex or oklch literal into a component, even
if you can see the literal value in `spec.json` or `DESIGN.md`. If a node's color prop
names a token, use that token; if it is missing from `global.css`, that is a spec
defect to report (see below), not a reason to hardcode the literal instead.

## When something genuinely cannot be built as specified

Sometimes a listed component, prop, or nesting cannot be built exactly as written (an
unsupported native combination, a missing token, a platform constraint). When that
happens, report it plainly (what the spec asked for, what got in the way) rather than
silently substituting your own layout, copy, or component choice. A close-enough
improvisation defeats the point of a locked, approved design: the user approved what
is in `DESIGN.md`, not a build agent's best guess at it.
