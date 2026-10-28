# unity-status

[![CI](https://github.com/aim4code/unity-status-mod/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aim4code/unity-status-mod/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/aim4code/unity-status-mod?sort=semver)](https://github.com/aim4code/unity-status-mod/releases)
[![License: MIT](https://img.shields.io/github/license/aim4code/unity-status-mod)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](https://docs.anthropic.com/en/docs/claude-code)
[![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)](#requirements)

A Claude Code mod that shows your Unity project's status in a band above the prompt: the project's Unity version and, while the Editor is open, its active platform. It also has a button to connect to the Editor, or open it.

```
Unity 6000.0.23f1 · StandaloneOSX                                  [Hide]
```

## What it shows

The band appears only when the session's folder is a Unity project, meaning it has `ProjectSettings/ProjectVersion.txt`. In any other folder the mod shows nothing and does nothing.

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

- **Version:** comes from `ProjectVersion.txt`, so it shows even with no Editor running.
- **Platform:** the open Editor's active build target.
- **Whether Unity is open:** comes from Unity's own lock. An Editor keeps `Temp/UnityLockfile` open while it has the project, and the mod checks that with `lsof`. This works with or without the Pipeline package, and whichever session or app launched the Editor.
- **Connect to Unity** never launches a second Editor. If the project is already open, the band says why it can't reach it, or waits for it to finish starting. Only when the project isn't open does it run `unity open`.
- **Install Pipeline** adds the Pipeline package to the project's `Packages/manifest.json`. Unity then imports it and the band connects.
- **While Unity is opening or starting,** the band checks every 5 seconds. It stops once the Editor answers, can't answer, closes, or 10 minutes pass, so no state is left stuck.
- **Hide** hides the band for the rest of the session. `/unity-status` brings it back and checks again.

### Keeping it current

There's no background polling. Apart from the 5-second watch above, the mod checks Unity at startup, and again whenever:

- you send a prompt,
- a client, such as the desktop app, attaches to the session,
- Claude runs a `unity` command, or
- you run `/unity-status`.

None of these checks delays anything. A platform switch, or an Editor opened or closed from anywhere (including another session on the same project), shows up the next time you send something.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install unity-status --marketplace aim4code/unity-status-mod
```

Answer `y` to add the marketplace, then pick a scope. User scope loads the mod in every session.

From a shell:

```bash
claude plugin install unity-status --marketplace aim4code/unity-status-mod
```

In the Claude desktop app, where `/plugin` doesn't run, click **+** next to the prompt box. Then choose **Plugins**, **Add marketplace** with `aim4code/unity-status-mod`, and **Add plugin**.

### Update

```bash
claude plugin update unity-status
```

Then run `/reload-plugins` in any session that's already open.

## Requirements

- Claude Code 2.1.309 or newer.
- The Unity CLI (`unity`), at `~/.unity/bin/unity` or on your `PATH`.
- `lsof`, which comes with macOS and most Linux systems. It's how the mod tells whether the project is open. On Windows the mod can only see an Editor that answers.
- To show the platform, the project needs the Pipeline package. The band offers to install it.

## What it runs on your machine

**By itself, read-only:** at startup and at the moments listed above, the mod:

- reads `ProjectSettings/ProjectVersion.txt`
- runs `lsof -t` on the project's `Temp/UnityLockfile`, which prints only process IDs
- runs `unity command eval` with a fixed C# expression that returns the active build target
- runs `unity pipeline list`

**Only when you press a button:**

- `unity open <project>` (Connect, and only when the project isn't already open)
- `unity pipeline install` (Install Pipeline, which changes `Packages/manifest.json`)

**Never:**

- shell commands built from outside input
- acting on any project other than the session's own folder, whatever paths appear in Claude's commands
- network requests of its own, stored secrets, or telemetry
- changing Claude's prompts, tool calls or results (it only watches them)

See [SECURITY.md](SECURITY.md) for how to report a problem.

## Contributing

Pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the tests and the security rules every change is reviewed against. Taking part means following the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Daniel Conde Linares
