import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type SectionProps = {
  /** Optional uppercase section label, e.g. "Quick Start", "Settings". */
  title?: string;
  children: ReactNode;
};

/**
 * A labeled screen section with consistent spacing — an uppercase label + its content,
 * with one fixed gap between the label and the content. Build a screen as a stack of
 * <Section>s directly inside the screen's `gap-6` content container, and the gap BETWEEN
 * sections comes from that container — so the vertical rhythm is identical on every screen.
 *
 * Don't hand-roll section labels + margins per screen (that's how the spacing drifts).
 *
 *   <ScrollView className="flex-1 bg-background"
 *     contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6">
 *     <Text className="text-3xl font-bold text-foreground">Today</Text>
 *     <Section title="Quick Start"><Card list>…</Card></Section>
 *     <Section title="Recent"><Card list>…</Card></Section>
 *   </ScrollView>
 */
export function Section({ title, children }: SectionProps) {
  return (
    <View className="gap-3">
      {title ? (
        <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</Text>
      ) : null}
      {children}
    </View>
  );
}
