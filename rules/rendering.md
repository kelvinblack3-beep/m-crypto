# Rendering Rules

## Impact: CRITICAL

## Always Use Ternary — Never `&&` for Conditional Rendering

Always use ternary operator `? :` for conditional rendering in JSX. Never use `&&`.

**Why:** In React Native, `&&` with falsy values (`0`, `""`, `NaN`) renders them as raw text outside `<Text>`, causing a **production crash**. Ternary with `: null` is always safe and consistent.

```typescript
// ✅ Correct — ternary with null
{isFocused ? <GlowBorder /> : null}
{label ? <Text>{label}</Text> : null}
{count > 0 ? <Badge count={count} /> : null}

// ✅ Correct — early return
if (!data) return null;

// ❌ Wrong — never use && in JSX
{isFocused && <GlowBorder />}
{label && <Text>{label}</Text>}
{count && <Badge count={count} />}
```

This applies to all conditional rendering in JSX, even when the value is a boolean. Consistency prevents mistakes.
