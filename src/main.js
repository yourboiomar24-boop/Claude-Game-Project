import * as THREE from 'three';
import './ui/ui.css';

import { InputManager } from './core/InputManager.js';
import { Terrain } from './world/Terrain.js';
import { generateProps } from './world/Props.js';
import { Storm, buildStormVisual } from './world/Storm.js';
import { BuildSystem } from './building/BuildSystem.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { getSkinById, SKINS } from './skins/skins.js';
import { WEAPONS, rollLootWeapon } from './combat/Weapons.js';
import { MainMenu } from './ui/MainMenu.js';
import { HUD } from './ui/HUD.js';
import { EditOverlay } from './ui/EditOverlay.js';
import { GameOverScreen } from './ui/GameOverScreen.js';

const app = document.getElementById('app');
const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc7e8);
scene.fog = new THREE.Fog(0x8fc7e8, 90, 340);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);

const input = new InputManager(canvas);
const hud = new HUD(app);
const editOverlay = new EditOverlay(app);
const gameOverScreen = new GameOverScreen(app, () => menu.show());
hud.root.style.display = 'none';

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function setupLighting(target) {
  const hemi = new THREE.HemisphereLight(0xaee2ff, 0x36432a, 0.9);
  target.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0015;
  target.add(sun);
  target.add(sun.target);
  return { hemi, sun };
}

let match = null; // holds all per-match state, disposed between matches

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}

function startMatch({ skinId, botCount }) {
  while (scene.children.length) {
    const child = scene.children[0];
    scene.remove(child);
    disposeObject3D(child);
  }

  setupLighting(scene);

  const terrain = new Terrain({ radius: 150, segments: 170, seed: Math.floor(Math.random() * 100000) });
  scene.add(terrain.group);

  const props = generateProps(terrain, { seed: Math.floor(Math.random() * 100000), count: 260, chests: 42 });
  scene.add(props.group);

  const storm = new Storm({ mapRadius: terrain.radius, seed: Math.floor(Math.random() * 100000) });
  const stormVisual = buildStormVisual(terrain.radius);
  scene.add(stormVisual.group);

  const buildSystem = new BuildSystem(scene, terrain);

  const characters = [];
  const world = {
    buildSystem,
    storm,
    terrainMesh: terrain.mesh,
    getStructureMeshes: () => buildSystem.getStructureMeshes(),
    getCharacters: () => characters,
    getResourceMeshes: () => props.resourceNodes.filter((n) => n.alive).map((n) => n.mesh),
  };

  const combatSystem = new CombatSystem(scene, world);

  const player = new Player({ scene, camera, input, skin: getSkinById(skinId), world, combatSystem });
  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnDist = terrain.radius * 0.5;
  player.spawnAt(Math.cos(spawnAngle) * spawnDist, Math.sin(spawnAngle) * spawnDist);
  characters.push(player);

  const bots = [];
  const usedSkinIdx = new Set();
  for (let i = 0; i < botCount; i++) {
    let skinIdx;
    do { skinIdx = Math.floor(Math.random() * SKINS.length); } while (SKINS.length > botCount && usedSkinIdx.has(skinIdx) && usedSkinIdx.size < SKINS.length);
    usedSkinIdx.add(skinIdx);
    const bot = new Bot({ scene, skin: SKINS[skinIdx], world, combatSystem, seed: Math.floor(Math.random() * 1e9) });
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * terrain.radius * 0.85;
    bot.spawnAt(Math.cos(ang) * dist, Math.sin(ang) * dist);
    bots.push(bot);
    characters.push(bot);
  }

  const totalPlayers = 1 + botCount;

  input.setEnabled(true);
  hud.root.style.display = 'block';

  player.onToast = (text) => hud.showToast(text);
  player.onFire = (kind, meta) => {
    if (kind === 'hit') hud.showHitMarker();
    if (kind === 'damaged') hud.flashDamage(1);
  };
  player.onDeath = () => {
    if (match.ended) return;
    match.ended = true;
    endMatchTo(false, bots.filter((b) => !b.isDead).length + 1, totalPlayers);
  };

  match = {
    terrain, props, storm, stormVisual, buildSystem, combatSystem,
    player, bots, characters, world, totalPlayers,
    ended: false,
  };
}

