/* Buggy Race - core state, physics loop, input, camera */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});
  var Matter = root.Matter;
  var Engine = Matter.Engine;
  var Composite = Matter.Composite;
  var Body = Matter.Body;

  var PX_PER_M = 12;
  var MAX_UPG = 8;
  var UPG_DEFS = [
    { key: "engine", name: "Engine", base: 440 },
    { key: "suspension", name: "Suspension", base: 520 },
    { key: "tires", name: "Tires", base: 270 },
    { key: "fourwd", name: "4WD", base: 330 }
  ];

  function normAngle(a) {
    while (a > Math.PI) a -= BR.TAU;
    while (a < -Math.PI) a += BR.TAU;
    return a;
  }
  function fmt(n) { return BR.formatNumber(n); }

  /* ---------------- save ---------------- */

  function defaultSave() {
    var upgrades = {};
    BR.VEHICLES.forEach(function (v) {
      upgrades[v.id] = { engine: 0, suspension: 0, tires: 0, fourwd: 0 };
    });
    return {
      coins: 0,
      best: {},
      upgrades: upgrades,
      owned: ["dune"],
      selectedVehicle: "dune",
      selectedStage: "dunes",
      settings: { sfx: true, music: true, quality: "auto" }
    };
  }

  function loadSave() {
    var base = defaultSave();
    var data = BR.store.load();
    if (!data || typeof data !== "object") return base;
    base.coins = typeof data.coins === "number" ? Math.max(0, Math.round(data.coins)) : 0;
    base.best = data.best || {};
    base.owned = Array.isArray(data.owned) && data.owned.length ? data.owned : ["dune"];
    if (BR.VEHICLES.some(function (v) { return v.id === data.selectedVehicle; })) {
      base.selectedVehicle = data.selectedVehicle;
    }
    if (BR.STAGES.some(function (s) { return s.id === data.selectedStage; })) {
      base.selectedStage = data.selectedStage;
    }
    if (data.upgrades) {
      for (var key in base.upgrades) {
        if (!data.upgrades[key]) continue;
        for (var k in base.upgrades[key]) {
          var val = data.upgrades[key][k];
          if (typeof val === "number") base.upgrades[key][k] = BR.clamp(val | 0, 0, MAX_UPG);
        }
      }
    }
    if (data.settings) {
      base.settings.sfx = !!data.settings.sfx;
      base.settings.music = !!data.settings.music;
      if (["auto", "high", "low"].indexOf(data.settings.quality) >= 0) {
        base.settings.quality = data.settings.quality;
      }
    }
    return base;
  }

  /* ---------------- app object ---------------- */

  var A = BR.App = {
    save: loadSave(),
    state: "menu",
    time: 0,
    cam: { x: 0, y: 0, zoom: 1, shake: 0, flash: 0, flashColor: "255,255,255" },
    attractCam: { x: 900, y: 0, zoom: 1, init: false },
    particles: new BR.Particles(),
    audio: BR.Audio,
    input: { gas: false, brake: false },
    engine: null, world: null, terrain: null, car: null, run: null,
    garageVehicleId: "dune",
    MAX_UPG: MAX_UPG,
    UPG_DEFS: UPG_DEFS,
    PX_PER_M: PX_PER_M
  };

  var canvas = document.getElementById("game");
  A.canvas = canvas;
  A.ctx = canvas.getContext("2d", { alpha: false });
  A.W = 800;
  A.H = 600;
  A.DPR = 1;

  A.el = function (id) { return document.getElementById(id); };
  A.fmt = fmt;

  function resize() {
    A.DPR = Math.min(root.devicePixelRatio || 1, 2);
    A.W = Math.max(1, canvas.clientWidth);
    A.H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(A.W * A.DPR);
    canvas.height = Math.round(A.H * A.DPR);
    A.ctx.setTransform(A.DPR, 0, 0, A.DPR, 0, 0);
  }
  A.resize = resize;

  A.baseZoom = function () {
    return BR.clamp(Math.min(A.W / 480, A.H / 380), 0.6, 2.2);
  };

  A.persist = function () { BR.store.save(A.save); };

  A.getStage = function (id) {
    for (var i = 0; i < BR.STAGES.length; i++) if (BR.STAGES[i].id === id) return BR.STAGES[i];
    return BR.STAGES[0];
  };
  A.getVehicle = function (id) {
    for (var i = 0; i < BR.VEHICLES.length; i++) if (BR.VEHICLES[i].id === id) return BR.VEHICLES[i];
    return BR.VEHICLES[0];
  };
  A.getUpgrades = function (id) {
    if (!A.save.upgrades[id]) A.save.upgrades[id] = { engine: 0, suspension: 0, tires: 0, fourwd: 0 };
    return A.save.upgrades[id];
  };
  A.getBest = function (id) { return Math.round(A.save.best[id] || 0); };
  A.isOwned = function (id) { return A.save.owned.indexOf(id) >= 0; };
  A.upgradeCost = function (u, level) { return Math.round(u.base * Math.pow(1.5, level)); };
  A.stageUnlocked = function (index) {
    if (index <= 0) return true;
    return A.getBest(BR.STAGES[index - 1].id) >= BR.STAGES[index].unlock;
  };

  var noises = {};
  A.getNoise = function (seed) {
    if (!noises[seed]) noises[seed] = BR.makeNoise(seed);
    return noises[seed];
  };

  var menuTerrain = {};
  A.getMenuTerrain = function (stage) {
    if (!menuTerrain[stage.id]) menuTerrain[stage.id] = new BR.Terrain(stage, null);
    return menuTerrain[stage.id];
  };

  A.applyQuality = function () {
    var q = A.save.settings.quality;
    A.particles.quality = q === "low" ? 0.5 : (q === "high" ? 1 : A.particles.quality || 1);
    if (q !== "auto") A._autoQuality = false;
    else A._autoQuality = true;
  };

  /* ---------------- previews ---------------- */

  var previews = { menu: null, garage: null };

  function buildPreview(which, defId, force) {
    var slot = previews[which];
    if (slot && slot.id === defId && !force) return slot.car;
    if (slot && slot.world) slot.car.destroy(slot.world);
    var world = Composite.create();
    var def = A.getVehicle(defId);
    var car = new BR.Car(world, def, A.getUpgrades(def.id), A.getStage(A.save.selectedStage));
    previews[which] = { id: def.id, car: car, world: world };
    return car;
  }

  A.ensureMenuPreview = function (force) { return buildPreview("menu", A.save.selectedVehicle, force); };
  A.ensureGaragePreview = function (force) { return buildPreview("garage", A.garageVehicleId, force); };

  A.poseCar = function (carObj, terr, x, time) {
    var d = carObj.def;
    var ang = Math.atan(terr.slopeAt(x));
    var cos = Math.cos(ang), sin = Math.sin(ang);
    var gx = x + d.rearX * cos - d.wheelY * sin;
    var gy = terr.heightAt(gx);
    var cy = gy - d.wheelR - (d.rearX * sin + d.wheelY * cos);

    Body.setPosition(carObj.chassis, { x: x, y: cy });
    Body.setAngle(carObj.chassis, ang);
    Body.setVelocity(carObj.chassis, { x: 0, y: 0 });
    Body.setAngularVelocity(carObj.chassis, 0);

    var spin = time * 3.4;
    var wheels = [carObj.rearWheel, carObj.frontWheel];
    var locals = [d.rearX, d.frontX];
    for (var i = 0; i < 2; i++) {
      var wx = x + locals[i] * cos - d.wheelY * sin;
      var wy = cy + locals[i] * sin + d.wheelY * cos;
      Body.setPosition(wheels[i], { x: wx, y: wy });
      Body.setAngle(wheels[i], ang + spin);
      Body.setVelocity(wheels[i], { x: 0, y: 0 });
      Body.setAngularVelocity(wheels[i], 0);
    }
    carObj.time = time;
  };

  /* ---------------- screens ---------------- */

  var SCREEN_IDS = ["menuScreen", "stageScreen", "garageScreen", "pauseScreen", "gameOverScreen"];

  A.hideAllScreens = function () {
    SCREEN_IDS.forEach(function (id) {
      var n = A.el(id);
      if (n) n.classList.add("hidden");
    });
    var sm = A.el("settingsModal");
    if (sm) sm.classList.add("hidden");
  };

  A.showScreen = function (id) {
    A.hideAllScreens();
    if (id) {
      var n = A.el(id);
      if (n) n.classList.remove("hidden");
    }
  };

  A.setState = function (s) {
    A.state = s;
    var inGame = (s === "play" || s === "paused");
    A.el("hud").classList.toggle("hidden", !inGame);
    A.el("controls").classList.toggle("hidden", s !== "play");
    document.body.classList.toggle("playing", s === "play");
  };

  A.gotoMenu = function () {
    A.cleanupRun();
    A.setState("menu");
    A.showScreen("menuScreen");
    A.attractCam.init = false;
    if (A.updateCoinsUI) A.updateCoinsUI();
    if (A.updateMenuMeta) A.updateMenuMeta();
    A.audio.startMusic();
  };

  /* ---------------- run lifecycle ---------------- */

  A.cleanupRun = function () {
    if (A.car && A.world) A.car.destroy(A.world);
    if (A.terrain) A.terrain.destroy();
    A.engine = null;
    A.world = null;
    A.terrain = null;
    A.car = null;
    A.run = null;
    A.particles.clear();
    A.audio.stopEngine();
    A.input.gas = false;
    A.input.brake = false;
  };

  A.startRun = function () {
    A.audio.resume();
    A.audio.click();
    A.cleanupRun();
    A.hideAllScreens();
    A.setState("play");

    var stage = A.getStage(A.save.selectedStage);
    var def = A.getVehicle(A.save.selectedVehicle);
    var upg = A.getUpgrades(def.id);

    A.engine = Engine.create({
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 3,
      enableSleeping: false
    });
    A.engine.gravity.y = 1.15;
    A.world = A.engine.world;

    A.terrain = new BR.Terrain(stage, A.world);
    A.car = new BR.Car(A.world, def, upg, stage);

    var sx = 240;
    var gy = A.terrain.heightAt(sx);
    A.car.reset(sx, gy - def.wheelY - def.wheelR - 4);
    A.terrain.update(sx, A.W);

    for (var i = 0; i < 6; i++) Engine.update(A.engine, 1000 / 60);
    A.car.update(1 / 60, A.terrain);

    A.run = {
      fuel: 100, coins: 0, dist: 0, startX: sx,
      best: A.getBest(stage.id), stage: stage, def: def,
      over: false, overReason: "", overTimer: 0, overShown: false,
      stopTimer: 0, emptyTimer: 0, flipTimer: 0,
      airTime: 0, angleAcc: 0, lastAngle: A.car.chassis.angle,
      maxSpeed: 0
    };

    A.cam.x = A.car.chassis.position.x + 60;
    A.cam.y = A.car.chassis.position.y;
    A.cam.zoom = A.baseZoom();
    A.cam.shake = 0;
    A.cam.flash = 0;

    A.audio.init();
    A.audio.startEngine();
    A.audio.setSfx(A.save.settings.sfx);
    A.audio.setMusic(A.save.settings.music);

    A.updateHUD(true);
    A.updateCoinsUI();
  };

  A.endRun = function (reason) {
    var run = A.run;
    if (!run || run.over) return;
    run.over = true;
    run.overReason = reason;
    run.overTimer = 0;
    A.cam.shake = reason === "crash" ? 1.1 : 0.5;
    A.cam.flash = reason === "crash" ? 0.8 : 0.4;
    A.cam.flashColor = reason === "crash" ? "255,110,80" : "255,240,200";
    A.input.gas = false;
    A.input.brake = false;
    if (reason === "crash") {
      A.audio.crash();
      if (A.car) A.particles.debris(A.car.chassis.position.x, A.car.chassis.position.y, 24, run.stage.dirt);
    } else {
      A.audio.blip(220, 0.4, "sawtooth", 0.2, 90);
    }
    A.audio.stopEngine();
  };

  A.finishRun = function () {
    var run = A.run;
    if (!run) return;
    var stage = run.stage;
    var dist = Math.max(0, Math.round(run.dist));
    var prevBest = A.getBest(stage.id);
    var total = Math.round(run.coins * stage.bonus);
    A.save.coins += total;
    if (dist > prevBest) A.save.best[stage.id] = dist;
    A.persist();

    A.el("goTitle").textContent = run.overReason === "crash" ? "DRIVER DOWN" : "OUT OF FUEL";
    A.el("goDistance").textContent = dist + " m";
    A.el("goCoins").textContent = "+" + fmt(run.coins);
    A.el("goBonus").textContent = "x" + stage.bonus.toFixed(2);
    A.el("goTotal").textContent = "+" + fmt(total);

    var nb = A.el("goNewBest");
    if (dist > prevBest) {
      nb.classList.remove("hidden");
      A.el("goBestLine").textContent = prevBest > 0 ? "PREVIOUS BEST: " + prevBest + " m" : "FIRST RUN ON THIS STAGE";
    } else {
      nb.classList.add("hidden");
      A.el("goBestLine").textContent = "BEST: " + prevBest + " m";
    }

    A.setState("gameover");
    A.showScreen("gameOverScreen");
    A.updateCoinsUI();
    A.audio.stopEngine();
  };

  /* ---------------- physics ---------------- */

  function localToWorld(body, lx, ly) {
    var a = body.angle, c = Math.cos(a), s = Math.sin(a);
    return { x: body.position.x + lx * c - ly * s, y: body.position.y + lx * s + ly * c };
  }

  function collectPickups() {
    var car = A.car, run = A.run, terr = A.terrain;
    var cx = car.chassis.position.x, cy = car.chassis.position.y;
    for (var i = terr.coins.length - 1; i >= 0; i--) {
      var co = terr.coins[i];
      if (!co.alive) continue;
      if (Math.abs(co.x - cx) < 32 && Math.abs(co.y - cy) < 46) {
        co.alive = false;
        run.coins += co.val;
        A.particles.coinBurst(co.x, co.y, co.val);
        A.audio.coin();
        terr.coins.splice(i, 1);
      }
    }
    for (var f = terr.fuelCans.length - 1; f >= 0; f--) {
      var can = terr.fuelCans[f];
      if (!can.alive) continue;
      if (Math.abs(can.x - cx) < 38 && Math.abs(can.y - cy) < 52) {
        can.alive = false;
        run.fuel = Math.min(100, run.fuel + 38);
        A.particles.sparkle(can.x, can.y, 12, "#8ef0c0");
        A.audio.fuel();
        A.showToast("+FUEL");
        terr.fuelCans.splice(f, 1);
      }
    }
  }

  function fixedUpdate(dt) {
    var run = A.run, car = A.car, terr = A.terrain;
    if (!run || !car || A.state !== "play") return;

    if (run.over) {
      Engine.update(A.engine, dt * 1000);
      car.update(dt, terr);
      run.overTimer += dt;
      if (run.overTimer > 0.85 && !run.overShown) {
        run.overShown = true;
        A.finishRun();
      }
      return;
    }

    var stage = run.stage;
    var def = run.def;
    var fuelOk = run.fuel > 0;
    var gas = A.input.gas && fuelOk;
    var brake = A.input.brake && fuelOk;

    car.applyControls(gas, brake, dt);
    Engine.update(A.engine, dt * 1000);
    car.update(dt, terr);

    /* fuel - burns fast so runs stay short and tense */
    var drain = gas ? 2.5 : (brake ? 0.85 : 0.58);
    run.fuel = BR.clamp(run.fuel - drain * dt, 0, 100);
    if (run.fuel <= 0) {
      run.emptyTimer += dt;
      if (car.speed() < 36) run.stopTimer += dt;
      if (run.stopTimer > 1.2 || run.emptyTimer > 5) { A.endRun("fuel"); return; }
    }

    /* distance */
    run.dist = Math.max(run.dist, (car.chassis.position.x - run.startX) / PX_PER_M);
    run.maxSpeed = Math.max(run.maxSpeed, car.speed());

    collectPickups();

    /* effects */
    var speedNow = car.speed();
    var rw = car.rearWheel, fw = car.frontWheel;
    var dustColor = stage.id === "arctic" ? "rgba(235,250,255,0.8)" :
      (stage.id === "night" || stage.id === "lava" ? "rgba(150,110,90,0.6)" : "rgba(215,185,140,0.7)");
    if (car.onGround && speedNow > 30) {
      var amt = BR.clamp(speedNow / 280, 0.15, 1.1);
      var dir = Math.sign(car.chassis.velocity.x);
      if (Math.random() < 0.34) A.particles.dust(rw.position.x, rw.position.y + def.wheelR * 0.7, amt, dir, dustColor);
      if (Math.random() < 0.18) A.particles.dust(fw.position.x, fw.position.y + def.wheelR * 0.7, amt * 0.7, dir, dustColor);
    }
    if (gas && car.onGround && Math.random() < 0.4) {
      var ep = localToWorld(car.chassis, -def.bodyW / 2 - 18, -def.bodyH / 2 - 30);
      A.particles.exhaust(ep.x, ep.y, 1, stage.id === "lava" ? "rgba(255,140,60,0.45)" : undefined);
    }
    if (car.landImpact > 0.12) {
      A.cam.shake = Math.max(A.cam.shake, car.landImpact * 0.5);
      A.particles.dust(rw.position.x, rw.position.y + def.wheelR * 0.7, car.landImpact * 9, 0, dustColor);
      A.particles.dust(fw.position.x, fw.position.y + def.wheelR * 0.7, car.landImpact * 9, 0, dustColor);
      A.audio.land(car.landImpact);
    }

    /* air tricks */
    if (!car.onGround) {
      run.angleAcc += normAngle(car.chassis.angle - run.lastAngle);
      run.airTime += dt;
    } else {
      if (car.landImpact > 0 && run.airTime > 0.55) {
        var flips = Math.floor(Math.abs(run.angleAcc) / BR.TAU);
        var bonus = Math.round(run.airTime * 10) + flips * 25;
        if (bonus > 0) {
          run.coins += bonus;
          A.particles.sparkle(car.chassis.position.x, car.chassis.position.y, 10, "#8ef0c0");
          A.audio.blip(760 + flips * 120, 0.18, "triangle", 0.14, 1200);
          A.showToast((flips > 0 ? flips + "x FLIP  " : "AIR  ") + "+" + bonus);
        }
      }
      run.airTime = 0;
      run.angleAcc = 0;
    }
    run.lastAngle = car.chassis.angle;

    /* crash detection */
    var head = car.headPos();
    if (head.y > terr.heightAt(head.x) + 5) { A.endRun("crash"); return; }
    if (car.chassis.position.y > terr.heightAt(car.chassis.position.x) + 260) { A.endRun("crash"); return; }

    var tilt = Math.abs(normAngle(car.chassis.angle));
    if (car.onGround && tilt > 2.05 && car.speed() < 45) {
      run.flipTimer += dt;
      if (run.flipTimer > 1.0) { A.endRun("crash"); return; }
    } else {
      run.flipTimer = 0;
    }

    terr.update(A.cam.x, A.W / A.cam.zoom + 600);
  }

  /* ---------------- camera ---------------- */

  function updateCamera(dt) {
    var car = A.car;
    if (!car) return;
    var cm = A.cam;
    var zTarget = A.baseZoom() * (1 - 0.1 * car.speed01()) * (car.airTime > 0.8 ? 0.94 : 1);
    cm.zoom = BR.damp(cm.zoom, zTarget, 2.6, dt);
    var vw = A.W / cm.zoom;
    var vh = A.H / cm.zoom;
    var tx = car.chassis.position.x + vw * 0.16 + car.chassis.velocity.x * 0.16;
    var ty = car.chassis.position.y - vh * 0.06;
    cm.x = BR.damp(cm.x, tx, 5.5, dt);
    cm.y = BR.damp(cm.y, ty, 4.5, dt);
    cm.shake = Math.max(0, cm.shake - dt * 2.4);
    cm.flash = Math.max(0, cm.flash - dt * 2.6);
  }

  /* ---------------- HUD / toast ---------------- */

  var hudCache = { fuel: -1, coins: -1, dist: -1, best: -1 };

  A.updateHUD = function (force) {
    var run = A.run;
    if (!run) return;
    var fuel = Math.round(run.fuel);
    var coins = run.coins;
    var dist = Math.floor(run.dist);
    var best = A.getBest(run.stage.id);

    if (force || fuel !== hudCache.fuel) {
      A.el("fuelFill").style.width = fuel + "%";
      A.el("fuelFill").classList.toggle("low", fuel < 28);
      hudCache.fuel = fuel;
    }
    if (force || coins !== hudCache.coins) {
      A.el("hudCoins").textContent = fmt(coins);
      hudCache.coins = coins;
    }
    if (force || dist !== hudCache.dist) {
      A.el("hudDist").textContent = dist;
      A.el("hudBest").textContent = best;
      hudCache.dist = dist;
      hudCache.best = best;
    }
  };

  var toastTimer = null;
  A.showToast = function (msg) {
    var el = A.el("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.classList.add("hidden"); }, 260);
    }, 1500);
  };

  /* ---------------- pause ---------------- */

  A.pauseGame = function () {
    if (A.state !== "play" || !A.run || A.run.over) return;
    A.setState("paused");
    A.showScreen("pauseScreen");
    A.audio.stopEngine();
    A.input.gas = false;
    A.input.brake = false;
  };

  A.resumeGame = function () {
    if (A.state !== "paused") return;
    A.hideAllScreens();
    A.setState("play");
    A.audio.startEngine();
  };

  A.togglePause = function () {
    if (A.state === "play") A.pauseGame();
    else if (A.state === "paused") A.resumeGame();
  };

  /* ---------------- input ---------------- */

  function bindHold(el, key) {
    if (!el) return;
    function down(e) {
      e.preventDefault();
      A.audio.resume();
      A.input[key] = true;
      el.classList.add("active");
    }
    function up(e) {
      if (e) e.preventDefault();
      A.input[key] = false;
      el.classList.remove("active");
    }
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  function bindInput() {
    bindHold(A.el("btnGas"), "gas");
    bindHold(A.el("btnBrake"), "brake");

    root.addEventListener("keydown", function (e) {
      var c = e.code;
      if (c === "ArrowRight" || c === "KeyD" || c === "KeyW") {
        A.input.gas = true;
        e.preventDefault();
      } else if (c === "ArrowLeft" || c === "KeyA" || c === "KeyS") {
        A.input.brake = true;
        e.preventDefault();
      } else if (c === "Escape" || c === "KeyP") {
        A.togglePause();
        e.preventDefault();
      } else if (c === "Space") {
        e.preventDefault();
      }
    });

    root.addEventListener("keyup", function (e) {
      var c = e.code;
      if (c === "ArrowRight" || c === "KeyD" || c === "KeyW") A.input.gas = false;
      else if (c === "ArrowLeft" || c === "KeyA" || c === "KeyS") A.input.brake = false;
    });

    function releaseAll() {
      A.input.gas = false;
      A.input.brake = false;
      var g = A.el("btnGas"), b = A.el("btnBrake");
      if (g) g.classList.remove("active");
      if (b) b.classList.remove("active");
      if (A.state === "play") A.pauseGame();
    }
    root.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) releaseAll();
    });
  }

  /* ---------------- loop ---------------- */

  var lastTime = 0, accumulator = 0, qAcc = 0, qFrames = 0;

  function adaptQuality(dt) {
    if (A.save.settings.quality !== "auto") return;
    qAcc += dt;
    qFrames++;
    if (qFrames >= 150) {
      var fps = qFrames / qAcc;
      A.particles.quality = fps < 46 ? 0.55 : 1;
      qAcc = 0;
      qFrames = 0;
    }
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = ts;
    var dt = (ts - lastTime) / 1000;
    lastTime = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;
    A.time += dt;

    if (A.state === "play") {
      accumulator += dt;
      var step = 1 / 60;
      var guard = 0;
      while (accumulator >= step && guard < 5) {
        fixedUpdate(step);
        accumulator -= step;
        guard++;
      }
      if (guard >= 5) accumulator = 0;
    }

    if (A.state !== "paused") updateCamera(dt);

    if (A.state === "play" && A.car && A.run && !A.run.over) {
      var gasOn = A.input.gas && A.run.fuel > 0;
      var brakeOn = A.input.brake && A.run.fuel > 0;
      A.audio.updateEngine(gasOn ? 1 : (brakeOn ? 0.35 : 0), A.car.speed01(), !A.car.onGround);
    }

    if (A.state === "play" || A.state === "paused" || A.state === "gameover") {
      BR.Render.renderGame();
    } else {
      BR.Render.renderAttract(dt);
    }

    if (A.state === "play" || A.state === "paused") A.updateHUD(false);
    if (A.state === "play" && A.car) {
      var gw = A.car.rearWheel.angularVelocity / (A.car.def.maxAngVel * 1.35);
      var nr = A.el("needleRpm"), ns = A.el("needleSpd");
      if (nr) nr.style.transform = "rotate(" + (-120 + 240 * BR.clamp(Math.abs(gw) * 1.1 + (A.input.gas ? 0.12 : 0), 0, 1)) + "deg)";
      if (ns) ns.style.transform = "rotate(" + (-120 + 240 * A.car.speed01()) + "deg)";
    }

    var garage = A.el("garageScreen");
    if (garage && !garage.classList.contains("hidden")) BR.Render.renderGaragePreview();

    adaptQuality(dt);
  }

  /* ---------------- boot ---------------- */

  function boot() {
    resize();
    A.applyQuality();
    A.audio.setSfx(A.save.settings.sfx);
    A.audio.setMusic(A.save.settings.music);
    bindInput();
    BR.UI.init();
    A.gotoMenu();

    root.addEventListener("resize", resize);
    if (root.screen && root.screen.orientation) {
      root.screen.orientation.addEventListener("change", function () {
        setTimeout(resize, 120);
      });
    }

    lastTime = 0;
    requestAnimationFrame(loop);
  }

  A.boot = boot;
  A.boot();
})(window);
