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
