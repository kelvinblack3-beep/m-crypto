# Newly app

A native-feeling Expo (React Native) app built with the newly design system:
**HeroUI Native** components, **Uniwind** (Tailwind v4) styling, a locked **design
token** set, and **Zustand + MMKV** for local-first state.

## Get started

```bash
bun install
bun run ios       # or: bun run android / bun run web
```

## Where things live

```
src/
├── app/              Expo Router routes — every .tsx here is a screen
├── components/       Scaffold primitives (Section, Card, ListRow, Segmented, …)
├── features/<f>/     Domain modules: components/ hooks/ store/ utils/ types/
├── hooks/            Cross-feature hooks
├── lib/              motion.ts · confirm.ts · storage.ts · cn.ts
└── constants/        theme.ts (native fallback palette)
design/               DESIGN.md + dials.json — the locked visual identity
rules/                Coding rules — read the matching rule before writing code
```

The app's look is driven by the tokens in `src/global.css` and the dials in
`design/dials.json` — change the look by editing tokens, never one screen at a time.

## Checks

```bash
bun run typecheck     # TypeScript
bun run lint:slop     # design-system lint (tokens only, primitives, motion rules)
```

`AGENTS.md` is the entry point for AI agents working in this repo — it links every
rule in `rules/` and the design docs in `design/`.
