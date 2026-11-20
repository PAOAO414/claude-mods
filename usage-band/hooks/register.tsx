import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Limit, Snapshot } from '../types'

// shape 標記：欄位變動時更換，舊版存下的值會被丟棄
const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null, { shape: 'snapshot-2' })
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
// 每個指標已提醒過的等級（0 / 80 / 90，以「已用 %」計）
const warned = atom({ plugin: 'usage-band', key: 'warned' } as const, {})

const NAMES: Record<string, string> = {
  five_hour: '5小時',
  seven_day: '7天',
  spend_limit: '額度',
}

function toSnapshot(context: SessionContextUsage, rateLimits: SessionRateLimit[], cost?: SessionCost): Snapshot {
  return {
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    usd: cost?.usd,
  }
}

function bar(fraction: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((fraction / 100) * width)))
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

// 限額以「剩餘 %」上色
function remainingColor(remaining: number): string {
  if (remaining <= 10) return 'error'
  if (remaining <= 30) return 'warning'
  return 'success'
}

// context 以「已用 %」上色
function usedColor(used: number): string | undefined {
  if (used >= 90) return 'error'
  if (used >= 80) return 'warning'
  return undefined
}

function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}

// 每個指標跨過 已用 80%、90% 時各提醒一次；回落後可再次提醒
async function remember($: EngineInterface, s: Snapshot) {
  await update($, snapshot, () => s)
  const metrics: [string, string, number | undefined][] = [
    ['context', 'Context 已用', s.contextPercent],
    ...s.limits.map(l => [l.kind, `${NAMES[l.kind] ?? l.kind} 剩`, l.percentUsed] as [string, string, number]),
  ]
  const seen = await read($, warned)
  const levels: Record<string, number> = { ...seen }
  for (const [key, label, used] of metrics) {
    if (used === undefined) continue
    const level = used >= 90 ? 90 : used >= 80 ? 80 : 0
    if (level > (seen[key] ?? 0)) {
      const shown = key === 'context' ? Math.round(used) : Math.max(0, Math.round((100 - used) * 10) / 10)
      $.ui.toast(`用量提醒：${label} ${shown}%`)
    }
    levels[key] = level
  }
  await update($, warned, () => levels)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-band', description: '顯示／隱藏輸入框上方的用量列' })
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u.context, u.rateLimits, u.cost))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, toSnapshot(e.context, e.rateLimits, e.cost))
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? '用量列已隱藏，再輸入 /usage-band 可顯示。' : '用量列已顯示。' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const s = await read($, snapshot)
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    if (!s || (s.limits.length === 0 && s.contextPercent === undefined)) {
      return (
        <Box>
          <Text dimColor>剩餘用量：等待第一次回應後顯示…</Text>
        </Box>
      )
    }

    const ctx = s.contextPercent
    const ctxTokens =
      s.contextTokens !== undefined && s.contextWindow ? ` (${kTokens(s.contextTokens)}/${kTokens(s.contextWindow)})` : ''

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {s.limits.map((l: Limit) => {
          const remaining = Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)
          return (
            <Text key={l.kind}>
              <Text dimColor>{NAMES[l.kind] ?? l.kind} 剩 </Text>
              <Text color={remainingColor(remaining)}>
                {bar(remaining)} {remaining}%
              </Text>
              <Text dimColor>{untilReset(l.resetsAt, now)}</Text>
            </Text>
          )
        })}
        {s.limits.length === 0 ? <Text dimColor>（非訂閱帳號，無限額資料）</Text> : null}
        {ctx !== undefined ? (
          <Text key="ctx" color={usedColor(ctx)} dimColor={!usedColor(ctx)}>
            Context 已用 {bar(ctx, 6)} {Math.round(ctx)}%{ctxTokens}
          </Text>
        ) : null}
        {s.usd !== undefined ? (
          <Text key="usd" dimColor>
            花費 ${s.usd.toFixed(2)}
          </Text>
        ) : null}
        <Button key="hide" label="隱藏" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
