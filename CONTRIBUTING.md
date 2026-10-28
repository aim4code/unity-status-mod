# Contributing to unity-status

Thanks for helping. The mod runs commands on people's machines, inside their Claude Code sessions, so changes are reviewed with that in mind. This page says how to work on it and what a change needs before it can merge.

## Set up

1. Fork the repository and clone your fork.
2. Install Claude Code 2.1.309 or newer (`claude --version`) and the Unity CLI.
3. Run the mod from your clone, in a session started from a Unity project folder:

   ```bash
   cd /path/to/a/unity/project
   claude --plugin-dir /path/to/your/unity-status-mod
   ```

   An interactive session reloads the mod when you save a file. If a hook fails, the transcript shows a dim line with the reason. `claude --debug` logs more detail.

4. Check your work:

   ```bash
   claude plugin validate .
   claude plugin test .
   ```

   Both run in CI on every pull request, and CI must pass before a pull request can merge.

## How the code is laid out

| Path | What it is |
|---|---|
| `hooks/register.tsx` | The whole mod: the checks, the buttons, the band |
| `types/index.d.ts` | The state the band reads, declared for the type-checker and `claude plugin validate` |
| `tests/register.test.tsx` | Tests against a simulated world (project folder, `lsof`, the unity CLI) |
| `.claude-plugin/plugin.json` | Name and version; `marketplace.json` makes the repo installable |

## Making a change

- Branch off `main` and keep one topic per pull request.
- Add or update a test for every behaviour change. The `world()` helper in the tests simulates Unity opening, closing, gaining the Pipeline package or entering Safe Mode.
- Bump `version` in `.claude-plugin/plugin.json` whenever `hooks/`, `types/` or `.claude-plugin/` changes. Use a patch bump for fixes and a minor bump for features. CI checks this, because `claude plugin update` only picks up a higher version.
- Update `README.md` if what users see changes, or if what the mod runs changes.
- Fill in the pull request template, including the security-sensitive section.

## The security bar

Every pull request is reviewed against these rules. A change that breaks one needs a strong reason, written in the pull request.

1. **Argv only, no shell.** Call `$.process.run([...])` with a fixed argument list. Never build a shell string or pass outside input to `/bin/sh -c`.
2. **Only this session's project.** The project path is the session's own folder. Never take a path from Claude's commands, files in the repo, or other outside text.
3. **Absolute executables.** Reach `lsof`, `unity` and other tools by absolute paths, never through a relative or project-local path.
4. **A timeout on every process**, and every timer bounded. No polling without an end.
5. **Nothing changes the user's project or machine without their click.** Checks that run by themselves must be read-only.
6. **Observe, don't rewrite.** Hooks on Claude's own events (`tool.call`, `prompt.submit`) pass `next(e)` through unchanged, and the mod's own work runs off-path (`$.clock.after`).
7. **Show only constrained text from outside.** Anything from a project file or a command's output is matched against a strict pattern before the band shows it.
8. **No network, secrets or telemetry** of the mod's own.

## Reviews and merging

- `main` is what every user installs, so it only changes through a reviewed pull request with green CI. A maintainer (see `.github/CODEOWNERS`) approves, and changes merge as a squash.
- For a first-time contributor, a maintainer approves the CI run before it starts.
- Releases (`v*` tags) are made by maintainers only.

## Reporting a vulnerability

Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Taking part means following the [Code of Conduct](CODE_OF_CONDUCT.md).
