# claude-mods

Claude Code 的自製 mod 集合。

## usage-band (v0.2.0)

在輸入框上方顯示訂閱方案的剩餘用量、context 使用率與花費：

```
5小時 剩 ███████░░░ 72.5% (2h14m 後重置)  7天 剩 ██░░░░░░░░ 15% (4d3h 後重置)  Context 已用 ██░░░░ 38% (76k/200k)  花費 $1.23  [隱藏]
```

- **限額**：剩餘 % = 100 − 已用 %，數據來自每次 API 回應帶回的限額（同 `/status`）；綠：剩 > 30%，黃：10–30%，紅：≤ 10%
- **Context**：已用 % 與 token 數；已用 ≥ 80% 變黃、≥ 90% 變紅
- **花費**：本 session 估計花費（同 `/cost`，估計值非實際帳單）
- **提醒**：任一指標「已用」跨過 80%、90% 時各跳一次 toast
- **隱藏**：按列上的「隱藏」，或輸入 `/usage-band` 切換顯示／隱藏
- 第一次回應前沒有數字；API key 計費（非訂閱）不顯示限額
- 支援終端機 CLI、Claude Desktop、VS Code、手機 App；瀏覽器網頁版不畫輸入框上方這一列

## 安裝

在 Claude Code 的輸入框：

```
/plugin install usage-band --marketplace PAOAO414/claude-mods
```

從 shell：

```bash
claude plugin install usage-band --marketplace PAOAO414/claude-mods
```

Desktop App（`/plugin` 不能用時）：點輸入框旁的 + → Plugins → Add marketplace 填 `PAOAO414/claude-mods` → Add plugin。

### 雲端 session 自動啟用

本 repo 的 `.claude/settings.json` 已登記此 marketplace 並啟用 `usage-band`。
在 claude.ai/code 開新雲端 session 時選擇 `PAOAO414/claude-mods`，就會自動載入；
其他專案 repo 想要同樣效果，把該檔內容複製到那個 repo 的 `.claude/settings.json` 即可。
