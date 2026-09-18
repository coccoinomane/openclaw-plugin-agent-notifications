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

- `message`: custom notice text.
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

Example:

```json
{
  "message": "🦞 Sottoagente avviato: `{agent}`\nModello: `{resolvedModel}` · modalità: `{mode}` · run: `{shortRunId}`"
}
```

## Visible spawns

`sessions_spawn` with `visible: true` creates a persistent dashboard session
through `sessions.create` and does not emit `subagent_spawned`. The plugin
covers that path by observing `after_tool_call` for the `sessions_spawn` tool
and sends `visibleMessage` instead of `message`.

Extra placeholders for `visibleMessage`:

- `{sessionUrl}`: Control UI URL of the new session. When the Control UI is
  disabled and no URL is returned, masked links `[text](<{sessionUrl}>)` collapse
  to `text` and other lines containing it are dropped.
- `{ownerLabel}`: label of the session owner.

`{resolvedModel}`, `{resolvedProvider}` and `{threadRequested}` are not
available on this path. Default:

```json
{
  "visibleMessage": "🦞 [Sottoagente avviato](<{sessionUrl}>): `{agent}`"
}
```

## What the plugin does not cover

The notice is tied to a spawn. A parent turn that ends with `sessions_yield`
sends nothing to the channel on its own: text the model writes between tool
calls stays private, and OpenClaw logs `visible channel turn dispatched with no
queued reply payloads`. When a spawn happened in that turn, this plugin's notice
is what the user sees. When the agent yields *without* spawning in the same turn
(for example while waiting for a child launched earlier), nothing is sent.

To cover that case, and to avoid the agent duplicating the notice, add a rule to
the agent's `AGENTS.md`, for example:

```markdown
- The `subagent-launch-notice` plugin announces sub-agent launches (including
  `visible` ones, with the session link): do not repeat that notice yourself.
  Pass `acknowledgment` to `sessions_yield` only when you end a turn from an
  interactive channel without having spawned a sub-agent in that turn; one
  concrete sentence, no generic "working on it" text.
```
