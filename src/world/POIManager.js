import * as THREE from 'three';
import { mulberry32 } from '../utils/Noise.js';
import { Chest, buildChestMesh } from './Props.js';

const LABEL_FADE_HIGH = 42; // fully visible above this altitude
const LABEL_FADE_LOW = 14; // fully hidden below this altitude

function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#797d84';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#bfe3ff';
  for (let y = 10; y < 128; y += 22) {
    for (let x = 6; x < 58; x += 20) {
      ctx.fillRect(x, y, 11, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 60px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(26, 6.5, 1);
  return sprite;
}

function buildTiltedTowers(rand) {
  const group = new THREE.Group();
  const windowTex = makeWindowTexture();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.8 });
  const windowMat = new THREE.MeshStandardMaterial({ map: windowTex, roughness: 0.6 });

  const positions = [
    [0, 0], [7, 4], [-6, 6], [5, -7], [-8, -3], [1, 9], [-2, -9],
  ];
  for (const [ox, oz] of positions) {
    const floors = 4 + Math.floor(rand() * 6);
    const w = 3.2 + rand() * 1.6;
    const h = floors * 2.2;
    const geo = new THREE.BoxGeometry(w, h, w);
    const mats = [
      windowMat, windowMat, bodyMat, bodyMat, windowMat, windowMat,
    ];
    const tex = windowTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, floors);
    const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const building = new THREE.Mesh(geo, [sideMat, sideMat, bodyMat, bodyMat, sideMat, sideMat]);
    building.position.set(ox, h / 2, oz);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
  }
  return group;
}

function buildHouse(color, roofColor) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 3.8), wallMat);
  body.position.y = 1.2;
  body.castShadow = true;
  body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.8, 4), roofMat);
  roof.position.y = 2.4 + 0.9;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(body, roof);
  return group;
}

function buildSaltySprings(rand) {
  const group = new THREE.Group();
  const palette = [
    [0x3f7a4d, 0x2b4a30], [0x3d6fa0, 0x274a68], [0x3f7a4d, 0x274a68], [0x3d6fa0, 0x2b4a30],
  ];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const dist = 8 + rand() * 16;
    const [wall, roof] = palette[Math.floor(rand() * palette.length)];
    const house = buildHouse(wall, roof);
    house.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    house.rotation.y = rand() * Math.PI * 2;
    group.add(house);
  }
  return group;
}

function buildRetailRow(rand) {
  const group = new THREE.Group();
  const storeMat = new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb0473f, roughness: 0.6 });
  const chests = [];
  const count = 5;
  const spacing = 9;
  const startX = -((count - 1) * spacing) / 2;

  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    const store = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4, 9), storeMat);
    store.position.set(x, 2, 0);
    store.castShadow = true;
    store.receiveShadow = true;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 2), trimMat);
    awning.position.set(x, 3.6, 5.2);
    group.add(store, awning);

    const chestMesh = buildChestMesh();
    const chestPos = new THREE.Vector3(x, 0, 2.5 + rand() * 2);
    const chest = new Chest(chestMesh, chestPos);
    group.add(chestMesh);
    chests.push(chest);
  }
  return { group, chests };
}

export class POIManager {
  constructor(scene, terrain, seed = 555) {
    this.scene = scene;
    this.terrain = terrain;
    const rand = mulberry32(seed);

    this.group = new THREE.Group();
    this.group.name = 'POIs';
    this.chests = [];
    this.pois = [];
    this._labels = [];

    const defs = [
      { name: 'TILTED TOWERS', angle: Math.PI * 0.15, dist: terrain.radius * 0.42, radius: 20, build: () => ({ group: buildTiltedTowers(rand), chests: [] }) },
      { name: 'SALTY SPRINGS', angle: Math.PI * 1.05, dist: terrain.radius * 0.48, radius: 26, build: () => ({ group: buildSaltySprings(rand), chests: [] }) },
      { name: 'RETAIL ROW', angle: Math.PI * 1.75, dist: terrain.radius * 0.4, radius: 24, build: () => buildRetailRow(rand) },
    ];

    for (const def of defs) {
      const cx = Math.cos(def.angle) * def.dist;
      const cz = Math.sin(def.angle) * def.dist;
      const groundY = terrain.getHeightAt(cx, cz);
      const { group: sectorGroup, chests } = def.build();
      sectorGroup.position.set(cx, groundY, cz);
      this.group.add(sectorGroup);

      for (const chest of chests) {
        chest.mesh.position.add(new THREE.Vector3(cx, groundY, cz));
        this.chests.push(chest);
      }

      const label = makeLabelSprite(def.name);
      label.position.set(cx, groundY + 22, cz);
      this.group.add(label);
      this._labels.push(label);

      this.pois.push({ name: def.name, x: cx, z: cz, radius: def.radius });
    }

    scene.add(this.group);
  }

  // Fades landmark titles out as the player nears the ground (e.g. while gliding in).
  update(playerAltitude) {
    const t = THREE.MathUtils.clamp(
      (playerAltitude - LABEL_FADE_LOW) / (LABEL_FADE_HIGH - LABEL_FADE_LOW), 0, 1
    );
    for (const label of this._labels) label.material.opacity = t;
  }

  // Used by prop scattering to avoid spawning trees/rocks inside a POI footprint.
  isInsidePOI(x, z) {
    for (const poi of this.pois) {
      const dx = x - poi.x, dz = z - poi.z;
      if (dx * dx + dz * dz < poi.radius * poi.radius) return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }
}
