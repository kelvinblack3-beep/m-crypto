# Design spec (locked)

> This file is the app's locked visual identity. The infer/plan step writes it
> before the build; the build reads it and may not contradict it; the refine path
> updates it. Screens are built from the **tokens** (`src/global.css`) and the
> **HeroUI Native** component library — never improvised per screen.

## Identity

- **Vibe:** _(e.g. calm, premium, playful, editorial)_ — clean & modern (default)
- **Mode:** light + dark (system)
- **Accent:** Newly pink (the scaffold default) — `--accent` in `src/global.css`
- **Shape:** soft, `--radius: 0.75rem` (cozy)
- **Type:** system font (SF Pro on iOS, Roboto on Android); no custom display font

## Dials

See `design/dials.json`. These three dials set the overall feel:

- **variance** — `low | medium | high`: how much screens may differ from one
  another. `low` = strong consistency (every screen shares the same rhythm and
  components); `high` = each screen can have a distinct hero treatment.
- **motion** — `calm | standard | lively`: animation intensity. `calm` =
  minimal, quick fades; `lively` = springy transitions, playful micro-interactions.
- **density** — `compact | cozy | spacious`: spacing + radius rhythm. Drives the
  base `--radius` and the default padding/gap scale used across screens.

Defaults: variance `low`, motion `standard`, density `cozy`.

## Screens

> The infer/plan step lists the screens to build here (one bullet each, with the
> key sections per screen). The build implements exactly these.
>
> The scaffold boots into `src/app/index.tsx`, the Newly welcome screen (tap the
> icon, it rains icons). It is the brand placeholder the build REPLACES, never a
> pattern to extend. The welcome screen's modules are the vendored npm package
> `@newly/welcome` (`node_modules/@newly/welcome`); the build must NOT edit or
> delete that package — it replaces the screen by rewriting `src/app/index.tsx`
> and dropping the `@newly/welcome` import. `explore.tsx` stays as the reference
> screen for Section / Card / ListRow / Segmented / confirmDelete. Replace this
> list with the app's real screens.

- Welcome (placeholder — replaced by the build)
- Explore (reference screen; not in the tab bar until the app has tabs)

## Anti-slop reminders

- Tokens only — no raw hex, no magic spacing numbers in components.
- HeroUI Native components + Uniwind `className`; StyleSheet only for native-only
  surfaces (NativeTabs, `@expo/ui`, glass).
- Native feel: system font, 44pt touch targets, SF Symbols (not emoji) for icons,
  haptics on key actions, respect safe areas.
