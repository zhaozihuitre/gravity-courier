/* 引力信使 · 游戏主逻辑：场景、输入、渲染、存档 */
(() => {
  'use strict';
  const { W, H, DT, KINDS, SHIELD_HALF, SHIELD_GAP } = Physics;
  const { LEVELS, CHAPTERS } = LevelData;
  const TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const T = I18N.t;
  const font = () => I18N.lang === 'en' ? '"Segoe UI",system-ui,Roboto,Arial,sans-serif' : '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';

  /* ───────── 存档 ───────── */
  const SAVE_KEY = 'gravity-courier-v1';
  const save = { stars: {}, muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* 无痕模式等情况下忽略 */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ } };
  const unlockAll = /[?&]all\b/.test(location.search);
  const starsOf = id => save.stars[id] || 0;
  const unlocked = id => unlockAll || id === 1 || starsOf(id - 1) > 0;
  Sfx.setMuted(!!save.muted);

  /* ───────── 画布与视图 ───────── */
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;
  const view = { s: 1, ox: 0, oy: 0, rot: false };
  let sky = [];

  function layout() {
    cw = innerWidth; ch = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const top = ch < 480 ? 44 : 56, pad = 8;
    view.rot = ch > cw * 1.15;           // 竖屏手机：把关卡旋转 90°，发射点在下方
    document.body.classList.toggle('portrait', view.rot);
    const right = view.rot ? 0 : 120, bottom = view.rot ? 118 : 0;   // 给控制按钮留位置
    const aw = cw - pad * 2 - right, ah = ch - top - pad - bottom;
    if (!view.rot) view.s = Math.min(aw / W, ah / H);
    else view.s = Math.min(aw / H, ah / W);
    const ww = (view.rot ? H : W) * view.s, wh = (view.rot ? W : H) * view.s;
    view.ox = (cw - right - ww) / 2; view.oy = top + (ah - wh) / 2;
    sky = Array.from({ length: Math.round(cw * ch / 5000) }, () => ({ x: Math.random() * cw, y: Math.random() * ch, r: Math.random() * 1.3 + 0.3, p: Math.random() * TAU }));
  }
  function worldTransform() {
    const { s, ox, oy } = view;
    if (!view.rot) ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);
    else ctx.setTransform(0, -s * dpr, s * dpr, 0, ox * dpr, (oy + W * s) * dpr);
  }
  function screenTransform() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function toWorld(sx, sy) {
    const { s, ox, oy } = view;
    return view.rot ? [(oy + W * s - sy) / s, (sx - ox) / s] : [(sx - ox) / s, (sy - oy) / s];
  }
  function toScreen(x, y) {
    const { s, ox, oy } = view;
    return view.rot ? [ox + y * s, oy + (W - x) * s] : [ox + x * s, oy + y * s];
  }

  /* ───────── 绘图工具 ───────── */
  function glow(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function poly(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
  function seeded(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

  function drawSky(t) {
    screenTransform();
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, cw, ch);
    let g = ctx.createRadialGradient(cw * 0.75, ch * 0.2, 0, cw * 0.75, ch * 0.2, Math.max(cw, ch) * 0.8);
    g.addColorStop(0, 'rgba(80,50,150,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    g = ctx.createRadialGradient(cw * 0.1, ch * 0.9, 0, cw * 0.1, ch * 0.9, Math.max(cw, ch) * 0.6);
    g.addColorStop(0, 'rgba(30,90,150,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#cfdcff';
    for (const s of sky) { ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 1.2 + s.p); ctx.fillRect(s.x, s.y, s.r, s.r); }
    ctx.globalAlpha = 1;
  }

  /* ───────── 界面元素 ───────── */
  const ui = {
    hud: $('hud'), controls: $('controls'), card: $('physCard'), title: $('title'), select: $('select'), intro: $('intro'), result: $('result'), pause: $('pause'), toast: $('toast'), fast: $('fastHint'),
  };
  const show = (el, on) => el.classList.toggle('hidden', !on);
  function muteLabel() {
    const on = !save.muted;
    $('btnMute').innerHTML = on
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';
    $('btnMuteTitle').textContent = T(on ? 'soundOn' : 'soundOff');
  }
  /* ───────── 物理小卡片 ───────── */
  const chapterCleared = ci => { const ls = LEVELS.filter(l => l.ch === ci); return ls.length && starsOf(ls[ls.length - 1].id) > 0; };
  function showCard(ci, isNew) {
    const c = CARDS[ci] && (CARDS[ci][I18N.lang] || CARDS[ci].zh);
    if (!c) return;
    $('pcKicker').textContent = T(isNew ? 'cardNew' : 'cardKicker', { n: ci + 1 });
    $('pcTitle').textContent = c.title;
    $('pcFormula').textContent = c.formula || ''; show($('pcFormula'), !!c.formula);
    const body = $('pcBody'); body.innerHTML = '';
    for (const para of c.body) { const el = document.createElement('p'); el.textContent = para; body.appendChild(el); }
    $('pcReal').textContent = c.real;
    show(ui.card, true);
    if (isNew) { Sfx.star(0); setTimeout(() => Sfx.star(2), 160); }
  }
  /* ───────── 语言 ───────── */
  function setLang(l) {
    save.lang = l; persist();
    I18N.set(l); I18N.applyStatic(); muteLabel(); vibeLabel();
    if (scene === 'title') goTitle();
    else if (scene === 'select') goSelect();
    else if (game) { $('lvTitle').textContent = `${lvLabel(game.L)} ${I18N.lvName(game.L)}`; updateHud(); refreshControls(); }
  }
  const toggleLang = () => setLang(I18N.lang === 'zh' ? 'en' : 'zh');
  function toggleMute() { save.muted = !save.muted; Sfx.setMuted(save.muted); persist(); muteLabel(); }
  // 手机震动（Android 浏览器支持；iOS Safari 没有震动接口，会静默忽略）
  function buzz(pattern) {
    if (save.noVibe || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* 部分环境禁止震动，忽略 */ }
  }
  function vibeLabel() {
    const t = T(save.noVibe ? 'vibeOff' : 'vibeOn');
    $('btnVibeTitle').textContent = t; $('btnPauseVibe').textContent = t;
  }
  function toggleVibe() { save.noVibe = !save.noVibe; persist(); vibeLabel(); if (!save.noVibe) buzz(40); }
  function toast(text, color = '#e9eef8') {
    const el = ui.toast; el.textContent = text; el.style.color = color;
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 1800);
  }
  const lvLabel = L => `${L.ch + 1}-${LEVELS.filter(x => x.ch === L.ch).indexOf(L) + 1}`;

  /* ───────── 场景切换 ───────── */
  let scene = 'title';
  let game = null;

  function goTitle() {
    scene = 'title'; game = null;
    [ui.hud, ui.controls, ui.select, ui.intro, ui.result, ui.pause, ui.fast, ui.card].forEach(e => show(e, false));
    show(ui.title, true);
    const next = LEVELS.find(l => !starsOf(l.id));
    $('btnPlay').textContent = !next ? T('replay1') : next.id === 1 ? T('startGame') : T('continueLv', { lv: lvLabel(next) });
  }
  function goSelect() {
    scene = 'select'; game = null;
    [ui.hud, ui.controls, ui.title, ui.intro, ui.result, ui.pause, ui.fast, ui.card].forEach(e => show(e, false));
    show(ui.select, true);
    const total = LEVELS.reduce((s, l) => s + starsOf(l.id), 0);
    $('starTotal').textContent = `★ ${total} / ${LEVELS.length * 3}`;
    const box = $('chapters'); box.innerHTML = '';
    CHAPTERS.forEach((c, ci) => {
      const sec = document.createElement('div'); sec.className = 'chapter';
      const hasCard = chapterCleared(ci) && CARDS[ci];
      sec.innerHTML = `<div class="chapter-head"><b>${T('chapterHead', { n: ci + 1, name: I18N.chName(c, ci) })}</b><span>${I18N.chDesc(c, ci)}</span>` +
        (hasCard ? `<button class="card-link">${T('cardBtn')}</button>` : '') + `</div><div class="lv-grid"></div>`;
      if (hasCard) sec.querySelector('.card-link').onclick = () => { Sfx.init(); Sfx.click(); showCard(ci, false); };
      const grid = sec.querySelector('.lv-grid');
      LEVELS.filter(l => l.ch === ci).forEach(l => {
        const b = document.createElement('button'); b.className = 'lv';
        const st = starsOf(l.id), open = unlocked(l.id);
        b.disabled = !open;
        b.innerHTML = `<span class="no">${lvLabel(l)}</span><span class="nm">${open ? I18N.lvName(l) : T('locked')}</span>` +
          `<span class="st"><b>${'★'.repeat(st)}</b>${'★'.repeat(3 - st)}</span>`;
        b.onclick = () => { Sfx.init(); Sfx.click(); startLevel(l.id, false); };
        grid.appendChild(b);
      });
      box.appendChild(sec);
    });
  }

  /* ───────── 关卡运行 ───────── */
  function startLevel(id, restart) {
    const L = LEVELS[id - 1];
    scene = 'play';
    [ui.title, ui.select, ui.result, ui.pause, ui.card].forEach(e => show(e, false));
    show(ui.hud, true); show(ui.controls, true);
    const rocks = (L.rocks || []).map((r, i) => {
      const rnd = seeded(id * 31 + i * 7);
      const n = 9;
      return {
        pts: Array.from({ length: n }, (_, k) => { const a = k / n * TAU, rr = r.r * (0.82 + rnd() * 0.3); return [r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr]; }),
        craters: Array.from({ length: 2 }, () => [r.x + (rnd() - 0.5) * r.r, r.y + (rnd() - 0.5) * r.r, r.r * (0.12 + rnd() * 0.12)]),
      };
    });
    const puckShapes = (L.pucks || []).map((pk, i) => {
      const rnd = seeded(id * 53 + i * 11);
      return Array.from({ length: 9 }, (_, k) => [k / 9 * TAU, 0.85 + rnd() * 0.25]);
    });
    const first = L.pirates[0], [fx, fy] = Physics.entPos(first, 0);
    game = {
      L, id, st: Physics.createState(L), torp: null, ptrails: [], ghost: null, used: 0, drag: null,
      aimA: Math.atan2(fy - L.launch[1], fx - L.launch[0]), aimP: 0.5, touched: false,
      parts: [], rings: [], floats: [], shake: 0, fast: false, acc: 0, combo: 0,
      endT: 0, outcome: null, done: false, paused: false, rocks, lastAim: null,
      puckShapes, tick: 0, capStars: 3, fullLine: false, predHit: false, hint: null, searching: false, scope: null, awacsT: -1, aimTween: null, failReason: null,
      angle: Math.atan2(fy - L.launch[1], fx - L.launch[0]),
      phase: L.tip && !restart ? 'intro' : 'aim',
    };
    $('lvTitle').textContent = `${lvLabel(L)} ${I18N.lvName(L)}`;
    updateHud(); refreshControls(); refreshHelp();
    if (game.phase === 'intro') {
      $('introNo').textContent = T('introNo', { lv: lvLabel(L), n: L.ch + 1, ch: I18N.chName(CHAPTERS[L.ch], L.ch) });
      $('introName').textContent = I18N.lvName(L);
      $('introTip').textContent = I18N.lvTip(L);
      show(ui.intro, true);
    } else {
      show(ui.intro, false);
      if (!restart) toast(`${lvLabel(L)} ${I18N.lvName(L)}`);
    }
  }
  function updateHud() {
    const g = game, L = g.L;
    const alive = g.st.pirates.filter(p => p.alive).length;
    $('lvSub').textContent = T('hudSub', { a: alive, t: L.pirates.length, shots: I18N.shots(L.par) });
    $('ammo').innerHTML = Array.from({ length: L.ammo }, (_, i) =>
      `<i class="${i < g.used ? 'used' : ''}${i === L.par - 1 ? ' par' : ''}"></i>`).join('');
  }
  /* 瞄准：角度和力度一直保留，拖动画面做相对调整（像拉弹弓的皮筋），按钮做精细调整，点「发射」才发射 */
  const maxDrag = () => Math.max(110, Math.min(220, Math.min(cw, ch) * 0.32));
  const w2sDir = (x, y) => view.rot ? [y, -x] : [x, y];     // 世界方向 → 屏幕方向
  const s2wDir = (x, y) => view.rot ? [-y, x] : [x, y];     // 屏幕方向 → 世界方向
  const canAim = () => game && !game.paused && game.phase === 'aim' && !game.torp && !game.searching && !game.aimTween;
  function setAim(angle, power) {
    game.aimA = Math.atan2(Math.sin(angle), Math.cos(angle));
    game.aimP = clamp(power, 0, 1);
    refreshControls();
  }
  function refreshControls() {
    if (!game) return;
    let deg = game.aimA * 180 / Math.PI; if (deg < 0) deg += 360;
    $('roAng').textContent = deg.toFixed(1) + '°';
    $('roPow').textContent = Math.round(game.aimP * 100) + '%';
    ui.controls.classList.toggle('busy', !canAim());
    const fire = $('btnFire');
    fire.classList.toggle('flying', !!game.torp);
    let label = game.torp ? T('holdSpeed') : game.searching ? T('locking') : T('fire'), state = '';
    if (timedHint()) {
      const [s, e] = game.hint.win;
      if (game.tick < s) { label = T('fireIn', { s: ((s - game.tick) * DT).toFixed(1) }); state = 'wait'; }
      else if (game.tick <= e) { label = T('fireNow'); state = 'go'; }
    } else if (!game.torp && game.predHit) state = 'go';     // 预警机辅助线显示能命中
    fire.textContent = label;
    fire.classList.toggle('wait', state === 'wait');
    fire.classList.toggle('go', state === 'go');
  }
  function fire() {
    if (!canAim() || game.aimP < 0.06) return;
    if (timedHint()) {
      const [s, e] = game.hint.win;
      if (game.tick < s) toast(T('early', { s: ((s - game.tick) * DT).toFixed(1) }), '#ffcf6b');
      else if (game.tick > e) toast(T('late', { s: ((game.tick - e) * DT).toFixed(1) }), '#ffcf6b');
    }
    launch(game.aimA, game.aimP);
  }
  // 玩家自己改了瞄准：自动瞄准给出的航线就不再成立
  const userAim = () => { game.touched = true; game.aimTween = null; if (game.hint) { game.hint = null; refreshHelp(); } };
  function nudgeAngle(deg) { if (canAim()) { userAim(); setAim(game.aimA + deg * Math.PI / 180, game.aimP); } }
  function nudgePower(d) { if (canAim()) { userAim(); setAim(game.aimA, Math.round((game.aimP + d) * 100) / 100); } }

  /* ───────── 求助（默认可用）─────────
   * 呼叫预警机（飞机图标）：辅助线延长成完整轨迹，并把海盗一起算进去，能命中时线变绿。瞄准仍由玩家调。本次最多 2 星。
   * 自动瞄准（瞄准镜图标）：现场算出一条能命中的航线并设好瞄准；移动目标会提示发射时机。发射仍由玩家按。本次最多 1 星。 */
  const HELP_AFTER = 0;   // 改成 3 则需要同一关失败 3 次后才出现
  const failsOf = id => (save.fails && save.fails[id]) || 0;
  const timedHint = () => !!(game && game.hint && game.hint.win && !game.torp);
  function refreshHelp() {
    const on = !!game && !game.done && failsOf(game.id) >= HELP_AFTER;
    const a = $('btnAwacs'), s = $('btnScope');
    show(a, on); show(s, on);
    if (!on) return;
    const aiming = game.phase === 'aim' && !game.torp;
    a.disabled = game.fullLine; a.classList.toggle('on', game.fullLine);
    s.disabled = game.searching || !!game.hint || !aiming;
    s.classList.toggle('on', game.searching || !!game.hint);
  }
  function callAwacs() {
    const g = game;
    if (!g || g.done || g.fullLine) return;
    g.fullLine = true; g.capStars = Math.min(g.capStars, 2); g.awacsT = 0;
    refreshHelp(); Sfx.radar();
    toast(T('awacsArrived'), '#9ff0bf');
  }

  // 模拟一次发射；record 为 true 时返回所有鱼雷和被撞飞小行星的完整轨迹（穿过虫洞处断开）。打到民船的一发不算。
  function simShot(L, base, t0, angle, power, record) {
    const st = Physics.cloneState(base); st.t = t0;
    const paths = record ? [[[L.launch[0], L.launch[1]]]] : null, ppaths = [];
    let n = 0;
    const r = Physics.simulate(L, st, angle, power, record ? (shot, s2) => {
      if (++n % 2) return;
      shot.torps.forEach((tp, k) => {
        if (tp.rec) return;
        const p = paths[k] || (paths[k] = []), last = p[p.length - 1];
        if (last && Math.hypot(tp.x - last[0], tp.y - last[1]) > 100) p.push(null);
        p.push([tp.x, tp.y]); if (tp.done) tp.rec = true;
      });
      s2.pucks.forEach((pk, k) => { if (pk.moving) (ppaths[k] || (ppaths[k] = [])).push([pk.x, pk.y]); });
    } : null);
    const hits = r.civ ? [] : r.events.filter(e => e.type === 'kill' || e.type === 'bosshit');
    let path = null;
    if (record) { path = []; for (const q of [...paths, ...ppaths]) if (q) { if (path.length) path.push(null); path.push(...q); } }
    return { score: hits.length, path, marks: hits.map(e => [e.x, e.y]) };
  }
  async function autoAim() {
    const g = game;
    if (!g || g.done || g.searching || g.hint || g.phase !== 'aim' || g.torp) return;
    g.searching = true; g.drag = null; g.aimTween = null;
    g.scope = { t: 0, lock: -1, target: null };
    refreshHelp(); refreshControls(); Sfx.scope();
    const L = g.L, moving = L.pirates.some(p => p.move || p.spin) || (L.civs || []).some(c => c.move) || (L.planets || []).some(p => p.move);
    const t = g.st.t, tick = g.tick;      // 计算期间世界时间冻结，算出的发射时机才准
    // 移动目标：至少留 1.5 秒给玩家看倒计时，并挑一个发射时间窗口够宽的航线
    const MIN_LEAD = Math.round(1.2 / DT), WANT = 0.4;
    const waits = moving ? Array.from({ length: 26 }, (_, i) => 1.5 + i * 0.25) : [0];
    const hitAt = (a, p, k) => simShot(L, g.st, t + k * DT, a, p).score > 0;
    const timeWindow = (a, p, k) => {
      const s = 6; let lo = k, hi = k;
      while (k - lo < 240 && lo - s >= MIN_LEAD && hitAt(a, p, lo - s)) lo -= s;
      while (hi - k < 240 && hitAt(a, p, hi + s)) hi += s;
      return [lo, hi];
    };
    const powers = [];
    for (let p = 0.2; p <= 1.0001; p += 0.05) powers.push(+p.toFixed(2));
    powers.sort((a, b) => Math.abs(a - 0.55) - Math.abs(b - 0.55));
    const started = performance.now();
    let found = null, n = 0;
    search: for (const w of waits) {
      const k = Math.round(w / DT), t0 = t + k * DT;
      // 从「直接指向海盗」的方向开始，往两边逐度扩展
      const bases = g.st.pirates.filter(p => p.alive).map(ps => {
        const [x, y] = Physics.entPos(L.pirates[ps.i], t0);
        return Math.atan2(y - L.launch[1], x - L.launch[0]);
      });
      for (let d = 0; d <= 180; d++) for (const b of bases) for (const sgn of d ? [1, -1] : [1]) {
        const a = b + sgn * d * Math.PI / 180;
        for (const p of powers) {
          if (hitAt(a, p, k)) {
            if (!moving) { found = { a, p, k }; break search; }
            const [lo, hi] = timeWindow(a, p, k), len = (hi - lo) * DT;
            if (!found || len > found.len) found = { a, p, k: Math.round((lo + hi) / 2), len };
            if (len >= WANT) break search;
          }
          if (++n % 120 === 0) {
            await new Promise(r => setTimeout(r));
            if (game !== g || g.done) return;
          }
          if (found && n > 20000) break search;     // 找不到够宽的窗口就用目前最好的
        }
      }
    }
    if (!found) {
      g.searching = false; g.scope = null; refreshHelp(); refreshControls();
      toast(T('noRoute'), '#ff9b7e');
      return;
    }
    found.t0 = t + found.k * DT;
    // 取命中范围的中间值，留出容错
    const ok = (a, p) => simShot(L, g.st, found.t0, a, p).score > 0;
    const da = 0.1 * Math.PI / 180, lim = 6 * Math.PI / 180;
    let lo = found.a, hi = found.a;
    while (found.a - lo < lim && ok(lo - da, found.p)) lo -= da;
    while (hi - found.a < lim && ok(hi + da, found.p)) hi += da;
    const a = (lo + hi) / 2;
    let plo = found.p, phi = found.p;
    while (found.p - plo < 0.25 && plo - 0.01 >= 0.1 && ok(a, plo - 0.01)) plo -= 0.01;
    while (phi - found.p < 0.25 && phi + 0.01 <= 1 && ok(a, phi + 0.01)) phi += 0.01;
    let p = Math.round((plo + phi) * 50) / 100;
    if (!ok(a, p)) p = found.p;
    const shot = simShot(L, g.st, found.t0, a, p, true);
    let win = null;
    if (moving) {
      let [wlo, whi] = timeWindow(a, p, found.k);
      if (whi - wlo > 24) { wlo += 6; whi -= 6; }      // 边界只精确到 6 步，往里收一点保险
      win = [tick + wlo, tick + whi];
    }
    // 让瞄准镜的搜索动画至少播 0.7 秒，再锁定
    const wait = 700 - (performance.now() - started);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (game !== g || g.done) return;
    g.searching = false; g.capStars = 1; g.touched = true;
    g.hint = { angle: a, power: p, path: shot.path, marks: shot.marks, win };
    g.scope = { t: 0, lock: 0, target: shot.marks[0] };
    g.aimTween = { a0: g.aimA, p0: g.aimP, a1: a, p1: p, t: 0 };
    refreshHelp(); refreshControls(); Sfx.lock();
    toast(T(moving ? 'lockedMoving' : 'lockedStatic'), '#9ff0bf');
  }
  function launch(angle, power) {
    const g = game, L = g.L;
    g.torp = Physics.newShot(L, angle, power);     // 一次发射：可能撕裂成多枚鱼雷
    g.torp.torps[0].trail = [[L.launch[0], L.launch[1]]]; g.ptrails = [];
    g.used++; g.angle = angle; g.lastAim = { angle, power }; g.combo = 0;
    g.predHit = false; g.hint = null; g.scope = null;
    g.phase = 'fly';
    for (let i = 0; i < 14; i++) {
      const a = angle + rand(-0.5, 0.5), v = rand(60, 220);
      g.parts.push({ x: L.launch[0], y: L.launch[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.45), max: 0.45, c: '#ffd88a', s: 3 });
    }
    Sfx.launch(); updateHud(); refreshControls(); refreshHelp();
    if (g.used === 1 && !save.seenFast) { show(ui.fast, true); }
  }
  function explode(x, y, big, hue = 0) {
    const g = game, n = big ? 90 : 40;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(40, big ? 420 : 260);
      g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, big ? 1.6 : 1), max: big ? 1.6 : 1,
        c: Math.random() < 0.5 ? '#ffb46b' : hsl(hue, 90, 65), s: rand(2, 5) });
    }
    g.rings.push({ x, y, r0: 10, r1: big ? 220 : 110, t: 0, dur: big ? 0.8 : 0.5, c: '255,190,120' });
    g.shake = Math.max(g.shake, big ? 1.8 : 0.9);
  }
  function addFloat(x, y, text, color, size = 22) { game.floats.push({ x, y, text, color, size, t: 0 }); }

  function handleEvents(evs) {
    const g = game;
    for (const e of evs) {
      if (e.type === 'kill') {
        const kind = g.st.pirates[e.i].kind;
        explode(e.x, e.y, kind === 'boss', 355);
        Sfx.boom(kind === 'boss');
        buzz(kind === 'boss' ? [120, 50, 160, 50, 220] : g.combo >= 1 ? [50, 30, 70] : 60);
        g.combo++;
        if (g.combo === 2) addFloat(e.x, e.y - 80, T('doubleKill'), '#ffcf6b', 26);
        else if (g.combo >= 3) addFloat(e.x, e.y - 80, T('combo', { n: g.combo }), '#ffcf6b', 30);
        else addFloat(e.x, e.y - 40, kind === 'boss' ? T('bossDown') : T('kill'), '#ff8a7a', kind === 'boss' ? 32 : 18);
        updateHud();
        if (g.st.pirates.every(p => !p.alive) && !g.outcome) { g.outcome = 'win'; g.endT = 1.3; }
      } else if (e.type === 'bosshit') {
        const p = g.st.pirates[e.i];
        explode(e.x, e.y, false, 20); Sfx.hit(); buzz([70, 40, 70]);
        addFloat(e.x, e.y - 30, T('bossHit', { hp: p.hp }), '#ff8a7a', 20);
      } else if (e.type === 'block') {
        for (let i = 0; i < 26; i++) {
          const a = rand(0, TAU), v = rand(80, 300);
          g.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.6), max: 0.6, c: '#9ff0ff', s: 2.5 });
        }
        g.rings.push({ x: e.x, y: e.y, r0: 4, r1: 50, t: 0, dur: 0.35, c: '150,235,255' });
        addFloat(e.x, e.y - 30, T('blocked'), '#9ff0ff', 18);
        Sfx.block();
      } else if (e.type === 'bounce') {
        g.rings.push({ x: e.x, y: e.y, r0: 4, r1: 34, t: 0, dur: 0.3, c: '220,230,255' });
        for (let i = 0; i < 10; i++) {
          const a = rand(0, TAU), v = rand(60, 200);
          g.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.15, 0.35), max: 0.35, c: '#e8eeff', s: 2 });
        }
        Sfx.bounce();
      } else if (e.type === 'civ') {
        explode(e.x, e.y, false, 200); Sfx.boom(false); buzz([150, 60, 150, 60, 150]);
        addFloat(e.x, e.y - 40, T('civHit'), '#7fc8ff', 26);
        if (g.outcome !== 'fail') {
          g.outcome = 'fail'; g.failReason = 'civ'; g.endT = 1.4;
          save.fails = save.fails || {}; save.fails[g.id] = failsOf(g.id) + 1; persist();
        }
      } else if (e.type === 'split') {
        g.rings.push({ x: e.x, y: e.y, r0: 6, r1: 70, t: 0, dur: 0.45, c: '255,150,110' });
        for (let i = 0; i < 24; i++) {
          const a = rand(0, TAU), v = rand(80, 260);
          g.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.5), max: 0.5, c: '#ffb08a', s: 2.5 });
        }
        addFloat(e.x, e.y - 34, T('split'), '#ffb08a', 22);
        Sfx.split(); buzz([30, 30, 30]);
      } else if (e.type === 'push') {
        g.rings.push({ x: e.x, y: e.y, r0: 6, r1: 46, t: 0, dur: 0.35, c: '255,210,150' });
        for (let i = 0; i < 16; i++) {
          const a = rand(0, TAU), v = rand(60, 220);
          g.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.5), max: 0.5, c: '#e8c39a', s: 3 });
        }
        g.shake = Math.max(g.shake, 0.5); Sfx.thud(); buzz(35);
      } else if (e.type === 'puckend') {
        if (e.reason !== 'lost' && e.reason !== 'timeout') { explode(e.x, e.y, false, 30); Sfx.fizzle(); buzz(25); }
      } else if (e.type === 'end') {
        torpEnd(e);
      } else if (e.type === 'warp') {
        g.rings.push({ x: e.from[0], y: e.from[1], r0: 50, r1: 4, t: 0, dur: 0.4, c: '200,150,255' });
        g.rings.push({ x: e.to[0], y: e.to[1], r0: 4, r1: 60, t: 0, dur: 0.45, c: '120,230,255' });
        Sfx.warp();
      }
    }
  }
  // 一枚鱼雷结束（可能还有别的鱼雷或被撞飞的小行星在飞）
  function torpEnd(e) {
    const g = game, tp = g.torp && g.torp.torps[e.k];
    if (tp && tp.trail) tp.trail.push([e.x, e.y]);
    if (e.reason === 'planet' || e.reason === 'rock') { explode(e.x, e.y, false, 30); g.shake = Math.max(g.shake, 0.5); Sfx.fizzle(); buzz(25); }
    else if (e.reason === 'hole') { g.rings.push({ x: e.x, y: e.y, r0: 40, r1: 2, t: 0, dur: 0.5, c: '255,170,90' }); Sfx.swallow(); }
    else if (e.reason === 'lost' || e.reason === 'timeout') { if (!g.outcome) addFloat(clamp(e.x, 80, W - 80), clamp(e.y, 80, H - 80), T('lostTorp'), '#8d99b6', 18); }
  }
  // 记录轨迹（穿过虫洞时断开）
  function trackTrails(g) {
    for (const tp of g.torp.torps) {
      if (!tp.trail) tp.trail = [[tp.x, tp.y]];
      if (tp.done) continue;
      const last = tp.trail[tp.trail.length - 1];
      if (last && Math.hypot(tp.x - last[0], tp.y - last[1]) > 100) tp.trail.push(null);
      tp.trail.push([tp.x, tp.y]);
    }
    g.st.pucks.forEach((pk, k) => { if (pk.moving) (g.ptrails[k] || (g.ptrails[k] = [])).push([pk.x, pk.y]); });
  }
  // 整次发射结束
  function finishShot() {
    const g = game, ghost = [];
    for (const tr of [...g.torp.torps.map(tp => tp.trail), ...g.ptrails]) if (tr) { if (ghost.length) ghost.push(null); ghost.push(...tr); }
    g.ghost = ghost; g.torp = null; g.ptrails = []; g.fast = false; g.combo = 0;
    show(ui.fast, false);
    if (!g.outcome) {
      if (g.used >= g.L.ammo) {
        g.outcome = 'fail'; g.endT = 1.0;
        save.fails = save.fails || {}; save.fails[g.id] = failsOf(g.id) + 1; persist();
      }
      else g.phase = 'aim';
    }
    refreshControls(); refreshHelp();
  }
  function finish() {
    const g = game, L = g.L;
    g.done = true; g.phase = 'done'; g.drag = null; refreshControls();
    const resBtns = $('resBtns'); resBtns.innerHTML = '';
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { Sfx.click(); fn(); }; resBtns.appendChild(b); };
    $('resNo').textContent = T('resNo', { lv: lvLabel(L), name: I18N.lvName(L) });
    const chLast = LEVELS.filter(l => l.ch === L.ch).pop().id === L.id;   // 本章最后一关
    if (g.outcome === 'win') {
      let stars = g.used <= L.par ? 3 : g.used <= L.par + 1 ? 2 : 1;
      stars = Math.min(stars, g.capStars);
      const first = !starsOf(L.id);
      save.stars[L.id] = Math.max(starsOf(L.id), stars); persist();
      const last = L.id === LEVELS.length;
      $('resTitle').textContent = T(last ? 'allClear' : 'cleared');
      $('resStars').innerHTML = [0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`).join('');
      let info = last ? T('allClearInfo', { n: g.used })
        : g.capStars < 3 ? T('helpedInfo', { tool: T(g.capStars === 1 ? 'toolScope' : 'toolAwacs'), cap: g.capStars, shots: I18N.shots(L.par) })
        : T('usedInfo', { n: g.used, shots: I18N.shots(L.par) }) + (stars < 3 ? T('tryBetter') : '');
      if (first && L.id < LEVELS.length && LEVELS[L.id].ch !== L.ch) info += '\n' + T('newChapter', { ch: I18N.chName(CHAPTERS[LEVELS[L.id].ch], LEVELS[L.id].ch) });
      $('resInfo').textContent = info;
      Sfx.win();
      for (let i = 0; i < stars; i++) setTimeout(() => Sfx.star(i), 300 + i * 180);
      if (!last) btn(T('next'), 'primary', () => startLevel(L.id + 1, false));
      btn(T('replay'), '', () => startLevel(L.id, true));
      if (chLast && CARDS[L.ch]) btn(T('cardBtn'), '', () => showCard(L.ch, false));
      btn(T(last ? 'viewAll' : 'levels'), last ? 'primary' : 'ghost', goSelect);
      // 一章第一次通关：自动弹出这一章的物理小卡片
      if (chLast && CARDS[L.ch] && !(save.cards && save.cards[L.ch])) {
        save.cards = save.cards || {}; save.cards[L.ch] = 1; persist();
        setTimeout(() => { if (game === g) showCard(L.ch, true); }, 1100);
      }
    } else {
      const civ = g.failReason === 'civ';
      $('resTitle').textContent = T(civ ? 'civFailTitle' : 'outOfAmmo');
      $('resStars').innerHTML = '';
      const canHelp = failsOf(L.id) >= HELP_AFTER;
      $('resInfo').textContent = T(civ ? 'civFail' : 'escaped') + T(canHelp ? 'helpHint' : 'retryHint');
      Sfx.fail();
      btn(T('retry'), 'primary', () => startLevel(L.id, true));
      if (canHelp) {
        btn(T('callAwacs'), '', () => { startLevel(L.id, true); callAwacs(); });
        btn(T('autoAim'), '', () => { startLevel(L.id, true); autoAim(); });
      }
      btn(T('levels'), 'ghost', goSelect);
    }
    $('resInfo').style.whiteSpace = 'pre-line';
    show(ui.result, true);
  }

  function updatePlay(dt) {
    const g = game;
    if (g.paused) return;
    const speed = g.torp && g.fast ? 3 : 1;
    g.acc += dt * speed;
    let steps = 0;
    if (g.searching) g.acc = 0;          // 自动瞄准计算期间冻结世界时间，算出的时机才准
    while (g.acc >= DT && steps < 1000) {
      g.acc -= DT; steps++;
      g.st.t += DT; g.tick++;
      if (g.torp) {
        const evs = [];
        const finished = Physics.stepShot(g.L, g.st, g.torp, DT, evs);
        if (evs.length) handleEvents(evs);
        if (steps % 2 === 0 || finished) trackTrails(g);
        if (finished) finishShot();
      }
    }
    // 求助动画与瞄准过渡
    if (g.awacsT >= 0) g.awacsT += dt;
    if (g.scope) g.scope.t += dt;
    if (g.aimTween) {
      const tw = g.aimTween; tw.t += dt;
      const k = Math.min(1, tw.t / 0.45), e = 1 - Math.pow(1 - k, 3);
      const da = Math.atan2(Math.sin(tw.a1 - tw.a0), Math.cos(tw.a1 - tw.a0));
      g.aimA = tw.a0 + da * e; g.aimP = tw.p0 + (tw.p1 - tw.p0) * e;
      if (k >= 1) { g.aimA = tw.a1; g.aimP = tw.p1; g.aimTween = null; }
      refreshControls();
    }
    if (timedHint()) {
      refreshControls();
      // 错过了发射窗口：重新锁定下一次时机
      if (g.tick > g.hint.win[1] && g.phase === 'aim' && !g.outcome) {
        g.hint = null; toast(T('relock'), '#ffcf6b'); autoAim();
      }
    }
    const pdt = dt * speed;
    for (const p of g.parts) { p.x += p.vx * pdt; p.y += p.vy * pdt; p.vx *= 0.985; p.vy *= 0.985; p.life -= pdt; }
    g.parts = g.parts.filter(p => p.life > 0);
    for (const r of g.rings) r.t += pdt;
    g.rings = g.rings.filter(r => r.t < r.dur);
    for (const f of g.floats) f.t += dt;
    g.floats = g.floats.filter(f => f.t < 1.4);
    g.shake = Math.max(0, g.shake - dt * 3);
    if (g.endT > 0) { g.endT -= dt; if (g.endT <= 0 && !g.done) finish(); }
  }

  /* ───────── 渲染：世界 ───────── */
  function drawPlanet(p, t) {
    const [x, y] = Physics.entPos(p, game.st.t);
    if (p.move && p.move.type === 'orbit') {   // 公转轨道
      ctx.strokeStyle = hsl(p.hue, 50, 65, 0.16); ctx.lineWidth = 1.5; ctx.setLineDash([2, 8]);
      ctx.beginPath(); ctx.arc(p.move.cx, p.move.cy, p.move.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    for (let k = 1.8; k <= 3.6; k += 0.9) {
      ctx.setLineDash([4, 10]); ctx.strokeStyle = hsl(p.hue, 60, 65, 0.08); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, p.r * k, 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, p.r * 1.35, hsl(p.hue, 80, 55, 0.22));
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(x - p.r * 0.4, y - p.r * 0.4, p.r * 0.05, x, y, p.r);
    g.addColorStop(0, hsl(p.hue, 70, 74)); g.addColorStop(0.7, hsl(p.hue, 55, 38)); g.addColorStop(1, hsl(p.hue, 60, 18));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.clip();
    ctx.strokeStyle = hsl(p.hue, 60, 80, 0.10); ctx.lineWidth = p.r * 0.12;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(x, y + k * p.r * 0.38, p.r * 1.2, p.r * 0.12, -0.15, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function drawHole(h, t) {
    ctx.globalCompositeOperation = 'lighter';
    glow(h.x, h.y, 140, 'rgba(255,140,60,0.16)');
    for (let i = 0; i < 6; i++) {
      const a = t * (1.6 + i * 0.3) + i;
      ctx.strokeStyle = `rgba(255,${150 + i * 15},${80 + i * 10},${0.55 - i * 0.07})`; ctx.lineWidth = 3 - i * 0.3;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, 34 + i * 9, 12 + i * 3.5, -0.35, a, a + 2.2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 1.4 + 1.5, 0, TAU); ctx.stroke();
  }
  function drawWorm(w, t) {
    [[w.a, 275], [w.b, 190]].forEach(([p, hue], j) => {
      ctx.globalCompositeOperation = 'lighter';
      glow(p[0], p[1], w.r * 2.2, hsl(hue, 90, 60, 0.3));
      for (let i = 0; i < 4; i++) {
        const a = (j ? -1 : 1) * t * 2.5 + i * TAU / 4;
        ctx.strokeStyle = hsl(hue, 90, 70, 0.8); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], w.r * (0.45 + i * 0.15), a, a + 2.4); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(5,4,15,0.85)'; ctx.beginPath(); ctx.arc(p[0], p[1], w.r * 0.32, 0, TAU); ctx.fill();
    });
    ctx.setLineDash([2, 12]); ctx.strokeStyle = 'rgba(200,170,255,0.12)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(w.a[0], w.a[1]); ctx.lineTo(w.b[0], w.b[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawRock(rk) {
    poly(rk.pts); ctx.fillStyle = '#26243a'; ctx.fill(); ctx.strokeStyle = '#6e6890'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [x, y, r] of rk.craters) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  }
  const SCOUT = [[26, 0], [-4, -9], [-16, -22], [-11, -5], [-19, 0], [-11, 5], [-16, 22], [-4, 9]];
  const SHIELDER = [[28, 0], [10, -12], [-6, -26], [-22, -18], [-16, -6], [-24, 0], [-16, 6], [-22, 18], [-6, 26], [10, 12]];
  function drawPirate(ps, t) {
    const g = game, L = g.L, p = L.pirates[ps.i], r = Physics.radius(L, ps.kind);
    const [x, y] = Physics.entPos(p, g.st.t);
    const bob = Math.sin(t * 2 + ps.i) * 2;
    if (ps.kind === 'boss') return drawBoss(ps, p, x, y + bob, t);
    const face = ps.kind === 'shield' ? Physics.faceOf(L, p, g.st.t) : Math.atan2(L.launch[1] - y, L.launch[0] - x);
    // 命中范围提示圈（前期船更大，圈也更大）
    ctx.strokeStyle = 'rgba(255,90,106,0.22)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(x, y + bob, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(face);
    const sc = r / KINDS[ps.kind].r * 0.92; ctx.scale(sc, sc);
    ctx.globalCompositeOperation = 'lighter';
    glow(-20, 0, 16 + Math.random() * 3, 'rgba(255,90,60,0.7)');
    ctx.globalCompositeOperation = 'source-over';
    poly(ps.kind === 'shield' ? SHIELDER : SCOUT);
    ctx.fillStyle = '#3a0d17'; ctx.fill();
    ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffb0a0'; ctx.beginPath(); ctx.arc(6, 0, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y + bob, r * 2.2, 'rgba(255,60,80,0.12)');
    ctx.globalCompositeOperation = 'source-over';
    if (ps.kind === 'shield') drawShield(x, y + bob, r + SHIELD_GAP, face, t);
  }
  function drawShield(x, y, r, face, t) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(120,225,255,${0.55 + 0.25 * Math.sin(t * 5)})`; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.shadowColor = '#6be3ff'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, r, face - SHIELD_HALF, face + SHIELD_HALF); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(160,240,255,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r + 6, face - SHIELD_HALF * 0.8, face + SHIELD_HALF * 0.8); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  }
  function drawBoss(ps, p, x, y, t) {
    const face = Physics.faceOf(game.L, p, game.st.t), r = KINDS.boss.r;
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, r * 2.4, 'rgba(255,60,80,0.18)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.15);
    const hex = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * TAU, rr = i % 2 ? r * 0.82 : r; return [Math.cos(a) * rr, Math.sin(a) * rr]; });
    poly(hex); ctx.fillStyle = '#300a14'; ctx.fill(); ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,106,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; ctx.fillStyle = '#ff7a6a'; ctx.fillRect(Math.cos(a) * r * 0.7 - 4, Math.sin(a) * r * 0.7 - 4, 8, 8); }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, r * 0.5, `rgba(255,120,90,${0.5 + 0.3 * Math.sin(t * 4)})`);
    ctx.globalCompositeOperation = 'source-over';
    drawShield(x, y, r + SHIELD_GAP, face, t);
    const total = p.hp || KINDS.boss.hp;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < ps.hp ? '#ff5a6a' : '#3a2230';
      ctx.fillRect(x - total * 11 + i * 22 + 2, y + r + 26, 18, 6);
    }
  }
  function drawCourier(L, angle, t) {
    const [x, y] = L.launch;
    ctx.strokeStyle = 'rgba(255,207,107,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    glow(-18, 0, 14 + Math.sin(t * 20) * 2, 'rgba(120,220,255,0.75)');
    ctx.globalCompositeOperation = 'source-over';
    poly([[24, 0], [4, -8], [-14, -16], [-10, -4], [-16, 0], [-10, 4], [-14, 16], [4, 8]]);
    ctx.fillStyle = '#f4ead0'; ctx.fill(); ctx.strokeStyle = '#ffcf6b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a6ea0'; ctx.beginPath(); ctx.ellipse(6, 0, 5, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function strokeTrail(tr, style, width, dash) {
    if (!tr || tr.length < 2) return;
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let pen = false;
    for (const p of tr) {
      if (!p) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  /* ───────── 新机制：斥力星、反射镜、民用货船 ───────── */
  function drawRepulsor(q, t) {
    // 向外扩散的波纹表示「推开」
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.7 + k / 3) % 1;
      ctx.strokeStyle = `rgba(110,240,255,${0.35 * (1 - f)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.2 + f * 3.2), 0, TAU); ctx.stroke();
    }
    glow(q.x, q.y, q.r * 2.2, 'rgba(110,240,255,0.25)');
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(q.x - q.r * 0.3, q.y - q.r * 0.3, 2, q.x, q.y, q.r);
    g.addColorStop(0, '#f2ffff'); g.addColorStop(0.5, '#7fe9ff'); g.addColorStop(1, '#1d6e86');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
    // 8 个向外的小箭头
    ctx.strokeStyle = 'rgba(160,245,255,0.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + t * 0.3, r0 = q.r * 1.35, r1 = q.r * 1.75;
      ctx.beginPath();
      ctx.moveTo(q.x + Math.cos(a) * r0, q.y + Math.sin(a) * r0); ctx.lineTo(q.x + Math.cos(a) * r1, q.y + Math.sin(a) * r1);
      ctx.lineTo(q.x + Math.cos(a + 0.12) * (r1 - 7), q.y + Math.sin(a + 0.12) * (r1 - 7));
      ctx.stroke();
    }
  }
  function drawMirror(m, t) {
    const len = Math.hypot(m.bx - m.ax, m.by - m.ay), nx = -(m.by - m.ay) / len, ny = (m.bx - m.ax) / len;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(200,215,255,0.25)'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(m.ax, m.ay); ctx.lineTo(m.bx, m.by); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#dfe7ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(m.ax, m.ay); ctx.lineTo(m.bx, m.by); ctx.stroke();
    ctx.lineCap = 'butt';
    // 镜面上滑过的高光
    const k = (t * 0.35) % 1, hx = m.ax + (m.bx - m.ax) * k, hy = m.ay + (m.by - m.ay) * k;
    ctx.globalCompositeOperation = 'lighter'; glow(hx, hy, 26, 'rgba(255,255,255,0.5)'); ctx.globalCompositeOperation = 'source-over';
    // 两侧的短斜纹，表示是镜面
    ctx.strokeStyle = 'rgba(180,195,240,0.35)'; ctx.lineWidth = 1.5;
    for (let d = 10; d < len; d += 22) {
      const x = m.ax + (m.bx - m.ax) * d / len, y = m.ay + (m.by - m.ay) * d / len;
      ctx.beginPath(); ctx.moveTo(x + nx * 6, y + ny * 6); ctx.lineTo(x + nx * 12 - ny * 6, y + ny * 12 + nx * 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - nx * 6, y - ny * 6); ctx.lineTo(x - nx * 12 + ny * 6, y - ny * 12 - nx * 6); ctx.stroke();
    }
  }
  const CIV_SHAPE = [[30, 0], [20, -12], [-22, -12], [-28, -6], [-28, 6], [-22, 12], [20, 12]];
  function drawCiv(c, t) {
    const [x, y] = Physics.entPos(c, game.st.t);
    let dir = 0;
    if (c.move) { const [x2, y2] = Physics.entPos(c, game.st.t + 0.05); dir = Math.atan2(y2 - y, x2 - x); }
    ctx.strokeStyle = 'rgba(127,200,255,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(x, y, Physics.CIV_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
    poly(CIV_SHAPE); ctx.fillStyle = '#16304d'; ctx.fill(); ctx.strokeStyle = '#7fc8ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2a5680'; for (let i = 0; i < 3; i++) ctx.fillRect(-18 + i * 12, -8, 9, 16);   // 货柜
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y - 16, 8, `rgba(120,255,170,${0.5 + 0.5 * Math.sin(t * 6)})`);   // 识别灯
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ───────── 求助动画 ───────── */
  // 瞄准镜：搜索时在海盗之间游走，锁定时收缩到命中点
  function drawScope(g, t) {
    const sc = g.scope; if (!sc) return;
    let x, y, r, a, col;
    if (sc.lock < 0) {
      const alive = g.st.pirates.filter(p => p.alive);
      if (!alive.length) return;
      const idx = Math.floor(sc.t * 2.5) % alive.length, k = (sc.t * 2.5) % 1;
      const p0 = Physics.entPos(g.L.pirates[alive[idx].i], g.st.t), p1 = Physics.entPos(g.L.pirates[alive[(idx + 1) % alive.length].i], g.st.t);
      const e = k < 0.6 ? 0 : (k - 0.6) / 0.4;
      x = p0[0] + (p1[0] - p0[0]) * e; y = p0[1] + (p1[1] - p0[1]) * e;
      r = 70 + 10 * Math.sin(sc.t * 9); a = sc.t * 2; col = '255,207,107';
    } else {
      if (!sc.target || sc.t > 1.6) return;
      const k = Math.min(1, sc.t / 0.5), e = 1 - Math.pow(1 - k, 3);
      [x, y] = sc.target; r = 120 - 80 * e; a = (1 - e) * 3; col = '123,227,160';
      ctx.globalAlpha = sc.t > 1.1 ? Math.max(0, 1 - (sc.t - 1.1) / 0.5) : 1;
    }
    ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const b = a + i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(b) * r * 0.75, y + Math.sin(b) * r * 0.75);
      ctx.lineTo(x + Math.cos(b) * r * 1.3, y + Math.sin(b) * r * 1.3); ctx.stroke();
    }
    ctx.fillStyle = `rgba(${col},1)`; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 预警机：从左到右飞过星区上空，雷达扫描线经过的地方辅助线才显现
  const AWACS_DUR = 3.6;   // 预警机飞过星区的时间（秒）
  function awacsReveal(g) { return g.awacsT < 0 ? 1 : clamp(g.awacsT / AWACS_DUR, 0, 1); }
  function drawAwacs(g, t) {
    if (g.awacsT < 0 || g.awacsT > AWACS_DUR + 0.8) return;
    const k = g.awacsT / AWACS_DUR, x = -200 + (W + 400) * k, y = 110;
    if (k <= 1) {
      // 扫描线
      const sx = -60 + (W + 120) * k;
      const gr = ctx.createLinearGradient(sx - 160, 0, sx, 0);
      gr.addColorStop(0, 'rgba(123,227,160,0)'); gr.addColorStop(1, 'rgba(123,227,160,0.18)');
      ctx.fillStyle = gr; ctx.fillRect(sx - 160, 0, 160, H);
      ctx.strokeStyle = 'rgba(123,227,160,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    // 雷达波
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const f = (g.awacsT * 1.4 + i / 3) % 1;
      ctx.strokeStyle = `rgba(123,227,160,${0.5 * (1 - f)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 20 + f * 160, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 机身（朝右）
    ctx.save(); ctx.translate(x, y);
    poly([[60, 0], [44, -7], [-40, -7], [-58, -26], [-66, -26], [-56, -5], [-56, 5], [-66, 26], [-58, 26], [-40, 7], [44, 7]]);
    ctx.fillStyle = '#d9e2f2'; ctx.fill(); ctx.strokeStyle = '#7be3a0'; ctx.lineWidth = 2; ctx.stroke();
    poly([[18, 0], [-6, -46], [-20, -46], [-8, 0], [-20, 46], [-6, 46]]);
    ctx.fillStyle = '#b9c6dc'; ctx.fill(); ctx.stroke();
    // 机背雷达罩（旋转）
    ctx.fillStyle = '#2b3a55'; ctx.beginPath(); ctx.ellipse(-12, 0, 24, 24 * Math.abs(Math.cos(t * 4)) + 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7be3a0'; ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter'; glow(x - 62, y, 16, 'rgba(255,170,90,0.7)'); ctx.globalCompositeOperation = 'source-over';
  }

  /* ───────── 新物理机制：磁场、洛希极限、可推动的小行星 ───────── */
  // 磁场区域：⊙ 表示磁感线指出屏幕、⊗ 表示指入；旋转的箭头弧标出鱼雷会往哪边拐
  function drawField(f, t) {
    const cw = f.w > 0;   // 世界坐标 y 向下，正角速度 = 顺时针
    ctx.save();
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.clip();
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    gr.addColorStop(0, 'rgba(170,110,255,0.16)'); gr.addColorStop(1, 'rgba(170,110,255,0.05)');
    ctx.fillStyle = gr; ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    ctx.strokeStyle = 'rgba(200,160,255,0.45)'; ctx.fillStyle = 'rgba(200,160,255,0.45)'; ctx.lineWidth = 1.5;
    const step = 46;
    for (let gx = f.x - f.r + step / 2; gx < f.x + f.r; gx += step) for (let gy = f.y - f.r + step / 2; gy < f.y + f.r; gy += step) {
      if (Math.hypot(gx - f.x, gy - f.y) > f.r - 10) continue;
      ctx.beginPath(); ctx.arc(gx, gy, 6, 0, TAU); ctx.stroke();
      if (cw) { ctx.beginPath(); ctx.moveTo(gx - 4, gy - 4); ctx.lineTo(gx + 4, gy + 4); ctx.moveTo(gx + 4, gy - 4); ctx.lineTo(gx - 4, gy + 4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(gx, gy, 1.8, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(190,140,255,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // 两段旋转箭头
    const dir = cw ? 1 : -1, r = f.r * 0.62;
    ctx.strokeStyle = 'rgba(220,190,255,0.75)'; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const a0 = dir * t * 0.8 + i * Math.PI, a1 = a0 + dir * 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const hx = f.x + Math.cos(a1) * r, hy = f.y + Math.sin(a1) * r, ta = a1 + dir * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(ta - 0.5) * 12, hy - Math.sin(ta - 0.5) * 12);
      ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(ta + 0.5) * 12, hy - Math.sin(ta + 0.5) * 12);
      ctx.stroke();
    }
  }
  // 洛希极限：进入这个圈，鱼雷会被潮汐力撕成两枚
  function drawRoche(b, t) {
    const [x, y] = Physics.entPos(b, game.st.t);
    ctx.strokeStyle = `rgba(255,140,110,${0.45 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 15;
    ctx.beginPath(); ctx.arc(x, y, b.tidal, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // 可推动的小行星：暖色，带一圈箭头提示「能撞动」
  function drawPuck(pk, shape, t) {
    ctx.save(); ctx.translate(pk.x, pk.y);
    poly(shape.map(([a, k]) => [Math.cos(a) * pk.r * k, Math.sin(a) * pk.r * k]));
    ctx.fillStyle = '#4a3322'; ctx.fill(); ctx.strokeStyle = '#e8b27a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(pk.r * 0.25, -pk.r * 0.2, pk.r * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
    if (!pk.moving) {
      ctx.strokeStyle = `rgba(232,178,122,${0.35 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, r0 = pk.r + 8, r1 = pk.r + 16;
        ctx.beginPath(); ctx.moveTo(pk.x + Math.cos(a) * r0, pk.y + Math.sin(a) * r0); ctx.lineTo(pk.x + Math.cos(a) * r1, pk.y + Math.sin(a) * r1); ctx.stroke();
      }
    }
  }

  function drawPrediction(g) {
    const angle = g.aimA, power = g.aimP, L = g.L;
    // 普通模式：只看前 preview 秒，不判定海盗。
    // 预警机模式：一直算到这次发射结束，把海盗、民船、被撞飞的小行星都模拟进去，看此刻发射能不能命中。
    const full = g.fullLine;
    const span = Math.round((L.preview || 0.9) / DT);
    const steps = full ? Math.ceil(Physics.MAX_TIME / DT) * 2 : span;
    const st = Physics.cloneState(g.st);          // 本地副本推进时间（公转的行星会动），不影响真实状态
    const shot = Physics.newShot(L, angle, power);
    const evs = full ? [] : null, pts = [];
    let done = false;
    for (let i = 1; i <= steps && !done; i++) {
      st.t += DT;
      done = Physics.stepShot(L, st, shot, DT, evs);
      if (i % 8 === 0 || done) {
        for (const tp of shot.torps) if (!tp.done || !tp.mark) { pts.push([tp.x, tp.y, i, 0]); if (tp.done) tp.mark = 1; }
        for (const pk of st.pucks) if (pk.moving) pts.push([pk.x, pk.y, i, 1]);
      }
    }
    const civ = full && evs.some(e => e.type === 'civ');
    const hits = full && !civ ? evs.filter(e => e.type === 'kill' || e.type === 'bosshit') : [];
    const hit = hits.length > 0;
    if (full && hit !== !!g.predHit) { g.predHit = hit; refreshControls(); }
    // 预警机刚到时，辅助线随雷达扫描逐步显现
    const reveal = full ? awacsReveal(g) : 1;
    ctx.save();
    if (reveal < 1) { ctx.beginPath(); ctx.rect(-400, -400, 400 + (W + 120) * reveal - 60, H + 800); ctx.clip(); }
    for (const [x, y, i, isPuck] of pts) {
      const f = full ? 0.75 : Math.max(0, 1 - i / span);
      ctx.fillStyle = isPuck ? `rgba(255,190,120,${0.35 + 0.6 * f})`
        : hit ? `rgba(123,227,160,${0.35 + 0.6 * f})` : `rgba(255,232,170,${0.25 + 0.7 * f})`;
      ctx.beginPath(); ctx.arc(x, y, full ? 3 : 2.6 + 1.8 * f, 0, TAU); ctx.fill();
    }
    if (hit) {
      ctx.strokeStyle = 'rgba(123,227,160,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      for (const e of hits) { ctx.beginPath(); ctx.arc(e.x, e.y, 36, 0, TAU); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (civ) {   // 会打到民船：红圈警告
      const c = evs.find(e => e.type === 'civ');
      ctx.strokeStyle = 'rgba(255,110,110,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, 38, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(255,120,100,0.9)'; ctx.lineWidth = 2.5;
    for (const tp of shot.torps) {
      if (!tp.done || ['lost', 'timeout', 'civ'].includes(tp.end) || (hit && tp.end === 'absorbed')) continue;
      ctx.beginPath(); ctx.moveTo(tp.x - 7, tp.y - 7); ctx.lineTo(tp.x + 7, tp.y + 7); ctx.moveTo(tp.x + 7, tp.y - 7); ctx.lineTo(tp.x - 7, tp.y + 7); ctx.stroke();
    }
    ctx.restore();
    return { angle, power };
  }

  function renderPlay(t) {
    const g = game, L = g.L;
    worldTransform();
    if (g.shake > 0) ctx.translate(rand(-1, 1) * g.shake * 8, rand(-1, 1) * g.shake * 8);
    // 星区边界
    ctx.strokeStyle = 'rgba(120,150,220,0.10)'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);
    for (const w of L.worms || []) drawWorm(w, t);
    for (const p of L.planets || []) drawPlanet(p, t);
    for (const h of L.holes || []) drawHole(h, t);
    for (const rk of g.rocks) drawRock(rk);
    for (const m of L.mirrors || []) drawMirror(m, t);
    for (const q of L.repulsors || []) drawRepulsor(q, t);
    for (const c of L.civs || []) drawCiv(c, t);
    for (const f of L.fields || []) drawField(f, t);
    for (const b of [...(L.planets || []), ...(L.holes || [])]) if (b.tidal) drawRoche(b, t);
    g.st.pucks.forEach((pk, k) => { if (pk.alive) drawPuck(pk, g.puckShapes[k], t); });
    strokeTrail(g.ghost, 'rgba(220,230,255,0.22)', 1.5, [5, 7]);
    ctx.globalCompositeOperation = 'lighter';
    if (g.torp) for (const tp of g.torp.torps) strokeTrail(tp.trail, 'rgba(255,200,110,0.75)', 2.5);
    for (const tr of g.ptrails) strokeTrail(tr, 'rgba(255,190,120,0.55)', 2, [3, 4]);
    ctx.globalCompositeOperation = 'source-over';
    for (const ps of g.st.pirates) if (ps.alive) drawPirate(ps, t);
    let angle = g.angle, power = 0;
    const aiming = g.phase === 'aim' && !g.torp && !g.outcome;
    if (aiming && g.hint && !g.aimTween) {
      // 自动瞄准算出的航线和命中点
      ctx.globalCompositeOperation = 'lighter';
      strokeTrail(g.hint.path, `rgba(123,227,160,${0.55 + 0.3 * Math.sin(t * 4)})`, 3, [10, 7]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(123,227,160,0.8)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]);
      for (const [x, y] of g.hint.marks || []) { ctx.beginPath(); ctx.arc(x, y, 34 + 4 * Math.sin(t * 5), 0, TAU); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (aiming) {
      ({ angle, power } = drawPrediction(g));
    }
    drawScope(g, t);
    drawAwacs(g, t);
    drawCourier(L, angle, t);
    if (aiming) {
      const [x, y] = L.launch;
      ctx.strokeStyle = 'rgba(255,207,107,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 44, -Math.PI / 2, -Math.PI / 2 + TAU * power); ctx.stroke();
    }
    if (g.torp) for (const tp of g.torp.torps) {
      if (tp.done) continue;
      ctx.globalCompositeOperation = 'lighter';
      glow(tp.x, tp.y, 22, 'rgba(255,220,150,0.85)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tp.x, tp.y, 4.5, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of g.parts) {
      ctx.globalAlpha = clamp(p.life / p.max * 1.4, 0, 1); ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (const r of g.rings) {
      const f = r.t / r.dur, rr = r.r0 + (r.r1 - r.r0) * f;
      ctx.strokeStyle = `rgba(${r.c},${1 - f})`; ctx.lineWidth = 3 * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, rr), 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 屏幕空间文字（竖屏旋转时也保持正向）
    screenTransform();
    const sc = clamp(view.s * 1.2, 0.65, 1.2);
    for (const f of g.floats) {
      const [sx, sy] = toScreen(f.x, f.y);
      ctx.globalAlpha = clamp((1.4 - f.t) * 2, 0, 1);
      ctx.font = `800 ${Math.round(f.size * sc)}px ${font()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,8,15,0.8)'; ctx.strokeText(f.text, sx, sy - f.t * 30);
      ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy - f.t * 30);
    }
    ctx.globalAlpha = 1;
    if (g.drag) {
      ctx.font = `700 13px ${font()}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffcf6b';
      const [sx, sy] = toScreen(L.launch[0], L.launch[1]);
      ctx.fillText(T('powerPct', { p: Math.round(power * 100) }), sx, sy - 54 * Math.max(0.6, view.s));
    }
    if (aiming && !g.drag && !g.touched && g.used === 0 && L.id <= 2) {
      // 新手提示：在画面中间示范一次拖动
      const cx = view.ox + (view.rot ? H : W) * view.s * 0.5, cy = view.oy + (view.rot ? W : H) * view.s * 0.62;
      const k = (t % 1.8) / 1.8, d = 60 * Math.min(1, k * 1.6);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - d, cy + d * 0.4, 10, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.font = `600 14px ${font()}`; ctx.textAlign = 'center'; ctx.fillStyle = '#e9eef8';
      ctx.fillText(T('dragHint'), cx, cy + 50);
      ctx.globalAlpha = 1;
    }
  }

  /* ───────── 渲染：标题背景 ───────── */
  function renderTitleBg(t) {
    screenTransform();
    const S = Math.min(cw, ch), cx = cw * 0.5, cy = ch * 0.5;
    const pr = S * 0.13, px = cx + S * 0.55 > cw ? cx + S * 0.28 : cx + S * 0.55, py = cy + S * 0.18;
    const g = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 2, px, py, pr);
    g.addColorStop(0, hsl(18, 70, 70, 0.9)); g.addColorStop(1, hsl(18, 60, 18, 0.9));
    ctx.globalCompositeOperation = 'lighter'; glow(px, py, pr * 1.5, 'rgba(255,140,80,0.15)'); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    // 一条绕行星甩出去的弧线
    ctx.globalCompositeOperation = 'lighter';
    const k = (t * 0.25) % 1;
    ctx.strokeStyle = 'rgba(255,200,110,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80 * k;
      const a = Math.PI * 1.1 + u * Math.PI * 1.5, rr = pr * (3.2 - 1.6 * Math.sin(u * Math.PI));
      const x = px + Math.cos(a) * rr, y = py + Math.sin(a) * rr * 0.7;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ───────── 主循环 ───────── */
  let last = performance.now(), clock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    if (scene === 'play' && game) updatePlay(dt);
    drawSky(clock);
    if (scene === 'title') renderTitleBg(clock);
    if (scene === 'play' && game) renderPlay(clock);
    requestAnimationFrame(frame);
  }

  /* ───────── 输入 ───────── */
  const pos = e => [e.clientX, e.clientY];
  canvas.addEventListener('pointerdown', e => {
    Sfx.init();
    if (scene !== 'play' || !game || game.paused) return;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (canAim()) {
      // 从当前瞄准出发做相对调整：手指放哪里都行，不会挡住飞船；触屏灵敏度更低，方便微调
      const m = maxDrag(), [dx, dy] = w2sDir(Math.cos(game.aimA), Math.sin(game.aimA));
      game.drag = { x, y, px: -dx * game.aimP * m, py: -dy * game.aimP * m, gain: e.pointerType === 'mouse' ? 1 : 0.6 };
      game.touched = true;
    } else if (game.torp) fastOn();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const d = game && game.drag;
    if (!d || !canAim()) return;
    const [x, y] = pos(e), m = maxDrag();
    let px = d.px + (x - d.x) * d.gain, py = d.py + (y - d.y) * d.gain;
    const len = Math.hypot(px, py);
    if (len > m) { px *= m / len; py *= m / len; }
    if (len > 0.5 && Math.hypot(x - d.x, y - d.y) > 3) {
      userAim();
      const [wx, wy] = s2wDir(-px, -py); setAim(Math.atan2(wy, wx), Math.min(len, m) / m);
    }
  });
  const release = () => { if (game) { game.drag = null; game.fast = false; } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  ui.intro.addEventListener('pointerdown', e => {
    Sfx.init(); e.preventDefault();
    if (game && game.phase === 'intro') { game.phase = 'aim'; show(ui.intro, false); refreshControls(); refreshHelp(); }
  });
  function fastOn() {
    game.fast = true;
    if (!save.seenFast) { save.seenFast = true; persist(); show(ui.fast, false); }
  }

  // 按住连续触发的微调按钮
  function holdRepeat(el, fn) {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); Sfx.init(); stop(); fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 45); }, 320);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
  }
  holdRepeat($('angDown'), () => nudgeAngle(-0.5));
  holdRepeat($('angUp'), () => nudgeAngle(0.5));
  holdRepeat($('powDown'), () => nudgePower(-0.01));
  holdRepeat($('powUp'), () => nudgePower(0.01));
  const fireBtn = $('btnFire');
  fireBtn.addEventListener('pointerdown', e => {
    e.preventDefault(); Sfx.init();
    if (!game) return;
    if (game.torp) fastOn(); else fire();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => fireBtn.addEventListener(ev, () => { if (game) game.fast = false; }));
  ui.controls.addEventListener('contextmenu', e => e.preventDefault());

  function pause(on) {
    if (!game || game.done) return;
    game.paused = on; game.drag = null; game.fast = false;
    show(ui.pause, on); refreshControls();
  }
  $('btnPlay').onclick = () => { Sfx.init(); Sfx.click(); const next = LEVELS.find(l => !starsOf(l.id)); startLevel(next ? next.id : 1, false); };
  $('btnSelect').onclick = () => { Sfx.init(); Sfx.click(); goSelect(); };
  $('btnMuteTitle').onclick = () => { Sfx.init(); toggleMute(); };
  $('btnBackTitle').onclick = () => { Sfx.click(); goTitle(); };
  $('btnMute').onclick = () => { Sfx.init(); toggleMute(); };
  $('btnRestart').onclick = () => { Sfx.click(); if (game) startLevel(game.id, true); };
  $('btnAwacs').onclick = () => { Sfx.init(); callAwacs(); };
  $('btnScope').onclick = () => { Sfx.init(); autoAim(); };
  $('btnPause').onclick = () => { Sfx.click(); pause(true); };
  $('btnResume').onclick = () => { Sfx.click(); pause(false); };
  $('btnPauseRestart').onclick = () => { Sfx.click(); startLevel(game.id, true); };
  $('btnPauseSelect').onclick = () => { Sfx.click(); goSelect(); };
  $('btnPauseTitle').onclick = () => { Sfx.click(); goTitle(); };
  $('btnVibeTitle').onclick = () => { Sfx.init(); toggleVibe(); };
  $('btnLangTitle').onclick = () => { Sfx.init(); Sfx.click(); toggleLang(); };
  $('btnPauseLang').onclick = () => { Sfx.click(); toggleLang(); };
  $('pcOk').onclick = () => { Sfx.click(); show(ui.card, false); };
  $('btnPauseVibe').onclick = () => { Sfx.click(); toggleVibe(); };

  addEventListener('keydown', e => {
    if (scene !== 'play' || !game) return;
    if (e.key === 'r' || e.key === 'R') startLevel(game.id, true);
    else if (e.key === 'Escape') pause(!game.paused);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (game.done) { if (e.key === 'Enter' && game.outcome === 'win' && game.id < LEVELS.length) startLevel(game.id + 1, false); }
      else if (game.phase === 'intro') { game.phase = 'aim'; show(ui.intro, false); refreshControls(); refreshHelp(); }
      else if (game.torp) game.fast = true;
      else if (!e.repeat) fire();
    }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nudgeAngle((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.5)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudgePower((e.key === 'ArrowDown' ? -1 : 1) * 0.01); }
  });
  addEventListener('keyup', e => { if (e.key === ' ' && game) game.fast = false; });
  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.done && game.phase !== 'intro') pause(true); });

  /* ───────── 启动 ───────── */
  I18N.set(save.lang || I18N.detect()); I18N.applyStatic();
  layout(); muteLabel(); vibeLabel();
  const m = location.search.match(/[?&]lv=(\d+)/);
  if (m && LEVELS[+m[1] - 1]) startLevel(+m[1], false); else goTitle();
  requestAnimationFrame(frame);

  // 调试/自动化测试用
  window.__game = {
    get state() { return game; }, startLevel, awacs: callAwacs, autoAim, fire,
    predict: () => { worldTransform(); drawPrediction(game); return game.predHit; },
    aim: (deg, pw) => setAim(deg * Math.PI / 180, pw),
    launch: (deg, pw) => { game.phase = 'aim'; show(ui.intro, false); launch(deg * Math.PI / 180, pw); },
    step: sec => { for (let i = 0; i < sec * 60 && game && !game.done; i++) updatePlay(1 / 60); },
  };
})();
