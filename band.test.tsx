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

test('手機上畫出剩餘用量', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: {
        limits: [
          { kind: 'five_hour', percentUsed: 27.5 },
          { kind: 'seven_day', percentUsed: 9 },
        ],
        contextPercent: 38,
      },
      version: 1,
    },
  }))
  on('clock.now', () => ({ value: 0 }))

  for (const surface of ['mobile', 'terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /72\.5%/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /91%/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /Context 已用 38%/ })) != null).toBe(true)
    await ui.unmount()
  }
})
