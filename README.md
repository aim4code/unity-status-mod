# unity-status-mod

A Claude Code mod that shows the status of the current Unity project session.

## What it does

A one-line band above the prompt, shown only when the session's folder is a Unity project (it has `ProjectSettings/ProjectVersion.txt`). Elsewhere the mod shows nothing and does nothing.

| When | Left | Right |
|---|---|---|
| Checking (startup, or after Connect) | `Unity 6000.0.23f1 · Checking for Unity…` | `[Hide]` |
| No Editor open | `Unity 6000.0.23f1` | `[Connect to Unity] [Hide]` |
| Opening Unity | `Unity 6000.0.23f1 · Opening Unity…` | `[Hide]` |
| Open, still loading | `Unity 6000.0.23f1 · Unity is starting…` | `[Hide]` |
| Open, no Pipeline package | `Unity 6000.0.23f1 · Open, no Pipeline package` | `[Install Pipeline] [Hide]` |
| Installing the package | `Unity 6000.0.23f1 · Installing Pipeline…` | `[Hide]` |
| Open in Safe Mode | `Unity 6000.0.23f1 · Open in Safe Mode (compile errors)` | `[Hide]` |
| Gave up after 10 minutes | `Unity 6000.0.23f1 · Couldn't reach Unity` | `[Connect to Unity] [Hide]` |
| Connected | `Unity 6000.0.23f1 · StandaloneOSX` | `[Hide]` |

- The version comes from `ProjectVersion.txt`, so it shows with no Editor running. The platform is the open Editor's active build target.
- **Whether Unity is open** comes from Unity's own lock: an Editor holds `Temp/UnityLockfile` open while it has the project, which the mod reads with `lsof`. That works for any Editor, with or without the Pipeline package, and whichever session or app launched it.
- **Connect to Unity** never launches a second Editor. If the project is already open, it shows why it can't reach it, or waits for it to finish starting. Only when the project isn't open does it run `unity open <project>`.
- **Install Pipeline** runs `unity pipeline install` for the project, which adds the package to `Packages/manifest.json`. Unity then imports it and the band connects. It only runs when you press it.
- While Unity is opening or starting, the band checks every 5 seconds. It stops once the Editor answers, can't answer (no Pipeline package, Safe Mode), closes, or 10 minutes pass. No state is left stuck.
- **Hide** hides the band for the rest of the session. `/unity-status` shows it again and checks Unity.

### Keeping it current

There's no background timer apart from the 5-second watch above. The mod checks Unity at startup and again, without delaying anything, whenever:

- you send a prompt,
- a client such as the desktop app attaches to the session,
- Claude runs a `unity` command, or
- you run `/unity-status`.

So a platform switch, or an Editor opened or closed from anywhere, including another session on the same project, shows up the next time you send something. If Claude passed `--project-path`, the mod checks that project.

## Requirements

- The Unity CLI (`unity`), on your `PATH` or at `~/.unity/bin/unity`.
- `lsof` (built into macOS and most Linux systems) to tell whether the project is open. Without it, the mod can only see an Editor that answers.
- For the platform: the project needs the Pipeline package, which the band offers to install.

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
