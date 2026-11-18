/* 引力信使 · 物理核心
 * 游戏、预测线、求助和关卡求解器（tools/solve.js）共用这一份代码，保证结果一致。
 * 世界坐标固定为 1600 x 900，固定步长积分，同样的输入永远得到同样的轨迹。
 *
 * 一次发射是一个 shot：里面可能有多枚鱼雷（潮汐撕裂会一分为二），
 * 被撞飞的小行星（puck）记在 state 里，也会接着飞，直到全部停下这次发射才结束。
 * 调用方式：每一步先 state.t += DT，再 stepShot(level, state, shot, DT, events)。
 */
(function (root) {
  'use strict';
  const W = 1600, H = 900;
  const G = 3200;                 // 行星质量 = G * r^2 * 密度
  const DT = 1 / 240;             // 固定步长
  const MAX_SPEED = 720;          // 满力度发射速度（px/s）
  const MAX_TIME = 10;            // 鱼雷/被撞飞的小行星最长飞行时间
  const SHIELD_HALF = 70 * Math.PI / 180;
  const SHIELD_GAP = 14;          // 护盾弧离船体的距离
  const CIV_R = 26;               // 民用货船的碰撞半径
  const TORP_MASS = 1;            // 鱼雷质量（和可推动小行星做弹性碰撞时用）
  const KINDS = {
    scout: { r: 22, hp: 1 },
    shield: { r: 26, hp: 1 },
    boss: { r: 58, hp: 3 },
  };

  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // 命中半径：前期关卡的海盗船更大（level.hitScale），母舰不缩放
  function radius(level, kind) {
    return KINDS[kind].r * (kind === 'boss' ? 1 : (level.hitScale || 1));
  }

  // 位置：静止物体直接用 x,y；会动的按 move 描述随时间计算（行星、海盗、民船都适用）
  function entPos(e, t) {
    const m = e.move;
    if (!m) return [e.x, e.y];
    if (m.type === 'orbit') {
      const a = (m.phase || 0) * Math.PI / 180 + m.w * t;
      return [m.cx + Math.cos(a) * m.R, m.cy + Math.sin(a) * m.R];
    }
    // line：在 a、b 两点之间平滑往返
    const s = 0.5 - 0.5 * Math.cos((t / m.period + (m.phase || 0)) * 2 * Math.PI);
    return [m.ax + (m.bx - m.ax) * s, m.ay + (m.by - m.ay) * s];
  }

  // 护盾朝向（弧度）。没写 face 的护盾舰始终朝向玩家。
  function faceOf(level, p, t) {
    if (p.face !== undefined) return (p.face + (p.spin || 0) * t) * Math.PI / 180;
    const [x, y] = entPos(p, t);
    return Math.atan2(level.launch[1] - y, level.launch[0] - x);
  }

  function muPlanet(p) { return G * p.r * p.r * (p.d || 1); }
  function muHole(h) { return G * h.m; }

  // 引力加速度。t 用于计算公转中的行星位置（引力弹弓）。
  function accel(level, x, y, t) {
    let ax = 0, ay = 0;
    const add = (px, py, mu) => {
      const dx = px - x, dy = py - y, d2 = dx * dx + dy * dy + 100, d = Math.sqrt(d2), a = mu / d2;
      ax += a * dx / d; ay += a * dy / d;
    };
    for (const p of level.planets || []) { const [px, py] = entPos(p, t || 0); add(px, py, muPlanet(p)); }
    for (const h of level.holes || []) add(h.x, h.y, muHole(h));
    for (const q of level.repulsors || []) add(q.x, q.y, -G * q.m);   // 斥力星：负质量，把鱼雷推开
    return [ax, ay];
  }

  function createState(level) {
    return {
      t: 0,
      pirates: (level.pirates || []).map((p, i) => ({
        i, kind: p.kind || 'scout', hp: p.hp || KINDS[p.kind || 'scout'].hp, alive: true,
      })),
      // 可以被鱼雷撞动的小行星（动量碰撞）
      pucks: (level.pucks || []).map(p => ({ x: p.x, y: p.y, vx: 0, vy: 0, r: p.r, m: p.m || 2, alive: true, moving: false, age: 0 })),
    };
  }
  function cloneState(st) {
    return { t: st.t, pirates: st.pirates.map(p => ({ ...p })), pucks: st.pucks.map(p => ({ ...p })) };
  }

  function launchVel(angle, power) {
    return [Math.cos(angle) * MAX_SPEED * power, Math.sin(angle) * MAX_SPEED * power];
  }
  const mkTorp = (x, y, vx, vy) => ({ x, y, vx, vy, age: 0, cool: 0, split: false, done: false, end: null });
  function newShot(level, angle, power) {
    const [vx, vy] = launchVel(angle, power);
    return { torps: [mkTorp(level.launch[0], level.launch[1], vx, vy)] };
  }

  /* ───────── 共用的碰撞判定 ───────── */
  // 反射镜：本步位移线段穿过镜面就反弹（两面都能反射）
  function reflect(level, ox, oy, b, events) {
    for (const m of level.mirrors || []) {
      const rx = b.x - ox, ry = b.y - oy, sx = m.bx - m.ax, sy = m.by - m.ay;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      const qx = m.ax - ox, qy = m.ay - oy;
      const u = (qx * sy - qy * sx) / den, v = (qx * ry - qy * rx) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const len = Math.hypot(sx, sy), nx = -sy / len, ny = sx / len;
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
      const ix = ox + rx * u, iy = oy + ry * u;
      const side = (ox - ix) * nx + (oy - iy) * ny >= 0 ? 1 : -1;
      b.x = ix + nx * side * 0.5; b.y = iy + ny * side * 0.5;
      if (events) events.push({ type: 'bounce', x: ix, y: iy });
      return true;
    }
    return false;
  }
  // 撞上不可破坏的天体。pr 是撞击物自身的半径（鱼雷为 0）。
  function hitSolid(level, t, x, y, pr) {
    for (const p of level.planets || []) { const [px, py] = entPos(p, t); if (Math.hypot(x - px, y - py) < p.r + pr) return 'planet'; }
    for (const h of level.holes || []) if (Math.hypot(x - h.x, y - h.y) < h.r + pr) return 'hole';
    for (const r of level.rocks || []) if (Math.hypot(x - r.x, y - r.y) < r.r + pr) return 'rock';
    for (const q of level.repulsors || []) if (Math.hypot(x - q.x, y - q.y) < q.r + pr) return 'planet';
    return null;
  }
  const outOfBounds = (x, y) => x < -300 || x > W + 300 || y < -300 || y > H + 300;
  function hitCiv(level, state, x, y, pr, events) {
    for (const c of level.civs || []) {
      const [cx, cy] = entPos(c, state.t);
      if (Math.hypot(x - cx, y - cy) < CIV_R + pr) { events.push({ type: 'civ', x: cx, y: cy }); return 'civ'; }
    }
    return null;
  }
  // 海盗：小船被穿透，护盾正面会挡，母舰会吞掉撞击物
  function hitPirates(level, state, x, y, pr, events, by) {
    for (const ps of state.pirates) {
      if (!ps.alive) continue;
      const p = level.pirates[ps.i], r = radius(level, ps.kind) + pr;
      const [px, py] = entPos(p, state.t);
      const d = Math.hypot(x - px, y - py);
      if (d > r + SHIELD_GAP + 2) continue;
      if (ps.kind !== 'scout') {
        const diff = angDiff(Math.atan2(y - py, x - px), faceOf(level, p, state.t));
        if (d < r + SHIELD_GAP && Math.abs(diff) < SHIELD_HALF) {
          events.push({ type: 'block', x, y, i: ps.i });
          return 'blocked';
        }
      }
      if (d < r) {
        ps.hp--;
        if (ps.hp <= 0) { ps.alive = false; events.push({ type: 'kill', i: ps.i, x: px, y: py, by }); }
        else events.push({ type: 'bosshit', i: ps.i, x, y, by });
        if (ps.kind === 'boss') return 'absorbed';
      }
    }
    return null;
  }
  // 弹性碰撞（动量守恒 + 动能守恒），沿连心线交换动量
  function collide(a, ma, b, mb) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vrel <= 0) return 0;
    const J = 2 * vrel / (1 / ma + 1 / mb);
    a.vx -= J / ma * nx; a.vy -= J / ma * ny;
    b.vx += J / mb * nx; b.vy += J / mb * ny;
    return J;
  }

  /* 推进一枚鱼雷一步。返回 null 表示继续飞，否则返回结束原因。
   * events 为 null 时是「普通预测线」：不判定海盗、民船，可推动的小行星当作障碍物。 */
  function stepTorpedo(level, state, tp, dt, events, shot) {
    const t = state.t;
    const [ax, ay] = accel(level, tp.x, tp.y, t);
    const ox = tp.x, oy = tp.y;
    tp.vx += ax * dt; tp.vy += ay * dt;
    // 磁场：带电鱼雷受洛伦兹力，速度方向以角速度 w 旋转、速率不变（速度越快，圆弧越大）
    for (const f of level.fields || []) {
      if (Math.hypot(tp.x - f.x, tp.y - f.y) < f.r) {
        const a = f.w * dt, c = Math.cos(a), s = Math.sin(a), vx = tp.vx;
        tp.vx = vx * c - tp.vy * s; tp.vy = vx * s + tp.vy * c;
      }
    }
    tp.x += tp.vx * dt; tp.y += tp.vy * dt;
    tp.age += dt; tp.cool -= dt;

    reflect(level, ox, oy, tp, events);

    if (tp.cool <= 0) {
      for (const w of level.worms || []) {
        const ends = [[w.a, w.b], [w.b, w.a]];
        let warped = false;
        for (const [a, b] of ends) {
          if (Math.hypot(tp.x - a[0], tp.y - a[1]) < w.r) {
            tp.x = b[0] + (tp.x - a[0]); tp.y = b[1] + (tp.y - a[1]);
            tp.cool = 0.35; warped = true;
            if (events) events.push({ type: 'warp', from: a, to: b });
            break;
          }
        }
        if (warped) break;
      }
    }

    // 潮汐撕裂：进入天体的洛希半径（tidal）后，鱼雷被撕成两枚，向两侧张开
    if (!tp.split && shot) {
      for (const b of [...(level.planets || []), ...(level.holes || [])]) {
        if (!b.tidal) continue;
        const [bx, by] = entPos(b, t);
        if (Math.hypot(tp.x - bx, tp.y - by) < b.tidal) {
          const a = (b.spread || 18) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
          const t2 = mkTorp(tp.x, tp.y, tp.vx * c + tp.vy * s, -tp.vx * s + tp.vy * c);
          const vx = tp.vx; tp.vx = vx * c - tp.vy * s; tp.vy = vx * s + tp.vy * c;
          tp.split = t2.split = true; t2.age = tp.age; t2.cool = tp.cool;
          shot.torps.push(t2);
          if (events) events.push({ type: 'split', x: tp.x, y: tp.y });
          break;
        }
      }
    }

    const solid = hitSolid(level, t, tp.x, tp.y, 0);
    if (solid) return solid;
    if (outOfBounds(tp.x, tp.y)) return 'lost';
    if (tp.age > MAX_TIME) return 'timeout';

    // 可推动的小行星：弹性碰撞，把动量传给它（鱼雷会被弹回一部分）
    for (const pk of state.pucks) {
      if (!pk.alive) continue;
      const d = Math.hypot(pk.x - tp.x, pk.y - tp.y);
      if (d >= pk.r) continue;
      if (!events) return 'rock';
      const J = collide(tp, TORP_MASS, pk, pk.m);
      if (J > 0) { pk.moving = true; events.push({ type: 'push', x: tp.x, y: tp.y }); }
      const nx = (tp.x - pk.x) / (d || 1), ny = (tp.y - pk.y) / (d || 1);
      tp.x = pk.x + nx * (pk.r + 0.5); tp.y = pk.y + ny * (pk.r + 0.5);
    }

    if (!events) return null;
    return hitCiv(level, state, tp.x, tp.y, 0, events) || hitPirates(level, state, tp.x, tp.y, 0, events, 'torp');
  }

  // 被撞飞的小行星：受引力（不受磁场影响，它不带电），会被镜面反弹，撞到海盗会击毁它
  function stepPuck(level, state, pk, dt, events) {
    const [ax, ay] = accel(level, pk.x, pk.y, state.t);
    const ox = pk.x, oy = pk.y;
    pk.vx += ax * dt; pk.vy += ay * dt;
    pk.x += pk.vx * dt; pk.y += pk.vy * dt; pk.age += dt;
    reflect(level, ox, oy, pk, events);
    // 撞上其他小行星：继续传递动量（牛顿摆）
    for (const o of state.pucks) {
      if (o === pk || !o.alive) continue;
      if (Math.hypot(o.x - pk.x, o.y - pk.y) < o.r + pk.r && collide(pk, pk.m, o, o.m) > 0) {
        o.moving = true;
        if (events) events.push({ type: 'push', x: (o.x + pk.x) / 2, y: (o.y + pk.y) / 2 });
      }
    }
    let end = hitSolid(level, state.t, pk.x, pk.y, pk.r) || (outOfBounds(pk.x, pk.y) ? 'lost' : null) || (pk.age > MAX_TIME ? 'timeout' : null);
    if (!end && events) end = hitCiv(level, state, pk.x, pk.y, pk.r, events) || hitPirates(level, state, pk.x, pk.y, pk.r, events, 'puck');
    if (end) {
      pk.moving = false; pk.alive = false;
      if (events) events.push({ type: 'puckend', reason: end, x: pk.x, y: pk.y });
    }
  }

  /* 推进整次发射一步。返回 true 表示这次发射已经全部结束（所有鱼雷和被撞飞的小行星都停了）。
   * 每枚鱼雷结束时追加 {type:'end', reason, x, y, k}。 */
  function stepShot(level, state, shot, dt, events) {
    const n = shot.torps.length;      // 本步刚撕裂出的鱼雷从下一步开始飞
    for (let k = 0; k < n; k++) {
      const tp = shot.torps[k];
      if (tp.done) continue;
      const r = stepTorpedo(level, state, tp, dt, events, shot);
      if (r) { tp.done = true; tp.end = r; if (events) events.push({ type: 'end', reason: r, x: tp.x, y: tp.y, k }); }
    }
    for (const pk of state.pucks) if (pk.moving) stepPuck(level, state, pk, dt, events);
    return shot.torps.every(tp => tp.done) && !state.pucks.some(pk => pk.moving);
  }

  // 完整模拟一次发射（求解器、自动瞄准用）。返回事件列表和是否打到民船。
  function simulate(level, state, angle, power, onStep) {
    const shot = newShot(level, angle, power), events = [];
    let done = false;
    while (!done) {
      state.t += DT;
      done = stepShot(level, state, shot, DT, events);
      if (onStep) onStep(shot, state);
    }
    return { events, shot, civ: events.some(e => e.type === 'civ') };
  }

  const api = { W, H, G, DT, MAX_SPEED, MAX_TIME, SHIELD_HALF, SHIELD_GAP, CIV_R, KINDS,
    entPos, faceOf, accel, radius, createState, cloneState, launchVel, newShot, stepShot, stepTorpedo, simulate,
    angDiff, muPlanet, muHole };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
