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

- `{sessionUrl}`: Control UI URL of the new session. Lines containing it are
  dropped when the Control UI is disabled and no URL is returned.
- `{ownerLabel}`: label of the session owner.

`{resolvedModel}`, `{resolvedProvider}` and `{threadRequested}` are not
available on this path. Default:

```json
{
  "visibleMessage": "🦞 Sottoagente avviato: `{agent}`\n-# [Segui la sessione](<{sessionUrl}>)"
}
```
