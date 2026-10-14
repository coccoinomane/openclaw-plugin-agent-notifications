import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createSessionLinkResolver } from "../session-link.js";

const require = createRequire(import.meta.url);
const enabled = process.env.OPENCLAW_SDK_INTEGRATION === "1";

test("real OpenClaw SDK resolves exact cross-agent, prefixed and encoded session URLs", { skip: !enabled }, async () => {
  const { buildControlUiSessionPath } = await import(pathToFileURL(require.resolve("openclaw/plugin-sdk/session-discussion")).href);
  const resolver = createSessionLinkResolver();
  const keys = [
    "agent:worker:subagent:12345678-1234-4321-8765-123456789012",
    "agent:media:subagent:87654321-1234-4321-8765-123456789012",
    "agent:worker:discord:channel:123:thread:456",
    "agent:worker:subagent:name with space",
  ];
  for (const basePath of ["", "/openclaw", "/nested/control/"]) {
    const config = { gateway: { publicOrigin: "https://console.example.test", controlUi: { basePath } } };
    for (const childSessionKey of keys) {
      const event = Object.freeze({ childSessionKey });
      const url = await resolver({ runtime: { config: { current: () => config } } }, event);
      const expected = new URL(config.gateway.publicOrigin);
      expected.pathname = buildControlUiSessionPath({ namespace: "chat", sessionKey: childSessionKey, basePath, exactKey: true });
      assert.equal(url, expected.toString());
      assert.equal(Object.hasOwn(event, "visible"), false);
      assert.equal(new URL(url).username, "");
      assert.equal(new URL(url).password, "");
    }
  }
});

test("real SDK loads the plugin with the same two observational hooks", { skip: !enabled }, async () => {
  const { default: plugin } = await import("../index.js");
  const hooks = [];
  plugin.register({ logger: { warn() {} }, on: (...args) => hooks.push(args) });
  assert.deepEqual(hooks.map(([name]) => name), ["subagent_spawned", "after_tool_call"]);
  assert.deepEqual(hooks[0][2], { timeoutMs: 1000 });
  assert.deepEqual(hooks[1][2], { matcher: ["sessions_spawn"], timeoutMs: 1000 });
  // No handler is invoked: no session creation, message send or Gateway writes.
});
