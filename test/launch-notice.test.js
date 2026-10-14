import test from "node:test";
import assert from "node:assert/strict";
import { createLaunchNotifier } from "../launch-notice.js";
import { DEFAULT_MESSAGE } from "../notice-message.js";

const sessionUrl = "https://console.example.test/chat/worker/subagent/12345678";
const event = Object.freeze({ runId: "run-123", childSessionKey: "agent:worker:subagent:12345678", agentId: "worker", mode: "run", threadRequested: true, cleanup: "delete", expectsCompletionMessage: false });
const context = Object.freeze({ requesterSessionKey: "agent:main:discord:channel:123" });
function harness(overrides = {}) {
  const sent = [], marks = [], seen = new Set();
  let resolutions = 0;
  const config = { message: DEFAULT_MESSAGE, visibleMessage: "[Visible](<{sessionUrl}>)", channels: new Set(["discord"]), notifyVisible: true, includeNested: false, silent: true, ...overrides.config };
  const notify = createLaunchNotifier({}, {
    resolveConfig: () => config,
    resolveRequesterRoute: async () => overrides.route || { channel: "Discord", to: "123", accountId: "default", threadId: "456" },
    isNestedRequester: () => overrides.nested === true,
    resolveSessionLink: async () => { resolutions += 1; return overrides.url === undefined ? sessionUrl : overrides.url; },
    markSentOnce: (key, original) => { marks.push({ key, original }); if (seen.has(key)) return false; seen.add(key); return true; },
    sendNotice: (notice) => sent.push(notice),
  });
  return { notify, sent, marks, resolutions: () => resolutions };
}

test("a normal spawn stays normal and preserves routing, silent, thread and completion flags", async () => {
  const h = harness();
  const before = JSON.stringify(event);
  await h.notify(event, context);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0], { channel: "discord", accountId: "default", target: "123", threadId: "456", message: DEFAULT_MESSAGE + "\n🔎 [Apri sessione](<" + sessionUrl + ">)", silent: true });
  assert.equal(JSON.stringify(event), before);
  assert.equal(Object.hasOwn(event, "visible"), false);
  assert.equal(h.marks[0].original, event);
});

test("normal spawn notices remain useful when link resolution returns no URL", async () => {
  const h = harness({ url: "" });
  await h.notify(event, context);
  assert.equal(h.sent[0].message, DEFAULT_MESSAGE);
});

test("deduplication still uses the original run id", async () => {
  const h = harness();
  await h.notify(event, context);
  await h.notify(event, context);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.marks.map((m) => m.key), [event.runId, event.runId]);
});

test("child session key remains the deduplication fallback", async () => {
  const h = harness();
  await h.notify({ ...event, runId: undefined }, context);
  assert.equal(h.marks[0].key, event.childSessionKey);
});

test("existing visible notice remains a single custom link", async () => {
  const h = harness();
  await h.notify({ ...event, visible: true }, context);
  assert.equal(h.sent[0].message, "[Visible](<" + sessionUrl + ">)");
});

test("visible opt-out does not opt out normal children", async () => {
  const h = harness({ config: { notifyVisible: false } });
  await h.notify({ ...event, visible: true }, context);
  assert.equal(h.resolutions(), 0);
  await h.notify(event, context);
  assert.equal(h.sent.length, 1);
});

test("channel, target and nested filters still run before link resolution", async () => {
  for (const overrides of [{ config: { channels: new Set(["slack"]) } }, { route: { channel: "discord", to: "" } }, { route: { channel: "", to: "123" } }, { nested: true }]) {
    const h = harness(overrides);
    await h.notify(event, context);
    assert.equal(h.resolutions(), 0);
    assert.equal(h.sent.length, 0);
  }
});

test("wildcard channels, nested opt-in and silent false retain their behavior", async () => {
  const h = harness({ nested: true, config: { channels: new Set(["*"]), includeNested: true, silent: false }, route: { channel: "Slack", to: "456" } });
  await h.notify(event, context);
  assert.equal(h.sent[0].channel, "slack");
  assert.equal(h.sent[0].silent, false);
});
