import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)

const NAMES: Record<string, string> = {
  five_hour: '5小時',
  seven_day: '7天',
  spend_limit: '額度',
}

function bar(remaining: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((remaining / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function untilReset(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const min = Math.round(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return ` (${d}d${h}h 後重置)`
  if (h > 0) return ` (${h}h${m}m 後重置)`
  return ` (${m}m 後重置)`
}

function color(remaining: number): string {
  if (remaining <= 10) return 'red'
  if (remaining <= 30) return 'yellow'
  return 'green'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const u = await $.session.usage()
    const s: Snapshot = { limits: u.rateLimits.map(l => ({ ...l })), contextPercent: u.context.percent }
    await update($, snapshot, () => s)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const s: Snapshot = { limits: e.rateLimits.map(l => ({ ...l })), contextPercent: e.context.percent }
    await update($, snapshot, () => s)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    if (!s || (s.limits.length === 0 && s.contextPercent === undefined)) {
      return (
        <Box>
          <Text dimColor>剩餘用量：等待第一次回應後顯示…</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {s.limits.map((l: Limit) => {
          const remaining = Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)
          return (
            <Text key={l.kind}>
              <Text dimColor>{NAMES[l.kind] ?? l.kind} 剩 </Text>
              <Text color={color(remaining)}>
                {bar(remaining)} {remaining}%
              </Text>
              <Text dimColor>{untilReset(l.resetsAt, now)}</Text>
            </Text>
          )
        })}
        {s.limits.length === 0 ? <Text dimColor>（非訂閱帳號，無限額資料）</Text> : null}
        {s.contextPercent !== undefined ? (
          <Text key="ctx" dimColor>
            Context 已用 {s.contextPercent}%
          </Text>
        ) : null}
      </Box>
    )
  })
}
