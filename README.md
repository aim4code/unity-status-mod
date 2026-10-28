# unity-status-mod

A Claude Code mod that shows the status of the current Unity project session.

## What it does

- **Connection pop-up.** The first time Claude runs a `unity` (unity-cli) command in a session, the mod checks whether a Unity Editor answers. If one does, a pop-up says Unity is connected for this session, with its version and platform. It appears once per session.
- **Status band above the prompt.** Once connected, a band shows:
  `Unity <version> · <active build target> · <status>`
  The status is one of:
  - Idle
  - Compiling scripts…
  - Building player…
  - Editor busy / not responding

  The band refreshes every 3 seconds. While a build or a script reload blocks the Editor, the status usually reads "not responding".
- **Hide button.** Hides the band for the rest of the session. Run `/unity-status` to show it again.

The mod gets its information by running `unity command eval` against the live Editor. If Claude passed `--project-path`, the mod checks that project.

## Requirements

- The Unity CLI (`unity`), on your `PATH` or at `~/.unity/bin/unity`.
- A Unity Editor open on a project that has the Pipeline package installed, so `unity status` lists it.

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
