import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 40,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('畫出剩餘用量、context、花費，並在跨過門檻時提醒一次', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: 0 }))

  await $.session.measure({
    context: { tokens: 76000, window: 200000, percent: 38 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 27.5 },
      { kind: 'seven_day', percentUsed: 85 },
    ],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  for (const surface of ['mobile', 'terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /72\.5%/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /15%/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /Context 已用 .* 38% \(76k\/200k\)/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /花費 \$1\.23/ })) != null).toBe(true)
    await ui.unmount()
  }

  // 7天已用 85% → 一次提醒；再量一次同樣數值不重複提醒
  await $.session.measure({
    context: { tokens: 76000, window: 200000, percent: 38 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 86 }],
    changed: ['rateLimits'],
  })
  expect(toasts).toEqual(['用量提醒：7天 剩 15%'])
})

test('/usage-band 可隱藏、再輸入一次可顯示', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: 0 }))
  await $.session.measure({
    context: { window: 200000, percent: 5 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 10 }],
    changed: ['context', 'rateLimits'],
  })

  const hidden = await $.command.run({ command: 'usage-band', args: '' } as never)
  expect(hidden.text).toContain('已隱藏')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /90%/ })) == null).toBe(true)
  await ui.unmount()

  await $.command.run({ command: 'usage-band', args: '' } as never)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /90%/ })) != null).toBe(true)
  await ui.unmount()
})

test('舊版存下的資料會被丟棄，不會壞掉', async ($, on) => {
  // 只回答 snapshot：舊版（無 shape 標記）存下的格式
  on('state.get', ($, e, next) =>
    (e as { key?: string }).key === 'snapshot'
      ? { value: { value: { limits: [{ kind: 'five_hour', percentUsed: 10 }], contextPercent: 5 }, version: 1 } }
      : next(e),
  )
  on('clock.now', () => ({ value: 0 }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /等待第一次回應/ })) != null).toBe(true)
  await ui.unmount()
})
