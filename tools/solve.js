#!/usr/bin/env node
/* 关卡求解器：暴力扫描发射角度 × 力度（以及移动关卡的发射时机），
 * 统计每关能否通关、难度（命中率）和最少发射次数。
 * 用法：node tools/solve.js [关卡编号...] [--fine]
 */
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '../js/physics.js'));
const { LEVELS } = require(path.join(__dirname, '../js/levels.js'));

const args = process.argv.slice(2);
const fine = args.includes('--fine');
const ids = args.filter(a => /^\d+$/.test(a)).map(Number);
const list = ids.length ? LEVELS.filter(l => ids.includes(l.id)) : LEVELS;

function shoot(level, angle, power, t0) {
  const state = P.createState(level);
  state.t = t0;
  const r = P.simulate(level, state, angle, power);
  const hits = [];
  // 打到民船的一发算无效
  if (!r.civ) for (const e of r.events) if (e.type === 'kill' || e.type === 'bosshit') hits.push(e.i);
  return { hits };
}

for (const level of list) {
  const t1 = Date.now();
  const moving = level.pirates.some(p => p.move || p.spin) || (level.civs || []).some(c => c.move) || (level.planets || []).some(p => p.move);
  const phases = moving ? [0, 1, 2, 3, 4, 5, 6, 7] : [0];
  const aStep = fine ? 0.5 : 1, pStep = fine ? 0.025 : 0.05;
  const need = level.pirates.map(p => p.hp || P.KINDS[p.kind || 'scout'].hp);
  const perPirate = need.map(() => 0);
  let total = 0, anyHit = 0, fullClear = 0, maxHits = 0;
  const shots = [];   // 记录有效发射，供贪心估算最少次数
  for (const t0 of phases) {
    for (let deg = 0; deg < 360; deg += aStep) {
      for (let pw = 0.2; pw <= 1.0001; pw += pStep) {
        total++;
        const r = shoot(level, deg * Math.PI / 180, pw, t0);
        if (!r.hits.length) continue;
        anyHit++;
        const uniq = [...new Set(r.hits)];
        uniq.forEach(i => perPirate[i]++);
        maxHits = Math.max(maxHits, r.hits.length);
        if (need.every((n, i) => r.hits.filter(h => h === i).length >= n)) fullClear++;
        if (shots.length < 20000) shots.push({ deg, pw: +pw.toFixed(3), t0, hits: r.hits });
      }
    }
  }
  // 贪心：每次选能打掉最多剩余血量的一发
  const remain = need.slice();
  let greedy = 0, best = [];
  while (remain.some(n => n > 0) && greedy < 20) {
    let pick = null, score = 0;
    for (const s of shots) {
      const tmp = remain.slice(); let sc = 0;
      for (const h of s.hits) if (tmp[h] > 0) { tmp[h]--; sc++; }
      if (sc > score) { score = sc; pick = s; }
    }
    if (!pick) break;
    for (const h of pick.hits) if (remain[h] > 0) remain[h]--;
    greedy++; best.push(`${pick.deg}°/${Math.round(pick.pw * 100)}%${moving ? '@' + pick.t0 + 's' : ''}`);
  }
  const ok = remain.every(n => n <= 0);
  const pct = n => (100 * n / total).toFixed(2) + '%';
  console.log(
    `${String(level.id).padStart(2)} ${level.name.padEnd(5, '　')} ` +
    `${ok ? 'OK ' : 'NO!'} 最少≈${ok ? greedy : '-'} par=${level.par} ammo=${level.ammo} | ` +
    `命中率 ${pct(anyHit)} 一发清场 ${pct(fullClear)} 单发最多 ${maxHits} | 各目标 ${perPirate.map(pct).join(' ')} | ` +
    `示例 ${best.slice(0, 4).join(', ')} (${((Date.now() - t1) / 1000).toFixed(1)}s)`
  );
}
