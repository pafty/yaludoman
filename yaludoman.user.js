// ==UserScript==
// @name         yaludoman — автокрутка Колеса призов
// @namespace    yaludoman
// @version      1.3
// @author       pafty
// @homepageURL  https://github.com/pafty/yaludoman
// @supportURL   https://github.com/pafty/yaludoman/issues
// @description  Панель автокрутки на странице «Колеса призов» Яндекс Маркета
// @match        https://market.yandex.ru/kolesoprizov*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/pafty/yaludoman/main/yaludoman.user.js
// @downloadURL  https://raw.githubusercontent.com/pafty/yaludoman/main/yaludoman.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__kolesoPanel) return;
  window.__kolesoPanel = true;

  const API = '/api/web/market.front.mfPromoLoyalty.MfPromoLoyalty/';
  const LS_KEY = 'koleso-autospin-cfg';
  const DEF = { maxSpins: 100, keepCoins: 0, delayMin: 4, delayMax: 8, muteClck: true };

  // ---------- настройки (запоминаются в браузере) ----------
  let cfg = { ...DEF };
  try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch (e) {}
  const saveCfg = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} };

  // ---------- глушим аналитику clck (её всё равно режет блокировщик) ----------
  if (cfg.muteClck) {
    const isClck = u => /\/clck\//.test(String((u && u.url) || u));
    const _fetch = window.fetch;
    window.fetch = function (i) {
      return isClck(i) ? Promise.resolve(new Response(null, { status: 204 })) : _fetch.apply(this, arguments);
    };
    const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__clck = isClck(u); return _open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () { if (this.__clck) return; return _send.apply(this, arguments); };
    if (navigator.sendBeacon) {
      const _b = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (u, d) => (isClck(u) ? true : _b(u, d));
    }
  }

  // ---------- токен и заголовки ----------
  async function getHeaders() {
    let html = document.documentElement.innerHTML;
    let m = html.match(/"user":\{"sk":"([^"]+)"/);
    if (!m) {
      html = await (await fetch('/kolesoprizov', { credentials: 'include' })).text();
      m = html.match(/"user":\{"sk":"([^"]+)"/);
    }
    if (!m) throw new Error('Не нашёл sk-токен. Вы залогинены?');
    const ver = (html.match(/"-version":"([^"]+-desktop[^"]*)"/) || [])[1];
    return {
      'content-type': 'application/json',
      'accept-language': 'ru',
      'sk': m[1],
      'x-market-apphost-target': 'PROMOLOYALTY',
      'x-market-page-id': 'market:fortune-wheel',
      'x-requested-with': 'XMLHttpRequest',
      'x-retpath-y': 'https://market.yandex.ru/kolesoprizov',
      ...(ver ? { 'x-market-app-version': ver } : {}),
    };
  }

  // ---------- UI ----------
  const css = `
    #kz{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;
      font:13px/1.35 -apple-system,system-ui,sans-serif;color:#1a1a1a;background:#fff;
      border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden}
    #kz header{display:flex;align-items:center;justify-content:space-between;
      padding:10px 12px;background:#1a1a1a;color:#fff;cursor:move;user-select:none}
    #kz header b{font-size:14px}
    #kz header button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer;padding:0 4px}
    #kz .body{padding:10px 12px}
    #kz .row{display:flex;gap:8px;margin-bottom:8px}
    #kz label{flex:1;display:flex;flex-direction:column;gap:2px;font-size:11px;color:#666}
    #kz input[type=number]{width:100%;box-sizing:border-box;padding:5px 6px;border:1px solid #ccc;border-radius:6px;font-size:13px;background:#fff;color:#000}
    #kz .chk{flex-direction:row;align-items:center;gap:6px;font-size:12px;color:#333;margin-bottom:8px}
    #kz .settings{display:none;padding-bottom:4px;margin-bottom:8px;border-bottom:1px solid #eee}
    #kz.cfg .settings{display:block}
    #kz.cfg [data-a="cfg"]{opacity:1}
    #kz [data-a="cfg"]{opacity:.6}
    #kz .toggle{display:block;width:100%;margin-bottom:8px;padding:14px 0;border:0;border-radius:10px;
      font-size:17px;font-weight:700;cursor:pointer;background:#fc0;color:#000;transition:background .15s}
    #kz .toggle:hover{filter:brightness(.96)}
    #kz .toggle.on{background:#2b2b2b;color:#fff}
    #kz .toggle:disabled{opacity:.5;cursor:default}
    #kz .stat{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
    #kz .log{height:150px;overflow:auto;background:#f6f6f6;border-radius:8px;padding:6px;font:11px/1.4 ui-monospace,Menlo,monospace}
    #kz .log div.w{color:#c33}
    #kz .r-coin{color:#8a3ffc;font-weight:600}
    #kz .r-leg{color:#e8a200;font-weight:800;font-size:12.5px;padding:2px 4px;margin:2px 0;border-radius:5px;
      background:linear-gradient(90deg,#fff3c4,#ffe27a,#fff3c4);text-shadow:0 0 6px rgba(255,190,0,.8);
      box-shadow:0 0 8px rgba(255,190,0,.7);animation:kzglow 1.2s ease-in-out infinite alternate}
    @keyframes kzglow{from{box-shadow:0 0 4px rgba(255,190,0,.5)}to{box-shadow:0 0 14px rgba(255,170,0,1)}}
    #kz td.r-leg{animation:none;box-shadow:none}
    #kz .tabs{display:flex;gap:10px;font-size:12px;margin-bottom:4px}
    #kz .tabs a{cursor:pointer;color:#888}
    #kz .tabs a.on{color:#000;font-weight:600}
    #kz table{width:100%;border-collapse:collapse;font:inherit}
    #kz td{padding:2px 0;border-bottom:1px solid #e6e6e6}
    #kz td:last-child{text-align:right;width:30px}
    #kz.min .body{display:none}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.id = 'kz';
  box.innerHTML = `
    <header><b>🎡 Автокрутка</b><span><button data-a="cfg" title="Настройки">⚙</button><button data-a="min" title="Свернуть">–</button></span></header>
    <div class="body">
      <div class="settings">
      <div class="row">
        <label>Круток<input type="number" min="1" data-k="maxSpins"></label>
        <label>Оставить монет<input type="number" min="0" data-k="keepCoins"></label>
      </div>
      <div class="row">
        <label>Пауза от, с<input type="number" min="1" step="0.5" data-k="delayMin"></label>
        <label>до, с<input type="number" min="1" step="0.5" data-k="delayMax"></label>
      </div>
      <label class="chk"><input type="checkbox" data-k="muteClck"> Глушить ошибки clck (после перезагрузки)</label>
      </div>
      <button class="toggle" data-a="toggle">▶ Вращать</button>
      <div class="stat"><span>Монет: <b data-s="coins">—</b></span><span>Круток: <b data-s="done">0</b></span><span>Статус: <b data-s="status">ждёт</b></span></div>
      <div class="tabs"><a class="on" data-t="log">Лог</a><a data-t="sum">Итоги</a><a data-a="csv">CSV ⤓</a></div>
      <div class="log" data-v="log"></div>
      <div class="log" data-v="sum" style="display:none"><table></table></div>
    </div>`;
  document.body.appendChild(box);

  const $ = s => box.querySelector(s);
  const setStat = (k, v) => { $(`[data-s="${k}"]`).textContent = v; };

  box.querySelectorAll('[data-k]').forEach(inp => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!cfg[k]; else inp.value = cfg[k];
    inp.addEventListener('change', () => {
      cfg[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
      saveCfg();
    });
  });

  // перетаскивание
  (() => {
    const h = $('header'); let sx, sy, ox, oy;
    h.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      const r = box.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      const mv = ev => { box.style.left = ox + ev.clientX - sx + 'px'; box.style.top = oy + ev.clientY - sy + 'px'; box.style.right = box.style.bottom = 'auto'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
  })();

  const logEl = $('[data-v="log"]');
  // редкость приза: обычная (скидки/промокоды), монеты (фиолетовый), легендарная (золото)
  function rarity(title, id) {
    const t = `${title} ${id || ''}`.toLowerCase();
    if (/монет|coins?_|coin_reward/.test(t)) return 'coin';
    if (/скидк|промокод|кешбэк|кэшбэк|баллы|%|discount|promo|cashback/.test(t)) return 'common';
    return 'leg';
  }

  function log(text, warn, cls) {
    const d = document.createElement('div');
    if (warn) d.className = 'w';
    else if (cls) d.className = cls;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    (warn ? console.warn : console.log)('[koleso]', text);
  }

  const prizes = {};
  const history = [];
  function renderSum() {
    const rows = Object.entries(prizes).sort((a, b) => b[1] - a[1]);
    $('[data-v="sum"] table').innerHTML = rows.length
      ? rows.map(([t, n]) => `<tr><td></td><td>${n}</td></tr>`).join('')
      : '<tr><td>Пока пусто</td><td></td></tr>';
    $('[data-v="sum"] table').querySelectorAll('tr').forEach((tr, i) => {
      if (!rows[i]) return;
      tr.firstChild.textContent = rows[i][0];
      const r = rarity(rows[i][0]);
      if (r !== 'common') tr.firstChild.className = r === 'coin' ? 'r-coin' : 'r-leg';
    });
  }

  box.querySelectorAll('[data-t]').forEach(a => a.addEventListener('click', () => {
    box.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === a));
    box.querySelectorAll('[data-v]').forEach(v => { v.style.display = v.dataset.v === a.dataset.t ? '' : 'none'; });
    if (a.dataset.t === 'sum') renderSum();
  }));

  function exportCsv() {
    if (!history.length) return log('Нечего выгружать', true);
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['n;time;prize;id;coins', ...history.map(h => [h.n, h.time, h.title, h.id, h.coins].map(esc).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `koleso-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
  }

  // ---------- логика круток ----------
  let running = false, stopFlag = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function refreshBalance(headers) {
    try {
      const r = await fetch(API + 'resolveFortuneWheelBalance', {
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ path: '/kolesoprizov', params: {} }),
      });
      const c = (await r.json())?.result?.badge?.coins;
      if (c != null) setStat('coins', c);
    } catch (e) {}
  }

  async function run() {
    if (running) return;
    running = true; stopFlag = false;
    const btn = $('[data-a="toggle"]');
    btn.classList.add('on'); btn.textContent = '⏹ Стоп'; btn.disabled = false;
    setStat('status', 'крутит');
    let headers;
    try { headers = await getHeaders(); } catch (e) { log(e.message, true); return finish('ошибка'); }

    const max = Math.max(1, cfg.maxSpins | 0);
    const dMin = Math.max(1, +cfg.delayMin) * 1000;
    const dMax = Math.max(dMin, +cfg.delayMax * 1000);
    log(`▶ Старт: до ${max} круток, оставить ${cfg.keepCoins} монет`);

    for (let i = 1; i <= max && !stopFlag; i++) {
      let j;
      try {
        const r = await fetch(API + 'resolveFortuneWheelSpin', {
          method: 'POST', credentials: 'include', headers,
          body: JSON.stringify({ path: '/kolesoprizov', params: { wheelId: 'default_wheel' } }),
        });
        if (!r.ok) { log(`HTTP ${r.status} — стоп`, true); break; }
        j = await r.json();
      } catch (e) { log('Ошибка сети — стоп', true); break; }

      const s = j?.result?.spinResponse;
      if (!s || s.type !== 'success') { log('Неожиданный ответ сервера — стоп', true); console.warn('[koleso]', j); break; }

      const title = s.reward?.title || s.reward?.id || '???';
      prizes[title] = (prizes[title] || 0) + 1;
      const n = history.length + 1;
      history.push({ n, time: new Date().toLocaleTimeString(), title, id: s.reward?.id, coins: s.coins });
      setStat('coins', s.coins); setStat('done', n);
      const r = rarity(title, s.reward?.id);
      if (r === 'leg') log(`★★★ #${n} ${title} ★★★`, false, 'r-leg');
      else log(`#${n} ${title}`, false, r === 'coin' ? 'r-coin' : '');

      const cost = j?.result?.wheelResponse?.spinCost ?? 10;
      if (s.needRefresh) { log('Сервер просит обновить страницу — стоп', true); break; }
      if (!s.enableToSpin) { log('Крутить больше нельзя — стоп', true); break; }
      if (s.coins - cost < cfg.keepCoins) { log('Монеты закончились (с учётом «оставить») — стоп'); break; }
      if (i < max && !stopFlag) await sleep(dMin + Math.random() * (dMax - dMin));
    }
    finish(stopFlag ? 'остановлен' : 'готово');
  }

  function finish(status) {
    running = false;
    const btn = $('[data-a="toggle"]');
    btn.classList.remove('on'); btn.textContent = '▶ Вращать'; btn.disabled = false;
    setStat('status', status);
    log(`■ ${status}`);
    renderSum();
  }

  box.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'toggle') {
      if (!running) run();
      else { stopFlag = true; e.target.disabled = true; e.target.textContent = 'Останавливаю…'; setStat('status', 'стоп…'); }
    }
    if (a === 'cfg') box.classList.toggle('cfg');
    if (a === 'min') box.classList.toggle('min');
    if (a === 'csv') exportCsv();
  });

  getHeaders().then(refreshBalance).catch(() => {});
})();
