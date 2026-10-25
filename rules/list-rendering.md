# List Rendering

## Impact: HIGH

Rules for screen containers, collections, and scrollable content.

## Every screen owns exactly ONE vertical container

The screen root is the container that fits the content, always `flex-1 bg-background` with the safe-area padded content classes (`px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6`). Never nest one vertical scroll container inside another.

```tsx
// Standard content screen — a ScrollView with the screen classes, title first
<ScrollView
  className="flex-1 bg-background"
  contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6"
  showsVerticalScrollIndicator={false}>
  <Text className="text-3xl font-bold text-foreground">Today</Text>
  <Section title="…">…</Section>
</ScrollView>
```

## Short / fixed collections — `.map()` inside the screen's ScrollView

For lists that render inside the screen's normal flow (a settings group, a day's log, a checklist — anything up to a few dozen simple rows), map over the data into `<Card list>` + `<ListRow>`:

```tsx
<Section title="History">
  <Card list>
    {workouts.map((workout) => (
      <ListRow
        key={workout.id}
        title={workout.name}
        subtitle={formatDate(workout.completedAt)}
        onPress={() => router.push(`/workout/${workout.id}`)}
      />
    ))}
  </Card>
</Section>
```

- Keys are stable unique ids — **never the array index**.
- List item components get their own file (see `rules/file-organization.md`) once they're more than a `<ListRow>`.

## Long / unbounded collections — `FlatList` as the screen root

When a list is the screen's main body and can grow large (hundreds of items, feed-style content), a `.map()` renders every item up front and a virtualized list nested in a ScrollView cannot virtualize. Make the `FlatList` the screen root instead — same screen classes, title via `ListHeaderComponent`:

```tsx
<FlatList
  className="flex-1 bg-background"
  contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-2"
  data={exercises}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ExerciseRow exercise={item} />}
  ListHeaderComponent={<Text className="pb-3 text-3xl font-bold text-foreground">Exercises</Text>}
  showsVerticalScrollIndicator={false}
/>
```

- Always provide `keyExtractor` with a stable unique key.
- Extract `renderItem` into a named component — never a growing inline closure.
- Spacing between rows: `gap-*` on `contentContainerClassName` or an `ItemSeparatorComponent`, never margins on the row.

## Forms — `KeyboardAwareScrollView` as the screen root

A screen with text inputs uses `KeyboardAwareScrollView` (from `react-native-keyboard-controller`, pre-installed, provider already mounted) as its root with the same screen classes — never RN's `KeyboardAvoidingView`.

## Horizontal rows (chips, carousels)

A horizontal `ScrollView` (or horizontal `FlatList` for long sets) inside a `<Section>` is fine — the one-container rule is about vertical scrolling. Wrap a scroll area whose content cuts off hard at an edge in HeroUI's `ScrollShadow` (`<ScrollShadow LinearGradientComponent={LinearGradient}>…</ScrollShadow>`) for the soft fade.

## Staged entrance

A screen's primary list/grid stages its first ~8 items in **once, on first focus** via the reveal-once pattern (`enterStaggered` from `@/lib/motion` — see its doc comment). Never re-run the stagger on scroll, re-render, or filter changes.
