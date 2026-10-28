import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'unity-status',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, bodyColumns: 80, view: {} },
} as const

function editor(on: Parameters<Parameters<typeof test>[1]>[1], reply: () => string) {
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    const stdout = argv[0] === '/bin/sh' ? '/usr/local/bin/unity\n' : reply()

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // Stands for the engine's own (empty) band.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
}

test('the first working unity-cli call pops a toast and shows the band', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  let compiling = 'False'
  editor(on, () => `{"result":"UNITYSTATUS:6000.0.23f1|StandaloneOSX|${compiling}|False"}`)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'unity-status' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const before = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await before.find({ type: 'Text', text: /Unity/ })).toBe(undefined)
  await before.unmount()

  await $.tool.call({ tool: 'Bash', command: 'unity status --json' })
  await clock.settle()

  expect(toasts).toEqual(['Unity connected for this session (Unity 6000.0.23f1, StandaloneOSX)'])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Unity 6000/ }))?.text).toBe('Unity 6000.0.23f1')
  expect((await ui.find({ type: 'Text', text: /StandaloneOSX/ }))?.text).toBe('StandaloneOSX')
  expect((await ui.find({ type: 'Text', text: /Idle/ }))?.text).toBe('Idle')

  compiling = 'True'
  await clock.advance(3000)
  expect((await ui.find({ type: 'Text', text: /Compiling/ }))?.text).toBe('Compiling scripts…')

  // A second unity call does not announce again.
  await $.tool.call({ tool: 'Bash', command: 'unity command editor_play' })
  await clock.settle()
  expect(toasts.length).toBe(1)

  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /Unity 6000/ })).toBe(undefined)
  await ui.unmount()
})

test('a unity call with no Editor answering stays quiet', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  editor(on, () => '{"success":false}')
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'unity-status' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'unity status' })
  await clock.settle()

  expect(toasts).toEqual([])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Unity/ })).toBe(undefined)
  await ui.unmount()
})
