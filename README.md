# claude-mods

Claude Code 的自製 mod 集合。

## usage-band

在輸入框上方顯示訂閱方案的剩餘用量：

```
5小時 剩 ███████░░░ 72.5% (2h14m 後重置)   7天 剩 █████████░ 91% (4d3h 後重置)   Context 已用 38%
```

- 剩餘 % = 100 − 已用 %，數據來自每次 API 回應帶回的限額（同 `/status`）
- 綠：剩 > 30%；黃：10–30%；紅：≤ 10%
- 第一次回應前沒有數字；API key 計費（非訂閱）只顯示 context 使用率
- 支援終端機 CLI、Claude Desktop、手機 App；瀏覽器網頁版不畫輸入框上方這一列

## 安裝

在 Claude Code 的輸入框：

```
/plugin install usage-band --marketplace PAOAO0414/claude-mods
```

從 shell：

```bash
claude plugin install usage-band --marketplace PAOAO0414/claude-mods
```

Desktop App（`/plugin` 不能用時）：點輸入框旁的 + → Plugins → Add marketplace 填 `PAOAO0414/claude-mods` → Add plugin。
