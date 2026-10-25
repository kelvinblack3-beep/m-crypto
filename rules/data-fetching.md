# Data Fetching

## Impact: HIGH

## Local-first is the default

This app does NOT talk to a backend unless the user explicitly asks for one. App data lives in the Zustand + MMKV store (`rules/state-management.md`). Do not add accounts, auth, sync, or a server "to be safe".

**Everything below applies only when the user asks for remote data** (a public API, their own backend, a weather/quotes/prices feed, …).

## When remote data IS requested — TanStack Query

Install `@tanstack/react-query` (it is not pre-installed), create one `QueryClient` + `QueryClientProvider` in `src/app/_layout.tsx`, and follow these patterns. Never `useEffect` + `useState` + `fetch`.

### Query options factories

Define reusable, type-safe query configs per feature in `src/features/<feature>/queries/<feature>-queries.ts`. Never inline `queryKey` + `queryFn` in components.

```ts
// src/features/weather/queries/weather-queries.ts
import { queryOptions } from '@tanstack/react-query';

export const weatherQueries = {
  current: (city: string) =>
    queryOptions({
      queryKey: ['weather', city] as const,
      queryFn: () => fetchCurrentWeather(city), // wire helper from utils/
      staleTime: 1000 * 60 * 5,
    }),
};
```

- Query keys are `[feature, ...params]` arrays — predictable for invalidation, never bare strings.
- The wire call (URL building, response parsing/validation) is a helper in `utils/`, so the factory stays "what endpoint, what shape out".
- Screens never call `useQuery` directly — a feature hook in `hooks/` wraps it (`useCurrentWeather`), and the screen consumes the hook.

### Mutations

**Every async action with side effects goes through `useMutation`** — no `useState + try/catch` loading flags. `mutationOptions` factories live in `features/<feature>/mutations/<feature>-mutations.ts`; screen-specific side effects (navigation, toast) layer on in the feature hook's `onSuccess`/`onError`.

Invalidate related queries on success, sourcing the key from the factory — never a re-typed string:

```ts
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: weatherQueries.current(city).queryKey });
},
```

### Loading states

While a query is pending with no data, render a `Skeleton` shaped like the content (see `rules/component-usage.md`) — never a centered spinner.

### No waterfalls

Independent datasets fetch in parallel — call the hooks at the top level; never chain them with `enabled` unless one truly depends on the other's result. Prefetch before navigation when a detail screen's data is known (`queryClient.prefetchQuery(...)` in the row's `onPress`).

### File placement

```
features/<feature>/
├── queries/<feature>-queries.ts     ← queryOptions factories
├── mutations/<feature>-mutations.ts ← mutationOptions factories
├── hooks/use-<thing>.ts             ← useQuery/useMutation wrappers screens consume
├── utils/<topic>.ts                 ← wire helpers (fetch, parse, validate)
└── types/<topic>.ts                 ← response/domain types
```
