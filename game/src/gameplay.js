  // ============================================================
  //  driving-sim gameplay layer
  // ============================================================
  const state = {
    mode: 'foot',
    flying: false,
    vel: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0.17,
    dist: 5.1,
    score: 0,
    car: null,
    started: false,
    bob: 0,
    camMode: 0,
    weather: 0,          // 0 clear · 1 rain · 2 fog
    time: 0.34,          // 0..1 day cycle
    timeSpeed: 1 / 260,  // one full day every 260 s
    night: 0
  };

  // ---------------------------------------------------------- input
  const input = {
    mx: 0, my: 0, up: 0, down: 0,
    gas: 0, brake: 0, steer: 0, handbrake: 0,
    jump: false, fly: false, act: false, cam: false, weather: false, horn: false
  };
  const pad = { gas: 0, brake: 0, steer: 0, up: 0, down: 0, hand: 0 };
  const keys = {};

  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    // a held key repeats keydown events; the one-shot actions below must fire
    // once per press, or holding F/C/R/E/H flipped flight, the camera, the
    // weather and the horn many times a second
    if (e.repeat) return;
    if (e.code === 'KeyF') input.fly = true;
    if (e.code === 'KeyE') input.act = true;
    if (e.code === 'KeyC') input.cam = true;
    if (e.code === 'KeyR') input.weather = true;
    if (e.code === 'KeyH') input.horn = true;
    if (e.code === 'KeyQ') input.handbrake = 1;
    if (e.code === 'Space' && state.mode === 'foot') input.jump = true;
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyQ') input.handbrake = 0;
  });

  function readInput() {
    const kL = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
    const kR = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;
    const kU = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
    const kD = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;

    if (!stick.active) { input.mx = kR - kL; input.my = kU - kD; }
    input.up = pad.up;
    input.down = pad.down;
    input.handbrake = Math.max(pad.hand, keys['KeyQ'] ? 1 : 0);

    const sSteer = stick.active ? input.mx : 0;
    const sFwd = stick.active ? input.my : 0;
    input.steer = clamp(sSteer + (kR - kL) + pad.steer, -1, 1);
    input.gas = Math.max(pad.gas, sFwd > 0.15 ? sFwd : 0, kU);
    input.brake = Math.max(pad.brake, sFwd < -0.15 ? -sFwd : 0, kD);
  }

  // ---------------------------------------------------------- touch
  const stick = { active: false, id: null };
  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('knob');
  const R = 50;

  function stickMove(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    const r = stickEl.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(d, R) / d;
    dx *= k; dy *= k;
    knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    input.mx = dx / R;
    input.my = -dy / R;
  }
  function stickEnd(e) {
    if (e.pointerId !== stick.id) return;
    stick.active = false; stick.id = null;
    knobEl.style.transform = 'translate(0,0)';
    input.mx = 0; input.my = 0;
    stickEl.classList.remove('on');
  }
  stickEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); stickEl.setPointerCapture(e.pointerId);
    stick.active = true; stick.id = e.pointerId; stickEl.classList.add('on'); stickMove(e);
  });
  stickEl.addEventListener('pointermove', stickMove);
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);

  function bindHold(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); el.classList.add('act'); onDown(); };
    const up = () => { el.classList.remove('act'); if (onUp) onUp(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
  bindHold('bJump', () => { input.jump = true; });
  bindHold('bFly', () => { input.fly = true; });
  bindHold('bUp', () => { pad.up = 1; }, () => { pad.up = 0; });
  bindHold('bDown', () => { pad.down = 1; }, () => { pad.down = 0; });
  bindHold('bAct', () => { input.act = true; });
  bindHold('bAct2', () => { input.act = true; });
  bindHold('bGas', () => { pad.gas = 1; }, () => { pad.gas = 0; });
  bindHold('bBrake', () => { pad.brake = 1; }, () => { pad.brake = 0; });
  bindHold('bLeft', () => { pad.steer = -1; }, () => { pad.steer = 0; });
  bindHold('bRight', () => { pad.steer = 1; }, () => { pad.steer = 0; });
  bindHold('bHand', () => { pad.hand = 1; }, () => { pad.hand = 0; });
  bindHold('bCam', () => { input.cam = true; });
  bindHold('bWeather', () => { input.weather = true; });
  bindHold('bHorn', () => { input.horn = true; });

  // ---------------------------------------------------------- camera drag
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // a mouse that is no longer held down must not keep orbiting the camera
    if (e.pointerType === 'mouse' && e.buttons === 0) { drag = null; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    state.yaw -= dx * 0.005;
    state.pitch = clamp(state.pitch + dy * 0.004, -0.22, 1.1);
  });
  canvas.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  // the pointer can be released outside the canvas — listen on the window too,
  // otherwise a lost pointerup leaves the drag latched on
  addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.dist = clamp(state.dist + e.deltaY * 0.01, 4.0, 16);
  }, { passive: false });

  // ---------------------------------------------------------- input reset
  // A window that loses focus never delivers keyup/pointerup, so every held
  // control has to be released explicitly or the hero keeps walking.
  function releaseInputs() {
    for (const k in keys) keys[k] = false;
    input.jump = input.fly = input.act = input.cam = input.weather = input.horn = false;
    input.gas = input.brake = input.steer = input.handbrake = 0;
    input.mx = 0; input.my = 0;
    pad.gas = pad.brake = pad.steer = pad.up = pad.down = pad.hand = 0;
    drag = null;
    if (stick.active) {
      stick.active = false; stick.id = null;
      knobEl.style.transform = 'translate(0,0)';
      stickEl.classList.remove('on');
    }
  }
  addEventListener('blur', releaseInputs);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseInputs();
      // the engine hum kept running with the app in the background, burning
      // battery for a sound nobody can hear
      if (actx && actx.state === 'running') { try { actx.suspend(); } catch (e) {} }
    } else if (state.started && actx && actx.state === 'suspended') {
      try {
        const p = actx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* the context resumes on the next tap */ }
    }
  });

  // ---------------------------------------------------------- collision
  function resolveCircle(p, radius) {
    for (let n = 0; n < buildings.length; n++) {
      const b = buildings[n];
      if (p.y > b.h) continue;
      const cx = clamp(p.x, b.x0, b.x1);
      const cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = radius - d;
        p.x += (dx / d) * push; p.z += (dz / d) * push;
      } else {
        const l = p.x - b.x0, r = b.x1 - p.x, f = p.z - b.z0, k = b.z1 - p.z;
        const m = Math.min(l, r, f, k);
        if (m === l) p.x = b.x0 - radius;
        else if (m === r) p.x = b.x1 + radius;
        else if (m === f) p.z = b.z0 - radius;
        else p.z = b.z1 + radius;
      }
    }
  }
  function hitsBuilding(x, z, radius, y) {
    for (let n = 0; n < buildings.length; n++) {
      const b = buildings[n];
      if (y !== undefined && y > b.h) continue;
      if (x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius) return true;
    }
    return false;
  }

  // ---------------------------------------------------------- HUD refs
  const speedTxt = document.getElementById('speed');
  const speedBar = document.getElementById('speedBar');
  const coreTxt = document.getElementById('cores');
  const prompt = document.getElementById('prompt');
  const footPanel = document.getElementById('footPanel');
  const carPanel = document.getElementById('carPanel');
  const toast = document.getElementById('toast');
  const gearTxt = document.getElementById('gear');
  const rpmBar = document.getElementById('rpmBar');
  const fuelBar = document.getElementById('fuelBar');
  const mapCv = document.getElementById('map');

  function popEl(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  let toastT = 0;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    toastT = 2.4;
  }

  function refreshPanels() {
    const drive = state.mode === 'drive';
    footPanel.classList.toggle('hide', drive);
    carPanel.classList.toggle('hide', !drive);
    document.getElementById('gauges').classList.toggle('hide', !drive);
    const st = document.getElementById('stateText');
    const dot = document.getElementById('stateDot');
    if (st) st.textContent = drive ? 'Driving · ' + CAM_NAMES[state.camMode] : (state.flying ? 'Flying' : 'On foot');
    if (dot) dot.style.background = drive ? '#ffcf6b' : (state.flying ? '#6fe3ff' : '#7dffb2');
  }

  // ---------------------------------------------------------- audio
  let actx = null, engOsc = null, engOsc2 = null, engGain = null, engFilt = null;
  function initAudio() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      engOsc = actx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 60;
      engOsc2 = actx.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 90;
      engFilt = actx.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 620;
      engGain = actx.createGain(); engGain.gain.value = 0;
      engOsc.connect(engFilt); engOsc2.connect(engFilt);
      engFilt.connect(engGain); engGain.connect(actx.destination);
      engOsc.start(); engOsc2.start();
    } catch (e) { actx = null; }
  }
  let audioT = 0;
  function updateAudio(dt) {
    if (!actx || !engGain) return;
    // the engine note only needs a few parameter ramps a second; scheduling
    // four AudioParam automations every frame is wasted main-thread work
    audioT += dt;
    if (audioT < 0.05) return;
    audioT = 0;
    const c = state.car;
    if (state.mode === 'drive' && c) {
      const f = 42 + (c.rpm / 7000) * 118;
      engOsc.frequency.setTargetAtTime(f, actx.currentTime, 0.05);
      engOsc2.frequency.setTargetAtTime(f * 1.51, actx.currentTime, 0.05);
      engFilt.frequency.setTargetAtTime(500 + (c.rpm / 7000) * 1500, actx.currentTime, 0.08);
      const g = 0.018 + (c.rpm / 7000) * 0.028 + Math.abs(c.speed) / 78 * 0.02;
      engGain.gain.setTargetAtTime(g, actx.currentTime, 0.1);
    } else {
      engGain.gain.setTargetAtTime(0, actx.currentTime, 0.15);
    }
  }
  function horn() {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = 415;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.start(t); o.stop(t + 0.5);
    // every horn press left an oscillator and a gain node wired to the
    // destination forever; drop them when the beep ends
    o.onended = function () { o.disconnect(); g.disconnect(); };
  }

  // ---------------------------------------------------------- cars
  const TAU = Math.PI * 2;
  const GEARS = [3.55, 2.30, 1.65, 1.25, 1.00, 0.82];
  const FINAL_DRIVE = 3.9;
  const WHEEL_R = 0.355;

  function nearestCar() {
    // the check is 2-D, so mid-flight over a parked car the hero could climb
    // into it from 100 m up; require him to be on the ground
    if (heroY > 2.2) return null;
    let best = null, bd = 1e9;
    for (const c of cars) {
      if (c.occupied) continue;
      const d = Math.hypot(c.x - heroPos.x, c.z - heroPos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return bd < 5.4 ? best : null;
  }

  function enterCar(c) {
    state.flying = false;
    state.mode = 'drive';
    state.car = c;
    c.occupied = true;
    c.gear = 0; c.rpm = 900; c.steer = 0; c.slip = 0; c.shiftT = 0;
    if (c.fuel === undefined) c.fuel = 42 + Math.random() * 30;
    hero.visible = false;
    state.yaw = c.heading + Math.PI;
    refreshPanels();
    showToast('Engine on · gear D');
  }
  function exitCar() {
    const c = state.car;
    if (!c) return;
    state.mode = 'foot';
    c.occupied = false;
    c.speed = 0;
    const side = 3.4;
    let px = c.x + Math.cos(c.heading) * side;
    let pz = c.z - Math.sin(c.heading) * side;
    if (hitsBuilding(px, pz, 0.6, 1)) { px = c.x - Math.cos(c.heading) * side; pz = c.z + Math.sin(c.heading) * side; }
    heroPos.set(px, 0, pz);
    // both sides can be blocked (parked against a wall) — never drop the hero
    // inside the geometry, push him back out of any overlap
    resolveCircle(heroPos, 0.55);
    heroY = 0;
    hero.visible = true;
    cockpit.visible = false;
    c.mesh.visible = true;
    state.vel.set(0, 0, 0);
    state.car = null;
    // the hood and cockpit views only exist inside a car; leaving one of them
    // selected meant the next car was entered straight into the cockpit
    state.camMode = 0;
    refreshPanels();
  }

  // ---------------------------------------------------------- foot
  const GRAVITY = -24;
  let grounded = true;
  let heroY = 0;

  // reused per-frame scratch vectors — allocating them every frame fed the GC
  const footFwd = new THREE.Vector3();
  const footRight = new THREE.Vector3();
  const footDir = new THREE.Vector3();

  function updateFoot(dt) {
    const fwd = footFwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const right = footRight.set(-fwd.z, 0, fwd.x);   // screen-right for this view
    const mag = Math.min(1, Math.hypot(input.mx, input.my));
    const running = mag > 0.82 || keys['ShiftLeft'] || keys['ShiftRight'];
    const walkSpeed = running ? 9.5 : 5.6;

    if (input.jump) {
      input.jump = false;
      if (grounded && !state.flying) { state.vel.y = 9.2; grounded = false; }
    }
    if (input.fly) {
      input.fly = false;
      state.flying = !state.flying;
      state.vel.set(0, state.flying ? 3.5 : 0, 0);
      grounded = false;
      refreshPanels();
      showToast(state.flying ? 'Flight engaged' : 'Flight disengaged');
    }

    const dir = footDir.set(0, 0, 0);
    if (mag > 0.08) {
      dir.copy(fwd).multiplyScalar(input.my).addScaledVector(right, input.mx).clampLength(0, 1);
    }

    let bobY = 0;
    if (state.flying) {
      const accel = 22, maxS = 34;
      state.vel.x += dir.x * accel * dt;
      state.vel.z += dir.z * accel * dt;
      state.vel.y += ((input.up - input.down) * 17 + 1.2) * dt;
      state.vel.x *= (1 - 1.5 * dt);
      state.vel.z *= (1 - 1.5 * dt);
      const hs = Math.hypot(state.vel.x, state.vel.z);
      if (hs > maxS) { state.vel.x *= maxS / hs; state.vel.z *= maxS / hs; }
      state.vel.y = clamp(state.vel.y, -20, 20);
      heroPos.x += state.vel.x * dt;
      heroPos.z += state.vel.z * dt;
      heroY = clamp(heroY + state.vel.y * dt, 0.9, 130);
      if (heroY <= 1.0) state.vel.y = Math.max(0, state.vel.y);
      grounded = false;
      const hs2 = Math.hypot(state.vel.x, state.vel.z);
      if (hs2 > 1.5) hero.rotation.y = angLerp(hero.rotation.y, Math.atan2(state.vel.x, state.vel.z), 6 * dt);
      hero.rotation.x = lerp(hero.rotation.x, clamp(hs2 * 0.012, 0, 0.55), 6 * dt);
      bobY = Math.sin(performance.now() * 0.005) * 0.12;
    } else {
      state.vel.y += GRAVITY * dt;
      heroPos.x += dir.x * walkSpeed * dt;
      heroPos.z += dir.z * walkSpeed * dt;
      // walking never wrote the horizontal velocity, so the speedometer sat at
      // 0 km/h for the whole on-foot part of the game
      state.vel.x = dir.x * walkSpeed;
      state.vel.z = dir.z * walkSpeed;
      heroY += state.vel.y * dt;
      if (heroY <= 0) { heroY = 0; state.vel.y = 0; grounded = true; }
      hero.rotation.x = lerp(hero.rotation.x, 0, 8 * dt);
      if (dir.lengthSq() > 0.02) {
        hero.rotation.y = angLerp(hero.rotation.y, Math.atan2(dir.x, dir.z), 12 * dt);
        state.bob += dt * (running ? 14 : 9);
      } else {
        state.bob += dt * 2;
      }
      bobY = grounded ? Math.abs(Math.sin(state.bob)) * (running ? 0.075 : 0.03) : 0;
    }

    heroPos.y = heroY;
    hero.position.y = heroY + bobY;   // visual only — never read back
    resolveCircle(heroPos, 0.55);

    if (input.act) {
      input.act = false;
      const c = nearestCar();
      if (c) enterCar(c);
    }
  }

  // ---------------------------------------------------------- vehicle physics
  function torqueAt(rpm) {
    const x = clamp(rpm / 7000, 0, 1);
    return clamp(0.62 + 1.35 * x - 1.05 * x * x, 0.15, 1.12);
  }

  function updateCar(dt) {
    const c = state.car;
    if (!c) return;
    const thr = input.gas, brk = input.brake, hb = input.handbrake;
    const v = c.speed;
    const absV = Math.abs(v);

    // ---- gearbox (automatic)
    const wheelRpm = (absV / (2 * Math.PI * WHEEL_R)) * 60;
    let rpm = wheelRpm * GEARS[c.gear] * FINAL_DRIVE;
    if (c.shiftT > 0) c.shiftT -= dt;
    if (rpm > 6500 && c.gear < GEARS.length - 1 && c.shiftT <= 0) { c.gear++; c.shiftT = 0.22; }
    else if (rpm < 1500 && c.gear > 0 && c.shiftT <= 0) { c.gear--; c.shiftT = 0.12; }
    rpm = clamp(rpm, 780, 7200);
    if (thr > 0.02 && absV < 1) rpm = Math.max(rpm, 1100 + thr * 1500);
    c.rpm = lerp(c.rpm, rpm, 1 - Math.exp(-10 * dt));

    // ---- drive / brake forces
    let force = 0;
    if (thr > 0.02 && c.fuel > 0 && c.shiftT <= 0) {
      force = 235 * torqueAt(c.rpm) * GEARS[c.gear] * FINAL_DRIVE / WHEEL_R * thr;
      if (v < -0.4) force = 0;                       // brake first when rolling back
    }
    let braking = 0;
    if (brk > 0.02) {
      if (v > 0.6) braking = brk * 13500;
      else if (c.fuel > 0) force = -5200 * brk * (absV < 9 ? 1 : 0);  // reverse gear
    }
    if (hb > 0.02) braking += hb * 9500;

    // ABS-ish: release brake when the wheel would lock
    if (braking > 0 && absV > 0.5 && braking / 1350 > absV / dt * 0.9) braking *= 0.75;

    const drag = 0.40 * v * absV;
    const roll = 11 * v;
    let a = (force - drag - roll - Math.sign(v) * braking) / 1350;
    c.speed += a * dt;
    if (brk > 0.02 && Math.abs(c.speed) < 0.25 && Math.abs(force) < 200) c.speed = 0;
    c.speed = clamp(c.speed, -11, 78);

    // ---- steering (speed sensitive) + drift
    const steerMax = 0.55 * (1 - clamp(absV / 58, 0, 0.74));
    c.steer = lerp(c.steer, input.steer * steerMax, 1 - Math.exp(-9 * dt));
    const yawRate = -(c.speed / 2.62) * Math.tan(c.steer);   // +steer = turn right
    c.heading += yawRate * dt;

    const gripLoss = (hb > 0.02 ? 2.4 : 1) * clamp(absV / 26, 0, 1.2);
    c.slip = lerp(c.slip, clamp(yawRate * absV * 0.05, -1.4, 1.4) * gripLoss, 1 - Math.exp(-5 * dt));

    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    const nx = c.x + (fx * c.speed + lx * c.slip * 3.2) * dt;
    const nz = c.z + (fz * c.speed + lz * c.slip * 3.2) * dt;
    if (hitsBuilding(nx, nz, 1.45, 0.6)) {
      c.speed *= -0.22;
      c.slip *= -0.3;
    } else {
      c.x = nx; c.z = nz;
    }

    // ---- fuel
    if (c.fuel > 0) c.fuel = Math.max(0, c.fuel - (0.02 + thr * 0.16) * dt * (absV > 0.5 ? 1 : 0.3));
    if (c.fuel <= 0 && Math.abs(c.speed) > 0.2) c.speed *= (1 - 0.6 * dt);

    // ---- visuals
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
    c.mesh.rotation.z = clamp(c.steer * c.speed * 0.004, -0.06, 0.06);
    const wheels = c.mesh.userData.wheels;
    const spin = c.speed * dt / WHEEL_R;
    // a plain loop: the per-frame closure was pure garbage, and the angle is
    // wrapped because it was summed forever and lost float precision on a long
    // drive
    for (let w = 0; w < wheels.length; w++) {
      const p = wheels[w];
      const tyre = p.children[0];
      tyre.rotation.x = (tyre.rotation.x + spin) % TAU;
      if (w < 2) p.rotation.y = -c.steer;
    }

    heroPos.set(c.x, 0, c.z);
    heroY = 0;
    state.yaw = angLerp(state.yaw, c.heading + Math.PI, 1 - Math.exp(-4.2 * Math.min(dt, 0.1)));

    if (input.act) { input.act = false; exitCar(); }
  }

  // ---------------------------------------------------------- traffic
  const traffic = [];
  const NODES = [];
  // single reusable result object: nodePos used to allocate twice per AI car per
  // frame (and again for every signal lamp), which was pure garbage
  const nodeTmp = { x: 0, z: 0 };
  function nodePos(i, k) {
    nodeTmp.x = (i + 0.5) * CELL;
    nodeTmp.z = (k + 0.5) * CELL;
    return nodeTmp;
  }

  for (let i = -GRID - 1; i <= GRID; i++) {
    for (let k = -GRID - 1; k <= GRID; k++) NODES.push({ i: i, k: k });
  }

  const TRAFFIC_COLORS = [0x9aa0a6, 0x4a5560, 0x7a6a58, 0x2f4a63, 0x8b8f96, 0x6d3b3b, 0xdadde0];
  function spawnTraffic(count) {
    for (let n = 0; n < count; n++) {
      const nd = NODES[ri(0, NODES.length - 1)];
      const p = nodePos(nd.i, nd.k);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[ri(0, 3)];
      const g = buildCar(TRAFFIC_COLORS[ri(0, TRAFFIC_COLORS.length - 1)]);
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      scene.add(g);
      traffic.push({
        mesh: g, x: p.x + rnd(-3, 3), z: p.z + rnd(-3, 3),
        heading: Math.atan2(d[0], d[1]), speed: 0,
        node: { i: nd.i, k: nd.k }, dir: d,
        cruise: rnd(7.5, 12)
      });
    }
  }
  spawnTraffic(18);

  // traffic signals: NS green for 7 s, then EW green for 7 s
  function nsGreen() { return (performance.now() / 1000) % 14 < 7; }
  function aiMustStop(dir) {
    const alongZ = dir[1] !== 0;      // travelling north/south
    return alongZ ? !nsGreen() : nsGreen();
  }

  // signal lamps at the intersections
  const signalGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const signalMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
  const signalMesh = new THREE.InstancedMesh(signalGeo, signalMat, NODES.length * 2);
  (function placeSignals() {
    const m = new THREE.Matrix4();
    let n = 0;
    for (const nd of NODES) {
      const p = nodePos(nd.i, nd.k);
      m.makeTranslation(p.x + 13, 5.2, p.z + 13); signalMesh.setMatrixAt(n++, m);
      m.makeTranslation(p.x - 13, 5.2, p.z - 13); signalMesh.setMatrixAt(n++, m);
    }
    signalMesh.instanceMatrix.needsUpdate = true;
    scene.add(signalMesh);
  })();
  let lastSignalState = null;
  const signalCol = new THREE.Color();

  function updateTraffic(dt) {
    const green = nsGreen();
    if (green !== lastSignalState) {
      lastSignalState = green;
      const col = signalCol;
      for (let n = 0; n < NODES.length * 2; n++) {
        // even index = NS lamp, odd = EW lamp
        const isNS = (n % 2) === 0;
        col.setHex((isNS ? green : !green) ? 0x2ecc71 : 0xe03b2f);
        signalMesh.setColorAt(n, col);
      }
      if (signalMesh.instanceColor) signalMesh.instanceColor.needsUpdate = true;
    }

    const player = state.mode === 'drive' ? state.car : null;
    for (const t of traffic) {
      const p = nodePos(t.node.i, t.node.k);
      const rx = t.dir[1], rz = -t.dir[0];           // right-hand lane offset
      const gx = p.x + rx * 4.2, gz = p.z + rz * 4.2;
      const dx = gx - t.x, dz = gz - t.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      t.heading = angLerp(t.heading, Math.atan2(dx, dz), 1 - Math.exp(-3.5 * dt));

      let target = t.cruise;
      if (dist < 16) target = 4.2;
      if (dist < 20 && aiMustStop(t.dir)) target = 0;
      if (player) {
        const pdx = player.x - t.x, pdz = player.z - t.z;
        if (pdx * pdx + pdz * pdz < 64) target = 0;
      }
      // separation: yield only to a car that is ahead of us and travelling the
      // same way. Slowing for every car within 6.5 m (including the ones behind
      // and the cross traffic) made queues crawl and lock up at intersections.
      const fhx = Math.sin(t.heading), fhz = Math.cos(t.heading);
      for (let n2 = 0; n2 < traffic.length; n2++) {
        const o = traffic[n2];
        if (o === t) continue;
        const ox = o.x - t.x, oz = o.z - t.z;
        if (ox * ox + oz * oz > 42.25) continue;
        if (ox * fhx + oz * fhz < 0.5) continue;              // behind us
        if (fhx * Math.sin(o.heading) + fhz * Math.cos(o.heading) < 0.2) continue; // crossing or oncoming
        target = Math.min(target, 1.5);
        break;
      }
      t.speed = lerp(t.speed, target, 1 - Math.exp(-2.6 * dt));

      t.x += Math.sin(t.heading) * t.speed * dt;
      t.z += Math.cos(t.heading) * t.speed * dt;
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.heading;
      const spin = t.speed * dt / WHEEL_R;
      const tw = t.mesh.userData.wheels;
      for (let w = 0; w < tw.length; w++) {
        const tyre = tw[w].children[0];
        tyre.rotation.x = (tyre.rotation.x + spin) % TAU;
      }

      // measured after the step: a car doing 12 m/s covers 0.6 m per frame, so
      // the pre-move distance let it overshoot the node goal, find the goal
      // behind itself and spin on the spot instead of taking the intersection
      const ndx = gx - t.x, ndz = gz - t.z;
      if (ndx * ndx + ndz * ndz < 10.24) {
        const ni = t.node.i + t.dir[0], nk = t.node.k + t.dir[1];
        if (ni < -GRID - 1 || ni > GRID || nk < -GRID - 1 || nk > GRID) {
          t.dir = [-t.dir[0], -t.dir[1]];
        } else {
          t.node.i = ni; t.node.k = nk;
          if (Math.random() < 0.34) {
            const left = [t.dir[1], -t.dir[0]], right = [-t.dir[1], t.dir[0]];
            t.dir = Math.random() < 0.5 ? left : right;
          }
        }
      }
      // player pushes traffic, never overlaps
      if (player) {
        const pdx2 = player.x - t.x, pdz2 = player.z - t.z;
        const pd2 = pdx2 * pdx2 + pdz2 * pdz2;
        const pd = Math.sqrt(pd2);
        if (pd2 < 10.24 && pd > 0.01) {
          const push = (3.2 - pd);
          t.x += ((t.x - player.x) / pd) * push * 0.5;
          t.z += ((t.z - player.z) / pd) * push * 0.5;
        }
      }
    }
  }

  // ---------------------------------------------------------- day / night
  const dayTop = new THREE.Color(0x1e3f72), dayMid = new THREE.Color(0x93b9dd), dayHor = new THREE.Color(0xf0d8bd);
  const duskTop = new THREE.Color(0x2a2f5a), duskMid = new THREE.Color(0xc98a6a), duskHor = new THREE.Color(0xffb36b);
  const nightTop = new THREE.Color(0x05070f), nightMid = new THREE.Color(0x0b1226), nightHor = new THREE.Color(0x18243c);
  const rainFogCol = new THREE.Color(0x8b98a6), mistFogCol = new THREE.Color(0xa8b0b8);
  const tmpCol = new THREE.Color(), tmpCol2 = new THREE.Color();

  function updateDayNight(dt) {
    state.time = (state.time + state.timeSpeed * dt) % 1;
    const ang = (state.time - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    state.night = clamp(-elev * 3 + 0.35, 0, 1);

    const sx = Math.cos(ang) * 0.8, sy = elev, sz = 0.62;
    const len = Math.hypot(sx, sy, sz) || 1;
    sun.position.set(sx / len * 190, Math.max(sy / len, -0.4) * 190, sz / len * 190);
    sun.intensity = 3.0 * clamp(elev * 2.6, 0, 1);
    sun.color.setHex(elev > 0.35 ? 0xffeedd : 0xffb070);
    hemi.intensity = 0.58 + clamp(elev, 0, 1) * 0.46;

    const dayF = clamp(elev * 2.2 + 0.25, 0, 1);
    const duskF = clamp(1 - Math.abs(elev) * 3.2, 0, 1);

    skyMat.uniforms.topCol.value.copy(nightTop).lerp(dayTop, dayF);
    skyMat.uniforms.midCol.value.copy(nightMid).lerp(dayMid, dayF);
    skyMat.uniforms.horCol.value.copy(nightHor).lerp(dayHor, dayF);
    if (duskF > 0.05) {
      skyMat.uniforms.midCol.value.lerp(duskMid, duskF * 0.55);
      skyMat.uniforms.horCol.value.lerp(duskHor, duskF * 0.7);
    }

    // fog follows the sky, weather tightens it
    tmpCol.copy(skyMat.uniforms.horCol.value);
    if (state.weather === 1) { tmpCol.lerp(rainFogCol, 0.65); scene.fog.near = 60; scene.fog.far = 320; }
    else if (state.weather === 2) { tmpCol.lerp(mistFogCol, 0.8); scene.fog.near = 25; scene.fog.far = 130; }
    else { scene.fog.near = 220; scene.fog.far = 900; }
    scene.fog.color.copy(tmpCol);

    if (facadeMat.userData.shader) facadeMat.userData.shader.uniforms.uNight.value = state.night;

    // street lamps glow after dark
    const lampGlow = clamp(state.night * 1.3, 0, 1);
    lampMat.color.setRGB(0.35 + lampGlow * 0.65, 0.32 + lampGlow * 0.62, 0.28 + lampGlow * 0.45);

    // headlights
    const on = state.night > 0.35 ? 1 : 0;
    const c = state.car;
    headlights.forEach(function (h, i) {
      if (c && on) {
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        const rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
        const side = i === 0 ? -0.62 : 0.62;
        h.light.position.set(c.x + fx * 2.2 + rx * side, 0.85, c.z + fz * 2.2 + rz * side);
        h.target.position.set(c.x + fx * 30 + rx * side, 0.1, c.z + fz * 30 + rz * side);
        h.light.intensity = 2.6;
      } else {
        h.light.intensity = 0;
      }
    });
  }

  // ---------------------------------------------------------- weather
  let rainOn = false;
  let groundWet = null;

  function updateWeather(dt) {
    const raining = state.weather === 1;
    rain.visible = raining;
    if (ground.material && groundWet !== raining) {
      groundWet = raining;
      ground.material.roughness = raining ? 0.34 : 0.92;
      ground.material.metalness = raining ? 0.32 : 0.04;
    }
    if (raining) {
      const p = rain.geometry.attributes.position;
      const arr = p.array;
      const cx = camera.position.x, cz = camera.position.z;
      if (!rainOn) {
        // the drop field is built around the origin, so switching rain on far
        // from it looked dry until every drop had fallen once — reseed it here
        for (let i = 0; i < RAIN_COUNT; i++) {
          arr[i * 3] = cx + rnd(-28, 28);
          arr[i * 3 + 1] = rnd(0, 30);
          arr[i * 3 + 2] = cz + rnd(-28, 28);
        }
      }
      for (let i = 0; i < RAIN_COUNT; i++) {
        const iy = i * 3 + 1;
        arr[iy] -= (28 + (i % 7)) * dt;
        if (arr[iy] < 0) {
          arr[iy] = 26 + Math.random() * 8;
          arr[i * 3] = cx + rnd(-28, 28);
          arr[i * 3 + 2] = cz + rnd(-28, 28);
        }
      }
      p.needsUpdate = true;
    }
    rainOn = raining;
  }

  // ---------------------------------------------------------- cores
  function updateCores(dt) {
    const t = performance.now() * 0.001;
    for (const c of cores) {
      if (c.taken) continue;
      c.mesh.rotation.y += (0.8 + c.spin) * dt;
      // hover from a fixed base height: the old code added a delta every frame,
      // so the bob accumulated and cores slowly drifted out of reach
      c.mesh.position.y = c.baseY + Math.sin(t * 1.6 + c.mesh.position.x) * 0.25;
      const d = c.mesh.position.distanceTo(V.set(heroPos.x, heroPos.y + 1.2, heroPos.z));
      if (d < 3.4) {
        c.taken = true;
        c.mesh.visible = false;
        state.score++;
        coreTxt.textContent = state.score + ' / ' + CORE_TOTAL;
        const fill = document.getElementById('coreFill');
        if (fill) fill.style.width = (state.score / CORE_TOTAL * 100) + '%';
        showToast('Energy core ' + state.score + ' / ' + CORE_TOTAL);
        popEl(document.getElementById('coreBox'));
        if (state.score === CORE_TOTAL) {
          document.getElementById('win').classList.add('on');
          document.getElementById('win').classList.remove('hide');
        }
      }
    }
  }

  // ---------------------------------------------------------- camera
  const CAM_NAMES = ['Chase', 'Hood', 'Cockpit'];
  const camSm = { tx: 0, ty: 0, tz: 0, ready: false };
  const camVec = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camBack = new THREE.Vector3();

  function carPoint(c, lx, ly, lz, out) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
    out.set(c.x + rx * lx + fx * lz, ly, c.z + rz * lx + fz * lz);
    return out;
  }

  function updateCamera(dt) {
    const step = Math.min(dt, 0.1);
    const c = state.car;
    const driving = state.mode === 'drive' && c;

    if (driving && state.camMode !== 0) {
      const steerYaw = c.steer * 0.55;
      if (state.camMode === 1) {
        carPoint(c, 0, 1.58, 1.30, camVec);
        carPoint(c, Math.sin(steerYaw) * 6, 1.15, 14, camLook);
      } else {
        carPoint(c, -0.32, 1.28, 0.42, camVec);
        carPoint(c, -0.32 + Math.sin(steerYaw) * 8, 1.22, 12, camLook);
      }
      const k = 1 - Math.exp(-26 * step);
      camera.position.lerp(camVec, camSm.ready ? k : 1);
      camera.lookAt(camLook);
      // the sun/shadow focus is driven from camSm; leaving it stale in the hood
      // and cockpit views parked the shadow frustum behind the car, so the car
      // and the street around it lost their shadows after a camera switch
      camSm.tx = c.x; camSm.ty = 1.2; camSm.tz = c.z;
      cockpit.visible = state.camMode === 2;
      c.mesh.visible = state.camMode !== 2;
      if (cockpit.visible) {
        cockpit.position.set(c.x, 0, c.z);
        cockpit.rotation.y = c.heading;
        const w = cockpit.userData.wheel;
        if (w) w.rotation.z = -c.steer * 5.5;
      }
    } else {
      cockpit.visible = false;
      if (c) c.mesh.visible = true;

      const aimY = heroY + (driving ? 1.55 : 1.42);
      const kt = 1 - Math.exp(-16 * step);
      if (!camSm.ready) {
        camSm.tx = heroPos.x; camSm.ty = aimY; camSm.tz = heroPos.z;
      } else {
        camSm.tx += (heroPos.x - camSm.tx) * kt;
        camSm.ty += (aimY - camSm.ty) * kt;
        camSm.tz += (heroPos.z - camSm.tz) * kt;
      }

      const p = state.pitch;
      const d = state.dist * (driving ? 1.62 : 1);
      camBack.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      camVec.set(
        camSm.tx + camBack.x * d * Math.cos(p),
        camSm.ty + d * Math.sin(p) + 0.62,
        camSm.tz + camBack.z * d * Math.cos(p)
      );
      camVec.y = Math.max(camVec.y, 0.8);
      if (!camSm.ready) { camera.position.copy(camVec); }
      else camera.position.lerp(camVec, 1 - Math.exp(-20 * step));
      camera.lookAt(camSm.tx, camSm.ty, camSm.tz);
      camLook.set(camSm.tx, camSm.ty, camSm.tz);
    }

    camSm.ready = true;
    sun.target.position.set(camSm.tx, 0, camSm.tz);
    sun.target.updateMatrixWorld();
    sky.position.set(camera.position.x, 0, camera.position.z);
  }

  // ---------------------------------------------------------- minimap
  const mapCtx = mapCv ? mapCv.getContext('2d') : null;
  const MAP_RANGE = (GRID + 1.4) * CELL;

  function drawMinimap() {
    if (!mapCtx) return;
    const W = mapCv.width, H = mapCv.height;
    const scale = W / (MAP_RANGE * 2);
    const px = heroPos.x, pz = heroPos.z;

    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = 'rgba(10,14,20,0.80)';
    mapCtx.fillRect(0, 0, W, H);

    // roads
    mapCtx.strokeStyle = 'rgba(160,190,215,0.55)';
    mapCtx.lineWidth = 1;
    for (let i = -GRID - 1; i <= GRID; i++) {
      const x = W / 2 + ((i + 0.5) * CELL - px) * scale;
      const y = H / 2 + ((i + 0.5) * CELL - pz) * scale;
      mapCtx.beginPath(); mapCtx.moveTo(x, 0); mapCtx.lineTo(x, H); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, y); mapCtx.lineTo(W, y); mapCtx.stroke();
    }

    // cores
    for (const c of cores) {
      if (c.taken) continue;
      const x = W / 2 + (c.mesh.position.x - px) * scale;
      const y = H / 2 + (c.mesh.position.z - pz) * scale;
      mapCtx.fillStyle = c.mesh.position.y > 10 ? '#ffcf6b' : '#6fe3ff';
      mapCtx.beginPath(); mapCtx.arc(x, y, 2.4, 0, 6.284); mapCtx.fill();
    }

    // traffic
    mapCtx.fillStyle = 'rgba(220,230,240,0.55)';
    for (const t of traffic) {
      const x = W / 2 + (t.x - px) * scale;
      const y = H / 2 + (t.z - pz) * scale;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      mapCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    // player
    const ang = state.mode === 'drive' && state.car ? state.car.heading : hero.rotation.y;
    mapCtx.save();
    mapCtx.translate(W / 2, H / 2);
    mapCtx.rotate(-ang + Math.PI);
    mapCtx.fillStyle = '#ffcf6b';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6); mapCtx.lineTo(4, 5); mapCtx.lineTo(0, 2.5); mapCtx.lineTo(-4, 5);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
  }

  // ---------------------------------------------------------- loop
  let last = performance.now();
  let mapTick = 0;
  let lastGear = '1';
  // HUD write caches: re-writing identical text/style every frame forces a
  // style recalc 60 times a second for no visual change
  let hudSpeed = -1, hudSpeedBar = -1, hudRpmBar = -1, hudFuelBar = -1;
  let hudFuelLow = null, hudPrompt = null;

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    // a backwards or NaN timestamp (tab restore, suspended clock) must not push
    // the physics a negative or infinite step
    if (!(dt > 0)) dt = 0;
    else if (dt > 0.05) dt = 0.05;

    if (!state.started || document.body.classList.contains('portrait')) {
      updateCamera(dt);
      renderer.render(scene, camera);
      return;
    }

    readInput();
    if (input.cam) {
      input.cam = false;
      state.camMode = (state.camMode + 1) % 3;
      if (state.camMode !== 0) state.camMode = state.mode === 'drive' ? state.camMode : 0;
      refreshPanels();
      if (state.mode === 'drive') showToast('Camera · ' + CAM_NAMES[state.camMode]);
    }
    if (input.weather) {
      input.weather = false;
      state.weather = (state.weather + 1) % 3;
      showToast(['Weather · clear', 'Weather · rain', 'Weather · fog'][state.weather]);
    }
    if (input.horn) { input.horn = false; horn(); }

    if (state.mode === 'drive') updateCar(dt); else updateFoot(dt);
    // the hero is hidden while driving, so posing him was ten node rotations
    // and a matrix rebuild per frame for something nobody can see
    if (hero.visible) {
      const mm = Math.min(1, Math.hypot(input.mx, input.my));
      poseHero(dt, mm, mm > 0.82);
    }

    updateTraffic(dt);
    updateDayNight(dt);
    updateWeather(dt);
    updateCores(dt);
    updateCamera(dt);
    updateAudio(dt);

    // ---- HUD
    const driving = state.mode === 'drive' && state.car;
    const kmh = driving ? Math.abs(state.car.speed) * 3.6 : Math.hypot(state.vel.x, state.vel.z) * 3.6;
    const kmhTxt = Math.round(kmh);
    if (kmhTxt !== hudSpeed) { hudSpeed = kmhTxt; speedTxt.textContent = kmhTxt; }
    const kmhBar = Math.min(100, Math.round((kmh / 220) * 100));
    if (kmhBar !== hudSpeedBar) { hudSpeedBar = kmhBar; speedBar.style.width = kmhBar + '%'; }

    if (driving) {
      const c = state.car;
      const gTxt = c.speed < -0.5 ? 'R' : (Math.abs(c.speed) < 0.4 && input.gas < 0.05 ? 'N' : String(c.gear + 1));
      if (gTxt !== lastGear) { lastGear = gTxt; gearTxt.textContent = gTxt; popEl(gearTxt); }
      const rpmW = Math.min(100, Math.round((c.rpm / 7200) * 100));
      if (rpmW !== hudRpmBar) { hudRpmBar = rpmW; rpmBar.style.width = rpmW + '%'; }
      const fuelW = Math.min(100, Math.round(c.fuel));
      if (fuelW !== hudFuelBar) { hudFuelBar = fuelW; fuelBar.style.width = fuelW + '%'; }
      const low = c.fuel < 12;
      if (low !== hudFuelLow) {
        hudFuelLow = low;
        fuelBar.style.background = low ? '#ff6b5a' : 'linear-gradient(90deg,#7dffb2,#6fe3ff)';
      }
    }

    const showPrompt = state.mode === 'foot' && !!nearestCar();
    if (showPrompt !== hudPrompt) {
      hudPrompt = showPrompt;
      prompt.classList.toggle('on', showPrompt);
    }

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('on'); }

    mapTick += dt;
    if (mapTick > 0.1) { mapTick = 0; drawMinimap(); }

    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------- start
  // orientation.lock() returns undefined on browsers that do not implement it
  // and can throw synchronously, so calling .catch() on the result raised an
  // uncaught TypeError on the way into the game
  function lockLandscape() {
    try {
      const o = screen.orientation;
      if (!o || typeof o.lock !== 'function') return;
      const p = o.lock('landscape');
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* not supported on this browser */ }
  }
  document.getElementById('play').addEventListener('click', () => {
    document.getElementById('start').classList.add('hide');
    state.started = true;
    initAudio();
    // resume() rejects when the browser still wants a real gesture; the
    // unhandled rejection landed in the console on every entry
    if (actx && actx.state === 'suspended') {
      try {
        const p = actx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* audio stays off until the next gesture */ }
    }
    refreshPanels();
    showToast('Drag to look · C for camera · R for weather');
    const el = document.documentElement;
    if (el.requestFullscreen) {
      let p = null;
      try { p = el.requestFullscreen(); } catch (e) { p = null; }
      if (p && p.then) p.then(lockLandscape).catch(() => {});
    } else {
      lockLandscape();
    }
  });
  document.getElementById('again').addEventListener('click', () => location.reload());

  addEventListener('resize', () => {
    // the pixel ratio is fixed at load; after a zoom or a move to a display
    // with another DPR the canvas was rendered at the old scale, which showed
    // up as a soft or over-sampled picture. Only touch it when it changed, so
    // a plain window resize still costs nothing.
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  refreshPanels();
  // Compile every program once while the start screen is up. Materials used to
  // be compiled the first time their geometry entered the view, which showed up
  // as a stutter on the first look at the car, the cockpit or a new part of the
  // city. The cockpit is hidden at this point, so show it for the compile pass.
  try {
    const cockpitWasVisible = cockpit.visible;
    cockpit.visible = true;
    renderer.compile(scene, camera);
    cockpit.visible = cockpitWasVisible;
  } catch (e) { /* compiling early is an optimisation, never a requirement */ }
  window.__game = {
    state: state, hero: hero, cars: cars, cores: cores, buildings: buildings,
    parts: heroParts, traffic: traffic, cam: camera, renderer: renderer, scene: scene, frames: 0,
    enterCar: enterCar, exitCar: exitCar, setHeight: function (y) { heroY = y; }
  };
  requestAnimationFrame(loop);
})();
