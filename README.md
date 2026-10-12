# OpenClaw Agent Notifications

OpenClaw plugin that sends a short Discord notice when a sub-agent is launched.

The runtime plugin id is `subagent-launch-notice`.

## Install

```bash
openclaw plugins install git:github.com/coccoinomane/openclaw-plugin-agent-notifications@master
```

## Config

```json
{
  "plugins": {
    "entries": {
      "subagent-launch-notice": {
        "enabled": true,
        "config": {
          "channels": ["discord"],
          "silent": true,
          "includeNested": false
        }
      }
    }
  }
}
```

## Options

- `message`: custom notice text for ordinary subagents. A session link is appended automatically when available and not already present in the rendered message.
- `visibleMessage`: notice text for visible spawns (see below).
- `notifyVisible`: also notify for visible spawns. Defaults to `true`.
- `channels`: channel ids where launch notices are enabled. Defaults to `["discord"]`.
- `silent`: send the notice silently when supported. Defaults to `true`.
- `includeNested`: also notify when a sub-agent spawns another sub-agent. Defaults to `false`.

`message` is a small template. Supported placeholders:

- `{agent}`: `label` when present, otherwise `agentId`.
- `{agentId}`
- `{label}`
- `{mode}`: `run` or `session`.
- `{runId}` / `{shortRunId}`
- `{childSessionKey}` / `{shortChildSessionKey}`
- `{resolvedModel}` / `{model}`
- `{resolvedProvider}` / `{provider}`
- `{threadRequested}`
- `{channel}`
- `{target}`
- `{threadId}`
- `{sessionUrl}`: authenticated Control UI URL of the child session, when available.

Example:

```json
{
  "message": "🦞 Sottoagente avviato: `{agent}`\nModello: `{resolvedModel}` · modalità: `{mode}` · run: `{shortRunId}`"
}
```

## Session links for ordinary subagents

Ordinary `subagent_spawned` notices now link to the existing child session.
Set `gateway.publicOrigin` to the Gateway's bare external HTTP(S) origin and
keep the Control UI enabled. `gateway.controlUi.basePath` is respected. The
plugin reads the current runtime config, so public-origin hot reloads do not
require replacing the plugin instance.

The link uses OpenClaw's canonical session-path SDK helper and the exact
`childSessionKey`. It contains no Gateway credentials; the recipient still
needs normal Gateway access. An ordinary subagent remains view-only and keeps
its original lifetime/cleanup behavior: opening a link does not make it a
persistent visible session. A link can become unavailable after cleanup.

Existing `message` overrides, including the old plain-text notice, gain an
`Apri sessione` link without a config migration. Templates may place
`{sessionUrl}` themselves; the same rendered URL is not appended twice.
If the public origin is absent, the Control UI is disabled, or the optional
SDK helpers are unavailable, a useful text notice is still delivered.

This is notification-only enrichment. The plugin does not change spawn
parameters (`visible`, `mode`, `thread`, `cleanup`, or completion flags),
create/update sessions, or change routing, filters, silence, or deduplication.

## Visible spawns

`sessions_spawn` with `visible: true` creates a persistent dashboard session
through `sessions.create` and does not emit `subagent_spawned`. For these
spawns the plugin listens to `after_tool_call` on the `sessions_spawn` tool and
sends `visibleMessage` instead of `message`.

Extra placeholders for `visibleMessage`:

- `{sessionUrl}`: Control UI URL returned in the visible-spawn receipt. When the Control UI is
  disabled and no URL is returned, masked links `[text](<{sessionUrl}>)` collapse
  to `text` and any other line containing `{sessionUrl}` is dropped.
- `{ownerLabel}`: label of the session owner.

`{resolvedModel}`, `{resolvedProvider}` and `{threadRequested}` are empty for
visible spawns, because the tool result does not include them. Default:

```json
{
  "visibleMessage": "🦞 [Sottoagente avviato](<{sessionUrl}>): `{agent}`"
}
```

## Tests

`npm test` runs dependency-free unit and notifier regression tests. The two
optional real-SDK checks are enabled by `OPENCLAW_SDK_INTEGRATION=1` when
`openclaw` is resolvable from the checkout. They verify canonical cross-agent
paths, reverse-proxy prefixes and unchanged hook registration without sending
messages, creating sessions or writing Gateway config.

## What the plugin does not cover

The plugin sends a notice only when a sub-agent is spawned. A parent turn that
ends with `sessions_yield` sends nothing to the channel: text the model writes
between tool calls stays private, and OpenClaw logs `visible channel turn
dispatched with no queued reply payloads`. If a sub-agent was spawned in that
turn, the user sees this plugin's notice. If the agent yields without spawning
in the same turn, for example while waiting for a child launched earlier, the
user sees nothing.

For that case, and to stop the agent from repeating the notice, add a rule to
the agent's `AGENTS.md`, for example:

```markdown
- The `subagent-launch-notice` plugin announces sub-agent launches (including
  `visible` ones, with the session link): do not repeat that notice yourself.
  Pass `acknowledgment` to `sessions_yield` only when you end a turn from an
  interactive channel without having spawned a sub-agent in that turn; one
  concrete sentence, no generic "working on it" text.
```
