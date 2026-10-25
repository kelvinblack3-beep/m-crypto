import { Surface } from 'heroui-native';
import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

type CardProps = {
  children: ReactNode;
  /** Render children as a divided list of rows (use with <ListRow>). Default: a padded
   *  content card. */
  list?: boolean;
  /** Media (a photo / hero image) shown FULL-BLEED at the top of the card, clipped by the
   *  card's own radius — pass the bare image (e.g. <Image className="w-full aspect-video" …/>)
   *  with NO radius of its own. This is the ONLY way media goes in a card: an image placed
   *  inside the padded content area picks up mismatched corners (square-inside-rounded is
   *  the #1 slop tell). For a small INSET thumbnail next to text, use rounded-lg. */
  media?: ReactNode;
};

/**
 * The standard card container — ONE consistent padding + radius for every card, so cards
 * never drift (one p-4, the next p-5, a third with none). Two modes:
 *  - default: a padded content card (p-4, gap-3) — put content blocks inside; photos go
 *    through the `media` prop (full-bleed, clipped by the card itself — never hand-round).
 *  - list: a divided list of <ListRow>s. The card supplies the horizontal padding and the
 *    hairline dividers; each <ListRow> supplies its own vertical padding — so every list
 *    row has identical spacing.
 *
 * Do NOT hand-roll a card (a `bg-surface` + `rounded-2xl` + padding View) — use <Card>.
 * The anti-slop lint flags hand-rolled cards in screens.
 *
 *   <Card><Text>…</Text></Card>
 *   <Card media={<Image source={{ uri }} className="w-full aspect-video" />}>
 *     <Text className="text-lg font-semibold text-foreground">Lemon Herb Roast Chicken</Text>
 *   </Card>
 *   <Card list>
 *     <ListRow title="Bench Press" subtitle="87.5 kg × 8" onPress={…} />
 *     <ListRow title="Deadlift" subtitle="130 kg × 5" onPress={…} />
 *   </Card>
 */
export function Card({ children, list, media }: CardProps) {
  if (list) {
    const items = Children.toArray(children).filter(Boolean);
    return (
      <Surface className="rounded-2xl px-4 overflow-hidden">
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View className="h-px bg-border" /> : null}
            {child}
          </View>
        ))}
      </Surface>
    );
  }
  if (media) {
    return (
      <Surface className="rounded-2xl overflow-hidden">
        {media}
        <View className="p-4 gap-3">{children}</View>
      </Surface>
    );
  }
  return <Surface className="rounded-2xl p-4 gap-3">{children}</Surface>;
}
