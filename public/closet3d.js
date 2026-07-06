// The 3D closet — a WebGL walk-in modeled on *that* apartment closet:
// cream cabinets, a backlit shelf wall, glossy white floor, and the blue
// Manolo center stage in a glass case (the proposal spot).
// Self-contained ES module; three.js is vendored locally in /vendor/.

import * as THREE from './vendor/three.module.min.js';

// ---------- tiny helpers ----------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function svgTexture(svg, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(canvasTexture(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h)));
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

const SHOE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
  <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7fa4f0"/><stop offset="55%" stop-color="#2f55c4"/><stop offset="100%" stop-color="#1b3a99"/></linearGradient></defs>
  <path d="M22 38 C26 32 33 32 36 38 C40 46 46 54 58 59 C74 65 92 66 103 68 C110 69 112 71 112 74 L112 75 C112 77 110 78 107 78 L36 78 C30 78 27 74 27 68 C27 58 20 48 22 38 Z" fill="url(#s)"/>
  <path d="M22 38 C26 32 33 32 36 38 C38 43 41 48 46 52 C42 60 38 66 37 78 L36 78 C30 78 27 74 27 68 C27 58 20 48 22 38 Z" fill="#24469f" opacity=".55"/>
  <path d="M31 78 L27 92 L33 92 L38 78 Z" fill="#1b3a99"/>
  <rect x="88" y="56" width="15" height="11" rx="2" transform="rotate(6 95 61)" fill="#dfe9ff" stroke="#9fb6e8"/>
  <circle cx="92" cy="59" r="1.3" fill="#fff"/><circle cx="97" cy="60" r="1.3" fill="#fff"/><circle cx="94" cy="63" r="1.3" fill="#fff"/><circle cx="100" cy="63" r="1.3" fill="#fff"/>
</svg>`;

const DRESS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">
  <defs><pattern id="n" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#fbf9f3"/><rect x="1" y="2" width="10" height="1" fill="#b5afa2"/><rect x="1" y="6" width="7" height="1" fill="#cdc7b8"/></pattern></defs>
  <path d="M60 8 L52 20 L68 20 Z" fill="#8b8578"/>
  <path d="M44 22 L76 22 L92 78 C96 100 86 140 60 140 C34 140 24 100 28 78 Z" fill="url(#n)" stroke="#a9a294" stroke-width="1.5"/>
  <path d="M44 22 L60 44 L76 22 L76 32 L60 56 L44 32 Z" fill="#e6e0d1"/>
</svg>`;

// ---------- materials ----------

const CREAM = 0xf1ece1;
const CREAM_DARK = 0xe4dccc;

function makeEnvironment(renderer) {
  // a tiny synthetic "room" so glossy surfaces have something to reflect
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdcd6c8);
  const strip = (x, y, z, w, h, ry, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity) }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  strip(0, 4, -4, 8, 2, 0, 5);
  strip(-4, 3, 0, 6, 1.5, Math.PI / 2, 3);
  strip(4, 3, 0, 6, 1.5, -Math.PI / 2, 3);
  strip(0, 1, 4, 8, 3, Math.PI, 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return env;
}

function cabinetTexture(rows) {
  return canvasTexture(512, 1024, (ctx) => {
    ctx.fillStyle = '#efe9dd';
    ctx.fillRect(0, 0, 512, 1024);
    const doorH = 620, y0 = 40;
    for (let i = 0; i < 2; i++) {
      const x = 30 + i * 236;
      ctx.fillStyle = '#e7e0d1';
      ctx.fillRect(x, y0, 216, doorH);
      ctx.strokeStyle = '#d3cab6';
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 12, y0 + 12, 192, doorH - 24);
      // oval inset
      ctx.save();
      ctx.translate(x + 108, y0 + doorH / 2);
      ctx.strokeStyle = '#c8bfa8';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 62, 150, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,252,240,0.55)';
      ctx.fill();
      ctx.restore();
      // handle
      ctx.fillStyle = '#b9b1a0';
      ctx.fillRect(i === 0 ? x + 196 : x + 12, y0 + doorH / 2 - 30, 8, 60);
    }
    // drawers below
    let dy = y0 + doorH + 24;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = '#e7e0d1';
      ctx.fillRect(30, dy, 452, 84);
      ctx.strokeStyle = '#d3cab6';
      ctx.lineWidth = 4;
      ctx.strokeRect(36, dy + 6, 440, 72);
      ctx.fillStyle = '#b9b1a0';
      ctx.fillRect(226, dy + 38, 60, 8);
      dy += 100;
    }
  });
}

