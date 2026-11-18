#!/usr/bin/env node
/* 生成 GitHub Pages 用的 PWA 站点：把源码内联成单文件写进 docs/index.html。
 * manifest.webmanifest、sw.js、icons/ 本来就放在 docs/ 里，这里只检查它们在不在。
 * 用法：node tools/build_web.js */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');

cp.execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });

const bundle = path.join(root, 'dist', 'gravity-courier.html');
fs.mkdirSync(docs, { recursive: true });
fs.copyFileSync(bundle, path.join(docs, 'index.html'));

const required = ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const missing = required.filter(f => !fs.existsSync(path.join(docs, f)));
if (missing.length) {
  console.warn('缺少 PWA 文件：' + missing.join('、'));
}

console.log(`docs/index.html 已更新（${(fs.statSync(bundle).size / 1024).toFixed(1)} KB），PWA 资源${missing.length ? '不完整' : '齐全'}`);
