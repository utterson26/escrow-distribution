// Allocation rules, checked without a chain: npx ts-node -T indexer/allocate.test.ts
import { allocate, MAX_SHARE_BPS } from "./snapshot";
import * as assert from "assert";

const R = 1_000_000n;
const cap = (R * MAX_SHARE_BPS) / 10000n; // 100_000

// 1. plain pro rata when nobody hits the cap
{
  const a = allocate([1n, 1n, 2n, 6n, 10n, 10n, 10n, 10n, 10n, 10n, 10n, 10n, 10n], R);
  assert.ok(a.every((x) => x <= cap), "under cap");
  assert.strictEqual(a.reduce((x, y) => x + y, 0n), R, "everything handed out (dust included)");
}
// 2. one whale: capped, the rest re-split pro rata
{
  const a = allocate([1000n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n], R);
  assert.strictEqual(a[0], cap, "whale capped at 10%");
  const rest = a.slice(1);
  assert.ok(rest.every((x) => x === rest[0]), "others equal");
  assert.strictEqual(a.reduce((x, y) => x + y, 0n), R, "cap excess redistributed");
}
// 3. cascading: after the whale is capped a second wallet goes over → capped too
{
  const a = allocate([1000n, 500n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n], R);
  assert.strictEqual(a[0], cap); assert.strictEqual(a[1], cap);
  assert.ok(a.slice(2).every((x) => x <= cap));
  assert.strictEqual(a.reduce((x, y) => x + y, 0n), R);
}
// 4. everyone capped: 3 holders → 30% handed out, 70% left pending
{
  const a = allocate([5n, 3n, 2n], R);
  assert.deepStrictEqual(a, [cap, cap, cap]);
}
// 5. deterministic: same input, same output; zero weights get nothing
{
  const w = [7n, 0n, 3n, 90n, 15n, 15n, 15n, 15n, 15n, 15n, 15n, 15n];
  assert.deepStrictEqual(allocate(w, R), allocate(w, R));
  assert.strictEqual(allocate(w, R)[1], 0n);
}
console.log("allocate: 5/5 ok");
