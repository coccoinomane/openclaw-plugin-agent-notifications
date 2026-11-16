import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentIdentity, createLaunchNotifier } from "../launch-notice.js";
import { buildNoticeMessage } from "../notice-message.js";

const label = "Recupero F24 INPS e preparazione Fineco";
const template = "🦞 {agentLaunchLabel} avviato: {label}";
const render = (identity) => buildNoticeMessage({ message: template }, { label, ...identity }, {}, {});

test("configured name, ID fallback and unknown identity use the requested wording", () => {
  assert.equal(render({ agentName: "Commercialista", agentId: "commercialista" }), "🦞 Agente Commercialista avviato: " + label);
  assert.equal(render({ agentId: "commercialista" }), "🦞 Agente commercialista avviato: " + label);
  assert.equal(render({}), "🦞 Sottoagente avviato: " + label);
  assert.equal(render({ agentName: "  ", agentId: " " }), "🦞 Sottoagente avviato: " + label);
  assert.equal(render({ agentName: "Commercialista" }), "🦞 Agente Commercialista avviato: " + label);
});

test("task titles do not become agent names; legacy placeholders retain their meaning", () => {
  const message = "{agent}|{label}|{agentName}|{agentIdentity}|{agentId}";
  assert.equal(buildNoticeMessage({ message }, { label, agentId: "worker", agentName: "Worker Name" }, {}, {}), label + "|" + label + "|Worker Name|Worker Name|worker");
});

test("identity resolution uses the child and current configured name, not the requester", async () => {
  const api = { config: { agents: { entries: { commercialista: { name: "Old Name" } } } }, runtime: { config: { current: () => ({ agents: { entries: { commercialista: { name: "Commercialista" }, main: { name: "Claw" } } } }) } } };
  assert.deepEqual(await resolveAgentIdentity(api, { childSessionKey: "agent:commercialista:subagent:123" }), { agentId: "commercialista", agentName: "Commercialista" });
  assert.deepEqual(await resolveAgentIdentity(api, {}), { agentId: "", agentName: "" });
});

test("explicit ID wins over session fallback and blank name uses identity.name", async () => {
  const api = { config: { agents: { entries: { worker: { name: " ", identity: { name: "Worker Name" } } } } } };
  assert.deepEqual(await resolveAgentIdentity(api, { agentId: "worker", childSessionKey: "agent:other:subagent:123" }), { agentId: "worker", agentName: "Worker Name" });
});

test("unavailable live config and legacy agents.list preserve useful identity", async () => {
  const api = { config: { agents: { list: [{ id: "worker", name: "Worker Name" }] } }, runtime: { config: { current: () => { throw new Error("unavailable"); } } } };
  assert.deepEqual(await resolveAgentIdentity(api, { agentId: "worker" }), { agentId: "worker", agentName: "Worker Name" });
  assert.deepEqual(await resolveAgentIdentity({}, { agentId: "worker" }), { agentId: "worker", agentName: "" });
});

test("normal and visible notifier paths deliver name without mutating event or routing", async () => {
  for (const visible of [false, true]) {
    const sent = [];
    const api = { config: { agents: { entries: { commercialista: { name: "Commercialista" } } } } };
    const event = Object.freeze({ agentId: "commercialista", label, runId: "run-1", visible });
    const notify = createLaunchNotifier(api, {
      resolveConfig: () => ({ message: template, visibleMessage: template, notifyVisible: true, channels: new Set(["discord"]), silent: true }),
      resolveRequesterRoute: async () => ({ channel: "discord", to: "123" }),
      isNestedRequester: () => false,
      resolveSessionLink: async () => "",
      markSentOnce: () => true,
      sendNotice: (notice) => sent.push(notice),
    });
    await notify(event, {});
    assert.equal(sent[0].message, "🦞 Agente Commercialista avviato: " + label);
    assert.equal(sent[0].target, "123");
    assert.equal(Object.hasOwn(event, "agentName"), false);
  }
});
