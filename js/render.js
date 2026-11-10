/* Buggy Race - all canvas rendering */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});
  var R = BR.Render = {};

  function ctx() { return BR.App.ctx; }
  function cam() { return BR.App.cam; }
  function stage() { return BR.App.run ? BR.App.run.stage : BR.App.getStage(BR.App.save.selectedStage); }

  /* ---------------- sky / background ---------------- */

  function drawSky(stage) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H, cm = A.cam;
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, stage.sky[0]);
    g.addColorStop(0.32, stage.sky[0]);
    g.addColorStop(0.72, stage.sky[1]);
    g.addColorStop(1, stage.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    if (stage.stars) {
      var rng = BR.mulberry32(stage.seed + 5);
      c.fillStyle = "#fff";
      for (var s = 0; s < 90; s++) {
        var x = rng() * W;
        var y = rng() * H * 0.62;
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(A.time * 1.7 + s));
        c.globalAlpha = tw * 0.9;
        c.fillRect(x, y, 1.8, 1.8);
      }
      c.globalAlpha = 1;
    }

    var sx = W * 0.76 - (cm.x * 0.012) % 120;
    var sy = H * 0.2 - cm.y * 0.035;
    var glow = c.createRadialGradient(sx, sy, 4, sx, sy, 170);
    glow.addColorStop(0, stage.sunGlow);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(sx, sy, 170, 0, BR.TAU);
    c.fill();

    var sunG = c.createRadialGradient(sx - 12, sy - 12, 4, sx, sy, 46);
    sunG.addColorStop(0, "#ffffff");
    sunG.addColorStop(0.6, stage.sun);
    sunG.addColorStop(1, stage.sun);
    c.fillStyle = sunG;
    c.beginPath();
    c.arc(sx, sy, 44, 0, BR.TAU);
    c.fill();

    drawClouds(stage);
  }

  function drawClouds(stage) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    var rng = BR.mulberry32(stage.seed + 99);
    var span = W + 500;
    var px = A.cam.x * 0.14;
    c.fillStyle = stage.cloud;
    for (var i = 0; i < 11; i++) {
      var baseX = rng() * span * 1.7;
      var y = (0.04 + rng() * 0.34) * H;
      var s = 0.55 + rng() * 0.9;
      var x = ((baseX - px) % span + span) % span - 200;
      c.globalAlpha = 0.88;
      c.beginPath();
      c.arc(x, y, 34 * s, 0, BR.TAU);
      c.arc(x + 38 * s, y + 8 * s, 27 * s, 0, BR.TAU);
      c.arc(x - 36 * s, y + 10 * s, 24 * s, 0, BR.TAU);
      c.arc(x + 8 * s, y - 18 * s, 25 * s, 0, BR.TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawRidge(noise, parallax, baseFrac, amp, color) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    var off = A.cam.x * parallax;
    c.beginPath();
    c.moveTo(-30, H);
    for (var sx = -30; sx <= W + 30; sx += 12) {
      var wx = (sx + off) * 0.0016;
      var h = noise.fbm(wx, 4) * amp + noise(wx * 3.1 + 4) * amp * 0.25;
      c.lineTo(sx, H * baseFrac - h);
    }
    c.lineTo(W + 30, H);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }

  function drawRidges(stage) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    drawRidge(BR.App.getNoise(stage.seed + 21), 0.05, 0.56, 108, stage.far);
    drawRidge(BR.App.getNoise(stage.seed + 22), 0.12, 0.64, 74, stage.mid);
    var fog = c.createLinearGradient(0, H * 0.4, 0, H * 0.76);
    fog.addColorStop(0, "rgba(0,0,0,0)");
    fog.addColorStop(1, stage.fog);
    c.fillStyle = fog;
    c.fillRect(0, H * 0.4, W, H * 0.36);
  }

  /* ---------------- ground ---------------- */

  function traceSurface(c, terr, x0, x1, step) {
    c.beginPath();
    var first = true;
    for (var x = x0; x <= x1 + step; x += step) {
      var px = Math.min(x, x1);
      var y = terr.heightAt(px);
      if (first) { c.moveTo(px, y); first = false; }
      else c.lineTo(px, y);
      if (px >= x1) break;
    }
  }

  function makeDirtGradient(c, stage, topY, bottomY) {
    var g = c.createLinearGradient(0, topY, 0, bottomY);
    g.addColorStop(0, stage.dirt);
    g.addColorStop(0.45, stage.dirt);
    g.addColorStop(1, stage.dirtDark);
    return g;
  }

  function drawBand(c, terr, stage, x0, x1, step, bandH, topOffset) {
    var xs = [];
    for (var x = x0; x <= x1; x += step) xs.push(x);
    if (xs[xs.length - 1] !== x1) xs.push(x1);
    var topOff = topOffset || 0;

    c.beginPath();
    c.moveTo(xs[0], terr.heightAt(xs[0]) + topOff);
    for (var i = 1; i < xs.length; i++) c.lineTo(xs[i], terr.heightAt(xs[i]) + topOff);
    for (var j = xs.length - 1; j >= 0; j--) c.lineTo(xs[j], terr.heightAt(xs[j]) + bandH);
    c.closePath();
    c.fillStyle = stage.grassDark;
    c.fill();

    traceSurface(c, terr, x0, x1, step);
    c.strokeStyle = stage.grass;
    c.lineWidth = Math.max(5, bandH * 0.5);
    c.lineJoin = "round";
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.22)";
    c.lineWidth = 2.2;
    c.stroke();
  }

  function drawGround(terr, stage, camX, camY, zoom) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    var vw = W / zoom, vh = H / zoom;
    var x0 = camX - vw / 2 - 60;
    var x1 = camX + vw / 2 + 60;
    var bottom = camY + vh / 2 + 120;

    traceSurface(c, terr, x0, x1, 14);
    c.lineTo(x1, bottom);
    c.lineTo(x0, bottom);
    c.closePath();
    c.fillStyle = makeDirtGradient(c, stage, camY - 260, camY + vh * 0.8);
    c.fill();

    drawBand(c, terr, stage, x0, x1, 14, 18, 0);
  }

  function drawPebbles(c, chunk, stage) {
    for (var i = 0; i < chunk.pebbles.length; i++) {
      var p = chunk.pebbles[i];
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = 0.55;
      c.fillStyle = stage.pebble;
      c.beginPath();
      c.ellipse(0, 0, p.rx, p.ry, 0, 0, BR.TAU);
      c.fill();
      c.globalAlpha = 0.28;
      c.fillStyle = "#fff";
      c.beginPath();
      c.ellipse(-p.rx * 0.25, -p.ry * 0.3, p.rx * 0.4, p.ry * 0.35, 0, 0, BR.TAU);
      c.fill();
      c.restore();
    }
  }

  function drawTerrain(terr, stage) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H, cm = A.cam;
    var viewW = W / cm.zoom;
    var chunks = terr.chunksInView(cm.x, viewW, 420);
    var vh = H / cm.zoom;
    var g = makeDirtGradient(c, stage, cm.y - 260, cm.y + vh * 0.8);
    var bottom = cm.y + vh + 160;

    for (var i = 0; i < chunks.length; i++) {
      var ch = chunks[i];
      var x0 = ch.idx * BR.Terrain.CHUNK_W;
      var x1 = x0 + BR.Terrain.CHUNK_W;
      traceSurface(c, terr, x0, x1, 12);
      c.lineTo(x1, bottom);
      c.lineTo(x0, bottom);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      drawPebbles(c, ch, stage);
    }
    for (var k = 0; k < chunks.length; k++) {
      var a = chunks[k].idx * BR.Terrain.CHUNK_W;
      drawBand(c, terr, stage, a, a + BR.Terrain.CHUNK_W, 12, 15, -1);
    }
  }

  /* ---------------- pickups ---------------- */

  function drawCoins(terr) {
    var A = BR.App, c = A.ctx, t = A.time;
    var viewW = A.W / A.cam.zoom;
    for (var i = 0; i < terr.coins.length; i++) {
      var co = terr.coins[i];
      if (!co.alive) continue;
      if (Math.abs(co.x - A.cam.x) > viewW / 2 + 80) continue;
      var bob = Math.sin(t * 3 + co.phase) * 3;
      var spin = Math.cos(t * 4.2 + co.phase);
      var sx = Math.max(0.2, Math.abs(spin));
      c.save();
      c.translate(co.x, co.y + bob);
      c.scale(sx, 1);

      var glow = c.createRadialGradient(0, 0, 3, 0, 0, 19);
      glow.addColorStop(0, "rgba(255,214,80,0.3)");
      glow.addColorStop(1, "rgba(255,214,80,0)");
      c.fillStyle = glow;
      c.beginPath();
      c.arc(0, 0, 19, 0, BR.TAU);
      c.fill();

      var cg = c.createRadialGradient(-3.5, -4, 1.5, 0, 1.5, 11);
      cg.addColorStop(0, "#fff6c2");
      cg.addColorStop(0.42, "#ffd447");
      cg.addColorStop(0.85, "#e0a012");
      cg.addColorStop(1, "#b57c00");
      c.fillStyle = cg;
      c.beginPath();
      c.arc(0, 0, 10, 0, BR.TAU);
      c.fill();
      c.strokeStyle = "#8a5c00";
      c.lineWidth = 1.5;
      c.stroke();

      c.strokeStyle = "rgba(255,250,215,0.55)";
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(0, 0, 6.4, 0, BR.TAU);
      c.stroke();

      if (co.val >= 10) {
        c.fillStyle = "rgba(150,96,0,0.65)";
        c.beginPath();
        for (var s2 = 0; s2 < 5; s2++) {
          var aa = -Math.PI / 2 + s2 * BR.TAU / 5;
          var ra = 4.6, rb = 2;
          c.lineTo(Math.cos(aa) * ra, Math.sin(aa) * ra);
          c.lineTo(Math.cos(aa + BR.TAU / 10) * rb, Math.sin(aa + BR.TAU / 10) * rb);
        }
        c.closePath();
        c.fill();
      }

      c.fillStyle = "rgba(255,255,255,0.85)";
      c.beginPath();
      c.ellipse(-3.6, -4.2, 2.6, 1.7, -0.6, 0, BR.TAU);
      c.fill();
      c.restore();
    }
  }

  function drawFuelCans(terr) {
    var A = BR.App, c = A.ctx, t = A.time;
    for (var i = 0; i < terr.fuelCans.length; i++) {
      var f = terr.fuelCans[i];
      if (!f.alive) continue;
      if (Math.abs(f.x - A.cam.x) > A.W / A.cam.zoom / 2 + 80) continue;
      var bob = Math.sin(t * 2.4 + f.bob) * 2.5;
      c.save();
      c.translate(f.x, f.y + bob);

      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.ellipse(0, 20, 15, 5, 0, 0, BR.TAU);
      c.fill();

      var fg = c.createLinearGradient(-12, -16, 12, 18);
      fg.addColorStop(0, "#ff6a4a");
      fg.addColorStop(0.5, "#e03a22");
      fg.addColorStop(1, "#a82414");
      BR.roundRect(c, -13, -16, 26, 34, 5);
      c.fillStyle = fg;
      c.fill();
      c.strokeStyle = "#6b1a10";
      c.lineWidth = 2;
      c.stroke();

      c.fillStyle = "#c22e18";
      BR.roundRect(c, -7, -21, 14, 7, 2);
      c.fill();
      c.strokeStyle = "#6b1a10";
      c.lineWidth = 1.6;
      c.stroke();

      c.strokeStyle = "rgba(255,255,255,0.5)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-8, -12);
      c.lineTo(-8, 10);
      c.stroke();

      c.fillStyle = "rgba(255,255,255,0.92)";
      c.font = "bold 7px Arial, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("FUEL", 0, 3);
      c.restore();
    }
  }

  /* ---------------- weather / overlays ---------------- */

  function drawWeather(stage) {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H, t = A.time;
    var isSnow = stage.id === "arctic";
    var isEmber = stage.id === "lava" || stage.id === "canyon";
    var isFly = stage.id === "night" || stage.id === "jungle";
    var isDust = stage.id === "dunes";
    if (!isSnow && !isEmber && !isFly && !isDust) return;
    var count = isSnow ? 64 : (isEmber ? 32 : (isDust ? 16 : 24));
    for (var i = 0; i < count; i++) {
      var seed = i * 97.13;
      var speed = isSnow ? 26 : (isEmber ? -34 : (isDust ? 3 : 6));
      var x = ((seed * 7 + Math.sin(t * 0.6 + i) * 30 + t * (isSnow ? 18 : 4)) % (W + 60) + W + 60) % (W + 60) - 30;
      var y = ((seed * 13 + t * speed + Math.sin(t * 1.3 + i * 2) * 14) % (H + 60) + H + 60) % (H + 60) - 30;
      if (isSnow) {
        c.globalAlpha = 0.55 + 0.4 * Math.abs(Math.sin(t + i));
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(x, y, 1 + (i % 3) * 0.7, 0, BR.TAU);
        c.fill();
      } else if (isEmber) {
        c.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(t * 2 + i));
        c.fillStyle = stage.id === "lava" ? "#ffae4a" : "#ffd8a8";
        c.beginPath();
        c.arc(x, y, 1 + (i % 2), 0, BR.TAU);
        c.fill();
      } else {
        c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.6 + i * 1.7));
        c.fillStyle = isDust ? "#ffe0ae" : "#c8ffb0";
        c.beginPath();
        c.arc(x, y, isDust ? 1.2 : 1.6, 0, BR.TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  function drawVignette() {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    var g = c.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.28, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  function drawSpeedLines() {
    var A = BR.App, c = A.ctx, W = A.W, H = A.H;
    if (!A.car) return;
    var s = A.car.speed01();
    if (s < 0.58) return;
    var a = (s - 0.58) / 0.42;
    c.save();
    c.globalAlpha = a * 0.13;
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1.4;
    for (var i = 0; i < 12; i++) {
      var y = (i * 131 + A.time * 1600) % H;
      var len = 30 + a * 90;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(len, y + 2);
      c.moveTo(W, y + 40);
      c.lineTo(W - len, y + 42);
      c.stroke();
    }
    c.restore();
  }

  function drawFlash() {
    var A = BR.App, c = A.ctx;
    if (A.cam.flash <= 0) return;
    c.fillStyle = "rgba(" + A.cam.flashColor + "," + (A.cam.flash * 0.55) + ")";
    c.fillRect(0, 0, A.W, A.H);
  }

  /* ---------------- scenes ---------------- */

  R.renderGame = function () {
    var A = BR.App, c = A.ctx;
    var st = stage();
    drawSky(st);
    drawRidges(st);

    var shake = A.cam.shake * A.cam.shake;
    var ox = (Math.random() - 0.5) * shake * 30;
    var oy = (Math.random() - 0.5) * shake * 30;

    c.save();
    c.translate(A.W / 2 + ox, A.H / 2 + oy);
    c.scale(A.cam.zoom, A.cam.zoom);
    c.translate(-A.cam.x, -A.cam.y);

    if (A.terrain) {
      drawTerrain(A.terrain, st);
      drawCoins(A.terrain);
      drawFuelCans(A.terrain);
    }
    A.particles.draw(c);
    if (A.car && A.terrain) {
      A.car.drawShadow(c, A.terrain);
      A.car.draw(c, A.terrain);
    }
    c.restore();

    drawWeather(st);
    drawSpeedLines();
    drawVignette();
    drawFlash();
  };

  R.renderAttract = function (dt) {
    var A = BR.App, c = A.ctx;
    var st = A.getStage(A.save.selectedStage);
    var terr = A.getMenuTerrain(st);
    var t = A.time;

    var targetX = 900 + t * 24;
    var targetZoom = A.baseZoom() * 1.02;
    if (!A.attractCam.init) {
      A.attractCam.x = targetX;
      A.attractCam.y = terr.heightAt(targetX) - 150;
      A.attractCam.zoom = targetZoom;
      A.attractCam.init = true;
    }
    A.attractCam.x = BR.damp(A.attractCam.x, targetX, 1.5, dt);
    A.attractCam.zoom = BR.damp(A.attractCam.zoom, targetZoom, 2, dt);

    var vh = A.H / A.attractCam.zoom;
    A.attractCam.y = BR.damp(A.attractCam.y, terr.heightAt(A.attractCam.x) - vh * 0.07, 2.4, dt);

    A.cam.x = A.attractCam.x;
    A.cam.y = A.attractCam.y;
    A.cam.zoom = A.attractCam.zoom;

    drawSky(st);
    drawRidges(st);

    c.save();
    c.translate(A.W / 2, A.H / 2);
    c.scale(A.cam.zoom, A.cam.zoom);
    c.translate(-A.cam.x, -A.cam.y);
    drawGround(terr, st, A.cam.x, A.cam.y, A.cam.zoom);
    var car = A.ensureMenuPreview();
    A.poseCar(car, terr, A.attractCam.x, t);
    car.drawShadow(c, terr);
    car.draw(c, terr);
    c.restore();

    drawWeather(st);
    drawVignette();
  };

  R.renderGaragePreview = function () {
    var A = BR.App;
    var el = A.el("garagePreview");
    if (!el) return;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = el.clientWidth || 300;
    var h = el.clientHeight || 160;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    var c = el.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    var st = A.getStage(A.save.selectedStage);
    var terr = A.getMenuTerrain(st);

    var bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, st.sky[0]);
    bg.addColorStop(0.75, st.sky[1]);
    bg.addColorStop(1, st.dirtDark);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    var car = A.ensureGaragePreview();
    var carX = 0;
    A.poseCar(car, terr, carX, A.time * 0.6);
    var carY = car.chassis.position.y;
    var zoom = BR.clamp(Math.min(w / 190, h / 130), 0.8, 3);

    c.save();
    c.translate(w / 2, h * 0.63);
    c.scale(zoom, zoom);
    c.translate(-carX, -carY);

    traceSurface(c, terr, -320, 320, 12);
    c.lineTo(320, carY + 700);
    c.lineTo(-320, carY + 700);
    c.closePath();
    c.fillStyle = makeDirtGradient(c, st, carY - 60, carY + 260);
    c.fill();
    drawBand(c, terr, st, -320, 320, 12, 15, -1);

    var glow = c.createRadialGradient(0, carY - 34, 5, 0, carY - 34, 130);
    glow.addColorStop(0, "rgba(255,240,200,0.22)");
    glow.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, carY - 34, 130, 0, BR.TAU);
    c.fill();

    car.drawShadow(c, terr);
    car.draw(c, terr);
    c.restore();
  };
})(window);
