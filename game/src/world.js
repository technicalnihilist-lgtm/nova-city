/* ============================================================
   NOVA CITY — hero simulator, realistic edition
   WebGL / three.js — PBR materials, procedural textures,
   golden-hour lighting, detailed hero + vehicles + city props
   ============================================================ */
(function () {
  'use strict';

  // ---------------------------------------------------------- renderer
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.2, 2600);

  // ---------------------------------------------------------- sky + sun
  const SUN_DIR = new THREE.Vector3(-0.62, 0.26, 0.74).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      sunDir: { value: SUN_DIR },
      topCol: { value: new THREE.Color(0x1e3f72) },
      midCol: { value: new THREE.Color(0x93b9dd) },
      horCol: { value: new THREE.Color(0xf0d8bd) },
      sunCol: { value: new THREE.Color(0xffdfae) }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 sunDir; uniform vec3 topCol; uniform vec3 midCol; uniform vec3 horCol; uniform vec3 sunCol;',
      'varying vec3 vDir;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float y = d.y;',
      '  vec3 col = mix(horCol, midCol, smoothstep(-0.03, 0.30, y));',
      '  col = mix(col, topCol, smoothstep(0.22, 0.80, y));',
      '  float sd = max(dot(d, sunDir), 0.0);',
      '  col += sunCol * pow(sd, 1200.0) * 7.0;',
      '  col += sunCol * pow(sd, 14.0) * 0.55;',
      '  col += sunCol * pow(sd, 3.5) * 0.14;',
      '  col = mix(col, horCol * 0.42, smoothstep(0.0, -0.16, y));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 20), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);


  // drifting clouds
  (function addClouds() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 30; i++) {
      const x = 40 + Math.random() * 176;
      const y = 52 + Math.random() * 38;
      const r = 16 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.50)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.284); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75, fog: false });
    window.__clouds = [];
    for (let i = 0; i < 20; i++) {
      const sp = new THREE.Sprite(mat);
      const ang = Math.random() * Math.PI * 2;
      const rad = 520 + Math.random() * 760;
      sp.position.set(Math.cos(ang) * rad, 190 + Math.random() * 240, Math.sin(ang) * rad);
      const sc = 280 + Math.random() * 340;
      sp.scale.set(sc, sc * 0.42, 1);
      scene.add(sp);
      window.__clouds.push(sp);
    }
  })();

  scene.fog = new THREE.Fog(0xdcc9ae, 220, 900);

  const sun = new THREE.DirectionalLight(0xffeedd, 3.0);
  sun.position.copy(SUN_DIR).multiplyScalar(180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -62; sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 62; sun.shadow.camera.bottom = -62;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x7a7468, 0.75);
  scene.add(new THREE.AmbientLight(0xaec6e0, 0.16));
  scene.add(hemi);

  // image-based lighting from the sky itself
  (function buildEnv() {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), skyMat));
      const rt = pmrem.fromScene(envScene, 0, 1, 900);
      scene.environment = rt.texture;
      pmrem.dispose();
    } catch (e) { /* env is a nicety, not a requirement */ }
  })();

  // ---------------------------------------------------------- helpers
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
  const M4 = new THREE.Matrix4();
  const QT = new THREE.Quaternion();
  const EU = new THREE.Euler();
  const PV = new THREE.Vector3();
  const SV = new THREE.Vector3();
  const V = new THREE.Vector3();

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  function angLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function canvasTexture(size, draw, rx, ry) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || rx || 1);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function instanced(geo, mat, items, cast, receive) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const col = new THREE.Color();
    let tinted = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      EU.set(it.rx || 0, it.ry || 0, it.rz || 0);
      QT.setFromEuler(EU);
      M4.compose(PV.set(it.x, it.y, it.z), QT, SV.set(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, M4);
      if (it.color !== undefined) { col.setHex(it.color); mesh.setColorAt(i, col); tinted = true; }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast !== false;
    mesh.receiveShadow = receive !== false;
    scene.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------- textures
  const asphaltTex = canvasTexture(512, function (ctx, S) {
    ctx.fillStyle = '#313235'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 24000; i++) {
      const g = 30 + Math.random() * 78 | 0;
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',' + (0.25 + Math.random() * 0.4) + ')';
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 2.1, 0, 6.284); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(18,18,20,0.55)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rnd(-40, 40); y += rnd(-40, 40); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 420, 420);

  const concreteTex = canvasTexture(512, function (ctx, S) {
    ctx.fillStyle = '#9b9a94'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 16000; i++) {
      const g = 120 + Math.random() * 70 | 0;
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g - 4) + ',0.30)';
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 2.4, 0, 6.284); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,88,84,0.85)'; ctx.lineWidth = 2;
    const n = 4, step = S / n;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(S, i * step); ctx.stroke();
    }
  }, 30, 30);

  const paintTex = canvasTexture(64, function (ctx, S) {
    ctx.fillStyle = '#e8e2d0'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(120,115,105,' + Math.random() * 0.35 + ')';
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
  }, 1, 1);

  // ---------------------------------------------------------- ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3400, 3400),
    new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.04, envMapIntensity: 0.5 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------- city layout
  const CELL = 82, BLOCK = 62, GRID = 5;
  const buildings = [];          // collision AABBs
  const towerItems = [];         // instanced facade boxes
  const roofItems = [];
  const plateItems = [];
  const curbItems = [];
  const dashItems = [];
  const walkItems = [];
  const poleItems = [];
  const armItems = [];
  const lampItems = [];
  const trunkItems = [];
  const leafItems = [];
  const benchItems = [];

  for (let i = -GRID; i <= GRID; i++) {
    for (let k = -GRID; k <= GRID; k++) {
      const cx = i * CELL, cz = k * CELL;
      const isSpawn = (i === 0 && k === 0);
      const isPark = !isSpawn && Math.random() < 0.12;

      // sidewalk slab
      plateItems.push({ x: cx, y: 0.1, z: cz, sx: BLOCK, sy: 0.2, sz: BLOCK, color: isPark ? 0x6a7652 : 0xa8a7a1 });
      // curb ring (4 thin boxes)
      const half = BLOCK / 2;
      curbItems.push({ x: cx, y: 0.12, z: cz - half, sx: BLOCK + 0.6, sy: 0.24, sz: 0.6 });
      curbItems.push({ x: cx, y: 0.12, z: cz + half, sx: BLOCK + 0.6, sy: 0.24, sz: 0.6 });
      curbItems.push({ x: cx - half, y: 0.12, z: cz, sx: 0.6, sy: 0.24, sz: BLOCK + 0.6 });
      curbItems.push({ x: cx + half, y: 0.12, z: cz, sx: 0.6, sy: 0.24, sz: BLOCK + 0.6 });

      if (isPark) {
        for (let t = 0; t < 9; t++) {
          const tx = cx + rnd(-BLOCK * 0.4, BLOCK * 0.4), tz = cz + rnd(-BLOCK * 0.4, BLOCK * 0.4);
          const th = rnd(2.4, 4.2);
          trunkItems.push({ x: tx, y: th / 2, z: tz, sx: 0.34, sy: th, sz: 0.34 });
          for (let b = 0; b < 3; b++) {
            const r = rnd(1.6, 2.5);
            leafItems.push({
              x: tx + rnd(-0.8, 0.8), y: th + rnd(0.2, 1.4), z: tz + rnd(-0.8, 0.8),
              sx: r, sy: r * 0.85, sz: r, ry: rnd(0, 3), color: [0x355c2a, 0x2c4d24, 0x40682f][ri(0, 2)]
            });
          }
        }
        continue;
      }
      if (isSpawn) continue;

      // building lots
      const lots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      const used = Math.random() < 0.3 ? 1 : (Math.random() < 0.55 ? 2 : 4);
      for (let n = 0; n < used; n++) {
        const lx = lots[n][0] * BLOCK * 0.24, lz = lots[n][1] * BLOCK * 0.24;
        const w = rnd(15, BLOCK * 0.42), d = rnd(15, BLOCK * 0.42);
        const near = 1 - Math.min(1, Math.hypot(i, k) / (GRID + 1));
        const h = rnd(13, 26) + near * rnd(6, 46);
        const bx = cx + lx, bz = cz + lz;
        const shade = [0x9a9c9e, 0x8b8f94, 0xa8aaa8, 0x7d838a, 0xb0aca4, 0x8f8b86, 0x9c8f7e, 0x6f7a86, 0xb7b3a8, 0x64707c][ri(0, 9)];
        towerItems.push({ x: bx, y: 0.2 + h / 2, z: bz, sx: w, sy: h, sz: d, color: shade });
        buildings.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h: 0.2 + h });

        // setback crown on taller towers
        if (h > 42 && Math.random() < 0.8) {
          const ch = rnd(5, 16), cw = w * rnd(0.55, 0.78), cd = d * rnd(0.55, 0.78);
          towerItems.push({ x: bx, y: 0.2 + h + ch / 2, z: bz, sx: cw, sy: ch, sz: cd, color: shade });
          if (Math.random() < 0.5) {
            const ah = rnd(3, 9);
            roofItems.push({ x: bx, y: 0.2 + h + ch + ah / 2, z: bz, sx: 0.35, sy: ah, sz: 0.35 });
          }
        } else if (Math.random() < 0.75) {
          roofItems.push({
            x: bx + rnd(-w * 0.22, w * 0.22), y: 0.2 + h + 1.0, z: bz + rnd(-d * 0.22, d * 0.22),
            sx: rnd(2.2, 3.6), sy: 2.0, sz: rnd(2.2, 3.6)
          });
        }
      }
    }
  }

  // lane markings + crosswalks
  for (let i = -GRID - 1; i <= GRID; i++) {
    const line = (i + 0.5) * CELL;
    for (let s = -GRID - 1; s <= GRID; s++) {
      const p = s * CELL;
      // dashes both directions
      dashItems.push({ x: line, y: 0.025, z: p, sx: 0.22, sy: 0.02, sz: 4.2 });
      dashItems.push({ x: p, y: 0.025, z: line, sx: 4.2, sy: 0.02, sz: 0.22 });
    }
    // crosswalks at each intersection
    for (let k = -GRID - 1; k <= GRID; k++) {
      const iz = (k + 0.5) * CELL;
      for (let b = 0; b < 6; b++) {
        const o = -7.5 + b * 3.0;
        dashItems.push({ x: line + o, y: 0.03, z: iz + 12.5, sx: 1.3, sy: 0.02, sz: 3.4 });
        dashItems.push({ x: line + o, y: 0.03, z: iz - 12.5, sx: 1.3, sy: 0.02, sz: 3.4 });
        dashItems.push({ x: line + 12.5, y: 0.03, z: iz + o, sx: 3.4, sy: 0.02, sz: 1.3 });
        dashItems.push({ x: line - 12.5, y: 0.03, z: iz + o, sx: 3.4, sy: 0.02, sz: 1.3 });
      }
    }
  }

  // street lights + sidewalk trees along the roads
  const EDGE = CELL / 2 - (BLOCK / 2 - 1.4);   // distance from road centre to the curb line
  for (let i = -GRID - 1; i <= GRID; i++) {
    const line = (i + 0.5) * CELL;
    for (let s2 = -GRID - 1; s2 <= GRID; s2++) {
      const along = s2 * CELL + CELL / 2;
      for (let side = -1; side <= 1; side += 2) {
        // pole on the north-south road, arm reaching over the asphalt
        poleItems.push({ x: line + side * EDGE, y: 3.4, z: along, sx: 0.13, sy: 6.8, sz: 0.13 });
        armItems.push({ x: line + side * (EDGE - 0.9), y: 6.75, z: along, sx: 1.9, sy: 0.10, sz: 0.10 });
        lampItems.push({ x: line + side * (EDGE - 1.75), y: 6.62, z: along, sx: 0.85, sy: 0.14, sz: 0.42 });
        // pole on the east-west road
        poleItems.push({ x: along, y: 3.4, z: line + side * EDGE, sx: 0.13, sy: 6.8, sz: 0.13 });
        armItems.push({ x: along, y: 6.75, z: line + side * (EDGE - 0.9), sx: 0.10, sy: 0.10, sz: 1.9 });
        lampItems.push({ x: along, y: 6.62, z: line + side * (EDGE - 1.75), sx: 0.42, sy: 0.14, sz: 0.85 });
      }
      // a tree on every other corner
      if ((i + s2) % 2 === 0) {
        const tx = line + EDGE + 2.2, tz = along + 9;
        trunkItems.push({ x: tx, y: 1.4, z: tz, sx: 0.26, sy: 2.8, sz: 0.26 });
        leafItems.push({ x: tx, y: 3.5, z: tz, sx: 1.5, sy: 1.4, sz: 1.5, ry: rnd(0, 3), color: 0x3a5f2e });
      }
    }
  }

  // plaza dressing around the spawn
  (function dressPlaza() {
    for (let i = 0; i <= 0; i++) {
      for (let k = 0; k <= 0; k++) {
        [[-22, -22], [22, -22], [-22, 22], [22, 22]].forEach(function (o) {
          const tx = i * CELL + o[0], tz = k * CELL + o[1];
          trunkItems.push({ x: tx, y: 1.5, z: tz, sx: 0.3, sy: 3.0, sz: 0.3 });
          leafItems.push({ x: tx, y: 3.8, z: tz, sx: 1.9, sy: 1.7, sz: 1.9, ry: rnd(0, 3), color: 0x3d6531 });
          leafItems.push({ x: tx + 0.9, y: 3.1, z: tz - 0.6, sx: 1.3, sy: 1.2, sz: 1.3, ry: rnd(0, 3), color: 0x35592b });
        });
        // bench rows along the plaza edges
        for (let b = -1; b <= 1; b++) {
          benchItems.push({ x: i * CELL + 19, y: 0.55, z: k * CELL + b * 9, sx: 0.6, sy: 0.16, sz: 3.0, color: 0x6b5844 });
          benchItems.push({ x: i * CELL - 19, y: 0.55, z: k * CELL + b * 9, sx: 0.6, sy: 0.16, sz: 3.0, color: 0x6b5844 });
        }
      }
    }
    // planters with hedges
    [[-15, -15], [15, -15], [-15, 15], [15, 15], [-24, 0], [24, 0]].forEach(function (o) {
      benchItems.push({ x: o[0], y: 0.45, z: o[1], sx: 3.4, sy: 0.5, sz: 3.4, color: 0xb3b1a8 });
      benchItems.push({ x: o[0], y: 1.15, z: o[1], sx: 3.0, sy: 0.9, sz: 3.0, color: 0x3f6b3d });
    });
    // plaza lamp posts
    [[-26, -26], [26, -26], [-26, 26], [26, 26]].forEach(function (o) {
      poleItems.push({ x: o[0], y: 2.4, z: o[1], sx: 0.12, sy: 4.8, sz: 0.12 });
      lampItems.push({ x: o[0], y: 4.9, z: o[1], sx: 0.5, sy: 0.35, sz: 0.5 });
    });

    // fountain in the middle of the plaza
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.8, metalness: 0.03 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.2, 0.75, 40), stoneMat);
    basin.position.y = 0.55; basin.castShadow = true; basin.receiveShadow = true; scene.add(basin);
    buildings.push({ x0: -7.4, x1: 7.4, z0: -7.4, z1: 7.4, h: 1.1 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.1, 40),
      new THREE.MeshStandardMaterial({ color: 0x35586b, roughness: 0.05, metalness: 0.45, envMapIntensity: 1.5 }));
    water.position.y = 0.92; scene.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 2.6, 20), stoneMat);
    column.position.y = 1.9; column.castShadow = true; scene.add(column);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.2, 0.5, 28), stoneMat);
    bowl.position.y = 3.2; bowl.castShadow = true; scene.add(bowl);
  })();

  // ---------------------------------------------------------- materials
  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.45 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9c9b95, roughness: 0.85, metalness: 0.02 });
  const paintMat = new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.7, metalness: 0.0 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x6d7278, roughness: 0.42, metalness: 0.85, envMapIntensity: 1.0 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x3c4045, roughness: 0.55, metalness: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x574232, roughness: 0.95, metalness: 0.0 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });

  // facades: procedural glass / mullion shader on an instanced mesh
  const facadeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.9 });
  facadeMat.onBeforeCompile = function (sh) {
    sh.uniforms.uNight = { value: 0 };
    facadeMat.userData.shader = sh;
    sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vNrmW;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n' +
      '#ifdef USE_INSTANCING\n  vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n#else\n  vec4 wp = modelMatrix * vec4(transformed, 1.0);\n#endif\n' +
      '  vWPos = wp.xyz; vNrmW = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform float uNight;\nvarying vec3 vWPos;\nvarying vec3 vNrmW;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', [
      '#include <emissivemap_fragment>',
      '{',
      '  vec3 nW = normalize(vNrmW);',
      '  float roof = step(0.6, abs(nW.y));',
      '  vec2 fuv = (abs(nW.x) > abs(nW.z)) ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y);',
      '  vec2 g = vec2(fuv.x / 2.40, fuv.y / 3.60);',
      '  vec2 cell = floor(g);',
      '  vec2 f = fract(g);',
      '  float mask = step(0.21, f.x) * step(f.x, 0.79) * step(0.27, f.y) * step(f.y, 0.83);',
      '  mask *= (1.0 - roof);',
      '  float h1 = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);',
      '  float h2 = fract(sin(dot(cell, vec2(39.346, 11.135))) * 24634.6345);',
      '  float lit = step(0.74, h1) * mask;',
      '  vec3 V = normalize(vViewPosition);',
      '  float fres = pow(1.0 - clamp(dot(normalize(normal), V), 0.0, 1.0), 2.6);',
      '  vec3 skyRefl = mix(vec3(0.14, 0.18, 0.25), vec3(0.58, 0.68, 0.82), fres);',
      '  vec3 glass = mix(vec3(0.07, 0.09, 0.125), skyRefl, 0.50 + 0.40 * fres);',
      '  glass += vec3(0.02) * h2;',
      '  vec3 base = diffuseColor.rgb;',
      '  base *= mix(0.86, 1.06, h2);',
      '  diffuseColor.rgb = mix(base, glass, mask);',
      '  roughnessFactor = mix(0.88, 0.10, mask);',
      '  metalnessFactor = mix(0.02, 0.55, mask);',
      '  totalEmissiveRadiance += vec3(1.0, 0.78, 0.50) * lit * (0.35 + 0.5 * h2) * uNight;',
      '  float band = smoothstep(0.90, 1.0, f.y) * (1.0 - roof);',
      '  float street = (1.0 - step(3.8, vWPos.y)) * (1.0 - roof);',
      '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.11, 0.13), street * 0.75);',
      '  roughnessFactor = mix(roughnessFactor, 0.55, street * 0.6);',
      '  diffuseColor.rgb *= (1.0 - band * 0.25);',
      '}'
    ].join('\n'));
  };

  instanced(BOX, facadeMat, towerItems, true, true);
  instanced(BOX, darkMetalMat, roofItems, true, true);
  instanced(BOX, concreteMat, plateItems, false, true);
  instanced(BOX, curbMat, curbItems, false, true);
  instanced(BOX, paintMat, dashItems, false, false);
  instanced(CYL, metalMat, poleItems, true, false);
  instanced(BOX, metalMat, armItems, true, false);
  instanced(BOX, lampMat, lampItems, false, false);
  instanced(CYL, trunkMat, trunkItems, true, false);
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  instanced(leafGeo, leafMat, leafItems, true, true);
  instanced(BOX, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 }), benchItems, true, true);

  // ---------------------------------------------------------- hero
  const hero = new THREE.Group();
  const heroParts = {};
  (function buildHero() {
    const suit = new THREE.MeshStandardMaterial({ color: 0x1b3d96, roughness: 0.55, metalness: 0.12, envMapIntensity: 0.8 });
    const suitDark = new THREE.MeshStandardMaterial({ color: 0x122a63, roughness: 0.58, metalness: 0.14 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc08a63, roughness: 0.72, metalness: 0.0 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.78, metalness: 0.0 });
    const capeM = new THREE.MeshStandardMaterial({ color: 0x8e1c22, roughness: 0.78, metalness: 0.0, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.2 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x7d181e, roughness: 0.6, metalness: 0.1 });

    const add = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      (parent || hero).add(m);
      return m;
    };

    // torso: chest -> waist -> hips, human proportions (head top ~1.88 m)
    const chest = add(new THREE.SphereGeometry(0.30, 20, 16), suit, 0, 1.35, 0.01);
    chest.scale.set(1.16, 0.80, 0.74);
    const ribs = add(new THREE.SphereGeometry(0.26, 18, 14), suit, 0, 1.17, 0);
    ribs.scale.set(1.05, 0.72, 0.72);
    const waist = add(new THREE.SphereGeometry(0.205, 16, 12), suitDark, 0, 1.04, 0);
    waist.scale.set(1.02, 0.62, 0.74);
    const pelvis = add(new THREE.SphereGeometry(0.225, 16, 12), suitDark, 0, 0.93, 0);
    pelvis.scale.set(1.14, 0.62, 0.84);
    // deltoids
    add(new THREE.SphereGeometry(0.115, 14, 12), suit, -0.285, 1.47, 0);
    add(new THREE.SphereGeometry(0.115, 14, 12), suit, 0.285, 1.47, 0);
    // belt
    const belt = add(new THREE.TorusGeometry(0.195, 0.024, 8, 24), gold, 0, 1.00, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.10, 0.90, 1.0);
    // chest crest (original diamond insignia)
    const crest = add(new THREE.BoxGeometry(0.15, 0.15, 0.03), gold, 0, 1.38, 0.215);
    crest.rotation.z = Math.PI / 4;
    const crestIn = add(new THREE.BoxGeometry(0.086, 0.086, 0.02), suitDark, 0, 1.38, 0.235);
    crestIn.rotation.z = Math.PI / 4;

    // neck + head
    add(new THREE.CylinderGeometry(0.070, 0.080, 0.10, 12), skin, 0, 1.575, 0);
    const head = add(new THREE.SphereGeometry(0.152, 22, 18), skin, 0, 1.72, 0.008);
    head.scale.set(0.90, 1.06, 0.95);
    const jaw = add(new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 1.645, 0.026);
    jaw.scale.set(0.88, 0.66, 0.92);
    // hair: a cap that leaves the face open
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.160, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM);
    hairCap.position.set(0, 1.720, -0.012);
    hairCap.rotation.x = -0.30;
    hairCap.scale.set(0.92, 1.00, 0.98);
    hairCap.castShadow = true;
    hero.add(hairCap);
    // eyes + brows
    [-0.050, 0.050].forEach(function (x) {
      add(new THREE.SphereGeometry(0.0145, 8, 8), new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.25 }), x, 1.727, 0.135).castShadow = false;
      const brow = add(new THREE.BoxGeometry(0.054, 0.010, 0.016), hairM, x, 1.755, 0.130);
      brow.castShadow = false;
    });

    // arms (pivot at shoulder)
    function makeArm(side) {
      const g = new THREE.Group();
      g.position.set(side * 0.325, 1.46, 0);
      add(new THREE.CapsuleGeometry(0.083, 0.24, 6, 12), suit, 0, -0.17, 0, g);
      add(new THREE.CapsuleGeometry(0.073, 0.24, 6, 12), suit, 0, -0.47, 0, g);
      const hand = add(new THREE.SphereGeometry(0.076, 12, 10), skin, 0, -0.665, 0, g);
      hand.scale.set(1, 1.2, 0.75);
      hero.add(g);
      return g;
    }
    // legs (pivot at hip)
    function makeLeg(side) {
      const g = new THREE.Group();
      g.position.set(side * 0.122, 0.90, 0);
      add(new THREE.CapsuleGeometry(0.108, 0.30, 6, 12), suit, 0, -0.24, 0, g);
      add(new THREE.CapsuleGeometry(0.090, 0.28, 6, 12), suitDark, 0, -0.58, 0, g);
      const bootM = add(new THREE.BoxGeometry(0.16, 0.13, 0.30), boot, 0, -0.80, 0.05, g);
      bootM.castShadow = true;
      hero.add(g);
      return g;
    }

    const armL = makeArm(-1), armR = makeArm(1);
    const legL = makeLeg(-1), legR = makeLeg(1);

    // cape: curved plane
    const capeGeo = new THREE.PlaneGeometry(0.78, 1.02, 8, 12);
    const pos = capeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = (y + 0.51) / 1.02;                 // 0 at the hem, 1 at the shoulders
      pos.setX(i, x * (1.0 - 0.38 * t));           // narrow at the shoulders, wide at the hem
      pos.setZ(i, -Math.abs(x) * 0.12 - (1 - t) * (1 - t) * 0.18);
    }
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeo, capeM);
    cape.position.set(0, 1.16, -0.255);
    cape.castShadow = true;
    hero.add(cape);

    heroParts.armL = armL; heroParts.armR = armR;
    heroParts.legL = legL; heroParts.legR = legR;
    heroParts.cape = cape; heroParts.torso = chest;
  })();
  hero.position.set(0, 0, -24);
  scene.add(hero);
  const heroPos = hero.position;

  // pose blending
  const pose = { arm: 0, leg: 0, fly: 0 };
  function poseHero(dt, moveMag, running) {
    const target = state.flying ? 1 : 0;
    pose.fly = lerp(pose.fly, target, Math.min(1, 7 * dt));
    const f = pose.fly;

    const stride = Math.sin(state.bob) * (moveMag > 0.08 ? (running ? 0.95 : 0.6) : 0.06);
    const legSwing = stride * (1 - f);
    const armSwing = -stride * 0.8 * (1 - f);

    heroParts.legL.rotation.x = lerp(legSwing, -0.28, f);
    heroParts.legR.rotation.x = lerp(-legSwing, -0.10, f);
    heroParts.armL.rotation.x = lerp(armSwing, -2.55, f);
    heroParts.armR.rotation.x = lerp(-armSwing, -2.55, f);
    heroParts.armL.rotation.z = lerp(0.10, 0.28, f);
    heroParts.armR.rotation.z = lerp(-0.10, -0.28, f);
    heroParts.cape.rotation.x = lerp(0.04, 0.95, f) + Math.sin(performance.now() * 0.004) * 0.05;
    heroParts.torso.rotation.x = lerp(0, 0.18, f);
  }

  // ---------------------------------------------------------- cars
  const CAR_COLORS = [0xb8232a, 0x1f4fa8, 0xd8b23a, 0x2a7d4f, 0xd9dce0, 0x4a2f7a, 0x1f7d80, 0xc45a16, 0x2b2f36];
  const cars = [];

  // Every car shares one set of geometries and all of the non-paint materials:
  // building ~30 boxes and 8 materials per car wasted tens of MB and slowed the
  // load. Only the paint material differs from car to car.
  const CAR_GEO = {
    body: new THREE.BoxGeometry(1.92, 0.50, 4.45),
    skirt: new THREE.BoxGeometry(1.84, 0.26, 4.20),
    hood: new THREE.BoxGeometry(1.78, 0.10, 1.45),
    trunk: new THREE.BoxGeometry(1.78, 0.10, 1.15),
    cabin: new THREE.BoxGeometry(1.62, 0.46, 1.95),
    roof: new THREE.BoxGeometry(1.52, 0.07, 1.80),
    windshield: new THREE.BoxGeometry(1.56, 0.52, 0.09),
    rearGlass: new THREE.BoxGeometry(1.50, 0.46, 0.09),
    grille: new THREE.BoxGeometry(1.86, 0.06, 0.16),
    sideTrim: new THREE.BoxGeometry(0.10, 0.05, 1.9),
    headlight: new THREE.BoxGeometry(0.46, 0.17, 0.10),
    taillight: new THREE.BoxGeometry(0.44, 0.15, 0.09),
    mirror: new THREE.BoxGeometry(0.09, 0.10, 0.16),
    bumper: new THREE.BoxGeometry(1.90, 0.26, 0.18),
    exhaust: new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10),
    strip: new THREE.BoxGeometry(0.86, 0.09, 0.06),
    tyre: new THREE.CylinderGeometry(0.355, 0.355, 0.26, 16),
    rim: new THREE.CylinderGeometry(0.21, 0.21, 0.27, 12)
  };
  const CAR_MAT = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.95, metalness: 0.0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.18, metalness: 1.0, envMapIntensity: 1.3 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffe9c0, emissiveIntensity: 2.4, roughness: 0.25 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: 0xff2418, emissiveIntensity: 1.6, roughness: 0.4 }),
    under: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7, metalness: 0.3 }),
    bumper: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.55, metalness: 0.35 }),
    strip: new THREE.MeshStandardMaterial({ color: 0x8d1418, emissive: 0xff2418, emissiveIntensity: 0.5, roughness: 0.4 })
  };

  function buildCar(colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.24, metalness: 0.72, envMapIntensity: 1.15 });
    const glass = CAR_MAT.glass;
    const rubber = CAR_MAT.rubber;
    const chrome = CAR_MAT.chrome;
    const head = CAR_MAT.head;
    const tail = CAR_MAT.tail;

    const put = (geo, mat, x, y, z, rx) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };

    put(CAR_GEO.body, paint, 0, 0.72, 0);
    put(CAR_GEO.skirt, CAR_MAT.under, 0, 0.45, 0);
    put(CAR_GEO.hood, paint, 0, 0.99, 1.45);   // hood
    put(CAR_GEO.trunk, paint, 0, 0.99, -1.72);  // trunk
    put(CAR_GEO.cabin, glass, 0, 1.20, -0.18);  // cabin
    put(CAR_GEO.roof, paint, 0, 1.44, -0.20);  // roof
    put(CAR_GEO.windshield, glass, 0, 1.16, 0.86, -0.55); // windshield
    put(CAR_GEO.rearGlass, glass, 0, 1.16, -1.16, 0.5);  // rear glass
    put(CAR_GEO.grille, chrome, 0, 0.62, 2.22);  // grille trim
    put(CAR_GEO.sideTrim, chrome, 0.94, 0.86, -0.1);
    put(CAR_GEO.sideTrim, chrome, -0.94, 0.86, -0.1);

    [-0.62, 0.62].forEach((x) => {
      put(CAR_GEO.headlight, head, x, 0.80, 2.22);
      put(CAR_GEO.taillight, tail, x, 0.84, -2.22);
      put(CAR_GEO.mirror, chrome, x * 1.62, 1.12, 0.55); // mirrors
    });
    // bumpers, diffuser, exhausts
    put(CAR_GEO.bumper, CAR_MAT.bumper, 0, 0.55, -2.24);
    put(CAR_GEO.bumper, CAR_MAT.bumper, 0, 0.55, 2.24);
    [-0.42, 0.42].forEach(function (x) {
      const ex = put(CAR_GEO.exhaust, chrome, x, 0.44, -2.26);
      ex.rotation.x = Math.PI / 2;
    });
    put(CAR_GEO.strip, CAR_MAT.strip, 0, 0.98, -2.24);

    const tyreGeo = CAR_GEO.tyre;
    const rimGeo = CAR_GEO.rim;
    const wheels = [];
    [[-0.94, 1.42], [0.94, 1.42], [-0.94, -1.45], [0.94, -1.45]].forEach((p) => {
      const pivot = new THREE.Group();
      pivot.position.set(p[0], 0.355, p[1]);
      const tyre = new THREE.Mesh(tyreGeo, rubber);
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, chrome);
      rim.rotation.z = Math.PI / 2;
      pivot.add(tyre, rim);
      g.add(pivot);
      wheels.push(pivot);
    });

    g.userData.wheels = wheels;
    return g;
  }

  for (let n = 0; n < 14; n++) {
    const g = buildCar(CAR_COLORS[ri(0, CAR_COLORS.length - 1)]);
    const alongX = Math.random() < 0.5;
    const lane = ri(-GRID - 1, GRID) + 0.5;
    const s = rnd(-GRID, GRID) * CELL + rnd(-20, 20);
    const off = (Math.random() < 0.5 ? -1 : 1) * 4.4;
    let x, z, heading;
    if (alongX) { x = s; z = lane * CELL + off; heading = Math.PI / 2; }
    else { x = lane * CELL + off; z = s; heading = 0; }
    if (Math.abs(x) < 70 && Math.abs(z) < 70) x += 140;
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    scene.add(g);
    cars.push({ mesh: g, x: x, z: z, heading: heading, speed: 0, occupied: false });
  }

  // a few cars parked around the plaza
  [[0, 41, Math.PI / 2], [41, 6, 0], [-41, -8, 0], [6, -41, Math.PI / 2], [41, -41, 0]].forEach(function (p) {
    const g = buildCar(CAR_COLORS[ri(0, CAR_COLORS.length - 1)]);
    g.position.set(p[0], 0, p[1]);
    g.rotation.y = p[2];
    scene.add(g);
    cars.push({ mesh: g, x: p[0], z: p[1], heading: p[2], speed: 0, occupied: false });
  });

  // ---------------------------------------------------------- power cores
  const coreGroup = new THREE.Group();
  scene.add(coreGroup);
  const cores = [];
  const CORE_TOTAL = 12;
  const coreGeo = new THREE.IcosahedronGeometry(0.85, 1);
  const ringGeo = new THREE.TorusGeometry(1.35, 0.08, 8, 32);
  for (let n = 0; n < CORE_TOTAL; n++) {
    const high = n >= 8;
    const col = high ? 0xffc247 : 0x39d6ff;
    const g = new THREE.Group();
    const orb = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 2.2, roughness: 0.25, metalness: 0.4
    }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.6
    }));
    ring.rotation.x = Math.PI / 2;
    g.add(orb, ring);
    const alongX = Math.random() < 0.5;
    const lane = ri(-GRID, GRID) + 0.5;
    const s = rnd(-GRID, GRID) * CELL;
    const y = high ? rnd(26, 46) : 2.6;
    if (alongX) g.position.set(s, y, lane * CELL);
    else g.position.set(lane * CELL, y, s);
    coreGroup.add(g);
    cores.push({ mesh: g, taken: false, spin: rnd(-1, 1), baseY: y });
  }


  // ---------------------------------------------------------- cockpit rig
  const cockpit = new THREE.Group();
  (function buildCockpit() {
    const dashMat = new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.95, metalness: 0.02, envMapIntensity: 0.25 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.3 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x050b10, emissive: 0x0d3444, emissiveIntensity: 0.45, roughness: 0.35, envMapIntensity: 0.2 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      cockpit.add(m);
      return m;
    };
    // eye sits at local (-0.32, 1.24, 0.42); everything below is ahead of it (+z)
    const dash = add(new THREE.BoxGeometry(1.5, 0.26, 0.50), dashMat, -0.30, 0.88, 1.02);
    const cowl = add(new THREE.BoxGeometry(1.5, 0.06, 0.30), trimMat, -0.30, 1.01, 1.14);
    cowl.rotation.x = -0.22;
    const cluster = add(new THREE.BoxGeometry(0.34, 0.11, 0.03), screenMat, -0.58, 1.08, 1.04);
    cluster.rotation.x = -0.30;
    const centre = add(new THREE.BoxGeometry(0.24, 0.15, 0.03), screenMat, 0.04, 1.02, 1.00);
    centre.rotation.x = -0.20;
    // steering wheel, just ahead of the driver
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(-0.32, 1.09, 1.00);
    wheelPivot.rotation.x = -0.62;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.023, 8, 26), trimMat);
    const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.016, 0.02), trimMat);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.15, 0.02), trimMat);
    spoke2.position.y = -0.07;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 12), dashMat);
    hub.rotation.x = Math.PI / 2;
    wheelPivot.add(rim, spoke1, spoke2, hub);
    cockpit.add(wheelPivot);
    // A-pillars, roof edge, mirror
    const pl = add(new THREE.BoxGeometry(0.05, 0.62, 0.05), dashMat, -1.02, 1.34, 1.10);
    pl.rotation.z = 0.16;
    const pr = add(new THREE.BoxGeometry(0.05, 0.62, 0.05), dashMat, 0.44, 1.34, 1.10);
    pr.rotation.z = -0.16;
    cockpit.userData.wheel = wheelPivot;
    cockpit.visible = false;
    scene.add(cockpit);
  })();

  // ---------------------------------------------------------- headlights
  const headlights = [];
  for (let i = 0; i < 2; i++) {
    const sp = new THREE.SpotLight(0xfff2d8, 0, 52, 0.5, 0.45, 1.1);
    sp.castShadow = false;
    const tgt = new THREE.Object3D();
    scene.add(tgt);
    sp.target = tgt;
    scene.add(sp);
    headlights.push({ light: sp, target: tgt });
  }

  // ---------------------------------------------------------- rain
  const RAIN_COUNT = 1500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPos[i * 3] = rnd(-30, 30);
    rainPos[i * 3 + 1] = rnd(0, 30);
    rainPos[i * 3 + 2] = rnd(-30, 30);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xbcd4e6, size: 0.13, transparent: true, opacity: 0.62, depthWrite: false, sizeAttenuation: true
  }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  // ===== gameplay section (state, input, physics, camera, HUD) =====
