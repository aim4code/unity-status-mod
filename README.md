# unity-status-mod

A Claude Code mod that shows the status of the current Unity project session.

## What it does

- **Only in Unity projects.** The band above the prompt appears only when the session's folder has `ProjectSettings/ProjectVersion.txt`. Elsewhere the mod shows nothing and does nothing.
- **Before connecting:** `Unity <project version> · ◆ [Connect to Unity] [Hide]`. The version comes from `ProjectVersion.txt`, so it shows with no Editor running.
- **Connect to Unity** first tries to reach an Editor that's already open on the project. If none answers, it runs `unity open <project>` and checks every 5 seconds, for up to 2 minutes, until the Editor answers.
- **Once connected:** `Unity <editor version> · <active platform> [↻] [Hide]`. ↻ re-reads the platform. If the Editor no longer answers, the Connect button comes back.
- **Connection pop-up.** The first connection in a session pops up "Unity connected for this session". A connection Claude makes by running a `unity` command also counts, with no button press needed.
- **Hide** hides the band for the rest of the session. Run `/unity-status` to show it again.

The mod has no background timer. It asks the Editor (with `unity command eval`) only when you press Connect or ↻, after Claude runs a `unity` command, and while it's waiting for a newly opened Editor. If Claude passed `--project-path`, the mod checks that project.

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
