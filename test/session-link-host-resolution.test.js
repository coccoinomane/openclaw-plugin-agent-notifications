import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function createFixture(t, sdk = "complete") {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-notifications-sdk-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginDir = path.join(root, "external-plugin");
  const hostModules = path.join(root, "host-modules");
  mkdirSync(pluginDir);
  writeFileSync(path.join(pluginDir, "package.json"), JSON.stringify({ type: "module" }));
  copyFileSync(new URL("../session-link.js", import.meta.url), path.join(pluginDir, "session-link.js"));
  assert.equal(existsSync(path.join(pluginDir, "node_modules")), false);

  if (sdk !== "absent") {
    const sdkDir = path.join(hostModules, "openclaw");
    mkdirSync(sdkDir, { recursive: true });
    const exports = { "./plugin-sdk/session-discussion": "./session-discussion.js" };
    if (sdk === "complete") exports["./plugin-sdk/config-contracts"] = "./config-contracts.js";
    writeFileSync(path.join(sdkDir, "package.json"), JSON.stringify({ name: "openclaw", type: "module", exports }));
    const initFailure = sdk === "incomplete-broken" ? 'throw new Error("fixture SDK initialization failure");' : "";
    writeFileSync(path.join(sdkDir, "session-discussion.js"), `
      ${initFailure}
      export function buildControlUiSessionPath({ namespace, sessionKey, basePath, exactKey }) {
        if (namespace !== "chat" || exactKey !== true) throw new Error("unexpected SDK arguments");
        const prefix = (basePath || "").endsWith("/") ? basePath.slice(0, -1) : (basePath || "");
        return prefix + "/chat/" + sessionKey.split(":").slice(1).map(encodeURIComponent).join("/");
      }
    `);
    writeFileSync(path.join(sdkDir, "config-contracts.js"), `
      export function resolveGatewayPublicOrigin(config) {
        return new URL(config.gateway.publicOrigin).origin;
      }
    `);
  }
  return { pluginDir, hostModules, moduleUrl: pathToFileURL(path.join(pluginDir, "session-link.js")).href };
}

function runFixture(fixture, code) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    cwd: fixture.pluginDir,
    // NODE_PATH is initialized at process startup, not by an in-process env edit.
    // No inherited loader flags may accidentally resolve the bare ESM imports.
    env: { ...process.env, NODE_PATH: fixture.hostModules, NODE_OPTIONS: "" },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr || child.stdout);
}

const config = { gateway: { publicOrigin: "https://console.example.test", controlUi: { basePath: "/openclaw" } } };
const event = { childSessionKey: "agent:worker:subagent:child with space" };

function probe(fixture, expected, checkBareImports = false) {
  return `
    import assert from "node:assert/strict";
    ${checkBareImports ? `
      await assert.rejects(import("openclaw/plugin-sdk/session-discussion"), { code: "ERR_MODULE_NOT_FOUND" });
      await assert.rejects(import("openclaw/plugin-sdk/config-contracts"), { code: "ERR_MODULE_NOT_FOUND" });
    ` : ""}
    const { createSessionLinkResolver } = await import(${JSON.stringify(fixture.moduleUrl)});
    const warnings = [];
    const resolver = createSessionLinkResolver({ logger: { warn: (message) => warnings.push(message) } });
    const api = { runtime: { config: { current: () => (${JSON.stringify(config)}) } } };
    const event = Object.freeze(${JSON.stringify(event)});
    assert.equal(await resolver(api, event), ${JSON.stringify(expected)});
    assert.equal(await resolver(api, event), ${JSON.stringify(expected)});
    assert.equal(warnings.length, ${expected ? 0 : 1});
    assert.equal(Object.hasOwn(event, "visible"), false);
  `;
}

test("external plugin loads host SDK through NODE_PATH when bare ESM imports cannot resolve it", (t) => {
  const fixture = createFixture(t);
  runFixture(fixture, probe(fixture, "https://console.example.test/openclaw/chat/worker/subagent/child%20with%20space", true));
});

test("external plugin keeps cached text-only fallback when the host SDK is absent", (t) => {
  const fixture = createFixture(t, "absent");
  runFixture(fixture, probe(fixture, ""));
});

test("external plugin keeps cached text-only fallback when an SDK subpath is not exported", (t) => {
  const fixture = createFixture(t, "incomplete");
  runFixture(fixture, probe(fixture, ""));
});

test("missing SDK subpath cannot leave an earlier failing import unhandled", (t) => {
  const fixture = createFixture(t, "incomplete-broken");
  runFixture(fixture, probe(fixture, ""));
});