function labelTexture(name, valueText, hex) {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, 512, 46);
    ctx.fillStyle = '#f7f2e6';
    ctx.fillRect(96, 74, 320, 118);
    ctx.strokeStyle = 'rgba(74,49,40,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(96, 74, 320, 118);
    ctx.fillStyle = '#4a3128';
    ctx.textAlign = 'center';
    ctx.font = '600 30px Georgia, serif';
    const words = name.split(' ');
    let line = '', lines = [];
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 18) { lines.push(line.trim()); line = word; }
      else line += ' ' + word;
    }
    lines.push(line.trim());
    lines = lines.slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, 256, 118 + i * 34));
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillStyle = '#7d5a49';
    ctx.fillText(valueText, 256, 178);
  });
}

function mirrorTexture(totalText, gainText) {
  return canvasTexture(512, 768, (ctx) => {
    const g = ctx.createRadialGradient(200, 200, 60, 256, 384, 520);
    g.addColorStop(0, '#fffdf6');
    g.addColorStop(1, '#efe4cd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 768);
    ctx.fillStyle = '#b0705f';
    ctx.textAlign = 'center';
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillText('the mirror never lies, darling', 256, 300);
    ctx.fillStyle = '#4a3128';
    ctx.font = '600 52px Georgia, serif';
    ctx.fillText(totalText, 256, 380);
    ctx.fillStyle = '#7d5a49';
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillText(gainText, 256, 432);
  });
}

// ---------- the scene ----------

export async function startCloset3D(container, data, onOpen) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f1e7);
  scene.environment = makeEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 60);
  const LOOK_AT = new THREE.Vector3(0, 1.45, 0.6);

  const clickable = [];

  // --- room shell: 9 wide, 3.6 high, 12 deep (back wall at z=0) ---
  const wallMat = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.6), wallMat);
  backWall.position.set(0, 1.8, -0.02);
  scene.add(backWall);

  const cabTex = cabinetTexture(3);
  const sideMat = new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.6), sideMat.clone());
    wall.material.map = cabTex.clone();
    wall.material.map.repeat.set(4, 1);
    wall.material.map.wrapS = THREE.RepeatWrapping;
    wall.position.set(side * 4.5, 1.8, 6);
    wall.rotation.y = -side * Math.PI / 2;
    scene.add(wall);
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xf3efe6, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 6);
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.9 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, 6);
  scene.add(ceiling);
  for (let i = 0; i < 3; i++) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0xfff3d8 }));
    spot.rotation.x = Math.PI / 2;
    spot.position.set(0, 3.59, 2 + i * 3);
    scene.add(spot);
  }

  // --- backlit shelf wall (the shoe wall) ---
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  );
  glow.position.set(0, 1.75, 0.02);
  scene.add(glow);
  const frameMat = new THREE.MeshStandardMaterial({ color: CREAM_DARK, roughness: 0.6 });
  const shelfMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.55 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.5), frameMat);
    pillar.position.set(side * 2.95, 1.75, 0.25);
    scene.add(pillar);
  }
  const shelfYs = [0.85, 1.55, 2.25];
  for (const y of shelfYs) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.05, 0.5), shelfMat);
    shelf.position.set(0, y, 0.27);
    scene.add(shelf);
  }

  // --- shoeboxes on the shelves (managed investments) ---
  const BOX_COLORS = ['#f6d9d4', '#fdf3e2', '#dde6d5', '#d9e4ee'];
  const perShelf = Math.ceil(data.boxes.length / shelfYs.length);
  data.boxes.forEach((box, i) => {
    const shelfIdx = Math.min(Math.floor(i / perShelf), shelfYs.length - 1);
    const posOnShelf = i - shelfIdx * perShelf;
    const count = Math.min(data.boxes.length - shelfIdx * perShelf, perShelf);
    const hex = BOX_COLORS[i % BOX_COLORS.length];
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.3, 0.42),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.65 }),
    );
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.3),
      new THREE.MeshStandardMaterial({ map: labelTexture(box.name, box.valueText, hex), roughness: 0.65 }),
    );
    front.position.z = 0.211;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.06, 0.48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.9), roughness: 0.6 }),
    );
    lid.position.y = 0.18;
    group.add(body, front, lid);
    const spread = 5.0 / (count + 1);
    group.position.set(-2.5 + spread * (posOnShelf + 1), shelfYs[shelfIdx] + 0.18, 0.28);
    group.userData.invId = box.id;
    scene.add(group);
    clickable.push(group);
  });

  // --- the proposal spot: blue Manolo in a glass case, center stage ---
  const shoeTex = await svgTexture(SHOE_SVG, 512, 410);
  {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.5, 40),
      new THREE.MeshStandardMaterial({ color: 0xf0eadd, roughness: 0.5 }),
    );
    base.position.y = 0.25;
    const trim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.05, 40),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, roughness: 0.25, metalness: 0.8 }),
    );
    trim.position.y = 0.52;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.58),
      new THREE.MeshBasicMaterial({ map: shoeTex, transparent: true, side: THREE.DoubleSide }),
    );
    card.position.y = 0.88;
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.8, 0.9),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.15 }),
    );
    caseMesh.position.y = 0.95;
    group.add(base, trim, card, caseMesh);
    group.position.set(0, 0, 2.3);
    group.userData.invId = data.shoe?.id;
    scene.add(group);
    if (data.shoe) clickable.push(group);
    const spot = new THREE.SpotLight(0xfff0d0, 25, 8, 0.5, 0.5);
    spot.position.set(0, 3.5, 3.4);
    spot.target = group;
    scene.add(spot);
  }

  // --- the newspaper dress on a stand (the bank) ---
  const dressTex = await svgTexture(DRESS_SVG, 512, 640);
  if (data.dress) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, metalness: 0.85, roughness: 0.3 }),
    );
    pole.position.y = 0.85;
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, metalness: 0.85, roughness: 0.3 }),
    );
    foot.position.y = 0.03;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 1.06),
      new THREE.MeshBasicMaterial({ map: dressTex, transparent: true, side: THREE.DoubleSide }),
    );
    card.position.y = 1.15;
    group.add(pole, foot, card);
    group.position.set(-2.9, 0, 3.4);
    group.rotation.y = 0.5;
    group.userData.invId = data.dress.id;
    scene.add(group);
    clickable.push(group);
  }

  // --- the deed, framed on the right wall (the apartment) ---
  if (data.deed) {
    const group = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, metalness: 0.7, roughness: 0.3 }),
    );
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.86),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(256, 356, (ctx) => {
          ctx.fillStyle = '#faf6ea';
          ctx.fillRect(0, 0, 256, 356);
          ctx.fillStyle = '#6b6458';
          ctx.textAlign = 'center';
          ctx.font = '600 30px Georgia, serif';
          ctx.fillText('D E E D', 128, 64);
          ctx.strokeStyle = '#cfc8b6';
          ctx.lineWidth = 4;
          for (let y = 110; y < 280; y += 24) {
            ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(216, y); ctx.stroke();
          }
          ctx.fillStyle = '#a12b2b';
          ctx.beginPath(); ctx.arc(196, 310, 18, 0, Math.PI * 2); ctx.fill();
        }),
        roughness: 0.8,
      }),
    );
    paper.position.z = 0.03;
    group.add(frame, paper);
    group.position.set(4.44, 1.9, 4.2);
    group.rotation.y = -Math.PI / 2;
    group.userData.invId = data.deed.id;
    scene.add(group);
    clickable.push(group);
  }

  // --- the gold mirror with the total (left wall) ---
  {
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.055, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, metalness: 0.8, roughness: 0.25 }),
    );
    frame.rotation.y = Math.PI / 2;
    frame.scale.set(1, 1.25, 1);
    frame.position.set(-4.42, 1.9, 2.6);
    scene.add(frame);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 48),
      new THREE.MeshBasicMaterial({ map: mirrorTexture(data.totalText, data.gainText) }),
    );
    face.position.set(-4.44, 1.9, 2.6);
    face.rotation.y = Math.PI / 2;
    face.scale.set(1, 1.25, 1);
    scene.add(face);
  }

  // --- the doors you walk through ---
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.55 });
  const doors = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 4.5, 0, 9.6);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.6, 0.08), doorMat);
    panel.position.set(-side * 2.25, 1.8, 0);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xcfa64f, metalness: 0.9, roughness: 0.2 }),
    );
    knob.position.set(-side * 4.28, 1.75, 0.09);
    pivot.add(panel, knob);
    scene.add(pivot);
    doors.push({ pivot, side });
  }

  // --- lights ---
  scene.add(new THREE.AmbientLight(0xfff6e8, 0.55));
  const hemi = new THREE.HemisphereLight(0xfffaf0, 0xd8cfc0, 0.8);
  scene.add(hemi);
  const key = new THREE.PointLight(0xfff0d8, 30, 20);
  key.position.set(0, 3.2, 6.5);
  scene.add(key);

  // --- entrance choreography, then free-look orbit ---
  const start = performance.now();
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  let yaw = 0, pitch = 0, dist = 6.2, entranceDone = false;

  function positionCamera() {
    const target = LOOK_AT;
    camera.position.set(
      target.x + Math.sin(yaw) * dist,
      target.y + 0.35 + Math.sin(pitch) * dist * 0.5,
      target.z + Math.cos(yaw) * dist,
    );
    camera.lookAt(target);
  }

  // pointer interaction (drag to orbit, wheel/pinch to zoom, click to open)
  let dragging = false, moved = 0, px = 0, py = 0, pinch = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickable, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.invId) obj = obj.parent;
    return obj;
  }

  const el = renderer.domElement;
  const onDown = (e) => { dragging = true; moved = 0; px = e.clientX; py = e.clientY; };
  const onMove = (e) => {
    if (!entranceDone) return;
    if (dragging) {
      yaw += (e.clientX - px) * 0.004;
      pitch += (e.clientY - py) * 0.003;
      yaw = Math.max(-0.65, Math.min(0.65, yaw));
      pitch = Math.max(-0.12, Math.min(0.35, pitch));
      moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
      px = e.clientX; py = e.clientY;
    } else {
      el.style.cursor = pick(e) ? 'pointer' : 'grab';
    }
  };
  const onUp = (e) => {
    if (!entranceDone) { dragging = false; return; }
    if (dragging && moved < 8) {
      const hit = pick(e);
      if (hit && hit.userData.invId) onOpen(hit.userData.invId);
    }
    dragging = false;
  };
  const onWheel = (e) => {
    if (!entranceDone) return;
    e.preventDefault();
    dist = Math.max(3.2, Math.min(8.6, dist + e.deltaY * 0.005));
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (pinch) dist = Math.max(3.2, Math.min(8.6, dist - (d - pinch) * 0.01));
      pinch = d;
    }
  };
  const onTouchEnd = () => { pinch = 0; };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchmove', onTouchMove, { passive: true });
  el.addEventListener('touchend', onTouchEnd);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = (now - start) / 1000;
    if (!entranceDone) {
      // hold on the closed doors while the title card shows, then open & glide in
      const open = ease((t - 1.15) / 1.5);
      for (const { pivot, side } of doors) pivot.rotation.y = side * open * 2.0;
      const glide = ease((t - 1.8) / 2.0);
      const z = 11.6 - glide * 5.4;
      camera.position.set(0, 1.75, z);
      camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);
      if (t > 3.9) {
        entranceDone = true;
        dist = camera.position.z - LOOK_AT.z;
        yaw = 0; pitch = 0;
        el.style.cursor = 'grab';
      }
    } else {
      positionCamera();
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.remove();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
    },
  };
}
