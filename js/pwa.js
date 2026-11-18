/* PWA：注册 Service Worker + 提供「安装到桌面」入口。
 * 只在 https（或 localhost）下生效；本地双击打开、itch.io 的 iframe 里会自动跳过，不影响游戏。
 * 依赖 game.js 之前加载的全局 I18N（可选），拿不到就用浏览器语言判断。 */
(function () {
  'use strict';

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  /* ───────── Service Worker ───────── */
  if (secure && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
        /* 注册失败只是没有离线能力，游戏照常玩 */
      });
    });
  }

  /* ───────── Android / 桌面 Chrome：显示安装按钮 ───────── */
  var deferred = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    addInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    var b = document.getElementById('btnInstallApp');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  });

  function addInstallButton() {
    if (!deferred || document.getElementById('btnInstallApp')) return;
    var menu = document.querySelector('#title .menu');
    if (!menu) { setTimeout(addInstallButton, 400); return; }

    var b = document.createElement('button');
    b.id = 'btnInstallApp';
    b.className = 'btn ghost';
    b.textContent = '安装到桌面 / Install';
    b.addEventListener('click', function () {
      if (!deferred) return;
      var p = deferred;
      deferred = null;
      p.prompt();
      if (p.userChoice && p.userChoice.then) {
        p.userChoice.then(function () {
          if (b.parentNode) b.parentNode.removeChild(b);
        });
      }
    });
    menu.appendChild(b);
  }

  /* ───────── iOS：没有安装事件，给一次分享提示 ───────── */
  if (isIOS && !standalone && secure) {
    var HINT_KEY = 'gravity-courier-pwa-hint';
    var shown = false;
    try { shown = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* 忽略 */ }
    if (!shown) {
      setTimeout(showIOSHint, 1800);
    }

    function showIOSHint() {
      if (document.getElementById('pwaHint')) return;
      var zh = !(window.I18N && window.I18N.lang === 'en');
      var box = document.createElement('div');
      box.id = 'pwaHint';
      box.style.cssText = [
        'position:fixed', 'left:12px', 'right:12px', 'bottom:calc(14px + env(safe-area-inset-bottom))',
        'z-index:60', 'padding:12px 14px', 'border-radius:12px',
        'background:rgba(18,26,44,.94)', 'border:1px solid rgba(107,227,255,.35)',
        'color:#dfe7f5', 'font-size:13px', 'line-height:1.5',
        'box-shadow:0 8px 24px rgba(0,0,0,.45)', 'cursor:pointer'
      ].join(';');
      box.textContent = zh
        ? '想装到桌面？点 Safari 下方的「分享」，选「添加到主屏幕」。点这里关闭。'
        : 'To install: tap Share in Safari, then “Add to Home Screen”. Tap here to dismiss.';
      box.addEventListener('click', function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      document.body.appendChild(box);
      try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* 忽略 */ }
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 14000);
    }
  }
})();
