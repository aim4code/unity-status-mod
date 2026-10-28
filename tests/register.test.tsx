import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'unity-status',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, bodyColumns: 80, view: {} },
} as const

const PROJECT_VERSION = 'm_EditorVersion: 6000.0.23f1\nm_EditorVersionWithRevision: 6000.0.23f1 (1c4764c07fb4)\n'

type On = Parameters<Parameters<typeof test>[1]>[1]

// The world beneath the mod: a project folder, the unity CLI and the engine's empty band.
// `editor.platform` is what an open Editor reports; null means no Editor answers. Tests change it.
function world(on: On, opts: { isUnity: boolean; platform: string | null }) {
  const editor = { platform: opts.platform }
  const runs: string[][] = []
  on('fs.read', () => {
    if (!opts.isUnity) throw new Error('ENOENT')
    return { value: PROJECT_VERSION }
  })
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    runs.push([...argv])
    const reply = editor.platform === null ? '{"success":false}' : `{"result":"UNITYSTATUS:${editor.platform}"}`
    const stdout = argv[0] === '/bin/sh' ? '/usr/local/bin/unity\n' : argv.includes('eval') ? reply : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', () => ({ value: { command: 'unity-status' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return { editor, runs }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: outside a Unity project nothing shows and nothing probes`, async ($, on) => {
    const clock = mock.clock(on)
    const { runs } = world(on, { isUnity: false, platform: 'StandaloneOSX' })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    await $.tool.call({ tool: 'Bash', command: 'unity status' })
    await $.prompt.submit({ text: 'hello' })
    await clock.settle()

    expect(runs.length).toBe(0)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  })

  test(`${surface}: startup checks, then offers Connect on the right`, async ($, on) => {
    const clock = mock.clock(on)
    world(on, { isUnity: true, platform: null })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Checking for Unity/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Button', key: 'connect' })).toBe(undefined)

    await clock.settle()

    expect((await ui.find({ type: 'Text', text: /Unity 6000/ }))?.text).toBe('Unity 6000.0.23f1')
    expect(await ui.find({ type: 'Text', text: /Checking/ })).toBe(undefined)
    expect(await ui.find({ type: 'Button', key: 'connect' })).not.toBe(undefined)
    expect(await ui.find({ type: 'Box', key: 'actions' })).not.toBe(undefined)
    await ui.unmount()
  })

  test(`${surface}: Connect reaches an Editor opened after startup; Hide hides`, async ($, on) => {
    const clock = mock.clock(on)
    const { editor } = world(on, { isUnity: true, platform: null })

    await $.session.start({ cwd: '/proj', surface, isInteractive: true })
    await clock.settle()
    const ui = await $.ui.mount({ ...BAND, surface })

    editor.platform = 'StandaloneOSX'
    await ui.press({ key: 'connect' })
    await clock.settle()

    expect(await ui.find({ type: 'Text', text: /StandaloneOSX/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Button', key: 'connect' })).toBe(undefined)

    await ui.press({ key: 'hide' })
    expect(await ui.find({ type: 'Text', text: /Unity 6000/ })).toBe(undefined)
    await ui.unmount()
  })
}

test('an Editor already open at startup shows its platform with no press', async ($, on) => {
  const clock = mock.clock(on)
  world(on, { isUnity: true, platform: 'StandaloneOSX' })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /StandaloneOSX/ })).not.toBe(undefined)
  await ui.unmount()
})

test('Connect with no Editor open runs unity open, then connects once it answers', async ($, on) => {
  const clock = mock.clock(on)
  const { editor, runs } = world(on, { isUnity: true, platform: null })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'connect' })
  await clock.settle()

  expect(runs.some(argv => argv.includes('open') && argv.includes('/proj'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /Opening Unity/ })).not.toBe(undefined)

  // A prompt sent while Unity opens does not cut the wait short.
  await $.prompt.submit({ text: 'still waiting?' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /Opening Unity/ })).not.toBe(undefined)

  editor.platform = 'Android'
  await clock.advance(10000)

  expect(await ui.find({ type: 'Text', text: /Android/ })).not.toBe(undefined)
  await ui.unmount()
})

test("Claude's unity-cli calls recheck: the band follows the platform and a closed Editor", async ($, on) => {
  const clock = mock.clock(on)
  const { editor } = world(on, { isUnity: true, platform: 'StandaloneOSX' })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  editor.platform = 'iOS'
  await $.tool.call({ tool: 'Bash', command: 'unity command switch_platform iOS' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /iOS/ })).not.toBe(undefined)

  editor.platform = null
  await $.tool.call({ tool: 'Bash', command: 'unity status' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /iOS/ })).toBe(undefined)
  expect(await ui.find({ type: 'Button', key: 'connect' })).not.toBe(undefined)
  await ui.unmount()
})

test('sending a prompt rechecks, and the prompt goes through unchanged', async ($, on) => {
  const clock = mock.clock(on)
  const { editor } = world(on, { isUnity: true, platform: null })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'connect' })).not.toBe(undefined)

  // Unity was opened by hand.
  editor.platform = 'WebGL'
  const sent = await $.prompt.submit({ text: 'build it' })
  expect(sent).toEqual({ text: 'build it' })
  await clock.settle()

  expect(await ui.find({ type: 'Text', text: /WebGL/ })).not.toBe(undefined)
  await ui.unmount()
})

test('a client attaching rechecks', async ($, on) => {
  const clock = mock.clock(on)
  const { editor } = world(on, { isUnity: true, platform: 'StandaloneOSX' })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  editor.platform = 'Android'
  await $.session.attach({ surface: 'desktop', clientId: 'c1' })
  await clock.settle()

  expect(await ui.find({ type: 'Text', text: /Android/ })).not.toBe(undefined)
  await ui.unmount()
})
