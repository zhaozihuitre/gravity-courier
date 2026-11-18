/* 引力信使 · 音效（Web Audio 实时合成，不需要音频文件） */
(function (root) {
  'use strict';
  const Sfx = {
    ctx: null, master: null, noiseBuf: null, muted: false,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    },
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; },
    tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, vol = 0.4, freq = 1000, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
    },
    launch() { this.tone(560, 0.28, 'triangle', 0.18, 150); this.noise(0.22, 0.12, 2400); },
    boom(big) { this.noise(big ? 1.2 : 0.55, big ? 0.7 : 0.45, big ? 700 : 1400); this.tone(big ? 80 : 150, big ? 0.9 : 0.4, 'sine', 0.4, 35); },
    hit() { this.noise(0.3, 0.35, 1800); this.tone(240, 0.25, 'square', 0.08, 90); },
    block() { this.tone(1500, 0.16, 'square', 0.07, 900); this.tone(2300, 0.14, 'sine', 0.08); },
    fizzle() { this.noise(0.3, 0.16, 700); },
    swallow() { this.tone(300, 0.6, 'sine', 0.22, 40); },
    warp() { this.tone(220, 0.35, 'sine', 0.2, 1300); this.tone(330, 0.35, 'triangle', 0.08, 1900, 0.04); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.16, null, i * 0.1)); },
    fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.38, 'triangle', 0.15, null, i * 0.15)); },
    star(i) { this.tone(700 * Math.pow(1.26, i), 0.3, 'triangle', 0.14); },
    click() { this.tone(880, 0.05, 'square', 0.04); },
    // 预警机：引擎轰鸣 + 两声雷达扫描音
    radar() { this.noise(3.4, 0.12, 500); this.tone(90, 3.4, 'sawtooth', 0.04, 70); [0.4, 1.4, 2.4].forEach(d => this.tone(1200, 0.45, 'sine', 0.1, 600, d)); },
    // 瞄准镜：搜索时的嘀嘀声
    scope() { [0, 0.12, 0.24].forEach(d => this.tone(1800, 0.05, 'square', 0.04, null, d)); },
    // 锁定：上扬的双音
    lock() { this.tone(1000, 0.09, 'square', 0.06); this.tone(1500, 0.18, 'square', 0.06, null, 0.1); },
    bounce() { this.tone(2400, 0.08, 'sine', 0.08, 1600); },
    // 潮汐撕裂：撕开的噪声 + 一分为二的双音
    split() { this.noise(0.25, 0.25, 3000); this.tone(700, 0.25, 'triangle', 0.1, 1100); this.tone(700, 0.25, 'triangle', 0.1, 450); },
    // 撞动小行星：低沉的闷响
    thud() { this.tone(120, 0.22, 'sine', 0.35, 55); this.noise(0.15, 0.25, 600); },
  };
  root.Sfx = Sfx;
})(window);
