import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'unity-status',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, bodyColumns: 80, view: {} },
} as const

const PROJECT_VERSION = 'm_EditorVersion: 6000.0.23f1\nm_EditorVersionWithRevision: 6000.0.23f1 (1c4764c07fb4)\n'
const REPLY = '{"result":"UNITYSTATUS:6000.0.23f1|StandaloneOSX"}'
const NO_EDITOR = '{"success":false}'

type On = Parameters<Parameters<typeof test>[1]>[1]

// The world beneath the mod: a project folder, the unity CLI, toasts and the engine's empty band.
// `editor.isUp` says whether an Editor answers right now; tests flip it.
function world(on: On, opts: { isUnity: boolean; isUp: boolean; hold?: Promise<void> }) {
  const editor = { isUp: opts.isUp }
  const runs: string[][] = []
  const toasts: string[] = []
  on('fs.read', () => {
    if (!opts.isUnity) throw new Error('ENOENT')
    return { value: PROJECT_VERSION }
  })
  on('process.run', async (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    runs.push([...argv])
    if (opts.hold !== undefined && argv.includes('eval')) await opts.hold
    const stdout =
      argv[0] === '/bin/sh' ? '/usr/local/bin/unity\n' : argv.includes('eval') ? (editor.isUp ? REPLY : NO_EDITOR) : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'unity-status' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return { editor, runs, toasts }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: outside a Unity project nothing shows and nothing probes`, async ($, on) => {
    const clock = mock.clock(on)
    const { runs } = world(on, { isUnity: false, isUp: true })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    await $.tool.call({ tool: 'Bash', command: 'unity status' })
    await clock.settle()

    expect(runs.length).toBe(0)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  })

  test(`${surface}: startup animates, then offers Connect on the right`, async ($, on) => {
    const clock = mock.clock(on)
    world(on, { isUnity: true, isUp: false })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface })

    // Before the startup check has run: the spinner, and no Connect yet.
    const glyph = await ui.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ })
    expect(glyph?.text).toBe('· ')
    expect(await ui.find({ type: 'Text', text: 'I' })).not.toBe(undefined)
    expect(await ui.find({ type: 'Button', key: 'connect' })).toBe(undefined)

    await clock.settle()

    expect((await ui.find({ type: 'Text', text: /Unity 6000/ }))?.text).toBe('Unity 6000.0.23f1')
    expect(await ui.find({ type: 'Button', key: 'connect' })).not.toBe(undefined)

    const actions = await ui.find({ type: 'Box', key: 'actions' })
    expect(actions).not.toBe(undefined)
    await ui.unmount()
  })

  test(`${surface}: Connect reaches an Editor opened after startup`, async ($, on) => {
    const clock = mock.clock(on)
    const { editor, toasts } = world(on, { isUnity: true, isUp: false })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    await clock.settle()
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /StandaloneOSX/ })).toBe(undefined)

    editor.isUp = true
    await ui.press({ key: 'connect' })
    await clock.settle()

    expect((await ui.find({ type: 'Text', text: /StandaloneOSX/ }))?.text).toBe('StandaloneOSX')
    expect(toasts).toEqual(['Unity connected for this session (Unity 6000.0.23f1, StandaloneOSX)'])

    await ui.press({ key: 'hide' })
    expect(await ui.find({ type: 'Text', text: /Unity 6000/ })).toBe(undefined)
    await ui.unmount()
  })
}

test('an Editor already open at startup connects with no press', async ($, on) => {
  const clock = mock.clock(on)
  const { toasts } = world(on, { isUnity: true, isUp: true })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /StandaloneOSX/ }))?.text).toBe('StandaloneOSX')
  expect(toasts.length).toBe(1)
  await ui.unmount()
})

test('the spinner moves while a check runs and stops once idle', async ($, on) => {
  const clock = mock.clock(on)
  // Hold the startup probe so the band stays busy while the clock moves.
  let release = () => {}
  const hold = new Promise<void>(r => (release = r))
  world(on, { isUnity: true, isUp: false, hold })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const first = (await ui.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ }))?.text

  await clock.advance(120)
  const second = (await ui.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ }))?.text
  expect(second).not.toBe(first)

  release()
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ })).toBe(undefined)
  expect(await ui.find({ type: 'Button', key: 'connect' })).not.toBe(undefined)
  await ui.unmount()
})

test('Connect with no Editor open runs unity open, then connects once it answers', async ($, on) => {
  const clock = mock.clock(on)
  const { editor, runs, toasts } = world(on, { isUnity: true, isUp: false })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'connect' })
  await clock.settle()

  expect(runs.some(argv => argv.includes('open') && argv.includes('/proj'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'O' })).not.toBe(undefined)

  editor.isUp = true
  await clock.advance(10000)

  expect((await ui.find({ type: 'Text', text: /StandaloneOSX/ }))?.text).toBe('StandaloneOSX')
  expect(toasts.length).toBe(1)
  await ui.unmount()
})

test("Claude's own unity-cli call connects without a press, and only once", async ($, on) => {
  const clock = mock.clock(on)
  const { editor, toasts } = world(on, { isUnity: true, isUp: false })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.settle()

  editor.isUp = true
  await $.tool.call({ tool: 'Bash', command: 'unity status --json' })
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'unity command editor_play' })
  await clock.settle()

  expect(toasts.length).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /StandaloneOSX/ }))?.text).toBe('StandaloneOSX')
  await ui.unmount()
})
