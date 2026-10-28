# Security policy

## Reporting a vulnerability

Please report security problems **privately**, through GitHub's private vulnerability reporting:

**[Report a vulnerability](https://github.com/aim4code/unity-status-mod/security/advisories/new)**

Don't open a public issue or pull request for a vulnerability. Include what an attacker could do, the steps to reproduce, and the version affected. You'll get an acknowledgement within a week. Fixes are released as a patch version, and the advisory is published once users can update.

## Supported versions

Only the latest release gets fixes. Users update with `claude plugin update unity-status`.

## What the mod does on your machine

This is the scope a report would concern.

**Runs by itself (read-only):** at session start, when you send a prompt, when a client attaches, and after Claude runs a `unity` command:

- reads `ProjectSettings/ProjectVersion.txt` in the session's folder
- runs `lsof -t -- <project>/Temp/UnityLockfile`, which prints only process IDs, to see whether Unity has the project open
- runs `unity command eval` with a fixed, read-only C# expression that returns the active build target
- runs `unity pipeline list`, to tell why an open Editor doesn't answer

**Runs only when you press a button:**

- **Connect to Unity** runs `unity open <project>`, and only when the project isn't already open
- **Install Pipeline** runs `unity pipeline install --project-path <project>`, which adds the Pipeline package to the project's `Packages/manifest.json`

**Never does:**

- run a shell command built from outside input
- act on a project other than the session's own folder
- make network requests of its own, store secrets, or send telemetry
- change Claude's prompts, tool calls or results (it only observes them)

A report about any of these not holding, or about a way to make the mod run something else, is in scope.
