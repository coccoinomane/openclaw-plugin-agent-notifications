import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteFromEntry } from "../requester-route.js";

const expected = { channel: "discord", accountId: "default", to: "channel:123", threadId: "123" };

test("route is read from the nested delivery state", () => {
  const entry = {
    delivery: {
      kind: "external",
      route: { channel: "discord", accountId: "default", target: { to: "channel:123" }, thread: { id: "123" } },
    },
  };
  assert.deepEqual(resolveRouteFromEntry(undefined, entry), expected);
  assert.deepEqual(resolveRouteFromEntry(undefined, { delivery: { context: expected } }), expected);
});

test("route is read from legacy top-level fields", () => {
  assert.deepEqual(resolveRouteFromEntry(undefined, { deliveryContext: expected }), expected);
  assert.deepEqual(
    resolveRouteFromEntry(undefined, { lastChannel: "discord", lastAccountId: "default", lastTo: "channel:123", lastThreadId: "123" }),
    expected,
  );
});

test("hook-provided requester wins over the session entry", () => {
  const route = resolveRouteFromEntry({ channel: "telegram", to: "42" }, { delivery: { context: expected } });
  assert.equal(route.channel, "telegram");
  assert.equal(route.to, "42");
});

test("missing entry yields an empty route", () => {
  assert.deepEqual(resolveRouteFromEntry(undefined, null), { channel: "", accountId: "", to: "", threadId: undefined });
});