function endMatchTo(win, placement, total) {
  input.setEnabled(false);
  document.exitPointerLock?.();
  gameOverScreen.show(win, placement, total);
}

function rollChestLoot(player, hud) {
  const weaponId = rollLootWeapon();
  const def = WEAPONS[weaponId];
  const gotWeapon = player.pickupWeapon(weaponId);
  if (gotWeapon) hud.showToast(`Found ${def.name}`);
  else player.addAmmo(def.ammoType, def.magSize * 2);

  const matAmount = 20 + Math.floor(Math.random() * 40);
  const matType = ['wood', 'stone', 'metal'][Math.floor(Math.random() * 3)];
  player.addMaterials(matType, matAmount);

  if (Math.random() < 0.3) {
    player.shield = Math.min(player.maxShield, player.shield + 50);
    hud.showToast('Shield +50');
  }
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());

  if (!match) {
    renderer.render(scene, camera);
    return;
  }

  const { player, bots, storm, stormVisual, buildSystem, combatSystem, terrain, props, characters, totalPlayers } = match;

  if (!player.isDead) {
    storm.update(dt);
    stormVisual.wall.position.set(storm.center.x, 25, storm.center.y);
    stormVisual.wall.scale.set(storm.radius, 1, storm.radius);
    stormVisual.nextRing.position.set(storm.nextCenter.x, terrain.getHeightAt(storm.nextCenter.x, storm.nextCenter.y) + 0.3, storm.nextCenter.y);
    stormVisual.nextRing.scale.set(storm.nextRadius, storm.nextRadius, 1);
    stormVisual.nextRing.visible = storm.state === 'calm';

    if (storm.isOutside(player.position.x, player.position.z)) {
      player.applyStormDamage(storm.damagePerSecond, dt);
    }

    player.update(dt);

    let nearestChest = null, nearestDist = 2.4;
    for (const chest of props.chests) {
      if (chest.opened) continue;
      const d = player.position.distanceTo(chest.mesh.position);
      if (d < nearestDist) { nearestChest = chest; nearestDist = d; }
    }
    if (nearestChest) {
      hud.setInteractHint('Press E to open supply chest');
      if (input.wasPressed('KeyE')) {
        nearestChest.open();
        rollChestLoot(player, hud);
      }
    } else {
      hud.setInteractHint(null);
    }

    for (const bot of bots) {
      if (bot.isDead) continue;
      bot.update(dt, characters);
    }

    for (let i = bots.length - 1; i >= 0; i--) {
      const bot = bots[i];
      if (!bot.isDead) continue;
      const killer = bot.lastDamagedBy;
      if (killer === player) {
        player.kills++;
        hud.addKillFeed(`You eliminated ${bot.name}`);
      } else if (killer && killer.name) {
        hud.addKillFeed(`${killer.name} eliminated ${bot.name}`);
      } else {
        hud.addKillFeed(`${bot.name} was eliminated by the storm`);
      }
      bot.remove();
      bots.splice(i, 1);
      const idx = characters.indexOf(bot);
      if (idx >= 0) characters.splice(idx, 1);
    }

    combatSystem.update(dt);

    hud.setHealthShield(player.health, player.maxHealth, player.shield, player.maxShield);
    hud.setMaterials(player.inventory, buildSystem.tier);
    hud.setWeaponSlots(player.weaponSlots, player.activeSlot);
    hud.setBuildSlots(['wall', 'floor', 'ramp', 'roof'], player.mode === 'build' ? player.buildType : null);
    hud.setPlayersLeft(bots.length + 1);
    if (storm.state === 'calm') hud.setStormTimer(`Storm closes in ${Math.ceil(storm.timeUntilShrink())}s`);
    else if (storm.state === 'shrinking') hud.setStormTimer('Storm is closing!');
    else hud.setStormTimer('Final circle');
    hud.drawMinimap({ playerPos: player.position, mapRadius: terrain.radius, storm, safeRadius: storm.radius });

    editOverlay.setTarget(player.editMode ? player.editTarget?.piece ?? null : null);

    if (bots.length === 0 && !match.ended) {
      match.ended = true;
      endMatchTo(true, 1, totalPlayers);
    }

    input.endFrame();
  }

  renderer.render(scene, camera);
}

const menu = new MainMenu(app, (opts) => startMatch(opts));

requestAnimationFrame(frame);
