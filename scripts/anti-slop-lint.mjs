#!/usr/bin/env node
/**
 * Anti-slop lint — the design-system's automated gate.
 *
 * Fails (exit 1) on the patterns that make generated UI look like "AI slop":
 *   • raw hex / rgb / hsl color literals in component code (use token utilities)
 *   • a second styling system or UI kit (only HeroUI Native + Uniwind are allowed)
 *   • a screen hand-rolling the safe area (insets.top / SafeAreaView /
 *     contentInsetAdjustmentBehavior) — screens pad with the safe-area utility CLASSES
 *     (pt-safe-offset-2, pb-safe-offset-22) so there is exactly ONE inset mechanism;
 *     mixing mechanisms is the #1 cause of the recurring big-top-gap / cut-off-header
 *     and double-padding defects
 *   • a bare chevron-right/forward icon outside <ListRow> — a dead-affordance "fake button"
 *     tell; tappable rows go through <ListRow onPress={...}>, which only shows a chevron
 *     when there's an action
 *   • a hand-rolled card (bg-surface + rounded-2xl + padding) in a screen — use <Card> so
 *     every card has consistent padding; lists go in <Card list> + <ListRow>
 *   • spacing between any containers via margins or arbitrary px — use `gap` on the parent
 *     + padding from the scale; margins (mt-/mx-/m-…) and bracket values (p-[17px]) drift
 *   • slop motion in a screen — Bounce* (banned always), springs outside the lively dial
 *     or unconfigured (bouncy-default) springs on lively, and sluggish (>600ms) durations;
 *     animations use the tokens in src/lib/motion.ts
 *
 * Spacing for EVERY container, not just cards: a raw <View> groups things; the space goes
 * BETWEEN its children as `gap-…` on the View, with `p-…` for inner padding, from the scale.
 *
 * Colors and shape live in src/global.css as tokens; components consume them via
 * Tailwind/Uniwind utilities (bg-accent, text-foreground, rounded-2xl, …). The one
 * file allowed to carry raw color values is the native-fallback palette, because
 * native components (NativeTabs, @expo/ui) take real color values, not classNames.
 *
 * Run:  node scripts/anti-slop-lint.mjs   (also: bun run lint:slop)
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// Files allowed to carry raw color values: the sanctioned native-fallback palette.
// Keep these in sync with the real tokens in src/global.css.
const ALLOWLIST = new Set(['src/constants/theme.ts']);

// A second general-purpose UI kit or styling system is never allowed — HeroUI
// Native (components) + Uniwind (Tailwind v4 styling) are the only ones.
const BANNED_IMPORTS = [
  'nativewind',
  'tamagui',
  '@tamagui',
  '@gluestack-ui',
  'native-base',
  'react-native-paper',
  '@rneui',
  'styled-components',
  '@shopify/restyle',
];

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(rgb|rgba|hsl|hsla)\s*\(/;

// The app's motion dial gates springs: calm/standard are timing-only; lively allows
// critically damped springs (configured — never the bouncy default). Missing → standard.
const MOTION_DIAL = (() => {
  try {
    const motion = JSON.parse(readFileSync(join(ROOT, 'design', 'dials.json'), 'utf8')).motion;
    return motion === 'lively' || motion === 'calm' ? motion : 'standard';
  } catch {
    return 'standard';
  }
})();

const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      walk(p);
      continue;
    }
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(extname(p))) continue;
    if (p.endsWith('.d.ts')) continue;
    const rel = relative(ROOT, p);
    if (ALLOWLIST.has(rel)) continue;

    // Screens pad with the safe-area utility classes (pt-safe-offset-2 / pb-safe-offset-22)
    // and route taps through <ListRow> — hand-rolled insets and bare chevrons are the
    // recurring source of the big-top-gap / cut-off-header / dead-chevron defects.
    // Feature modules (src/features/) hold screen hooks + feature components, so the same
    // screen-code rules apply there — src/components/ (the primitives) stays exempt.
    const isRouteScreen =
      ((rel.startsWith('src/app/') && rel.endsWith('.tsx')) || (rel.startsWith('src/features/') && rel.endsWith('.tsx'))) &&
      !rel.endsWith('_layout.tsx');
    const isListRow = rel === join('src', 'components', 'list-row.tsx');

    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const ln = i + 1;
      const code = raw.replace(/\/\/.*$/, ''); // ignore line comments
      if (HEX.test(code)) {
        findings.push([rel, ln, 'raw hex color — use a token utility (bg-*/text-*) instead', raw.trim()]);
      } else if (COLOR_FN.test(code)) {
        findings.push([rel, ln, 'inline color literal — use a design token instead', raw.trim()]);
      }
      if (isRouteScreen && /contentInsetAdjustmentBehavior|insets\.top|SafeAreaView/.test(code)) {
        findings.push([
          rel,
          ln,
          'hand-rolled safe area — pad the screen container with the safe-area utility classes instead (contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6"). Mixing SafeAreaView / useSafeAreaInsets / contentInsetAdjustmentBehavior with the classes double-counts the inset — the big-top-gap / cut-off-header bug.',
          raw.trim(),
        ]);
      }
      if (!isListRow && /chevron[.\-](right|forward)|Chevron(Right|Forward)/i.test(code)) {
        findings.push([
          rel,
          ln,
          'bare chevron icon — render tappable rows with <ListRow onPress={...}> (src/components/list-row.tsx). It shows a chevron ONLY when there is an action, so a chevron is never a dead "fake button".',
          raw.trim(),
        ]);
      }
      // Hand-rolled card surface (bg-surface + a card radius + padding) → use <Card> so
      // every card has identical padding. <Card> itself uses HeroUI <Surface> (no
      // bg-surface className), so it's exempt; this only catches by-hand cards in screens.
      if (
        isRouteScreen &&
        /\bbg-surface(-secondary)?\b/.test(code) &&
        /\brounded-(2xl|3xl)\b/.test(code) &&
        /\b(p|px|py)-\d/.test(code)
      ) {
        findings.push([
          rel,
          ln,
          'hand-rolled card — use the <Card> primitive (src/components/card.tsx) for consistent padding. Do not build a card from bg-surface + rounded-2xl + padding by hand (that is how card padding drifts screen to screen). Wrap list rows in <Card list> + <ListRow>; wrap content in <Card>.',
          raw.trim(),
        ]);
      }
      // Spacing between ANY containers comes from `gap` on the parent + padding from the
      // scale — NOT margins (they drift) and NOT arbitrary px values. Negative margins
      // (full-bleed) and *-auto are fine. Applies to every wrapper, not just Card/Section.
      if (isRouteScreen && /(?<![-\w])m[trblxy]?-\d/.test(code)) {
        findings.push([
          rel,
          ln,
          'margin for spacing — put the gap on the PARENT with gap-… (or use padding), not margins; margins make spacing inconsistent across screens. (Negative margins for full-bleed and mx-auto are fine.)',
          raw.trim(),
        ]);
      }
      if (isRouteScreen && /(?<![-\w])(p|px|py|pt|pb|pl|pr|gap|m[trblxy]?)-\[/.test(code)) {
        findings.push([
          rel,
          ln,
          'arbitrary spacing value — use the spacing scale (gap-3, p-4, px-5…), not a bracket px value, so spacing stays consistent.',
          raw.trim(),
        ]);
      }
      // Bounce presets are banned on every dial; springs are DIAL-GATED (calm/standard
      // timing-only; lively allows configured, critically damped springs).
      if (isRouteScreen && /\bBounce(In|Out)\w*\b/.test(code)) {
        findings.push([
          rel,
          ln,
          'bounce preset — Bounce* is banned on every motion dial (a visible overshoot reads as demo motion). Use FadeIn/FadeOut/SlideIn* with the motion tokens (src/lib/motion.ts), or (dial lively only) a critically damped spring.',
          raw.trim(),
        ]);
      }
      if (isRouteScreen && MOTION_DIAL !== 'lively' && /\bwithSpring\s*\(|\.springify\s*\(/.test(code)) {
        findings.push([
          rel,
          ln,
          `spring on a ${MOTION_DIAL} app — this motion dial is timing-only. Use a component's built-in animation (a collapsible is a HeroUI Accordion, not a custom spring); for a layout change use layout={LinearTransition} + FadeIn/FadeOut; tween with withTiming using the motion tokens (src/lib/motion.ts). Springs unlock only at motion dial lively (design/dials.json).`,
          raw.trim(),
        ]);
      }
      if (isRouteScreen && MOTION_DIAL === 'lively' && /\bwithSpring\s*\([^,()]*\)/.test(code)) {
        findings.push([
          rel,
          ln,
          'unconfigured spring — the default withSpring config visibly bounces. Pass springs.press or springs.settle from @/lib/motion (dampingRatio 0.95-1, no visible overshoot).',
          raw.trim(),
        ]);
      }
      // Sluggish animation durations read as slop. UI motion caps at 300ms; the one
      // sanctioned longer motion is a one-time data draw-in (≤ ~600ms, timing.draw).
      // Conservative: only fires when the line also names an animation API, so a data
      // value like `duration: 900` (a workout length) never matches.
      const slowMotion = code.match(
        /\b(withTiming|withDelay|FadeIn|FadeOut|SlideIn\w*|SlideOut\w*|ZoomIn\w*|ZoomOut\w*|LinearTransition)\b.*?duration[:(]\s*(\d+)/,
      );
      if (isRouteScreen && slowMotion && Number(slowMotion[2]) > 600) {
        findings.push([
          rel,
          ln,
          `sluggish animation — ${slowMotion[2]}ms reads as slop. UI motion stays ≤ 300ms (exits faster than entrances); a one-time data draw-in may take up to ~600ms. Use the motion tokens (src/lib/motion.ts: timing.enter/exit/move/draw, fadeIn/fadeOut/reflow) instead of ad-hoc numbers.`,
          raw.trim(),
        ]);
      }
      for (const b of BANNED_IMPORTS) {
        if (code.includes(`'${b}`) || code.includes(`"${b}`)) {
          findings.push([rel, ln, `banned UI kit / styling system: ${b}`, raw.trim()]);
        }
      }
    });

    // File-level: a destructive action (delete/remove/destroy…) in a screen MUST be behind a
    // confirm — the output app never deletes on tap. Conservative: skips listener/storage
    // APIs, and any file that already confirms (confirmDelete / an Alert with a destructive
    // button / a Dialog) passes.
    if (isRouteScreen) {
      const full = lines.join('\n');
      const calls = [...full.matchAll(/\b(delete|remove|destroy)\w*\s*\(/g)].filter((m) => {
        const name = m[0].replace(/\s*\($/, '');
        return !/^(removeListener|removeEventListener|removeAllListeners|removeChild|removeItem|removeClippedSubviews)$/.test(name);
      });
      const hasConfirm = /\bconfirmDelete\b|\bAlert\.alert\b|style:\s*['"]destructive['"]|AlertDialog|<Dialog\b/.test(full);
      if (calls.length && !hasConfirm) {
        const idx = full.indexOf(calls[0][0]);
        findings.push([
          rel,
          full.slice(0, idx).split('\n').length,
          'destructive action without a confirm — wrap delete/remove in confirmDelete({ onConfirm }) (src/lib/confirm.ts) so the user confirms before anything is deleted. The app must NEVER delete on tap.',
          calls[0][0].trim(),
        ]);
      }
    }

    // Every <NativeTabs.Trigger> must carry `disableAutomaticContentInsets`. expo-router
    // defaults it ON, which quietly adds a SECOND inset mechanism on top of the safe-area
    // utility classes the screens already use: on iOS react-native-screens flips the
    // screen's first descendant ScrollView to contentInsetAdjustmentBehavior = Automatic
    // (top AND bottom), and on Android the screen is wrapped in
    // <SafeAreaView edges={{ bottom: true }}>. Every screen root is then padded twice:
    // the giant band above the large title on iOS, doubled home-indicator padding on both.
    // The classes are the ONE inset mechanism, so the native one stays off.
    const full = readFileSync(p, 'utf8');
    const triggers = [...full.matchAll(/<NativeTabs\.Trigger(?![.\w])/g)];
    if (triggers.length) {
      const tags = full.split(/<NativeTabs\.Trigger(?![.\w])/).slice(1);
      tags.forEach((tag, idx) => {
        const openingTag = tag.split('>')[0];
        if (/disableAutomaticContentInsets/.test(openingTag)) return;
        findings.push([
          rel,
          full.slice(0, triggers[idx].index).split('\n').length,
          'NativeTabs.Trigger without `disableAutomaticContentInsets`: expo-router defaults it ON, which double-counts the safe area against the screens\' pt-safe-offset-2 / pb-safe-offset-22 classes (the giant top gap on iOS, doubled bottom padding on both platforms). Add the prop to every Trigger.',
          `<NativeTabs.Trigger${openingTag.split('\n')[0]}>`.trim(),
        ]);
      });
    }
  }
}

if (!existsSync(SRC)) {
  console.log('anti-slop: no src/ directory — nothing to check.');
  process.exit(0);
}

walk(SRC);

if (findings.length === 0) {
  console.log('anti-slop: clean ✓');
  process.exit(0);
}

console.error(`anti-slop: ${findings.length} finding(s)\n`);
for (const [f, ln, msg, src] of findings) {
  console.error(`  ${f}:${ln}  ${msg}`);
  console.error(`      ${src}`);
}
console.error(
  '\nFix: move colors into src/global.css as tokens and use token utilities ' +
    '(bg-accent, text-foreground, border-border …); remove any second UI kit; ' +
    'pad screens with the safe-area utility classes (pt-safe-offset-2 / ' +
    'pb-safe-offset-22 — no hand-rolled insets); route tappable ' +
    'rows through <ListRow onPress={...}> (no bare chevrons); and build cards/sections ' +
    'with <Card>/<Section> (no hand-rolled card padding).',
);
process.exit(1);
