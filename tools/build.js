#!/usr/bin/env node
/* 把 index.html 及其 CSS/JS 内联成一个独立文件 dist/gravity-courier.html，
 * 方便拷到手机上直接用浏览器打开。用法：node tools/build.js */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'gravity-courier.html');
fs.writeFileSync(out, html);
console.log(`已生成 ${out}（${(fs.statSync(out).size / 1024).toFixed(1)} KB）`);
