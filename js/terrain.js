/* Buggy Race - stages + procedural terrain */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});
  var Bodies = root.Matter.Bodies;
  var Composite = root.Matter.Composite;

  BR.STAGES = [
    {
      id: "dunes", name: "Sunset Dunes", tagline: "Golden hour, endless hills",
      seed: 1337, amp: 250, rough: 11, friction: 0.95, bonus: 1.0, unlock: 0,
      sky: ["#1d2a63", "#ff9b5c"], sun: "#ffe9ae", sunGlow: "rgba(255,190,120,0.55)",
      cloud: "rgba(255,226,200,0.92)", far: "#7c5688", mid: "#bd7150",
      grass: "#f0c064", grassDark: "#c99342", dirt: "#c08a52", dirtDark: "#96623a",
      pebble: "#a97343", fog: "rgba(255,170,110,0.16)", stars: 0
    },
    {
      id: "arctic", name: "Arctic Rush", tagline: "Slippery ice, sharp peaks",
      seed: 90210, amp: 240, rough: 7, friction: 0.3, bonus: 1.95, unlock: 120,
      sky: ["#062c52", "#a9e2ff"], sun: "#ffffff", sunGlow: "rgba(190,235,255,0.55)",
      cloud: "rgba(240,252,255,0.9)", far: "#5f8fae", mid: "#9cc2d6",
      grass: "#f4fdff", grassDark: "#c4e3f2", dirt: "#a9c8da", dirtDark: "#7fa3ba",
      pebble: "#93b6ca", fog: "rgba(200,236,255,0.18)", stars: 0
    },
    {
      id: "jungle", name: "Jungle Run", tagline: "Wild roots and vines",
      seed: 424242, amp: 300, rough: 17, friction: 1.05, bonus: 1.35, unlock: 200,
      sky: ["#0d4d3e", "#a9e8a0"], sun: "#f5ffd0", sunGlow: "rgba(190,255,170,0.4)",
      cloud: "rgba(228,255,224,0.8)", far: "#2f6f4d", mid: "#4d8f52",
      grass: "#54c45a", grassDark: "#2f8c3c", dirt: "#7c5734", dirtDark: "#5b3d24",
      pebble: "#6b4a2c", fog: "rgba(150,230,160,0.12)", stars: 0
    },
    {
      id: "canyon", name: "Canyon Sprint", tagline: "Red rock, big air",
      seed: 77123, amp: 340, rough: 15, friction: 0.92, bonus: 1.6, unlock: 280,
      sky: ["#3a1230", "#ff8b5e"], sun: "#ffd18a", sunGlow: "rgba(255,140,90,0.5)",
      cloud: "rgba(255,190,150,0.75)", far: "#7d2f45", mid: "#b3503c",
      grass: "#e8894a", grassDark: "#b65f33", dirt: "#a8492f", dirtDark: "#7c3222",
      pebble: "#8f3c28", fog: "rgba(255,130,90,0.14)", stars: 0
    },
    {
      id: "night", name: "Neon Night", tagline: "Midnight run, glowing trails",
      seed: 515151, amp: 285, rough: 12, friction: 0.85, bonus: 2.2, unlock: 360,
      sky: ["#05030f", "#2b1a5e"], sun: "#d9c8ff", sunGlow: "rgba(150,110,255,0.45)",
      cloud: "rgba(120,100,190,0.35)", far: "#1c1440", mid: "#33246b",
      grass: "#4ff2d8", grassDark: "#22b39c", dirt: "#1d2140", dirtDark: "#12142b",
      pebble: "#2a3054", fog: "rgba(90,70,180,0.18)", stars: 1
    },
    {
      id: "lava", name: "Lava Ridge", tagline: "One wrong move and it's toast",
      seed: 66600, amp: 330, rough: 19, friction: 0.88, bonus: 2.5, unlock: 440,
      sky: ["#1a0505", "#7a1b12"], sun: "#ffb347", sunGlow: "rgba(255,90,30,0.5)",
      cloud: "rgba(90,40,30,0.6)", far: "#3d0f0c", mid: "#6b1d12",
      grass: "#ff7a2e", grassDark: "#c94a16", dirt: "#3a1a15", dirtDark: "#260f0d",
      pebble: "#4a201a", fog: "rgba(255,80,20,0.16)", stars: 0
    }
  ];

  var CHUNK_W = 560;
  var SEG = 20;
  var GROUND_THICK = 500;

  function Terrain(stage, world) {
    this.stage = stage;
    this.world = world;
    this.noise = BR.makeNoise(stage.seed);
    this.chunks = {};
    this.coins = [];
    this.fuelCans = [];
    this._buildQueue = [];
  }

  Terrain.CHUNK_W = CHUNK_W;

  Terrain.prototype.heightAt = function (x) {
    var s = this.stage;
    var n = this.noise;
    var h = 0;
    h += n.fbm(x * 0.00042 + 11.3, 3) * s.amp;
    h += n.fbm(x * 0.0015 + 301.7, 4) * s.amp * 0.32;
    h += n(x * 0.0058 + 917.1) * s.rough * 1.35;
    h += Math.sin(x * 0.00105 + s.seed * 0.001) * s.amp * 0.16;
    h += n.fbm(x * 0.0034 + 57.3, 2) * s.amp * 0.13;
    /* the further you drive, the nastier the surface gets */
    var hard = 1 + BR.clamp((x - 1600) / 22000, 0, 0.65);
    var flat = BR.clamp((x - 80) / 520, 0, 1);
    h *= flat * hard;
    return h;
  };

  Terrain.prototype.slopeAt = function (x) {
    return (this.heightAt(x + 3) - this.heightAt(x - 3)) / 6;
  };

  /* pick the flattest spot in a chunk so fuel cans are easy to grab */
  Terrain.prototype._flatSpot = function (rng, x0, width) {
    var bestX = x0 + width * 0.5;
    var bestSlope = Infinity;
    for (var i = 0; i < 9; i++) {
      var x = x0 + 90 + rng() * (width - 180);
      var sl = Math.abs(this.slopeAt(x));
      if (sl < bestSlope) { bestSlope = sl; bestX = x; }
    }
    return bestX;
  };

  Terrain.prototype._buildChunk = function (idx) {
    var self = this;
    var stage = this.stage;
    var x0 = idx * CHUNK_W;
    var segCount = Math.ceil(CHUNK_W / SEG);
    var chunk = { idx: idx, bodies: [], coins: [], fuel: [], pebbles: [] };
    var rng = BR.mulberry32((stage.seed ^ (idx * 2654435761)) >>> 0);

    for (var i = 0; i < segCount; i++) {
      var xa = x0 + i * SEG;
      var xb = xa + SEG;
      var ya = this.heightAt(xa);
      var yb = this.heightAt(xb);
      var dx = xb - xa;
      var dy = yb - ya;
      var len = Math.sqrt(dx * dx + dy * dy) + 4;
      var ang = Math.atan2(dy, dx);
      var mx = (xa + xb) * 0.5;
      var my = (ya + yb) * 0.5;
      var nx = -dy, ny = dx;
      var nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
      if (ny < 0) { nx = -nx; ny = -ny; }
      var cx = mx + nx * (GROUND_THICK * 0.5 - 3);
      var cy = my + ny * (GROUND_THICK * 0.5 - 3);
      var body = Bodies.rectangle(cx, cy, len, GROUND_THICK, {
        isStatic: true,
        angle: ang,
        friction: stage.friction,
        frictionStatic: stage.friction * 2,
        restitution: 0,
        slop: 0.02,
        label: "ground",
        render: { visible: false }
      });
      chunk.bodies.push(body);
    }
    Composite.add(this.world, chunk.bodies);

    /* pebble decoration */
    var pc = 7 + Math.floor(rng() * 8);
    for (var p = 0; p < pc; p++) {
      var px = x0 + rng() * CHUNK_W;
      var depth = 18 + rng() * 170;
      chunk.pebbles.push({
        x: px,
        y: this.heightAt(px) + depth,
        rx: 5 + rng() * 10,
        ry: 3 + rng() * 6,
        rot: rng() * Math.PI,
        shade: rng()
      });
    }

    /* coins */
    if (idx >= 1 && rng() < 0.92) {
      var rowX = x0 + 100 + rng() * (CHUNK_W - 320);
      var count = 4 + Math.floor(rng() * 5);
      var spacing = 27;
      var arc = 18 + rng() * 42;
      for (var c = 0; c < count; c++) {
        var cx2 = rowX + c * spacing;
        var base = this.heightAt(cx2);
        var t = count > 1 ? c / (count - 1) : 0.5;
        var lift = 44 + Math.sin(t * Math.PI) * arc;
        var val = rng() < 0.16 ? 10 : 5;
        var coin = {
          x: cx2, y: base - lift, r: 11, val: val,
          phase: rng() * BR.TAU, alive: true, chunk: idx,
          spin: 0
        };
        chunk.coins.push(coin);
        this.coins.push(coin);
      }
    }

    /* fuel cans spaced out (every 3rd chunk) on flat ground */
    if (idx > 0 && idx % 3 === 0) {
      var fx = this._flatSpot(rng, x0, CHUNK_W);
      var fy = this.heightAt(fx);
      var can = { x: fx, y: fy - 20, r: 19, alive: true, chunk: idx, bob: rng() * BR.TAU };
      chunk.fuel.push(can);
      this.fuelCans.push(can);
    }

    this.chunks[idx] = chunk;
  };

  Terrain.prototype._removeChunk = function (idx) {
    var chunk = this.chunks[idx];
    if (!chunk) return;
    Composite.remove(this.world, chunk.bodies);
    var i;
    for (i = 0; i < this.coins.length; i++) {
      if (this.coins[i].chunk === idx) { this.coins.splice(i, 1); i--; }
    }
    for (i = 0; i < this.fuelCans.length; i++) {
      if (this.fuelCans[i].chunk === idx) { this.fuelCans.splice(i, 1); i--; }
    }
    delete this.chunks[idx];
  };

  Terrain.prototype.update = function (camX, viewW) {
    var from = Math.floor((camX - viewW * 0.9 - 500) / CHUNK_W);
    var to = Math.ceil((camX + viewW * 0.9 + 900) / CHUNK_W);
    var i;
    for (i = from; i <= to; i++) {
      if (!this.chunks[i]) this._buildChunk(i);
    }
    for (var key in this.chunks) {
      var idx = this.chunks[key].idx;
      if (idx < from - 1 || idx > to + 1) this._removeChunk(idx);
    }
  };

  Terrain.prototype.chunksInView = function (camX, viewW, margin) {
    margin = margin || 300;
    var out = [];
    for (var key in this.chunks) {
      var ch = this.chunks[key];
      if (ch.idx * CHUNK_W > camX - viewW / 2 - margin &&
          ch.idx * CHUNK_W < camX + viewW / 2 + margin) {
        out.push(ch);
      }
    }
    return out;
  };

  Terrain.prototype.destroy = function () {
    for (var key in this.chunks) {
      Composite.remove(this.world, this.chunks[key].bodies);
    }
    this.chunks = {};
    this.coins = [];
    this.fuelCans = [];
  };

  BR.Terrain = Terrain;
})(window);
