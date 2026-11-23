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
/plugin install usage-band --marketplace PAOAO414/claude-mods
```

從 shell：

```bash
claude plugin install usage-band --marketplace PAOAO414/claude-mods
```

Desktop App（`/plugin` 不能用時）：點輸入框旁的 + → Plugins → Add marketplace 填 `PAOAO414/claude-mods` → Add plugin。

## claude-ai-usage-bar（一般對話頁面用）

在 **電腦瀏覽器的 claude.ai 一般對話頁面** 右下角固定顯示用量列（Tampermonkey 腳本）：

```
5h  ████░  73%  2h14m  ×
7d  █████  91%  4d3h
```

- 上下兩行（5h＝5 小時限額、7d＝7 天限額），每一欄對齊；長條 5 格、每格 20%；最後一欄是距離重置的時間
- 每 60 秒、切回分頁時自動更新；點一下立即更新
- 固定在畫面右下角，× 隱藏到重新整理
- 顏色規則同 usage-band：綠 > 30%、黃 10–30%、紅 ≤ 10%
- 僅限電腦瀏覽器；Desktop App、手機 App 無法安裝腳本
- 數據來自 claude.ai 網頁自己使用的內部 API（`/api/organizations/{id}/usage`），非公開介面，改版時可能失效

### 安裝

1. Chrome／Edge 安裝 [Tampermonkey](https://www.tampermonkey.net/) 擴充功能
   （Chrome 需在擴充功能頁開啟「開發人員模式」，或在 Tampermonkey 詳細資料中允許使用者腳本）
2. 用瀏覽器開啟下面網址，Tampermonkey 會跳出安裝畫面，按「安裝」：
   `https://raw.githubusercontent.com/PAOAO414/claude-mods/main/claude-ai-usage-bar/usage-bar.user.js`
3. 重新整理 claude.ai
