// ==UserScript==
// @name         Claude 用量列 (claude.ai)
// @namespace    https://github.com/PAOAO414/claude-mods
// @version      0.1.0
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
  const POS_KEY = 'cub-usage-bar-pos';   // 拖曳後的位置存在 localStorage
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
    const t = d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`;
    return ` (${t} 後重置)`;
  }

  function bar(pct) {
    const n = Math.round(pct / 10);
    return '█'.repeat(n) + '░'.repeat(10 - n);
  }

  function level(pct) {
    return pct > 30 ? 'ok' : pct > 10 ? 'warn' : 'bad';
  }

  function fmtPct(p) {
    return (Math.round(p * 10) / 10) + '%';
  }

  // ---------- 畫面 ----------
  const css = `
#${BAR_ID}{position:fixed;z-index:2147483000;bottom:6px;right:12px;
  font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  padding:4px 10px;border-radius:8px;cursor:move;user-select:none;white-space:nowrap;
  background:var(--cub-bg);color:var(--cub-fg);border:1px solid var(--cub-bd);
  box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;gap:14px;align-items:center;
  --cub-bg:#ffffffee;--cub-fg:#3d3d3a;--cub-bd:#e5e3dc;
  --cub-ok:#2f855a;--cub-warn:#b7791f;--cub-bad:#c53030;--cub-mute:#8a8a85}
@media (prefers-color-scheme: dark){#${BAR_ID}{
  --cub-bg:#262624ee;--cub-fg:#e8e6df;--cub-bd:#3d3d3a;
  --cub-ok:#68d391;--cub-warn:#f6e05e;--cub-bad:#fc8181;--cub-mute:#8a8a85}}
#${BAR_ID} .ok{color:var(--cub-ok)} #${BAR_ID} .warn{color:var(--cub-warn)}
#${BAR_ID} .bad{color:var(--cub-bad)} #${BAR_ID} .mute{color:var(--cub-mute)}
#${BAR_ID} .x{cursor:pointer;color:var(--cub-mute);padding-left:2px}
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
    el.title = '點一下立即更新；拖曳可移動；× 隱藏到重新整理';
    restorePos(el);
    makeDraggable(el);
    document.body.appendChild(el);
    return el;
  }

  function seg(label, v) {
    if (!v) return `<span class="mute">${label} —</span>`;
    const lv = level(v.remain);
    return `<span>${label} 剩 <span class="${lv}">${bar(v.remain)} ${fmtPct(v.remain)}</span>` +
      `<span class="mute">${fmtReset(v.resetsAt)}</span></span>`;
  }

  let hidden = false;
  let last = null;

  function render(state) {
    if (hidden) return;
    const el = ensureBar();
    let html;
    if (state.error) {
      html = `<span class="mute">用量讀取失敗（${state.error}）</span>`;
    } else if (!state.data) {
      html = `<span class="mute">用量讀取中…</span>`;
    } else {
      html = seg('5小時', state.data.five) + seg('7天', state.data.seven);
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

  // ---------- 拖曳與位置 ----------
  function restorePos(el) {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && typeof p.left === 'number') {
        el.style.left = Math.min(p.left, innerWidth - 60) + 'px';
        el.style.top = Math.min(p.top, innerHeight - 24) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    } catch (_) { /* localStorage 不可用就用預設位置 */ }
  }

  function makeDraggable(el) {
    let sx, sy, ox, oy, moved = false;
    el.addEventListener('mousedown', e => {
      if (e.target.dataset.x) return;
      const r = el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; moved = false;
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (!moved) return;
        el.style.left = Math.max(0, ox + dx) + 'px';
        el.style.top = Math.max(0, oy + dy) + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
      };
      const up = () => {
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', up);
        if (moved) {
          const r2 = el.getBoundingClientRect();
          try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r2.left, top: r2.top })); } catch (_) {}
        }
      };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
    el.addEventListener('click', e => {
      if (e.target.dataset.x) { hidden = true; el.remove(); return; }
      if (!moved) refresh();
    });
    el.addEventListener('dblclick', () => {
      try { localStorage.removeItem(POS_KEY); } catch (_) {}
      el.style.left = el.style.top = ''; el.style.right = '12px'; el.style.bottom = '6px';
    });
  }

  // ---------- 啟動 ----------
  render({ data: null });
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(() => { if (last && !hidden) render(last); }, 30 * 1000); // 倒數與被 SPA 移除時補回
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
