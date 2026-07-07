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
