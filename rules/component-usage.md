# Component Usage

## Impact: CRITICAL

**MANDATORY**: Before writing ANY component import, follow this lookup order — no exceptions:

**`src/components/` (scaffold primitives) → HeroUI Native → Expo native → React Native**

Using a React Native primitive when a scaffold or HeroUI Native equivalent exists is a rule violation. The anti-slop lint enforces the scaffold primitives.

## Lookup order

1. **`src/components/`** — the scaffold primitives. They exist so recurring layout/interaction defects are structurally impossible:

   | Need | Use |
   |------|-----|
   | Labeled section of a screen | `<Section title="…">` directly inside the screen's `gap-6` container |
   | Card / grouped content / divided list | `<Card>` / `<Card list>` / `<Card media={…}>` |
   | Tappable row (settings, list item, "see details") | `<ListRow title onPress>` — chevron only when tappable |
   | Few-choice toggle (theme, units, filter) | `<Segmented values value onChange>` (native control) |
   | Any other tappable surface (card, chip, icon button) | `<Pressable>` from `@/components/pressable` (press animation + haptic) |
   | Like / favorite / heart toggle | `<LikeButton>` |
   | Hero image screen header | `<ParallaxHero>` |
   | Light/dark toggle button | `<ThemeToggleButton>` (circular reveal) |

2. **HeroUI Native** — accessible, themed components with `className` support. Get exact APIs from the `heroui:heroui-native` skill / MCP — never guess props.

3. **Expo native** — where HeroUI has no equivalent and the platform does: NativeTabs (Expo Router), `@expo/ui` (SwiftUI/Compose controls), `expo-symbols` (SF Symbols — never emoji as icons), `expo-glass-effect`, `expo-image`.

4. **React Native** — only when none of the above provides an equivalent.

### Component mapping

| Need | ❌ Don't use | ✅ Use instead |
|------|-------------|---------------|
| Button | `<Pressable>` / `<TouchableOpacity>` styled as a button | `<Button>` from `heroui-native` |
| Non-button tap target | bare RN `<Pressable>` | `<Pressable>` from `@/components/pressable` |
| Text input | `<TextInput>` | `<TextField>` / `<TextArea>` from `heroui-native` |
| Toggle | RN `<Switch>` | `<Switch>` from `heroui-native` |
| Checkbox / radio | custom `<Pressable>` | `<Checkbox>` / `<Radio>` / `<RadioGroup>` |
| Select / picker | `<Picker>` | `<Select>` (or `@expo/ui` native picker) |
| Card | `<View>` with `bg-surface rounded-2xl p-4` | `<Card>` from `@/components/card` |
| Avatar | `<Image>` with manual styling | `<Avatar>` |
| Tag / badge | `<View>` + `<Text>` | `<Chip>` |
| Loading content | `<ActivityIndicator>` | `<Skeleton>` / `<SkeletonGroup>` shaped like the content |
| Divider | `<View>` with a border | `<Separator>` (or `<Card list>` dividers) |
| Modal / dialog | RN `<Modal>` | `<Dialog>` / `<BottomSheet>` from `heroui-native` |
| Dropdown / menu | custom menu | `<Menu>` / `<Popover>` |
| Collapsible | hand-rolled + custom animation | `<Accordion>` (animates itself) |
| Toast / snackbar | custom component | HeroUI toast |
| Segmented pills | hand-rolled `Pressable` pills | `<Segmented>` from `@/components/segmented` |

### When React Native primitives ARE correct

- **`<View>`** — layout container. Spacing via `gap-*` on the parent, `p-*` for inner padding.
- **`<Text>`** — text display, styled with token utilities.
- **`<ScrollView>`** — the standard screen root, with the safe-area padded content classes; see `rules/list-rendering.md` for the screen-container shapes (ScrollView / FlatList / KeyboardAwareScrollView / fixed View).
- **`<Image>`** — use `expo-image` with `transition={imageFade}` (from `@/lib/motion`) so remote images fade in.

## Loading states — Skeleton, never a spinner

While content is loading and there is nothing to render yet, render a **`Skeleton`** (from `heroui-native`) shaped like the content that will appear — same row heights, counts, corner radii. A spinner as a content placeholder reads as "something is stuck" and causes a layout jump. Spinners are only for in-place actions: a submit button awaiting completion, pull-to-refresh, a "load more" footer.

## Haptics on every tap

- `<ListRow>` and `@/components/pressable`'s `<Pressable>` fire the selection haptic for you.
- For a HeroUI `<Button>`, call `pressHaptic()` (from `@/components/pressable`) at the start of `onPress`.
- For a different feel: `import { Presets } from 'react-native-pulsar'` → `Presets.System.selection()` / `impactMedium()` / `notificationWarning()`.

## Destructive actions always confirm

Every delete / remove / clear / reset goes through `confirmDelete({ onConfirm })` from `@/lib/confirm` — a native confirm dialog (red destructive button + Cancel) + warning haptic. **Never delete on tap.** The lint fails a screen that deletes without a confirm.

## Multi-button rows are horizontal

Two or more peer actions (Cancel + Confirm, Delete + Save) sit in a single row with equal width (`flex-row gap-3`, each button `flex-1`). Stacked vertical buttons are for a single primary CTA with, at most, a low-emphasis text link under it.

## Sheets and dialogs

- Prefer HeroUI `<Dialog>` (center, focused decision) and `<BottomSheet>` (options, pickers, short forms). Never build a custom modal from `<Modal>` + views.
- Sheets already inset the home indicator — use plain `pb-4` inside a sheet, never `pb-safe*` (it double-counts and leaves an oversized gap). See `rules/styling.md`.
- A sheet/modal close button sits on its **own line above** the title — never crammed beside content on the same row.
