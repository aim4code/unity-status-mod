# unity-status-mod

A Claude Code mod that shows the status of the current Unity project session.

## What it does

A one-line band above the prompt, shown only when the session's folder is a Unity project (it has `ProjectSettings/ProjectVersion.txt`). Elsewhere the mod shows nothing and does nothing.

| When | Left | Right |
|---|---|---|
| Checking (startup, or after Connect) | `Unity 6000.0.23f1 · Checking for Unity…` | `[Hide]` |
| Opening Unity | `Unity 6000.0.23f1 · Opening Unity…` | `[Hide]` |
| No Editor | `Unity 6000.0.23f1` | `[Connect to Unity] [Hide]` |
| Couldn't open one | `Unity 6000.0.23f1 · Couldn't reach Unity` | `[Connect to Unity] [Hide]` |
| Connected | `Unity 6000.0.23f1 · StandaloneOSX` | `[Hide]` |

- The version comes from `ProjectVersion.txt`, so it shows with no Editor running. The platform is the open Editor's active build target.
- **Connect to Unity** first tries to reach an Editor that's already open on the project. If none answers, it runs `unity open <project>` and checks every 5 seconds, for up to 2 minutes.
- **Hide** hides the band for the rest of the session. `/unity-status` shows it again and checks Unity.

### Keeping it current

There's no background timer. The mod asks the Editor (one `unity command eval` call) at startup and again, without delaying anything, whenever:

- you send a prompt,
- a client such as the desktop app attaches to the session,
- Claude runs a `unity` command, or
- you run `/unity-status`.

So a platform switch, or an Editor you opened or closed yourself, shows up the next time you send something. If Claude passed `--project-path`, the mod checks that project.

## Requirements

- The Unity CLI (`unity`), on your `PATH` or at `~/.unity/bin/unity`.
- For the platform: the project needs the Pipeline package installed, so the Unity CLI can reach the Editor while it's open.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install unity-status --marketplace aim4code/unity-status-mod
```

Answer `y` to add the marketplace, then pick a scope. User scope makes the mod load in every session.

From a shell:

```bash
claude plugin install unity-status --marketplace aim4code/unity-status-mod
```

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `aim4code/unity-status-mod`, then **Add plugin**.

This repository is private. Installing works only for people who can read it on GitHub and whose machine already has a git credential for github.com: an SSH key, or `gh auth login` followed by `gh auth setup-git`. The install never prompts for credentials.

## Development

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT. See [LICENSE](LICENSE).
