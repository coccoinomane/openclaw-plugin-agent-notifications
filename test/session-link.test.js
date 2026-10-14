import test from "node:test";
import assert from "node:assert/strict";
import { createSessionLinkResolver } from "../session-link.js";

const event = Object.freeze({
  agentId: "worker",
  childSessionKey: "agent:worker:subagent:12345678-1234-4321-8765-123456789012",
});
const config = { gateway: { publicOrigin: "https://console.example.test", controlUi: { basePath: "/openclaw" } } };
const quiet = { warn() {} };
const sdk = {
  resolveGatewayPublicOrigin: (cfg) => new URL(cfg.gateway.publicOrigin).origin,
  buildControlUiSessionPath: ({ namespace, sessionKey, basePath = "" }) =>
    basePath.replace(/\/$/, "") + "/" + namespace + "/" + sessionKey.split(":").slice(1).map(encodeURIComponent).join("/"),
};
const makeResolver = (options = {}) => createSessionLinkResolver({ loadSdk: async () => sdk, logger: quiet, ...options });

test("normal child uses canonical SDK path and runtime config without changing its event", async () => {
  let params;
  const resolver = makeResolver({ loadSdk: async () => ({ ...sdk, buildControlUiSessionPath: (p) => { params = p; return sdk.buildControlUiSessionPath(p); } }) });
  const api = { config: { gateway: { publicOrigin: "https://stale.example.test" } }, runtime: { config: { current: () => config } } };
  const url = await resolver(api, event);
  assert.equal(url, "https://console.example.test/openclaw/chat/worker/subagent/12345678-1234-4321-8765-123456789012");
  assert.deepEqual(params, { namespace: "chat", sessionKey: event.childSessionKey, fallbackAgentId: "worker", basePath: "/openclaw", exactKey: true });
  assert.equal(Object.hasOwn(event, "visible"), false);
});

test("registration config works on hosts without runtime.config.current", async () => {
  assert.equal(await makeResolver()({ config }, event), "https://console.example.test/openclaw/chat/worker/subagent/12345678-1234-4321-8765-123456789012");
});

test("config is read again after hot reload while SDK imports are cached", async () => {
  let cfg = config;
  let loads = 0;
  const resolver = makeResolver({ loadSdk: async () => { loads += 1; return sdk; } });
  const api = { runtime: { config: { current: () => cfg } } };
  assert.match(await resolver(api, event), /^https:\/\/console\.example\.test\/openclaw\//);
  cfg = { gateway: { publicOrigin: "https://new.example.test", controlUi: { basePath: "/new" } } };
  assert.match(await resolver(api, event), /^https:\/\/new\.example\.test\/new\//);
  cfg = { gateway: { publicOrigin: "https://new.example.test", controlUi: { enabled: false } } };
  assert.equal(await resolver(api, event), "");
  assert.equal(loads, 1);
});

test("missing origin, disabled UI and missing identity remain text-only without SDK loads", async () => {
  let loads = 0;
  const resolver = makeResolver({ loadSdk: async () => { loads += 1; return sdk; } });
  assert.equal(await resolver({ config: {} }, event), "");
  assert.equal(await resolver({ config: { gateway: { publicOrigin: config.gateway.publicOrigin, controlUi: { enabled: false } } } }, event), "");
  assert.equal(await resolver({ config }, {}), "");
  assert.equal(loads, 0);
});

test("unsafe or non-bare origins never become notification URLs", async (t) => {
  for (const origin of ["invalid", "javascript:alert(1)", "ftp://console.test", "https://user:secret@console.test", "https://console.test/path", "https://console.test/?token=secret", "https://console.test/#secret"]) {
    await t.test(origin.replace(/secret/g, "redacted"), async () => {
      assert.equal(await makeResolver()({ config: { gateway: { publicOrigin: origin } } }, event), "");
    });
  }
});

test("a valid localhost HTTP origin is supported", async () => {
  assert.match(await makeResolver()({ config: { gateway: { publicOrigin: "http://127.0.0.1:18789" } } }, event), /^http:\/\/127\.0\.0\.1:18789\/chat\//);
});

test("unavailable SDK imports are cached and produce a credential-free warning", async () => {
  const warnings = [];
  let loads = 0;
  const resolver = makeResolver({ loadSdk: async () => { loads += 1; throw new Error("secret from provider"); }, logger: { warn: (text) => warnings.push(text) } });
  assert.equal(await resolver({ config }, event), "");
  assert.equal(await resolver({ config }, event), "");
  assert.equal(loads, 1);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /secret/);
});

test("missing, broken or unsafe SDK results do not prevent a text notice", async (t) => {
  for (const helpers of [null, {}, { ...sdk, resolveGatewayPublicOrigin: () => undefined }, { ...sdk, resolveGatewayPublicOrigin: () => "https://user:secret@console.test" }, { ...sdk, buildControlUiSessionPath: () => null }, { ...sdk, buildControlUiSessionPath: () => "relative" }, { ...sdk, buildControlUiSessionPath: () => { throw new Error("broken path"); } }]) {
    await t.test("optional SDK fallback", async () => {
      assert.equal(await makeResolver({ loadSdk: async () => helpers })({ config }, event), "");
    });
  }
});

test("failed live config does not resurrect a stale registration origin", async () => {
  assert.equal(await makeResolver()({ config, runtime: { config: { current: () => { throw new Error("unavailable"); } } } }, event), "");
});

test("visible receipt URL bypasses config and SDK reads", async () => {
  const resolver = makeResolver({ loadSdk: async () => { throw new Error("must not load"); } });
  assert.equal(await resolver({ runtime: { config: { current: () => { throw new Error("must not read"); } } } }, { ...event, visible: true, sessionUrl: "https://visible.example.test/chat/worker/12345678" }), "https://visible.example.test/chat/worker/12345678");
  assert.equal(await resolver({}, { visible: true }), "");
});
