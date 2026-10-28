import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Connection } from '../types'

const projectVersion = atom({ plugin: 'unity-status', key: 'projectVersion' } as const, null)
const connection = atom({ plugin: 'unity-status', key: 'connection' } as const, 'idle' as Connection)
const platform = atom({ plugin: 'unity-status', key: 'platform' } as const, null)
const isHidden = atom({ plugin: 'unity-status', key: 'isHidden' } as const, false)

const WATCH_MS = 5000
// 10 minutes of watching an Editor that is opening or starting, then give up.
const WATCH_TRIES = 120

// A Bash command that runs the unity CLI (bare, or by a path ending in /unity).
const RUNS_UNITY = /(?:^|[\s;&|(`'"/])unity(?=\s|$)/
// Only a plain version string from the project's file reaches the band.
const EDITOR_VERSION = /^m_EditorVersion:[ \t]*([0-9A-Za-z._-]{1,32})[ \t]*$/m
// Absolute, so a `lsof` in the project folder or early on PATH is never the one run.
const LSOF = ['/usr/sbin/lsof', '/usr/bin/lsof']

// Asks the live Editor for its active build target, behind a marker to find it in the output.
const PROBE = 'return "UNITYSTATUS:" + UnityEditor.EditorUserBuildSettings.activeBuildTarget;'
const PROBE_LINE = /UNITYSTATUS:([A-Za-z0-9_]+)/

const STATUS: Partial<Record<Connection, string>> = {
  checking: 'Checking for Unity…',
  launching: 'Opening Unity…',
  starting: 'Unity is starting…',
  'no-pipeline': 'Open, no Pipeline package',
  installing: 'Installing Pipeline…',
  'safe-mode': 'Open in Safe Mode (compile errors)',
  failed: "Couldn't reach Unity",
}

type Look = { state: Connection; target?: string }

let unityBin: string | null = null
let projectRoot = '.'
let inFlight: Promise<string | null> | null = null
let watching: { cancel: () => void } | null = null

// The unity CLI's absolute path: its default install first, then PATH. A relative answer
// (a `unity` in the current folder) is never taken.
async function resolveUnity($: EngineInterface): Promise<string> {
  if (unityBin !== null) return unityBin
  const found = await $.process.run([
    '/bin/sh',
    '-c',
    '[ -x "$HOME/.unity/bin/unity" ] && echo "$HOME/.unity/bin/unity" || command -v unity',
  ])
  const bin = found.stdout.trim().split('\n')[0] ?? ''
  if (!bin.startsWith('/')) throw new Error('unity CLI not found')
  unityBin = bin

  return bin
}

// Whether an Editor has the project open: Unity holds Temp/UnityLockfile while it runs.
// null where lsof is not there to ask.
async function isOpen($: EngineInterface): Promise<boolean | null> {
  for (const lsof of LSOF) {
    try {
      const ran = await $.process.run([lsof, '-t', '--', `${projectRoot}/Temp/UnityLockfile`], { timeoutMs: 5000 })

      return ran.exitCode === 0 && ran.stdout.trim() !== ''
    } catch {
      // Not at this path; try the next.
    }
  }

  return null
}

// The Editor's active platform, or null when no Editor answers. Callers that overlap share one run.
function probe($: EngineInterface): Promise<string | null> {
  inFlight ??= runProbe($).finally(() => {
    inFlight = null
  })

  return inFlight
}

async function runProbe($: EngineInterface): Promise<string | null> {
  try {
    const bin = await resolveUnity($)
    const ran = await $.process.run(
      [bin, '--no-banner', '--non-interactive', '--no-color', 'command', 'eval', PROBE, '--timeout', '8', '--project-path', projectRoot],
      { timeoutMs: 12000 },
    )

    return PROBE_LINE.exec(ran.stdout)?.[1] ?? null
  } catch {
    return null
  }
}

// An open Editor that does not answer: no Pipeline package, Safe Mode, or still starting.
async function whyUnreachable($: EngineInterface): Promise<Connection> {
  try {
    const bin = await resolveUnity($)
    const ran = await $.process.run([bin, '--json', '--no-banner', '--non-interactive', 'pipeline', 'list'], {
      timeoutMs: 12000,
    })
    const path = projectRoot.replace(/\/+$/, '')
    const instances: { projectPath?: string; hasPipelinePackage?: boolean; safeMode?: unknown }[] =
      JSON.parse(ran.stdout)?.data?.instances ?? []
    const mine = instances.find(i => i.projectPath?.replace(/\/+$/, '') === path)
    if (mine?.hasPipelinePackage === false) return 'no-pipeline'
    if (mine?.safeMode) return 'safe-mode'
  } catch {
    // Can't tell why; treat it as still starting.
  }

  return 'starting'
}

// One look at the project: closed, connected, or open and why it doesn't answer.
async function look($: EngineInterface): Promise<Look> {
  const open = await isOpen($)
  if (open === false) return { state: 'idle' }
  const target = await probe($)
  if (target !== null) return { state: 'connected', target }
  if (open === null) return { state: 'idle' }

  return { state: await whyUnreachable($) }
}

async function apply($: EngineInterface, { state, target }: Look) {
  await update($, platform, () => target ?? null)
  await update($, connection, () => state)
}

// One check, unless a watch already owns the band; an Editor still starting gets watched.
async function check($: EngineInterface) {
  if (watching !== null) return
  const seen = await look($)
  if (watching !== null || (await read($, connection)) === 'installing') return
  await apply($, seen)
  if (seen.state === 'starting') watch($)
}

// Runs a check off the caller's path, so no prompt, tool call or command waits on it.
function recheck($: EngineInterface) {
  $.clock.after(0, () => {
    void check($)
  })
}

// Every 5 seconds until the Editor answers, can't (no Pipeline, Safe Mode), closes, or 10 minutes pass.
function watch($: EngineInterface) {
  watching?.cancel()
  let tries = 0
  // After `unity open`, the lock takes a moment to appear; until then "not open" is not "closed".
  let hasOpened = false
  watching = $.clock.every(WATCH_MS, () => {
    void (async () => {
      tries += 1
      const seen = await look($)
      if (seen.state !== 'idle') hasOpened = true
      const isWaiting =
        seen.state === 'starting' || (seen.state === 'idle' && !hasOpened && (await read($, connection)) === 'launching')
      if (isWaiting && tries < WATCH_TRIES) return

      watching?.cancel()
      watching = null
      await apply($, isWaiting ? { state: 'failed' } : seen)
    })()
  })
}

// The Connect button: reach the Editor that has the project open, or open it and wait.
async function launch($: EngineInterface) {
  await apply($, { state: 'checking' })
  const seen = await look($)
  if (seen.state !== 'idle') {
    await apply($, seen)
    if (seen.state === 'starting') watch($)
    return
  }

  await apply($, { state: 'launching' })
  try {
    const bin = await resolveUnity($)
    const opened = await $.process.run([bin, '--no-banner', '--non-interactive', 'open', projectRoot], {
      timeoutMs: 60000,
    })
    if (opened.exitCode !== 0) return apply($, { state: 'failed' })
  } catch {
    return apply($, { state: 'failed' })
  }
  watch($)
}

// The Install Pipeline button: add the package, then watch while Unity imports it.
async function installPipeline($: EngineInterface) {
  await apply($, { state: 'installing' })
  try {
    const bin = await resolveUnity($)
    const ran = await $.process.run(
      [bin, '--no-banner', '--non-interactive', 'pipeline', 'install', '--project-path', projectRoot],
      { timeoutMs: 120000 },
    )
    if (ran.exitCode !== 0) return apply($, { state: 'no-pipeline' })
  } catch {
    return apply($, { state: 'no-pipeline' })
  }
  await apply($, { state: 'starting' })
  watch($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    let version: string | null = null
    try {
      const text = await $.fs.read(`${e.cwd}/ProjectSettings/ProjectVersion.txt`)
      version = EDITOR_VERSION.exec(text)?.[1] ?? null
    } catch {
      version = null
    }
    await update($, projectVersion, () => version)

    await $.command.register({
      name: 'unity-status',
      description: 'Shows the Unity status band above the prompt and checks Unity again.',
    })

    // A reload drops every timer, so whatever was running starts over from one check.
    if (version !== null) {
      await apply($, { state: 'checking' })
      recheck($)
    }

    return next(e)
  })

  on('command.run', { command: 'unity-status' }, async $ => {
    if ((await read($, projectVersion)) === null) {
      return { text: 'This folder is not a Unity project (no ProjectSettings/ProjectVersion.txt).' }
    }
    await update($, isHidden, () => false)
    recheck($)

    return { text: 'Unity status band shown; checking Unity again.' }
  })

  // The nearest signals to "the person is looking at this session": a prompt they send, a client attaching.
  on('prompt.submit', async ($, e, next) => {
    if ((await read($, projectVersion)) !== null) recheck($)

    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    if ((await read($, projectVersion)) !== null) recheck($)

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!RUNS_UNITY.test(e.command) || (await read($, projectVersion)) === null) return ran

    // Always this session's own project, whatever path the command named.
    recheck($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const version = await read($, projectVersion)
    if (e.props.hasSurvey || version === null || (await read($, isHidden))) return next(e)

    const state = await read($, connection)
    const target = await read($, platform)
    const status = STATUS[state]
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box width={e.props.bodyColumns} flexWrap="nowrap" justifyContent="space-between">
        <Box>
          <Text bold>Unity {version}</Text>
          {state === 'connected' ? <Text> · {target}</Text> : null}
          {status === undefined ? null : <Text dimColor> · {status}</Text>}
        </Box>
        <Box key="actions" flexShrink={0}>
          {state === 'idle' || state === 'failed' ? (
            <Button key="connect" label="Connect to Unity" onPress={() => $.clock.after(0, () => void launch($))} />
          ) : null}
          {state === 'no-pipeline' ? (
            <Button
              key="install"
              label="Install Pipeline"
              onPress={() => $.clock.after(0, () => void installPipeline($))}
            />
          ) : null}
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
