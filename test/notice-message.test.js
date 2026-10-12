import test from "node:test";
import assert from "node:assert/strict";
import { buildNoticeMessage, DEFAULT_MESSAGE } from "../notice-message.js";

const url = "https://console.example.test/chat/worker/subagent/12345678";
const config = { message: DEFAULT_MESSAGE, visibleMessage: "🦞 [Sottoagente avviato](<{sessionUrl}>): " + String.fromCharCode(96) + "{agent}" + String.fromCharCode(96) };
const event = Object.freeze({ agentId: "worker", label: "Ricerca", runId: "run-123456789", childSessionKey: "agent:worker:subagent:12345678", sessionUrl: url, mode: "run", resolvedModel: "model-x", resolvedProvider: "provider-x", threadRequested: true });
const ctx = { requesterSessionKey: "agent:main:discord:channel:123" };
const route = { channel: "discord", accountId: "default", to: "123", threadId: "456" };
const build = (cfg = config, ev = event) => buildNoticeMessage(cfg, ev, ctx, route);

test("default and old custom message both acquire one session link", () => {
  for (const message of [DEFAULT_MESSAGE, "La vecchia frase personalizzata."]) {
    assert.equal(build({ ...config, message }), message + "\n🔎 [Apri sessione](<" + url + ">)");
  }
});

test("sessionUrl placeholders and existing canonical links are not duplicated", () => {
  for (const message of ["[Apri](<{sessionUrl}>)", "Link: {sessionUrl}", "Vai a " + url, "[Personalizzato](<" + url + ">)"]) {
    const rendered = build({ ...config, message });
    assert.equal(rendered.split(url).length - 1, 1);
    assert.doesNotMatch(rendered, /🔎/);
  }
});

test("unrelated links do not hide the child session link", () => {
  assert.equal(build({ ...config, message: "[Docs](https://docs.example.test)" }), "[Docs](https://docs.example.test)\n🔎 [Apri sessione](<" + url + ">)");
});

test("without a URL the old message remains byte-for-byte unchanged", () => {
  assert.equal(build(config, { ...event, sessionUrl: "" }), DEFAULT_MESSAGE);
});

test("URL-less custom templates retain their useful inline text and no broken links", () => {
  const message = "Lavoro: {agent}. [Apri](<{sessionUrl}>)\n{sessionUrl}";
  assert.equal(build({ ...config, message }, { ...event, sessionUrl: "" }).trim(), "Lavoro: Ricerca. Apri");
});

test("a URL-only template still delivers a useful text notice when no link is available", () => {
  assert.equal(build({ ...config, message: "<{sessionUrl}>" }, { ...event, sessionUrl: "" }), DEFAULT_MESSAGE);
});

test("visible messages keep their original link and formatting", () => {
  assert.equal(build(config, { ...event, visible: true }), "🦞 [Sottoagente avviato](<" + url + ">): " + String.fromCharCode(96) + "Ricerca" + String.fromCharCode(96));
  assert.equal(build(config, { ...event, visible: true, sessionUrl: "" }), "🦞 Sottoagente avviato: " + String.fromCharCode(96) + "Ricerca" + String.fromCharCode(96));
});

test("existing model, routing, boolean and unknown placeholders retain their behavior", () => {
  const message = "{model}|{provider}|{mode}|{threadRequested}|{visible}|{shortRunId}|{accountId}|{target}|{threadId}|{unknown}";
  assert.equal(build({ ...config, message }, { ...event, sessionUrl: "" }), "model-x|provider-x|run|true|false|run-1234|default|123|456|{unknown}");
});
