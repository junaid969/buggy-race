/* Buggy Race - shared helpers */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});

  BR.TAU = Math.PI * 2;

  BR.clamp = function (v, a, b) {
    return v < a ? a : (v > b ? b : v);
  };

  BR.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  BR.smooth = function (t) {
    return t * t * (3 - 2 * t);
  };

  /* multiply-first-step smoothing, frame-rate independent */
  BR.damp = function (a, b, lambda, dt) {
    return BR.lerp(a, b, 1 - Math.exp(-lambda * dt));
  };

  BR.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Deterministic 1D value noise with smooth interpolation */
  BR.makeNoise = function (seed) {
    var rng = BR.mulberry32(seed);
    var table = new Float32Array(1024);
    for (var i = 0; i < table.length; i++) table[i] = rng() * 2 - 1;

    function at(i) {
      return table[((i % table.length) + table.length) % table.length];
    }

    function noise(x) {
      var xi = Math.floor(x);
      var t = BR.smooth(x - xi);
      return BR.lerp(at(xi), at(xi + 1), t);
    }

    noise.fbm = function (x, octaves, lacunarity, gain) {
      octaves = octaves || 4;
      lacunarity = lacunarity || 2;
      gain = gain || 0.5;
      var amp = 1, freq = 1, sum = 0, norm = 0;
      for (var o = 0; o < octaves; o++) {
        sum += noise(x * freq) * amp;
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    };

    return noise;
  };

  BR.DIFFICULTY = {
    easy:   { id: "easy",   name: "Easy",   rough: 0.82, drain: 0.85, bonus: 0.85, startFuel: 100 },
    normal: { id: "normal", name: "Normal", rough: 1.0,  drain: 1.0,  bonus: 1.0,  startFuel: 92 },
    hard:   { id: "hard",   name: "Hard",   rough: 1.28, drain: 1.25, bonus: 1.4,  startFuel: 82 }
  };

  BR.getDifficulty = function () {
    var A = root.BR.App;
    var id = (A && A.save && A.save.difficulty) || "normal";
    return BR.DIFFICULTY[id] || BR.DIFFICULTY.normal;
  };

  BR.formatNumber = function (n) {
    n = Math.round(n);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  BR.store = {
    key: "buggyRaceSave_v1",
    load: function () {
      try {
        var raw = root.localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    save: function (data) {
      try {
        root.localStorage.setItem(this.key, JSON.stringify(data));
      } catch (e) { /* storage disabled: game still works */ }
    }
  };

  BR.pointInRect = function (px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  };
})(window);
