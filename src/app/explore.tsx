import { ScrollView, Text } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { useSettingsStore } from '@/features/settings/store/settings-store';
import { confirmDelete } from '@/lib/confirm';

export default function ExploreScreen() {
  // App data lives in a Zustand store persisted with MMKV (src/features/<feature>/store/) —
  // the screen renders from the store, controls mutate it, and the choice survives a
  // reload. Narrow selectors so unrelated store updates don't re-render this screen.
  const density = useSettingsStore((s) => s.density);
  const setDensity = useSettingsStore((s) => s.setDensity);
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6"
      showsVerticalScrollIndicator={false}>
      <Text className="text-3xl font-bold text-foreground" numberOfLines={1}>
        Explore
      </Text>
      <Section title="Design system">
        <Card>
          <Text className="text-base text-muted">
            HeroUI Native components, Uniwind styling, and a locked token set. Native where it
            matters: NativeTabs, SF Symbols, safe areas.
          </Text>
        </Card>
      </Section>

      {/* A few-choice toggle → the native <Segmented> control, accent-tinted. Use it for
          theme (System/Light/Dark), units (kg/lbs), filters — never hand-rolled pills. */}
      <Section title="Density">
        <Segmented
          values={['compact', 'cozy', 'spacious']}
          labels={['Compact', 'Cozy', 'Spacious']}
          value={density}
          onChange={setDensity}
        />
      </Section>

      {/* A divided list — <Card list> + <ListRow>: every row has identical padding and a
          hairline divider. <ListRow> shows a chevron only when onPress is set. */}
      <Section title="Explore">
        <Card list>
          <ListRow title="Components" subtitle="Buttons, cards, inputs…" onPress={() => {}} />
          <ListRow title="Tokens" subtitle="Colors, radius, spacing" onPress={() => {}} />
          <ListRow title="Layout" subtitle="Screens, sections, lists" onPress={() => {}} />
        </Card>
      </Section>

      {/* Any destructive action goes through confirmDelete — a native confirm before
          anything is removed. NEVER delete on tap. */}
      <Section title="Danger zone">
        <Card list>
          <ListRow
            title="Reset preferences"
            subtitle="Restore the defaults"
            onPress={() =>
              confirmDelete({
                title: 'Reset preferences?',
                message: 'This restores the default density.',
                confirmLabel: 'Reset',
                onConfirm: () => setDensity('cozy'),
              })
            }
          />
        </Card>
      </Section>
    </ScrollView>
  );
}
