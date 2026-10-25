# Control Flow

## Impact: CRITICAL

**Never use `if/else` or nested `if/else` chains.** Use guard clauses with early `return` for branching, or `switch` for fixed enumerations.

This is a hard rule. It applies to every function — hooks, handlers, validators, utilities, and screen logic.

## Why

Early returns keep the happy path un-nested and visually flat. `if/else` chains push real work into branches and force the reader to track every path simultaneously. Switch statements make fixed-set dispatch explicit.

## Use guard clauses + early return

```typescript
// ❌ Wrong — if/else
const updateDay = (day: Day, next: DayFeedback | null) => {
  if (next === null) {
    deleteDay(day);
  } else {
    saveDay(day, next);
  }
};

// ✅ Correct — early return, no else
const updateDay = (day: Day, next: DayFeedback | null) => {
  if (next === null) {
    deleteDay(day);
    return;
  }
  saveDay(day, next);
};
```

```typescript
// ❌ Wrong — nested if/else
const navigate = () => {
  if (isReducedMotion) {
    navigateNow();
  } else {
    if (isAnimating) {
      return;
    } else {
      animateOut(navigateNow);
    }
  }
};

// ✅ Correct — flat early returns
const navigate = () => {
  if (isReducedMotion) {
    navigateNow();
    return;
  }
  if (isAnimating) return;
  animateOut(navigateNow);
};
```

## Use ternary for value selection

When you need to **return a value** based on a condition, use a ternary expression. Don't use `if/else` to assign to a variable.

```typescript
// ❌ Wrong — if/else for value assignment
let label;
if (isSelected) {
  label = "Selected";
} else {
  label = "Tap to select";
}

// ✅ Correct — ternary
const label = isSelected ? "Selected" : "Tap to select";
```

For early-return shapes that produce a value, return early:

```typescript
// ❌ Wrong
const resolve = (pace: Pace) => {
  if (pace === "auto") {
    return autoValue;
  } else {
    return paceMap[pace];
  }
};

// ✅ Correct — early return
const resolve = (pace: Pace) => {
  if (pace === "auto") return autoValue;
  return paceMap[pace];
};
```

## Use `switch` for fixed enumerations

When dispatching on a finite, exhaustive set of values (string unions, enums, action types), use `switch`. Each `case` ends in `return` — no `break` needed, no fallthrough.

```typescript
// ❌ Wrong — if/else if chain
const resolveDuration = (pace: Pace): number => {
  if (pace === "3m") {
    return 3;
  } else if (pace === "6m") {
    return 6;
  } else if (pace === "12m") {
    return 12;
  } else {
    return autoValue;
  }
};

// ✅ Correct — switch with early returns per case
const resolveDuration = (pace: Pace): number => {
  switch (pace) {
    case "3m":
      return 3;
    case "6m":
      return 6;
    case "12m":
      return 12;
    case "auto":
      return autoValue;
  }
};
```

`switch` over a discriminated union also gives you exhaustiveness checking from TypeScript when the function has an explicit return type.

## Don't chain `if/else if`

Long `if/else if` chains are just nested if/else dressed up. Convert them to `switch` (for fixed values) or to a sequence of guard clauses with early returns (for predicates).

```typescript
// ❌ Wrong
if (status === "loading") {
  return <Spinner />;
} else if (status === "error") {
  return <ErrorView />;
} else if (status === "empty") {
  return <EmptyState />;
} else {
  return <Content />;
}

// ✅ Correct — early returns
if (status === "loading") return <Spinner />;
if (status === "error") return <ErrorView />;
if (status === "empty") return <EmptyState />;
return <Content />;
```

## In JSX, use ternary (per `rules/rendering.md`)

This rule complements `rules/rendering.md`: never `&&`, always `? :` for inline JSX branching. `if/else` doesn't appear inside JSX expressions at all — it only ever appears in function bodies, where this file's rules apply.
