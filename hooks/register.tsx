import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Connection } from '../types'

const projectVersion = atom({ plugin: 'unity-status', key: 'projectVersion' } as const, null)
const projectPath = atom({ plugin: 'unity-status', key: 'projectPath' } as const, null)
const connection = atom({ plugin: 'unity-status', key: 'connection' } as const, 'idle' as Connection)
const platform = atom({ plugin: 'unity-status', key: 'platform' } as const, null)
const isHidden = atom({ plugin: 'unity-status', key: 'isHidden' } as const, false)

const LAUNCH_POLL_MS = 5000
const LAUNCH_TRIES = 24

// A Bash command that runs the unity CLI (bare, or by a path ending in /unity).
const RUNS_UNITY = /(?:^|[\s;&|(`'"/])unity(?=\s|$)/
const PROJECT_PATH = /--project-path(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/
const EDITOR_VERSION = /^m_EditorVersion:\s*(\S+)/m

// Asks the live Editor for its active build target, behind a marker to find it in the output.
const PROBE = 'return "UNITYSTATUS:" + UnityEditor.EditorUserBuildSettings.activeBuildTarget;'
const PROBE_LINE = /UNITYSTATUS:([A-Za-z0-9_]+)/

const STATUS: Partial<Record<Connection, string>> = {
  checking: 'Checking for Unity…',
  launching: 'Opening Unity…',
  failed: "Couldn't reach Unity",
}

let unityBin: string | null = null
let projectRoot = '.'
let inFlight: Promise<string | null> | null = null
let waiting: { cancel: () => void } | null = null

async function resolveUnity($: EngineInterface): Promise<string> {
  if (unityBin !== null) return unityBin
  const found = await $.process.run([
    '/bin/sh',
    '-c',
    'command -v unity || { [ -x "$HOME/.unity/bin/unity" ] && echo "$HOME/.unity/bin/unity"; }',
  ])
  const bin = found.stdout.trim().split('\n')[0] || 'unity'
  unityBin = bin

  return bin
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
    const path = (await read($, projectPath)) ?? projectRoot
    const ran = await $.process.run(
      [bin, '--no-banner', '--non-interactive', '--no-color', 'command', 'eval', PROBE, '--timeout', '8', '--project-path', path],
      { timeoutMs: 12000 },
    )

    return PROBE_LINE.exec(ran.stdout)?.[1] ?? null
  } catch {
    return null
  }
}

async function setConnection($: EngineInterface, state: Connection, target: string | null = null) {
  await update($, platform, () => target)
  await update($, connection, () => state)
}

// One look at the Editor: connected with its platform, or back to the Connect button.
async function check($: EngineInterface) {
  const target = await probe($)
  // Connect's own flow owns the band while it opens Unity.
  if ((await read($, connection)) === 'launching') return
  await setConnection($, target === null ? 'idle' : 'connected', target)
}

// Runs a check off the caller's path, so no prompt, tool call or command waits on it.
function recheck($: EngineInterface) {
  $.clock.after(0, () => {
    void check($)
  })
}

// The Connect button: reach an open Editor, or open the project and wait for one.
async function launch($: EngineInterface) {
  await setConnection($, 'checking')
  const target = await probe($)
  if (target !== null) return setConnection($, 'connected', target)

  await setConnection($, 'launching')
  try {
    const bin = await resolveUnity($)
    const opened = await $.process.run([bin, '--no-banner', '--non-interactive', 'open', projectRoot], {
      timeoutMs: 60000,
    })
    if (opened.exitCode !== 0) return setConnection($, 'failed')
  } catch {
    return setConnection($, 'failed')
  }

  let tries = 0
  waiting?.cancel()
  waiting = $.clock.every(LAUNCH_POLL_MS, () => {
    void waitForEditor($, ++tries)
  })
}

async function waitForEditor($: EngineInterface, tries: number) {
  const target = await probe($)
  if (target === null && tries < LAUNCH_TRIES) return

  waiting?.cancel()
  waiting = null
  await setConnection($, target === null ? 'failed' : 'connected', target)
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
      await setConnection($, 'checking')
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

    const m = PROJECT_PATH.exec(e.command)
    const path = m?.[1] ?? m?.[2] ?? m?.[3]
    if (path !== undefined) await update($, projectPath, () => path)
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
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
