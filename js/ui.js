/* Buggy Race - menus, garage, settings, bindings */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});
  var UI = BR.UI = {};
  var A = null;

  function el(id) { return document.getElementById(id); }
  function fmt(n) { return BR.formatNumber(n); }
  function toast(msg) { A.showToast(msg); }

  UI.init = function () {
    A = BR.App;

    A.updateCoinsUI = updateCoinsUI;
    A.renderStageScreen = renderStageScreen;
    A.openStages = openStages;
    A.openGarage = openGarage;
    A.renderGarage = renderGarage;
    A.updateMenuMeta = updateMenuMeta;

    bind("playBtn", function () { A.startRun(); });
    bind("stagesBtn", function () { A.openStages(); });
    bind("garageBtn", function () { A.openGarage(); });
    bind("settingsBtn", function () { openSettings(); });

    bind("stageBack", function () { A.audio.click(); A.gotoMenu(); });
    bind("garageBack", function () { A.audio.click(); A.gotoMenu(); });
    bind("garageBack2", function () { A.audio.click(); A.gotoMenu(); });
    bind("garageStart", function () { A.startRun(); });
    bind("sfxQuick", function () { A.save.settings.sfx = !A.save.settings.sfx; A.persist(); A.audio.setSfx(A.save.settings.sfx); A.audio.click(); updateSettingsUI(); });
    bind("musicQuick", function () { A.save.settings.music = !A.save.settings.music; A.persist(); A.audio.setMusic(A.save.settings.music); updateSettingsUI(); });
    bind("settingsClose", function () { closeSettings(); });
    bind("settingsScrim", function () { closeSettings(); });

    bind("pauseBtn", function () { A.pauseGame(); });
    bind("pauseResume", function () { A.resumeGame(); });
    bind("pauseRestart", function () { A.startRun(); });
    bind("pauseGarage", function () { A.openGarage(); });
    bind("pauseMenu", function () { A.gotoMenu(); });

    bind("goRetry", function () { A.startRun(); });
    bind("goGarage", function () { A.openGarage(); });
    bind("goMenu", function () { A.gotoMenu(); });

    if (el("stageGrid")) {
      el("stageGrid").addEventListener("click", function (e) {
        var card = e.target.closest(".stage-card");
        if (!card) return;
        if (card.getAttribute("data-locked") === "1") {
          A.audio.click();
          toast("Locked: " + card.querySelector(".stage-tag").textContent);
          return;
        }
        A.save.selectedStage = card.getAttribute("data-stage");
        A.persist();
        A.audio.click();
        renderStageScreen();
        updateMenuMeta();
        updateCoinsUI();
      });
    }

    bind("vehPrev", function () { cycleVehicle(-1); });
    bind("vehNext", function () { cycleVehicle(1); });
    bind("vehicleAction", function () { vehicleAction(); });

    if (el("upgradeGrid")) {
      el("upgradeGrid").addEventListener("click", function (e) {
        var card = e.target.closest(".upg-card");
        if (!card || card.disabled) return;
        onUpgrade(card.getAttribute("data-upg"));
      });
    }

    bind("sfxToggle", function () {
      A.save.settings.sfx = !A.save.settings.sfx;
      A.persist();
      A.audio.setSfx(A.save.settings.sfx);
      A.audio.click();
      updateSettingsUI();
    });
    bind("musicToggle", function () {
      A.save.settings.music = !A.save.settings.music;
      A.persist();
      A.audio.setMusic(A.save.settings.music);
      updateSettingsUI();
    });
    if (el("qualitySelect")) {
      el("qualitySelect").addEventListener("change", function (e) {
        A.save.settings.quality = e.target.value;
        A.persist();
        A.applyQuality();
        A.audio.click();
      });
    }
    bind("fullscreenBtn", function () {
      A.audio.click();
      try {
        if (!document.fullscreenElement) {
          var d = document.documentElement;
          if (d.requestFullscreen) d.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      } catch (err) { /* ignore */ }
    });
    bind("resetBtn", function () {
      if (root.confirm("Erase all progress, coins and upgrades?")) {
        try { root.localStorage.removeItem(BR.store.key); } catch (e) {}
        root.location.reload();
      }
    });

    root.addEventListener("pointerdown", function unlock() {
      A.audio.resume();
      if (A.state === "menu" && A.save.settings.music) A.audio.startMusic();
      root.removeEventListener("pointerdown", unlock);
    });

    renderGarage();
    updateSettingsUI();
    updateMenuMeta();
  };

  function bind(id, fn) {
    var node = el(id);
    if (node) node.addEventListener("click", fn);
  }

  /* ---------------- coins / menu ---------------- */

  function updateCoinsUI() {
    if (!A) A = BR.App;
    var els = document.querySelectorAll(".coin-value");
    for (var i = 0; i < els.length; i++) els[i].textContent = fmt(A.save.coins);
  }

  function updateMenuMeta() {
    if (!A) A = BR.App;
    var st = A.getStage(A.save.selectedStage);
    var nameEl = el("menuStageName");
    if (nameEl) nameEl.textContent = st.name;
    var bestEl = el("menuBest");
    if (bestEl) bestEl.textContent = A.getBest(st.id) + " m";
  }

  /* ---------------- stages ---------------- */

  function renderStageScreen() {
    if (!A) A = BR.App;
    var html = "";
    for (var i = 0; i < BR.STAGES.length; i++) {
      var st = BR.STAGES[i];
      var unlocked = A.stageUnlocked(i);
      var best = A.getBest(st.id);
      var selected = A.save.selectedStage === st.id;
      var lockText = "";
      if (!unlocked) {
        var prev = BR.STAGES[i - 1];
        lockText = "Reach " + st.unlock + " m in " + prev.name;
      }
      html +=
        '<button class="stage-card ' + (selected ? "selected " : "") + (unlocked ? "" : "locked") +
        '" data-stage="' + st.id + '" data-locked="' + (unlocked ? "0" : "1") + '">' +
        '<div class="stage-art" style="background:linear-gradient(165deg,' + st.sky[0] + ',' + st.sky[1] + ')">' +
        '<i style="background:' + st.far + '"></i>' +
        '<i style="background:' + st.mid + '"></i>' +
        '<i style="background:' + st.grass + '"></i>' +
        (unlocked ? "" : '<span class="stage-lock">LOCKED</span>') +
        "</div>" +
        '<div class="stage-name">' + st.name + "</div>" +
        '<div class="stage-best">BEST ' + best + " m</div>" +
        '<div class="stage-tag">' + (unlocked ? st.tagline : lockText) + "</div>" +
        '<div class="stage-bonus">COIN BONUS x' + st.bonus.toFixed(2) + "</div>" +
        "</button>";
    }
    el("stageGrid").innerHTML = html;
    updateCoinsUI();
  }

  function openStages() {
    if (!A) A = BR.App;
    A.audio.click();
    A.cleanupRun();
    A.setState("menu");
    renderStageScreen();
    A.showScreen("stageScreen");
    A.updateCoinsUI();
  }

  /* ---------------- garage ---------------- */

  function openGarage() {
    if (!A) A = BR.App;
    A.audio.resume();
    A.audio.click();
    A.cleanupRun();
    A.setState("menu");
    A.garageVehicleId = A.save.selectedVehicle;
    renderGarage();
    A.showScreen("garageScreen");
    A.updateCoinsUI();
  }

  function cycleVehicle(dir) {
    if (!A) A = BR.App;
    var ids = BR.VEHICLES.map(function (v) { return v.id; });
    var idx = ids.indexOf(A.garageVehicleId);
    idx = (idx + dir + ids.length) % ids.length;
    A.garageVehicleId = ids[idx];
    A.audio.click();
    A.ensureGaragePreview(true);
    renderGarage();
  }

  function vehicleAction() {
    if (!A) A = BR.App;
    var def = A.getVehicle(A.garageVehicleId);
    var owned = A.isOwned(def.id);
    if (!owned) {
      if (A.save.coins < def.price) {
        A.audio.blip(180, 0.2, "square", 0.15, 120);
        toast("Not enough coins - need " + fmt(def.price));
        return;
      }
      A.save.coins -= def.price;
      A.save.owned.push(def.id);
      A.save.selectedVehicle = def.id;
      A.persist();
      A.audio.upgrade();
      A.showToast(def.name + " unlocked!");
      A.ensureMenuPreview(true);
      A.ensureGaragePreview(true);
      updateCoinsUI();
      renderGarage();
      return;
    }
    A.save.selectedVehicle = def.id;
    A.persist();
    A.audio.click();
    A.ensureMenuPreview(true);
    renderGarage();
    toast(def.name + " selected");
  }

  function onUpgrade(key) {
    if (!A) A = BR.App;
    var def = A.getVehicle(A.garageVehicleId);
    if (!A.isOwned(def.id)) { toast("Buy this vehicle first"); return; }
    var upg = A.getUpgrades(def.id);
    if (upg[key] >= A.MAX_UPG) return;
    var defs = A.UPG_DEFS;
    var u = null;
    for (var i = 0; i < defs.length; i++) if (defs[i].key === key) u = defs[i];
    if (!u) return;
    var cost = A.upgradeCost(u, upg[key]);
    if (A.save.coins < cost) {
      A.audio.blip(180, 0.2, "square", 0.15, 120);
      toast("Not enough coins - need " + fmt(cost));
      return;
    }
    A.save.coins -= cost;
    upg[key] += 1;
    A.persist();
    A.audio.upgrade();
    A.ensureGaragePreview(true);
    updateCoinsUI();
    renderGarage();
    toast(u.name + " Lv " + upg[key]);
  }

  function renderGarage() {
    if (!A) A = BR.App;
    var def = A.getVehicle(A.garageVehicleId);
    var owned = A.isOwned(def.id);
    var selected = A.save.selectedVehicle === def.id;
    var upg = A.getUpgrades(def.id);

    el("garageName").textContent = def.name;
    el("garageDesc").textContent = def.desc;
    el("garageStage").textContent = "Stage: " + A.getStage(A.save.selectedStage).name.toUpperCase();
    updateCoinsUI();

    var action = el("vehicleAction");
    if (!owned) {
      action.textContent = "BUY  " + fmt(def.price);
      action.className = "btn btn-gold wide";
    } else if (selected) {
      action.textContent = "SELECTED";
      action.className = "btn btn-ghost wide";
    } else {
      action.textContent = "SELECT";
      action.className = "btn btn-green wide";
    }

    var html = "";
    for (var i = 0; i < A.UPG_DEFS.length; i++) {
      var u = A.UPG_DEFS[i];
      var lvl = upg[u.key];
      var maxed = lvl >= A.MAX_UPG;
      var cost = A.upgradeCost(u, lvl);
      var pips = "";
      for (var p = 0; p < A.MAX_UPG; p++) {
        pips += '<i class="' + (p < lvl ? "on" : "") + '"></i>';
      }
      html +=
        '<button class="upg-card ' + (maxed ? "maxed" : "") + '" data-upg="' + u.key + '"' +
        (!owned || maxed ? " disabled" : "") + '>' +
        '<div class="upg-head"><span class="upg-icon upg-' + u.key + '"></span><span class="upg-name">' + u.name + "</span>" +
        '<span class="upg-lv">' + (lvl > 0 ? "L" + lvl : "") + "</span></div>" +
        '<div class="pips">' + pips + "</div>" +
        '<div class="upg-cost">' + (maxed ? "MAXED" : '<span class="coin"></span>' + fmt(cost)) + "</div>" +
        "</button>";
    }
    el("upgradeGrid").innerHTML = html;

    if (!owned) {
      var note = el("garageLockNote");
      if (note) {
        note.classList.remove("hidden");
        note.textContent = "Upgrades unlock after you buy this vehicle.";
      }
    } else {
      var note2 = el("garageLockNote");
      if (note2) note2.classList.add("hidden");
    }

    A.ensureGaragePreview(true);
  }

  /* ---------------- settings ---------------- */

  function openSettings() {
    if (!A) A = BR.App;
    A.audio.click();
    updateSettingsUI();
    el("settingsModal").classList.remove("hidden");
  }

  function closeSettings() {
    if (!A) A = BR.App;
    A.audio.click();
    el("settingsModal").classList.add("hidden");
  }

  function updateSettingsUI() {
    if (!A) A = BR.App;
    var s = A.save.settings;
    setToggle("sfxToggle", s.sfx);
    setToggle("musicToggle", s.music);
    if (el("sfxQuick")) el("sfxQuick").classList.toggle("off", !s.sfx);
    if (el("musicQuick")) el("musicQuick").classList.toggle("off", !s.music);
    if (el("qualitySelect")) el("qualitySelect").value = s.quality;
  }

  function setToggle(id, on) {
    var node = el(id);
    if (!node) return;
    node.textContent = on ? "ON" : "OFF";
    node.classList.toggle("on", on);
    node.classList.toggle("off", !on);
  }
})(window);
