/* Buggy Race - particle system (pooled, capped) */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});

  var MAX = 520;

  function Particles() {
    this.items = new Array(MAX);
    for (var i = 0; i < MAX; i++) {
      this.items[i] = { live: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, rot: 0, vr: 0, color: "#fff", type: 0, grav: 0, drag: 0.9 };
    }
    this.cursor = 0;
    this.count = 0;
    this.quality = 1;
    this._sprites = {};
  }

  Particles.prototype._sprite = function (color) {
    var s = this._sprites[color];
    if (s) return s;
    var m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return null;
    var parts = m[1].split(",");
    if (parts.length < 3) return null;
    var r = Math.round(+parts[0]), g = Math.round(+parts[1]), b = Math.round(+parts[2]);
    var a = parts.length > 3 ? +parts[3] : 1;
    var cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    var x = cv.getContext("2d");
    var gr = x.createRadialGradient(32, 32, 1, 32, 32, 32);
    gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + a + ")");
    gr.addColorStop(0.45, "rgba(" + r + "," + g + "," + b + "," + (a * 0.55) + ")");
    gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    s = this._sprites[color] = cv;
    return s;
  };

  Particles.prototype._spawn = function () {
    for (var i = 0; i < MAX; i++) {
      var idx = (this.cursor + i) % MAX;
      if (!this.items[idx].live) {
        this.cursor = (idx + 1) % MAX;
        return this.items[idx];
      }
    }
    var p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    return p;
  };

  Particles.prototype.emit = function (opts) {
    if (this.quality <= 0.35 && Math.random() < 0.5) return null;
    var p = this._spawn();
    p.live = true;
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.max = opts.life || 0.7; p.life = p.max;
    p.size = opts.size || 4;
    p.color = opts.color || "#fff";
    p.type = opts.type || 0;
    p.rot = opts.rot || 0;
    p.vr = opts.vr || 0;
    p.grav = opts.grav == null ? 600 : opts.grav;
    p.drag = opts.drag == null ? 1.5 : opts.drag;
    return p;
  };

  Particles.prototype.dust = function (x, y, amount, dirSign, color) {
    amount = Math.max(1, Math.round(amount * this.quality));
    for (var i = 0; i < amount; i++) {
      this.emit({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 40 - (dirSign || 0) * 70,
        vy: -8 - Math.random() * 45,
        life: 0.35 + Math.random() * 0.4,
        size: 3.5 + Math.random() * 6,
        color: color || "rgba(220,190,150,0.75)",
        type: 1, grav: -25, drag: 2.6
      });
    }
  };

  Particles.prototype.smoke = function (x, y, amount, color) {
    amount = Math.max(1, Math.round(amount * this.quality));
    for (var i = 0; i < amount; i++) {
      this.emit({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 35,
        vy: -25 - Math.random() * 45,
        life: 0.7 + Math.random() * 0.7,
        size: 4 + Math.random() * 6,
        color: color || "rgba(90,90,100,0.55)",
        type: 1, grav: -50, drag: 1.8
      });
    }
  };

  Particles.prototype.sparkle = function (x, y, amount, color) {
    amount = Math.max(2, Math.round(amount * this.quality));
    for (var i = 0; i < amount; i++) {
      var a = Math.random() * BR.TAU;
      var sp = 60 + Math.random() * 220;
      this.emit({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.35 + Math.random() * 0.5,
        size: 2 + Math.random() * 3.5,
        color: color || "#ffe27a",
        type: 2, grav: 420, drag: 0.6, vr: (Math.random() - 0.5) * 18
      });
    }
  };

  Particles.prototype.coinBurst = function (x, y, value) {
    this.sparkle(x, y, 10, "#ffd447");
    this.emit({ x: x, y: y, vx: 0, vy: -90, life: 0.8, size: 13, color: "#ffd447", type: 5, grav: -40, drag: 1.2 });
    if (value >= 10) this.sparkle(x, y, 8, "#b9f4ff");
  };

  Particles.prototype.debris = function (x, y, amount, color) {
    amount = Math.max(3, Math.round(amount * this.quality));
    for (var i = 0; i < amount; i++) {
      var a = Math.random() * BR.TAU;
      var sp = 100 + Math.random() * 320;
      this.emit({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 190,
        life: 0.5 + Math.random() * 0.7,
        size: 2 + Math.random() * 4,
        color: color || "#8a5a35",
        type: 3, grav: 900, drag: 0.4, vr: (Math.random() - 0.5) * 26
      });
    }
  };

  Particles.prototype.exhaust = function (x, y, amount, color) {
    amount = Math.max(1, Math.round(amount * this.quality));
    for (var i = 0; i < amount; i++) {
      this.emit({
        x: x, y: y,
        vx: -80 - Math.random() * 60,
        vy: -10 - Math.random() * 35,
        life: 0.35 + Math.random() * 0.35,
        size: 3 + Math.random() * 4,
        color: color || "rgba(120,120,130,0.5)",
        type: 1, grav: -20, drag: 2
      });
    }
  };

  Particles.prototype.update = function (dt) {
    var n = 0;
    for (var i = 0; i < MAX; i++) {
      var p = this.items[i];
      if (!p.live) continue;
      n++;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; continue; }
      p.vx *= Math.max(0, 1 - p.drag * dt);
      p.vy *= Math.max(0, 1 - p.drag * dt);
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.count = n;
  };

  Particles.prototype.draw = function (ctx) {
    var items = this.items;
    for (var i = 0; i < MAX; i++) {
      var p = items[i];
      if (!p.live) continue;
      var t = p.life / p.max;
      var alpha = t < 0.35 ? t / 0.35 : 1;
      ctx.globalAlpha = alpha;
      if (p.type === 2) {
        ctx.fillStyle = p.color;
        var s = p.size * (0.5 + t * 0.7);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, BR.TAU);
        ctx.fill();
      } else if (p.type === 3) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.type === 5) {
        ctx.fillStyle = "#ffd447";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.6), 0, BR.TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        var spr = this._sprite(p.color);
        var s = p.size * (0.75 + (1 - t) * 0.45);
        if (spr) {
          ctx.drawImage(spr, p.x - s * 1.5, p.y - s * 1.5, s * 3, s * 3);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, BR.TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  Particles.prototype.clear = function () {
    for (var i = 0; i < MAX; i++) this.items[i].live = false;
    this.count = 0;
  };

  BR.Particles = Particles;
})(window);
