/* Buggy Race - procedural audio (no external assets) */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = true;
    this.sfxOn = true;
    this.started = false;
  }

  Audio.prototype.init = function () {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.22 : 0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
    this.sfxGain.connect(this.master);

    this.started = true;
  };

  Audio.prototype.resume = function () {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  };

  Audio.prototype.setSfx = function (on) {
    this.sfxOn = on;
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  };

  Audio.prototype.setMusic = function (on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.08);
    if (on) this.startMusic(); else this.stopMusic();
  };

  /* ---------- engine loop ---------- */
  Audio.prototype.startEngine = function () {
    if (!this.ctx || this.engine) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var sub = ctx.createOscillator();
    var oscGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var rumble = ctx.createBufferSource();
    var rumbleGain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 55;
    sub.type = "square";
    sub.frequency.value = 27;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 6;
    oscGain.gain.value = 0;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(this.sfxGain);

    var len = ctx.sampleRate * 1.5;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    rumble.buffer = buf;
    rumble.loop = true;
    rumbleGain.gain.value = 0;
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.sfxGain);

    osc.start();
    sub.start();
    rumble.start();

    this.engine = {
      osc: osc, sub: sub, filter: filter, gain: oscGain,
      rumble: rumble, rumbleGain: rumbleGain
    };
  };

  Audio.prototype.stopEngine = function () {
    if (!this.engine) return;
    var e = this.engine;
    var now = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, now, 0.05);
    e.rumbleGain.gain.setTargetAtTime(0, now, 0.05);
    try { e.osc.stop(now + 0.25); e.sub.stop(now + 0.25); e.rumble.stop(now + 0.25); } catch (err) {}
    this.engine = null;
  };

  Audio.prototype.updateEngine = function (throttle, speed01, airborne) {
    if (!this.engine) return;
    var e = this.engine;
    var now = this.ctx.currentTime;
    var target = airborne ? 0.05 : (0.1 + 0.24 * throttle);
    var freq = 46 + speed01 * 120 + throttle * 26;
    var cut = 300 + speed01 * 900 + (airborne ? 200 : 0);
    e.gain.gain.setTargetAtTime(target, now, 0.06);
    e.rumbleGain.gain.setTargetAtTime(airborne ? 0.02 : 0.05 + speed01 * 0.1, now, 0.06);
    e.osc.frequency.setTargetAtTime(freq, now, 0.08);
    e.sub.frequency.setTargetAtTime(freq * 0.5, now, 0.08);
    e.filter.frequency.setTargetAtTime(cut, now, 0.08);
  };

  /* ---------- one-shots ---------- */
  Audio.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.sfxOn) return;
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(ctx.currentTime + dur + 0.03);
  };

  Audio.prototype.coin = function () {
    var self = this;
    this.blip(1180, 0.09, "triangle", 0.22);
    setTimeout(function () { self.blip(1760, 0.14, "triangle", 0.16); }, 55);
  };

  Audio.prototype.fuel = function () {
    this.blip(420, 0.12, "square", 0.16, 880);
    var self = this;
    setTimeout(function () { self.blip(660, 0.16, "sine", 0.18, 1320); }, 70);
  };

  Audio.prototype.click = function () {
    this.blip(520, 0.05, "square", 0.12);
  };

  Audio.prototype.upgrade = function () {
    var self = this;
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { self.blip(f, 0.16, "triangle", 0.16); }, i * 70);
    });
  };

  Audio.prototype.crash = function () {
    if (!this.ctx || !this.sfxOn) return;
    var ctx = this.ctx;
    var dur = 0.55;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      var env = Math.pow(1 - i / len, 2);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(2200, ctx.currentTime);
    filt.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);
    var g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start();
    this.blip(90, 0.35, "sawtooth", 0.25, 40);
  };

  Audio.prototype.land = function (force) {
    this.blip(120, 0.12, "sine", BR.clamp(force * 0.12, 0.05, 0.4), 60);
  };

  /* ---------- music ---------- */
  Audio.prototype.startMusic = function () {
    if (!this.ctx || !this.musicOn || this.musicTimer) return;
    var self = this;
    var melody = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 15, 7];
    var bass = [0, 0, 3, 3, 5, 5, 3, 3];
    var root = 130.81; // C3
    this.musicStep = 0;
    var tick = function () {
      if (!self.ctx || !self.musicOn) return;
      var s = self.musicStep++;
      var now = self.ctx.currentTime;
      var semi = melody[s % melody.length];
      var f = root * Math.pow(2, semi / 12) * 2;
      self.musicNote(f, now, 0.34, 0.05, "triangle");
      if (s % 4 === 0) {
        var b = root * Math.pow(2, bass[(s / 4 | 0) % bass.length] / 12);
        self.musicNote(b, now, 0.9, 0.075, "sine");
        self.musicNote(b * 2, now, 0.55, 0.028, "square");
      }
      if (s % 2 === 0) self.musicHat(now);
      self.musicTimer = setTimeout(tick, 170);
    };
    tick();
  };

  Audio.prototype.musicNote = function (freq, t, dur, vol, type) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  Audio.prototype.musicHat = function (t) {
    var ctx = this.ctx;
    var len = Math.floor(ctx.sampleRate * 0.05);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.value = 0.09;
    var f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  };

  Audio.prototype.stopMusic = function () {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  };

  BR.Audio = new Audio();
})(window);
