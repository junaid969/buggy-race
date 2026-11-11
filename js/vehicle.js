/* Buggy Race - vehicles (physics + cartoon rendering) */
(function (root) {
  "use strict";
  var BR = root.BR || (root.BR = {});
  var Matter = root.Matter;
  var Bodies = Matter.Bodies;
  var Body = Matter.Body;
  var Constraint = Matter.Constraint;
  var Composite = Matter.Composite;

  BR.VEHICLES = [
    {
      id: "dune", name: "Dune Buggy", price: 0,
      desc: "The classic. Balanced and forgiving.",
      bodyW: 76, bodyH: 24, wheelR: 17, rearX: -27, frontX: 28, wheelY: 20,
      density: 0.0034, torque: 0.15, maxAngVel: 0.6, airTorque: 0.75,
      grip: 1.25, suspStiff: 0.065, suspDamp: 0.075,
      body: "#f6b41c", body2: "#cd8407", accent: "#ffd766", cage: "#33333c",
      rim: "#f3c74e", seat: "#7d4a26", shirt: "#e0432e", helmet: "#3fae4a",
      headOff: { x: 2, y: -27 }
    },
    {
      id: "truck", name: "Monster Truck", price: 2500,
      desc: "Huge wheels. Nothing stops it.",
      bodyW: 84, bodyH: 30, wheelR: 27, rearX: -32, frontX: 33, wheelY: 24,
      density: 0.0032, torque: 0.35, maxAngVel: 0.52, airTorque: 1.7,
      grip: 1.45, suspStiff: 0.07, suspDamp: 0.085,
      body: "#e2452f", body2: "#a82a1a", accent: "#ff8f6e", cage: "#c9ccd4",
      rim: "#b9c0cc", seat: "#5a3a22", shirt: "#2f6fd0", helmet: "#f4f4f4",
      headOff: { x: 2, y: -32 }
    },
    {
      id: "rally", name: "Rally Buggy", price: 6000,
      desc: "Light, quick and glued to the road.",
      bodyW: 72, bodyH: 20, wheelR: 15, rearX: -26, frontX: 28, wheelY: 16,
      density: 0.0038, torque: 0.135, maxAngVel: 0.7, airTorque: 0.8,
      grip: 1.6, suspStiff: 0.08, suspDamp: 0.08,
      body: "#1eb7e6", body2: "#0d7ea6", accent: "#8ee9ff", cage: "#22262e",
      rim: "#d8e6ef", seat: "#33404d", shirt: "#f5c518", helmet: "#f5f5f5",
      headOff: { x: 3, y: -25 }
    }
  ];

  function num(upg, key) { return (upg && upg[key]) || 0; }

  function Car(world, def, upgrades, stage) {
    this.world = world;
    this.def = def;
    this.u = upgrades || { engine: 0, suspension: 0, tires: 0, fourwd: 0 };
    this.stage = stage || {};
    this.group = Body.nextGroup(true);

    this.torqueMul = 1 + 0.13 * num(this.u, "engine");
    this.gripMul = 1 + 0.06 * num(this.u, "tires");
    this.fourWD = BR.clamp(num(this.u, "fourwd") / 3, 0, 1);
    this.suspStiff = BR.clamp(def.suspStiff + 0.008 * num(this.u, "suspension"), 0.03, 0.15);
    this.suspDamp = def.suspDamp + 0.006 * num(this.u, "suspension");

    this.onGround = false;
    this.airTime = 0;
    this.time = 0;
    this.wasOnGround = true;
    this.landImpact = 0;

    var cx = 240, cy = -300;
    var d = def;

    this.chassis = Bodies.rectangle(cx, cy, d.bodyW, d.bodyH, {
      density: d.density,
      friction: 0.45,
      frictionAir: 0.012,
      restitution: 0.08,
      chamfer: { radius: 5 },
      collisionFilter: { group: this.group },
      label: "chassis",
      render: { visible: false }
    });

    function makeWheel(x, y) {
      return Bodies.circle(x, y, d.wheelR, {
        density: 0.0016,
        friction: d.grip * (1 + 0.06 * num(upgrades, "tires")),
        frictionStatic: d.grip * 2.8,
        frictionAir: 0.006,
        restitution: 0.1,
        slop: 0.02,
        collisionFilter: { group: this.group },
        label: "wheel",
        render: { visible: false }
      });
    }
    this.rearWheel = makeWheel.call(this, cx + d.rearX, cy + d.wheelY);
    this.frontWheel = makeWheel.call(this, cx + d.frontX, cy + d.wheelY);

    this.constraints = [];
    this._attachWheel(this.chassis, this.rearWheel, d.rearX);
    this._attachWheel(this.chassis, this.frontWheel, d.frontX);

    this.parts = [this.chassis, this.rearWheel, this.frontWheel];
    Composite.add(world, this.parts);
    Composite.add(world, this.constraints);
  }

  Car.prototype._attachWheel = function (chassis, wheel, wheelX) {
    var d = this.def, dir = wheelX < 0 ? 1 : -1, top = 0, arm = 38;
    this.constraints.push(Constraint.create({
      bodyA: chassis, pointA: { x: wheelX, y: top }, bodyB: wheel, pointB: { x: 0, y: 0 },
      length: d.wheelY - top, stiffness: this.suspStiff, damping: this.suspDamp, render: { visible: false }
    }));
    this.constraints.push(Constraint.create({
      bodyA: chassis, pointA: { x: wheelX + dir * arm, y: d.wheelY }, bodyB: wheel, pointB: { x: 0, y: 0 },
      length: arm, stiffness: 0.95, damping: 0.1, render: { visible: false }
    }));
  };

  Car.prototype.reset = function (x, y) {
    var d = this.def;
    var bodies = [
      { b: this.chassis, dx: 0, dy: 0 },
      { b: this.rearWheel, dx: d.rearX, dy: d.wheelY },
      { b: this.frontWheel, dx: d.frontX, dy: d.wheelY }
    ];
    for (var i = 0; i < 3; i++) {
      var e = bodies[i];
      Body.setPosition(e.b, { x: x + e.dx, y: y + e.dy });
      Body.setVelocity(e.b, { x: 0, y: 0 });
      Body.setAngularVelocity(e.b, 0);
      Body.setAngle(e.b, 0);
    }
    this.time = 0;
    this.airTime = 0;
  };

  Car.prototype.applyControls = function (gas, brake, dt) {
    var d = this.def;
    var torque = d.torque * this.torqueMul;
    var rear = this.rearWheel;
    var front = this.frontWheel;

    if (this.onGround) {
      if (gas && !brake) {
        rear.torque += torque;
        if (this.fourWD > 0) front.torque += torque * this.fourWD * 0.95;
      } else if (brake && !gas) {
        rear.torque -= torque * 1.0;
        if (this.fourWD > 0) front.torque -= torque * this.fourWD * 0.8;
      }
    } else {
      var t = (gas ? 1 : 0) - (brake ? 1 : 0);
      if (t !== 0 && this.airTime > 0.12) this.chassis.torque -= t * d.airTorque;
    }

    /* clamp spin */
    var maxW = d.maxAngVel * (this.onGround ? 1 : 1.35);
    var maxRev = d.maxAngVel * 0.72;
    var w;
    w = rear.angularVelocity;
    if (w > maxW) Body.setAngularVelocity(rear, maxW);
    else if (w < -maxRev) Body.setAngularVelocity(rear, -maxRev);
    w = front.angularVelocity;
    if (w > maxW) Body.setAngularVelocity(front, maxW);
    else if (w < -maxRev) Body.setAngularVelocity(front, -maxRev);
  };

  Car.prototype.update = function (dt, terrain) {
    this.time += dt;
    var d = this.def;
    var rw = this.rearWheel, fw = this.frontWheel;
    var hR = terrain.heightAt(rw.position.x);
    var hF = terrain.heightAt(fw.position.x);
    var nearR = (rw.position.y + d.wheelR) >= hR - 6;
    var nearF = (fw.position.y + d.wheelR) >= hF - 6;
    var nowGround = nearR || nearF;

    if (nowGround && !this.wasOnGround) {
      var vy = Math.abs(this.chassis.velocity.y) * 60;
      this.landImpact = BR.clamp(vy / 700, 0, 1.4);
    } else {
      this.landImpact = 0;
    }
    this.wasOnGround = nowGround;
    this.onGround = nowGround;
    this.airTime = nowGround ? 0 : this.airTime + dt;

    /* keep wheels attached and above ground - fixes vanishing tyres */
    var cos = Math.cos(this.chassis.angle), sin = Math.sin(this.chassis.angle);
    var pairs = [
      { w: rw, lx: d.rearX, ly: d.wheelY },
      { w: fw, lx: d.frontX, ly: d.wheelY }
    ];
    for (var wi = 0; wi < 2; wi++) {
      var pr = pairs[wi];
      var ex = this.chassis.position.x + pr.lx * cos - pr.ly * sin;
      var ey = this.chassis.position.y + pr.lx * sin + pr.ly * cos;
      var ddx = pr.w.position.x - ex;
      var ddy = pr.w.position.y - ey;
      var sep = Math.sqrt(ddx * ddx + ddy * ddy);
      if (!isFinite(sep) || sep > d.wheelR + 40) {
        Body.setPosition(pr.w, { x: ex, y: ey });
        Body.setVelocity(pr.w, { x: this.chassis.velocity.x, y: this.chassis.velocity.y });
        Body.setAngularVelocity(pr.w, 0);
      }
      var gr = terrain.heightAt(pr.w.position.x);
      if (pr.w.position.y - d.wheelR > gr + 45) {
        Body.setPosition(pr.w, { x: pr.w.position.x, y: gr - d.wheelR - 3 });
        Body.setVelocity(pr.w, { x: this.chassis.velocity.x, y: Math.min(0, this.chassis.velocity.y) });
      }
    }

    /* uprighting torque when nearly flipped and crawling */
    var angle = this.chassis.angle % BR.TAU;
    var tilt = Math.abs(angle);
    if (nowGround && tilt > 1.9 && Math.abs(this.chassis.velocity.x) < 40) {
      this.chassis.torque += (angle > 0 ? -1 : 1) * 0.02;
    }

    /* gentle self-levelling keeps the buggy planted and controllable */
    if (nowGround) {
      var groundAng = Math.atan2(hF - hR, (fw.position.x - rw.position.x) || 1);
      var err = groundAng - this.chassis.angle;
      while (err > Math.PI) err -= BR.TAU;
      while (err < -Math.PI) err += BR.TAU;
      var align = Math.abs(this.chassis.velocity.x) < 220 ? 0.012 : 0.006;
      this.chassis.torque += BR.clamp(err, -0.7, 0.7) * align;
    }
  };

  Car.prototype.speed = function () {
    var v = this.chassis.velocity;
    return Math.sqrt(v.x * v.x + v.y * v.y) * 60;
  };

  Car.prototype.speed01 = function () {
    return BR.clamp(this.speed() / 400, 0, 1);
  };

  Car.prototype.headPos = function () {
    var o = this.def.headOff;
    var a = this.chassis.angle;
    var cos = Math.cos(a), sin = Math.sin(a);
    return {
      x: this.chassis.position.x + o.x * cos - o.y * sin,
      y: this.chassis.position.y + o.x * sin + o.y * cos
    };
  };

  Car.prototype.destroy = function (world) {
    Composite.remove(world, this.parts);
    Composite.remove(world, this.constraints);
  };

  /* ---------------------------------------------------------------- */
  /* rendering                                                         */
  /* ---------------------------------------------------------------- */

  var TAU = Math.PI * 2;

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  BR.roundRect = roundRect;

  Car.prototype._wheelLocal = function (wheel) {
    var c = this.chassis;
    var dx = wheel.position.x - c.position.x;
    var dy = wheel.position.y - c.position.y;
    var a = -c.angle;
    return {
      x: dx * Math.cos(a) - dy * Math.sin(a),
      y: dx * Math.sin(a) + dy * Math.cos(a)
    };
  };

  Car.prototype.drawShadow = function (ctx, terrain) {
    var c = this.chassis.position;
    var ground = terrain.heightAt(c.x);
    if (c.y > ground + 160) return;
    var dist = BR.clamp((ground - c.y) / 300, 0, 1);
    var w = this.def.bodyW * (1.05 - dist * 0.3);
    ctx.save();
    ctx.globalAlpha = 0.24 * (1 - dist * 0.6);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(c.x, ground + 2, w * 0.62, 9 - dist * 3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  Car.prototype.draw = function (ctx, terrain) {
    var self = this;
    var d = this.def;
    var c = this.chassis;
    var t = this.time;

    /* suspension arms in local space */
    var rearL = this._wheelLocal(this.rearWheel);
    var frontL = this._wheelLocal(this.frontWheel);

    this._drawWheelArm(ctx, rearL, d.rearX);
    this._drawWheelArm(ctx, frontL, d.frontX);

    this._drawWheel(ctx, this.rearWheel, d);
    this._drawWheel(ctx, this.frontWheel, d);

    ctx.save();
    ctx.translate(c.position.x, c.position.y);
    ctx.rotate(c.angle);

    /* subtle body bob */
    var bob = this.speed01() * 0.6;

    /* chassis tub */
    var w = d.bodyW, h = d.bodyH;
    var hw = w / 2, hh = h / 2;

    /* rear engine block */
    ctx.fillStyle = "#3a3d46";
    roundRect(ctx, -hw - 4, -hh - 12, 26, 24, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (var e = 0; e < 3; e++) {
      ctx.fillRect(-hw + 1 + e * 6, -hh - 8, 3, 15);
    }

    /* main body */
    var bodyPath = function () {
      ctx.beginPath();
      ctx.moveTo(-hw - 2, hh * 0.35);
      ctx.lineTo(-hw + 2, -hh * 0.55);
      ctx.quadraticCurveTo(-hw + 6, -hh - 4, -hw + 18, -hh - 4);
      ctx.lineTo(hw * 0.42, -hh - 4);
      ctx.quadraticCurveTo(hw * 0.72, -hh - 4, hw * 0.82, -hh * 0.3);
      ctx.lineTo(hw + 8, -hh * 0.15);
      ctx.quadraticCurveTo(hw + 13, -hh * 0.05, hw + 12, hh * 0.35);
      ctx.lineTo(hw + 6, hh);
      ctx.quadraticCurveTo(hw * 0.6, hh + 5, hw * 0.2, hh + 4);
      ctx.lineTo(-hw + 6, hh + 4);
      ctx.quadraticCurveTo(-hw - 2, hh + 4, -hw - 2, hh * 0.35);
      ctx.closePath();
    };
    var grad = ctx.createLinearGradient(0, -hh - 6, 0, hh + 6);
    grad.addColorStop(0, d.accent || d.body);
    grad.addColorStop(0.35, d.body);
    grad.addColorStop(1, d.body2);
    bodyPath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "#3a2a14";
    ctx.lineJoin = "round";
    ctx.stroke();

    /* side highlight */
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-6, -hh * 0.5, hw * 0.8, 4, -0.05, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, hh + 3, hw, 7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* number decal */
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(-6, 1, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#3a2a14";
    ctx.font = "bold 9px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("7", -6, 1.5);
    ctx.restore();

    /* headlight */
    var lightGrad = ctx.createRadialGradient(hw + 7, 0, 0, hw + 7, 0, 16);
    lightGrad.addColorStop(0, "rgba(255,246,180,0.95)");
    lightGrad.addColorStop(1, "rgba(255,246,180,0)");
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(hw + 7, 0, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff6c4";
    ctx.strokeStyle = "#3a2a14";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hw + 6, 0, 4.2, 0, TAU);
    ctx.fill();
    ctx.stroke();

    /* per-vehicle styling */
    if (d.id === "rally") {
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(-hw + 8, -hh - 3, hw * 1.5, 4);
      ctx.fillStyle = d.body2; ctx.fillRect(-hw - 6, -hh - 24, 4, 14); ctx.fillRect(-hw - 12, -hh - 26, 20, 4);
    } else if (d.id === "truck") {
      ctx.fillStyle = "#222"; roundRect(ctx, -hw * 0.5, -hh - 36, hw * 1.1, 6, 3); ctx.fill();
      ctx.fillStyle = "#fff6c4"; for (var L = 0; L < 4; L++) ctx.fillRect(-hw * 0.4 + L * 18, -hh - 35, 8, 4);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-hw + 4, hh - 2, w - 8, 5);
    } else {
      ctx.fillStyle = "#3a2a14"; ctx.fillRect(hw + 4, hh - 3, 10, 5);
    }
    /* driver */
    this._drawDriver(ctx, d, t, bob);

    /* roll cage */
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(-hw + 5, 2);
    ctx.lineTo(-hw + 13, -hh - 20);
    ctx.quadraticCurveTo(-hw + 16, -hh - 27, -hw + 26, -hh - 28);
    ctx.lineTo(hw * 0.34, -hh - 28);
    ctx.quadraticCurveTo(hw * 0.5, -hh - 27, hw * 0.56, -hh - 18);
    ctx.lineTo(hw * 0.62, 2);
    ctx.stroke();
    ctx.strokeStyle = d.cage;
    ctx.lineWidth = 4.6;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-hw + 8, 0);
    ctx.lineTo(-hw + 16, -hh - 20);
    ctx.stroke();

    /* steering wheel */
    ctx.strokeStyle = "#26262c";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(hw * 0.4, -6, 7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#1d1d22";
    ctx.beginPath();
    ctx.arc(hw * 0.4, -6, 2.2, 0, TAU);
    ctx.fill();

    /* exhaust pipe */
    ctx.strokeStyle = "#5b5f68";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-hw - 2, -hh - 6);
    ctx.quadraticCurveTo(-hw - 16, -hh - 14, -hw - 18, -hh - 30);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    /* antenna + flag */
    ctx.strokeStyle = "#4a4a52";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + 4, hh + 2);
    ctx.quadraticCurveTo(-hw - 2, -hh - 10, -hw - 10, -hh - 34);
    ctx.stroke();
    var flap = Math.sin(t * 9) * 2.2;
    ctx.fillStyle = d.shirt;
    ctx.beginPath();
    ctx.moveTo(-hw - 10, -hh - 34);
    ctx.lineTo(-hw - 10 - 3, -hh - 27 + flap);
    ctx.lineTo(-hw - 10 + 8, -hh - 28 + flap * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  Car.prototype._drawWheelArm = function (ctx, wl, wheelX) {
    var c = this.chassis, d0y = this.def.wheelY - 4;
    ctx.save();
    ctx.translate(c.position.x, c.position.y);
    ctx.rotate(c.angle);
    ctx.strokeStyle = "#2c2f36";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(wheelX + (wheelX < 0 ? 30 : -30), d0y);
    ctx.lineTo(wl.x, wl.y - 4);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    /* coil spring */
    var sx = wheelX, sy = -2;
    var ex = wl.x, ey = wl.y - 8;
    var dx = ex - sx, dy = ey - sy;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var coils = 6;
    ctx.strokeStyle = "#8a8f99";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var i = 0; i <= coils * 2; i++) {
      var k = i / (coils * 2);
      var off = (i % 2 === 0 ? 1 : -1) * 4 * (i === 0 || i === coils * 2 ? 0.2 : 1);
      var px = sx + dx * k + nx * off;
      var py = sy + dy * k + ny * off;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  Car.prototype._drawWheel = function (ctx, wheel, d) {
    var r = d.wheelR;
    var p = wheel.position;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(wheel.angle);

    /* tire */
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, "#3a3a42");
    g.addColorStop(0.7, "#232329");
    g.addColorStop(1, "#101014");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#0a0a0c";
    ctx.stroke();

    /* treads */
    ctx.fillStyle = "#0d0d11";
    var treads = 11;
    for (var i = 0; i < treads; i++) {
      var a = (i / treads) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.fillRect(r - 2.6, -2.4, 3.4, 4.8);
      ctx.restore();
    }

    /* rim */
    var rimR = r * 0.56;
    var rg = ctx.createRadialGradient(-rimR * 0.4, -rimR * 0.4, 1, 0, 0, rimR);
    rg.addColorStop(0, "#fff2b8");
    rg.addColorStop(0.4, d.rim);
    rg.addColorStop(1, "#9c7a22");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, rimR, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(60,40,10,0.8)";
    ctx.stroke();

    /* spokes */
    ctx.strokeStyle = "rgba(70,50,15,0.75)";
    ctx.lineWidth = 2;
    for (var s = 0; s < 5; s++) {
      var sa = (s / 5) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * rimR * 0.2, Math.sin(sa) * rimR * 0.2);
      ctx.lineTo(Math.cos(sa) * rimR * 0.88, Math.sin(sa) * rimR * 0.88);
      ctx.stroke();
    }

    /* hub */
    ctx.fillStyle = "#40311a";
    ctx.beginPath();
    ctx.arc(0, 0, rimR * 0.28, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(-rimR * 0.12, -rimR * 0.12, rimR * 0.1, 0, TAU);
    ctx.fill();

    ctx.restore();
  };

  Car.prototype._drawDriver = function (ctx, d, t, bob) {
    var lean = BR.clamp(this.chassis.angularVelocity * 2.5, -0.18, 0.18);

    /* torso */
    ctx.save();
    ctx.translate(0, 0);
    ctx.fillStyle = d.shirt;
    ctx.beginPath();
    ctx.ellipse(-2, -14 + bob, 9, 12, lean, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* arm to wheel */
    ctx.strokeStyle = "#d8a06b";
    ctx.lineWidth = 4.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(3, -16 + bob);
    ctx.quadraticCurveTo(10, -14, 15, -8);
    ctx.stroke();

    /* head */
    var hx = 2, hy = -27 + bob;
    ctx.fillStyle = "#e0a970";
    ctx.beginPath();
    ctx.arc(hx, hy, 7.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    /* helmet */
    ctx.fillStyle = d.helmet;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 8, Math.PI * 0.92, Math.PI * 2.08);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(hx, hy - 3.5, 4.2, 2.1, 0, 0, TAU);
    ctx.fill();

    /* goggles */
    ctx.fillStyle = "#243040";
    roundRect(ctx, hx + 1, hy + 1, 7.5, 4.2, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(150,220,255,0.8)";
    ctx.beginPath();
    ctx.arc(hx + 5.5, hy + 3, 1.4, 0, TAU);
    ctx.fill();

    ctx.restore();
  };

  BR.Car = Car;
})(window);

