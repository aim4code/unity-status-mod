import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Connection } from '../types'

const projectVersion = atom({ plugin: 'unity-status', key: 'projectVersion' } as const, null)
const projectPath = atom({ plugin: 'unity-status', key: 'projectPath' } as const, null)
const connection = atom({ plugin: 'unity-status', key: 'connection' } as const, 'idle' as Connection)
const editorVersion = atom({ plugin: 'unity-status', key: 'editorVersion' } as const, null)
const platform = atom({ plugin: 'unity-status', key: 'platform' } as const, null)
const isHidden = atom({ plugin: 'unity-status', key: 'isHidden' } as const, false)
const frame = atom({ plugin: 'unity-status', key: 'frame' } as const, 0)

const LAUNCH_POLL_MS = 5000
const LAUNCH_TRIES = 24
const SPINNER_MS = 120

// A Bash command that runs the unity CLI (bare, or by a path ending in /unity).
const RUNS_UNITY = /(?:^|[\s;&|(`'"/])unity(?=\s|$)/
const PROJECT_PATH = /--project-path(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/
const EDITOR_VERSION = /^m_EditorVersion:\s*(\S+)/m

// One line from the live Editor: version | active build target.
const PROBE =
  'return "UNITYSTATUS:" + UnityEngine.Application.unityVersion + "|" + ' +
  'UnityEditor.EditorUserBuildSettings.activeBuildTarget;'
const PROBE_LINE = /UNITYSTATUS:([^|"\s]+)\|([^|"\s]+)/

// A simple cube mark, drawn for this mod.
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14">' +
  '<path fill="currentColor" d="M12 2 21 7v10l-9 5-9-5V7zm0 2.3L5.2 8.1 12 12l6.8-3.9zM5 9.8v6l6 3.4v-6zm14 0-6 3.4v6l6-3.4z"/>' +
  '</svg>'

// Claude's spinner glyphs, played forward then back.
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽']
const GLYPH_CYCLE = [...GLYPHS, ...GLYPHS.slice(1, -1).reverse()]
const SHIMMER_WIDTH = 3

const BUSY_LABEL: Partial<Record<Connection, string>> = {
  initializing: 'Initializing Unity status mod…',
  connecting: 'Connecting to Unity…',
  launching: 'Opening Unity…',
}

let unityBin: string | null = null
let projectRoot = '.'
let isProbing = false
let waiting: { cancel: () => void } | null = null
let spinner: { cancel: () => void } | null = null

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

// Asks the Editor for its version and platform; true when it answered.
async function probe($: EngineInterface): Promise<boolean> {
  if (isProbing) return false
  isProbing = true
  try {
    const bin = await resolveUnity($)
    const path = (await read($, projectPath)) ?? projectRoot
    const argv = [bin, '--no-banner', '--non-interactive', '--no-color', 'command', 'eval', PROBE]
    argv.push('--timeout', '8', '--project-path', path)

    const ran = await $.process.run(argv, { timeoutMs: 12000 })
    const m = PROBE_LINE.exec(ran.stdout)
    if (m === null) return false

    const [, version = '?', target = '?'] = m
    await update($, editorVersion, () => version)
    await update($, platform, () => target)

    return true
  } catch {
    return false
  } finally {
    isProbing = false
  }
}

function startSpinner($: EngineInterface) {
  if (spinner !== null) return
  spinner = $.clock.every(SPINNER_MS, () => {
    void update($, frame, n => n + 1)
  })
}

function stopSpinner() {
  spinner?.cancel()
  spinner = null
}

// Every state change goes through here, so the spinner runs exactly while a check does.
async function setConnection($: EngineInterface, state: Connection) {
  await update($, connection, () => state)
  if (BUSY_LABEL[state] !== undefined) startSpinner($)
  else stopSpinner()
}

async function markConnected($: EngineInterface) {
  const was = await read($, connection)
  await setConnection($, 'connected')
  if (was === 'connected') return

  const version = await read($, editorVersion)
  const target = await read($, platform)
  $.ui.toast(`Unity connected for this session (Unity ${version}, ${target})`, { timeoutMs: 8000 })
}

// Once at startup: is an Editor already open on the project?
async function initialCheck($: EngineInterface) {
  if (await probe($)) await markConnected($)
  else await setConnection($, 'idle')
}

// Claude ran unity-cli; call it connected only once an Editor really answers.
async function connect($: EngineInterface) {
  if ((await read($, connection)) === 'connected') return
  if (await probe($)) await markConnected($)
}

// The Connect button: reach an open Editor, or open the project and wait for one.
async function launch($: EngineInterface) {
  const state = await read($, connection)
  if (BUSY_LABEL[state] !== undefined) return

  await setConnection($, 'connecting')
  if (await probe($)) {
    await markConnected($)
    return
  }

  await setConnection($, 'launching')
  try {
    const bin = await resolveUnity($)
    const opened = await $.process.run([bin, '--no-banner', '--non-interactive', 'open', projectRoot], {
      timeoutMs: 60000,
    })
    if (opened.exitCode !== 0) {
      await setConnection($, 'failed')
      return
    }
  } catch {
    await setConnection($, 'failed')
    return
  }

  let tries = 0
  waiting?.cancel()
  waiting = $.clock.every(LAUNCH_POLL_MS, () => {
    void waitForEditor($, ++tries)
  })
}

async function waitForEditor($: EngineInterface, tries: number) {
  const answered = await probe($)
  if (!answered && tries < LAUNCH_TRIES) return

  waiting?.cancel()
  waiting = null
  if (answered) await markConnected($)
  else await setConnection($, 'failed')
}

// The ↻ button: re-read the platform; an Editor that no longer answers drops back to Connect.
async function refresh($: EngineInterface) {
  if (!(await probe($))) await setConnection($, 'idle')
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
      description: 'Shows the Unity status band above the prompt again.',
    })

    // A reload drops every timer, so a check that was running starts over.
    if (version !== null && (await read($, connection)) !== 'connected') {
      await setConnection($, 'initializing')
      $.clock.after(0, () => {
        void initialCheck($)
      })
    }

    return next(e)
  })

  on('command.run', { command: 'unity-status' }, async $ => {
    if ((await read($, projectVersion)) === null) {
      return { text: 'This folder is not a Unity project (no ProjectSettings/ProjectVersion.txt).' }
    }
    await update($, isHidden, () => false)

    return { text: 'Unity status band shown.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!RUNS_UNITY.test(e.command) || (await read($, projectVersion)) === null) return ran

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
    const version = await read($, projectVersion)
    if (e.props.hasSurvey || version === null || (await read($, isHidden))) return next(e)

    const state = await read($, connection)
    const isConnected = state === 'connected'
    const busy = BUSY_LABEL[state]

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els

    let left
    if (busy !== undefined) {
      // Glyph and a highlight sweeping across the label, as Claude's own spinner does.
      const step = await read($, frame)
      const glyph = GLYPH_CYCLE[step % GLYPH_CYCLE.length]
      const sweep = (step % (busy.length + SHIMMER_WIDTH * 2)) - SHIMMER_WIDTH
      left = (
        <Box>
          <Text color="claude">{glyph} </Text>
          <Text>
            {[...busy].map((ch, i) =>
              i >= sweep && i < sweep + SHIMMER_WIDTH ? <Text color="claude">{ch}</Text> : <Text dimColor>{ch}</Text>,
            )}
          </Text>
        </Box>
      )
    } else {
      const shown = isConnected ? ((await read($, editorVersion)) ?? version) : version
      // The terminal draws no Svg.
      const logo =
        'Svg' in els ? <els.Svg source={LOGO} alt="Unity" width={14} height={14} /> : <Text color="claude">◆</Text>
      left = (
        <Box>
          <Text bold>Unity {shown}</Text>
          <Text dimColor> · </Text>
          {isConnected ? <Text>{await read($, platform)}</Text> : logo}
          {state === 'failed' ? <Text dimColor> Couldn't reach Unity</Text> : null}
        </Box>
      )
    }

    return (
      <Box width={e.props.bodyColumns} flexDirection="row" flexWrap="nowrap" justifyContent="space-between">
        {left}
        <Box key="actions" flexShrink={0}>
          {isConnected ? <Button key="refresh" label="↻" onPress={() => refresh($)} /> : null}
          {busy === undefined && !isConnected ? (
            <Button key="connect" label="Connect to Unity" onPress={() => $.clock.after(0, () => void launch($))} />
          ) : null}
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
