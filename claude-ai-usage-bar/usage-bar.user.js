// ==UserScript==
// @name         Claude 用量列 (claude.ai)
// @namespace    https://github.com/PAOAO414/claude-mods
// @version      0.4.0
// @description  在 claude.ai 一般對話頁面顯示 5 小時／7 天限額的剩餘 %
// @match        https://claude.ai/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/PAOAO414/claude-mods/main/claude-ai-usage-bar/usage-bar.user.js
// @downloadURL  https://raw.githubusercontent.com/PAOAO414/claude-mods/main/claude-ai-usage-bar/usage-bar.user.js
// ==/UserScript==

(function () {
  'use strict';

  const REFRESH_MS = 60 * 1000;          // 每 60 秒更新一次
  const OLD_POS_KEY = 'cub-usage-bar-pos'; // v0.2 以前拖曳存的位置，啟動時清掉
  const BAR_ID = 'cub-usage-bar';

  // ---------- 資料 ----------
  // 注意：/api/organizations/{id}/usage 是 claude.ai 網頁自己用的內部 API，
  // 不是公開文件，Anthropic 改版時可能失效。
  let orgId = null;

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function getOrgId() {
    if (orgId) return orgId;
    orgId = getCookie('lastActiveOrg');
    if (orgId) return orgId;
    const r = await fetch('/api/organizations', { credentials: 'include' });
    if (!r.ok) throw new Error('organizations HTTP ' + r.status);
    const orgs = await r.json();
    const chat = orgs.find(o => (o.capabilities || []).includes('chat')) || orgs[0];
    if (!chat) throw new Error('找不到組織');
    orgId = chat.uuid;
    return orgId;
  }

  async function fetchUsage() {
    const id = await getOrgId();
    const r = await fetch('/api/organizations/' + id + '/usage', { credentials: 'include' });
    if (!r.ok) {
      if (r.status === 403 || r.status === 404) orgId = null; // 換帳號／組織時重抓
      throw new Error('usage HTTP ' + r.status);
    }
    const d = await r.json();
    console.debug('[claude 用量列] raw', d);
    return {
      five: pick(d.five_hour),
      seven: pick(d.seven_day),
    };
  }

  function pick(o) {
    if (!o || typeof o.utilization !== 'number') return null;
    const used = Math.min(100, Math.max(0, o.utilization));
    return { remain: 100 - used, resetsAt: o.resets_at ? new Date(o.resets_at) : null };
  }

  // ---------- 格式 ----------
  function fmtReset(date) {
    if (!date || isNaN(date)) return '';
    let s = Math.max(0, Math.round((date - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60);
    return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`;
  }

  function bar(pct) {
    // 5 格，每格 20%；還有剩就至少顯示 1 格，避免 5% 看起來像 0
    const n = pct > 0 ? Math.max(1, Math.round(pct / 20)) : 0;
    return '█'.repeat(n) + '░'.repeat(5 - n);
  }

  function level(pct) {
    return pct > 30 ? 'ok' : pct > 10 ? 'warn' : 'bad';
  }

  function fmtPct(p) {
    return Math.round(p) + '%';
  }

  // ---------- 畫面 ----------
  const css = `
#${BAR_ID}{position:fixed;z-index:2147483000;bottom:6px!important;right:12px!important;top:auto!important;left:auto!important;
  font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  padding:4px 10px;border-radius:8px;cursor:pointer;user-select:none;white-space:nowrap;
  background:var(--cub-bg);color:var(--cub-fg);border:1px solid var(--cub-bd);
  box-shadow:0 1px 4px rgba(0,0,0,.12);
  display:grid;grid-template-columns:repeat(4,auto) 14px;column-gap:8px;row-gap:1px;align-items:center;
  --cub-bg:#ffffffee;--cub-fg:#3d3d3a;--cub-bd:#e5e3dc;
  --cub-ok:#2f855a;--cub-warn:#b7791f;--cub-bad:#c53030;--cub-mute:#8a8a85}
@media (prefers-color-scheme: dark){#${BAR_ID}{
  --cub-bg:#262624ee;--cub-fg:#e8e6df;--cub-bd:#3d3d3a;
  --cub-ok:#68d391;--cub-warn:#f6e05e;--cub-bad:#fc8181;--cub-mute:#8a8a85}}
#${BAR_ID} .ok{color:var(--cub-ok)} #${BAR_ID} .warn{color:var(--cub-warn)}
#${BAR_ID} .bad{color:var(--cub-bad)} #${BAR_ID} .mute{color:var(--cub-mute)}
#${BAR_ID} .r{text-align:right;font-variant-numeric:tabular-nums}
#${BAR_ID} .full{grid-column:1/5}
#${BAR_ID} .x{grid-column:5;grid-row:1;cursor:pointer;color:var(--cub-mute);text-align:right}
#${BAR_ID} .x:hover{color:var(--cub-fg)}
`;

  function ensureBar() {
    let el = document.getElementById(BAR_ID);
    if (el) return el;
    if (!document.getElementById(BAR_ID + '-css')) {
      const st = document.createElement('style');
      st.id = BAR_ID + '-css';
      st.textContent = css;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = BAR_ID;
    el.title = '點一下立即更新；× 隱藏到重新整理';
    el.addEventListener('click', e => {
      if (e.target.dataset.x) { hidden = true; el.remove(); return; }
      refresh();
    });
    document.body.appendChild(el);
    return el;
  }

  // 一行 = 4 格：標籤｜長條｜百分比(靠右)｜重置倒數；CSS grid 讓上下兩行對齊
  function row(label, v) {
    if (!v) return `<span>${label}</span><span class="mute" style="grid-column:2/5">—</span>`;
    const lv = level(v.remain);
    return `<span>${label}</span><span class="${lv}">${bar(v.remain)}</span>` +
      `<span class="${lv} r">${fmtPct(v.remain)}</span><span class="mute">${fmtReset(v.resetsAt)}</span>`;
  }

  let hidden = false;
  let last = null;

  function render(state) {
    if (hidden) return;
    const el = ensureBar();
    let html;
    if (state.error) {
      html = `<span class="mute full">用量讀取失敗（${state.error}）</span>`;
    } else if (!state.data) {
      html = `<span class="mute full">用量讀取中…</span>`;
    } else {
      html = row('5h', state.data.five) + row('7d', state.data.seven);
    }
    el.innerHTML = html + '<span class="x" data-x="1">×</span>';
  }

  async function refresh() {
    if (hidden) return;
    try {
      last = { data: await fetchUsage() };
    } catch (e) {
      last = { error: e.message || String(e), data: null };
      console.warn('[claude 用量列]', e);
    }
    render(last);
  }

  // ---------- 啟動 ----------
  try { localStorage.removeItem(OLD_POS_KEY); } catch (_) {}
  render({ data: null });
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(() => { if (last && !hidden) render(last); }, 30 * 1000); // 倒數與被 SPA 移除時補回
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
