import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UnityInfo } from '../types'

const isConnected = atom({ plugin: 'unity-status', key: 'isConnected' } as const, false)
const projectPath = atom({ plugin: 'unity-status', key: 'projectPath' } as const, null)
const info = atom({ plugin: 'unity-status', key: 'info' } as const, null)
const isHidden = atom({ plugin: 'unity-status', key: 'isHidden' } as const, false)

const POLL_MS = 3000

// A Bash command that runs the unity CLI (bare, or by a path ending in /unity).
const RUNS_UNITY = /(?:^|[\s;&|(`'"/])unity(?=\s|$)/
const PROJECT_PATH = /--project-path(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/

// One line from the live Editor: version | build target | compiling | building a player.
const PROBE =
  'return "UNITYSTATUS:" + UnityEngine.Application.unityVersion + "|" + ' +
  'UnityEditor.EditorUserBuildSettings.activeBuildTarget + "|" + ' +
  'UnityEditor.EditorApplication.isCompiling + "|" + ' +
  'UnityEditor.BuildPipeline.isBuildingPlayer;'
const PROBE_LINE = /UNITYSTATUS:([^|"\s]+)\|([^|"\s]+)\|(True|False)\|(True|False)/

let unityBin: string | null = null
let isProbing = false
let poll: { cancel: () => void } | null = null

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

// Asks the Editor for its state; resolves what it answered, or null when it did not.
async function probe($: EngineInterface): Promise<Omit<UnityInfo, 'isResponding'> | null> {
  const bin = await resolveUnity($)
  const path = await read($, projectPath)
  const argv = [bin, '--no-banner', '--non-interactive', '--no-color', 'command', 'eval', PROBE, '--timeout', '8']
  if (path !== null) argv.push('--project-path', path)

  try {
    const ran = await $.process.run(argv, { timeoutMs: 12000 })
    const m = PROBE_LINE.exec(ran.stdout)
    if (m === null) return null

    const [, version = '?', platform = '?', compiling, building] = m

    return { version, platform, isCompiling: compiling === 'True', isBuilding: building === 'True' }
  } catch {
    return null
  }
}

async function refresh($: EngineInterface): Promise<boolean> {
  if (isProbing) return false
  isProbing = true
  try {
    const got = await probe($)
    if (got !== null) {
      await update($, info, () => ({ ...got, isResponding: true }))
    } else {
      await update($, info, prev => (prev === null ? null : { ...prev, isResponding: false }))
    }

    return got !== null
  } finally {
    isProbing = false
  }
}

function startPolling($: EngineInterface) {
  if (poll !== null) return
  poll = $.clock.every(POLL_MS, () => {
    void refresh($)
  })
}

// Claude ran unity-cli; call it connected only once an Editor really answers.
async function connect($: EngineInterface) {
  if (await read($, isConnected)) return
  if (!(await refresh($))) return

  await update($, isConnected, () => true)
  const now = await read($, info)
  $.ui.toast(`Unity connected for this session${now ? ` (Unity ${now.version}, ${now.platform})` : ''}`, {
    timeoutMs: 8000,
  })
  startPolling($)
}

export const register: Register = on => {
  // A reload or a resumed session keeps the state but not the timer.
  on('session.start', async ($, e, next) => {
    if (await read($, isConnected)) startPolling($)

    await $.command.register({
      name: 'unity-status',
      description: 'Shows the Unity status band above the prompt again.',
    })

    return next(e)
  })

  on('command.run', { command: 'unity-status' }, async $ => {
    await update($, isHidden, () => false)
    const connected = await read($, isConnected)

    return {
      text: connected
        ? 'Unity status band shown.'
        : 'Unity status band will show once Claude connects to a Unity Editor through unity-cli.',
    }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!RUNS_UNITY.test(e.command) || (await read($, isConnected))) return ran

    const m = PROJECT_PATH.exec(e.command)
    const path = m?.[1] ?? m?.[2] ?? m?.[3]
    if (path !== undefined) await update($, projectPath, () => path)

    // Off the tool call's own path, so Claude never waits on the probe.
    $.clock.after(0, () => {
      void connect($)
    })

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, info)
    const isQuiet =
      e.props.hasSurvey || !(await read($, isConnected)) || now === null || (await read($, isHidden))

    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    const activity = !now.isResponding
      ? <Text color="warning">Editor busy / not responding</Text>
      : now.isBuilding
        ? <Text color="warning">Building player…</Text>
        : now.isCompiling
          ? <Text color="warning">Compiling scripts…</Text>
          : <Text color="success">Idle</Text>

    return (
      <Box>
        <Text bold>Unity {now.version}</Text>
        <Text dimColor> · </Text>
        <Text>{now.platform}</Text>
        <Text dimColor> · </Text>
        {activity}
        <Text> </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
