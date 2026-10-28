## What this changes

<!-- What the band or the mod does differently, and why. Link the issue it closes. -->

## Checklist

- [ ] `claude plugin validate .` and `claude plugin test .` pass locally
- [ ] Each behaviour change has a test in `tests/register.test.tsx`
- [ ] `.claude-plugin/plugin.json` `version` is bumped (patch: fix, minor: feature) if `hooks/`, `types/` or `.claude-plugin/` changed
- [ ] README updated if what users see, or what the mod runs, changed

## Security-sensitive?

Tick each item this PR adds or changes, and explain it below; a maintainer reviews these lines first. Leave a box unticked if this PR doesn't touch it. If none apply, tick the last box.

- [ ] A `$.process.run` / `$.process.spawn` call (new command, new argument, or input reaching an argument)
- [ ] File writes (`$.fs.write`) or anything that changes the user's project
- [ ] Network access (`$.http`)
- [ ] A hook that changes Claude's input or output (`tool.call`, `prompt.submit`, `session.append`, ...) instead of only observing it
- [ ] None of these apply

<!-- If ticked: what runs, with what input, and why it is safe (argv only, no shell; a timeout; only on the user's click if it changes anything). -->
