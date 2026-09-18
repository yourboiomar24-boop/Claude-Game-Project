import * as THREE from 'three';
import './ui/ui.css';

import { InputManager } from './core/InputManager.js';
import { Terrain } from './world/Terrain.js';
import { generateProps } from './world/Props.js';
import { Storm, buildStormVisual } from './world/Storm.js';
import { spawnChestLoot } from './world/Loot.js';
import { POIManager } from './world/POIManager.js';
import { BuildSystem } from './building/BuildSystem.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { RARITY_TIERS } from './combat/Rarity.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { getSkinById, SKINS } from './skins/skins.js';
import { MenuTabs } from './ui/MenuTabs.js';
import { HUD } from './ui/HUD.js';
import { EditOverlay } from './ui/EditOverlay.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { LobbyManager } from './match/LobbyManager.js';
import { BusManager } from './match/BusManager.js';
import { SkydiveManager } from './match/SkydiveManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { computeMatchXp } from './progression/BattlePass.js';

const SCAVENGE_WINDOW_SECONDS = 30;

const app = document.getElementById('app');
const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc7e8);
scene.fog = new THREE.Fog(0x8fc7e8, 90, 340);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);

const input = new InputManager(canvas);
const hud = new HUD(app);
const editOverlay = new EditOverlay(app);
const gameOverScreen = new GameOverScreen(app, () => menu.show());
const audioManager = new AudioManager();
hud.root.style.display = 'none';

hud.onFullscreenClick(() => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
resize();

function setupLighting(target) {
  const hemi = new THREE.HemisphereLight(0xaee2ff, 0x36432a, 0.9);
  target.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1280, 1280);
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
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

// ---------------------------------------------------------------------
// Match setup — builds the full combat-phase world up front (terrain,
// POIs, props, storm, building, combat) plus the lobby island, then starts
// the match in the 'lobby' phase. The bus/skydive managers are created
// lazily when their phase begins.
// ---------------------------------------------------------------------
function startMatch({ skinId, botCount }) {
  while (scene.children.length) {
    const child = scene.children[0];
    scene.remove(child);
    disposeObject3D(child);
  }

  setupLighting(scene);

  const terrain = new Terrain({ radius: 150, segments: 110, seed: Math.floor(Math.random() * 100000) });
  scene.add(terrain.group);

  const poiManager = new POIManager(scene, terrain, Math.floor(Math.random() * 100000));

  const props = generateProps(terrain, { seed: Math.floor(Math.random() * 100000), count: 170, chests: 34, poiManager });
  scene.add(props.group);

  const chests = [...props.chests, ...poiManager.chests];
  const pickups = [];

  const storm = new Storm({ mapRadius: terrain.radius, seed: Math.floor(Math.random() * 100000) });
  const stormVisual = buildStormVisual(terrain.radius);
  scene.add(stormVisual.group);

  const buildSystem = new BuildSystem(scene, terrain);

  const characters = [];
  const world = {
    buildSystem,
    storm,
    terrain,
    terrainMesh: terrain.mesh,
    getStructureMeshes: () => buildSystem.getStructureMeshes(),
    getCharacters: () => characters,
    getResourceMeshes: () => props.resourceNodes.filter((n) => n.alive).map((n) => n.mesh),
    getChests: () => chests,
    getPickups: () => pickups,
    removePickup: (pk) => {
      pk.collected = true;
      scene.remove(pk.mesh);
      const idx = pickups.indexOf(pk);
      if (idx >= 0) pickups.splice(idx, 1);
    },
  };

  const combatSystem = new CombatSystem(scene, world);

  const lobby = new LobbyManager(scene);

  const player = new Player({ scene, camera, input, skin: getSkinById(skinId), world, combatSystem });
  const playerSpawn = lobby.getSpawnPoint(0, botCount + 1);
  player.setPosition(playerSpawn.x, playerSpawn.y, playerSpawn.z);
  characters.push(player);

  player.onEditEnter = (piece) => editOverlay.open(piece);
  player.onEditExit = (piece) => editOverlay.commit(piece);

  const bots = [];
  const usedSkinIdx = new Set();
  for (let i = 0; i < botCount; i++) {
    let skinIdx;
    do { skinIdx = Math.floor(Math.random() * SKINS.length); } while (SKINS.length > botCount && usedSkinIdx.has(skinIdx) && usedSkinIdx.size < SKINS.length);
    usedSkinIdx.add(skinIdx);
    const bot = new Bot({ scene, skin: SKINS[skinIdx], world, combatSystem, seed: Math.floor(Math.random() * 1e9) });
    const spawn = lobby.getSpawnPoint(i + 1, botCount + 1);
    bot.position.copy(spawn);
    bot.mesh.position.copy(spawn);
    bots.push(bot);
    characters.push(bot);
  }

  const totalPlayers = 1 + botCount;

  input.setEnabled(true);
  hud.root.style.display = 'block';
  hud.setHealthShield(player.health, player.maxHealth, player.shield, player.maxShield);
  hud.setMaterials(player.inventory, buildSystem.tier);
  hud.setWeaponSlots(player.weaponSlots, player.activeSlot);
  hud.setBuildSlots(['wall', 'floor', 'ramp'], null);
  hud.setPlayersLeft(totalPlayers);

  player.onToast = (text) => hud.showToast(text);
  player.onFire = (kind) => {
    if (kind === 'hit') hud.showHitMarker();
    if (kind === 'damaged') hud.flashDamage(1);
  };
  player.onDeath = () => {
    if (match.ended) return;
    match.ended = true;
    endMatchTo(false, bots.filter((b) => !b.isDead).length + 1, totalPlayers);
  };

  match = {
    phase: 'lobby',
    terrain, props, poiManager, chests, pickups, storm, stormVisual, buildSystem, combatSystem,
    player, bots, characters, world, totalPlayers,
    lobby, bus: null, skydive: null,
    chestHold: { chest: null, timer: 0 },
    cinematic: null,
    combatTime: 0,
    survivalTimer: 0,
    ended: false,
  };
}

function endMatchTo(win, placement, total) {
  const kills = match.player.kills;
  const survivalSeconds = match.survivalTimer;
  menu.addBattlePassXp(computeMatchXp({ kills, survivalSeconds, won: win }));
  menu.recordMatchResult({ kills, won: win });

  input.setEnabled(false);
  document.exitPointerLock?.();
  hud.setLobbyCountdown(null);
  hud.setDropPromptVisible(false);
  hud.setChestProgress(null);
  hud.setInteractHint(null);
  audioManager.stopAll();
  if (win) audioManager.playVictoryFanfare();
  gameOverScreen.show(win, placement, total);
}

// ---------------------------------------------------------------------
// Phase 1: Lobby
// ---------------------------------------------------------------------
function updateLobbyPhase(dt) {
  const { player, lobby } = match;
  player.updateLobby(dt, lobby);
  const ready = lobby.update(dt);
  hud.setLobbyCountdown(lobby.countdown);
  hud.setHealthShield(player.health, player.maxHealth, player.shield, player.maxShield);
  if (ready) startBusPhase();
}

function startBusPhase() {
  match.lobby.dispose();
  match.lobby = null;
  match.phase = 'bus';
  hud.setLobbyCountdown(null);
  hud.setDropPromptVisible(true);
  audioManager.playBusDrone();

  const bus = new BusManager(scene, match.terrain.radius);
  match.bus = bus;

  for (const bot of match.bots) bot.mesh.visible = false;
}

// ---------------------------------------------------------------------
// Phase 2: The Battle Bus — free-look riding, no locked camera.
// ---------------------------------------------------------------------
function updateBusPhase(dt) {
  const { bus, player } = match;
  const reachedEdge = bus.update(dt);
  player.updateBusRide(dt, bus.getPosition());
  if (input.wasPressed('Space') || reachedEdge) {
    startSkydivePhase();
  }
}

function startSkydivePhase() {
  const bus = match.bus;
  const dropPos = bus.getPosition().clone().add(new THREE.Vector3(0, 1.5, 0));
  const dropVel = bus.getDropVelocity();

  match.skydive = new SkydiveManager(match.player, match.terrain);
  match.skydive.start(dropPos, dropVel);
  audioManager.playWindRush();

  for (const bot of match.bots) {
    bot.mesh.visible = true;
    bot.startDrop(dropPos, match.terrain, bot._rand, match.poiManager.pois);
  }

  bus.dispose();
  match.bus = null;
  match.phase = 'skydive';
  hud.setDropPromptVisible(false);
}

// ---------------------------------------------------------------------
// Phase 3: Skydiving & gliding
// ---------------------------------------------------------------------
function updateSkydivePhase(dt) {
  const landed = match.skydive.update(dt);
  for (const bot of match.bots) {
    if (bot.isDead) continue;
    bot.updateDrop(dt);
  }
  match.poiManager.update(match.player.position.y);
  hud.setHealthShield(match.player.health, match.player.maxHealth, match.player.shield, match.player.maxShield);
  if (landed) startCombatPhase();
}

function startCombatPhase() {
  match.skydive.dispose();
  match.skydive = null;
  match.player.velocity.set(0, 0, 0);
  match.phase = 'combat';
  match.combatTime = 0;
  audioManager.stopAll();
}

// ---------------------------------------------------------------------
// Phase 4: Combat (storm, building, bots, loot)
// ---------------------------------------------------------------------
function updateChestInteraction(dt) {
  const { player } = match;
  let nearestChest = null, nearestDist = 2.4;
  for (const chest of match.chests) {
    if (chest.opened) continue;
    const d = player.position.distanceTo(chest.mesh.position);
    if (d < nearestDist) { nearestChest = chest; nearestDist = d; }
  }

  if (!nearestChest) {
    match.chestHold.chest = null;
    match.chestHold.timer = 0;
    hud.setChestProgress(null);
    hud.setInteractHint(null);
    return;
  }

  if (input.isDown('KeyE')) {
    if (match.chestHold.chest !== nearestChest) {
      match.chestHold.chest = nearestChest;
      match.chestHold.timer = 0;
    }
    match.chestHold.timer += dt;
    hud.setInteractHint(null);
    hud.setChestProgress(Math.min(1, match.chestHold.timer / 1.5));

    if (match.chestHold.timer >= 1.5) {
      nearestChest.open();
      const drops = spawnChestLoot(nearestChest.mesh.position, Math.random);
      for (const p of drops) scene.add(p.mesh);
      match.pickups.push(...drops);
      hud.showToast('Supply chest opened!');
      match.chestHold.chest = null;
      match.chestHold.timer = 0;
      hud.setChestProgress(null);
    }
  } else {
    match.chestHold.chest = null;
    match.chestHold.timer = 0;
    hud.setChestProgress(null);
    hud.setInteractHint('Hold E to open supply chest');
  }
}

function updatePickups(dt) {
  const { player, pickups } = match;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.update(dt);
    if (player.position.distanceTo(pk.mesh.position) < 1.3) {
      if (pk.kind === 'weapon') {
        const got = player.pickupWeapon(pk.payload);
        if (got) hud.showToast(`Picked up ${RARITY_TIERS[pk.payload.rarity].name} ${pk.payload.name}`);
        else {
          player.addAmmo(pk.payload.ammoType, pk.payload.magSize);
          hud.showToast('Weapon slots full — converted to ammo');
        }
      } else if (pk.kind === 'ammo') {
        player.addAmmo(pk.payload.ammoType, pk.payload.amount);
        hud.showToast(`+${pk.payload.amount} ammo`);
      } else if (pk.kind === 'shield') {
        player.shield = Math.min(player.maxShield, player.shield + pk.payload.amount);
        hud.showToast(`+${pk.payload.amount} shield`);
      }
      scene.remove(pk.mesh);
      pickups.splice(i, 1);
    }
  }
}

function updateCombatPhase(dt) {
  const { player, bots, storm, stormVisual, buildSystem, combatSystem, terrain, characters } = match;
  if (player.isDead) return;

  match.combatTime += dt;
  match.survivalTimer += dt;
  const scavengeExpired = match.combatTime >= SCAVENGE_WINDOW_SECONDS;

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
  updateChestInteraction(dt);
  updatePickups(dt);
  match.poiManager.update(player.position.y);

  for (const bot of bots) {
    if (bot.isDead) continue;
    bot.update(dt, characters, scavengeExpired);
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
  hud.setBuildSlots(['wall', 'floor', 'ramp'], player.mode === 'build' ? player.buildType : null);
  hud.setPlayersLeft(bots.length + 1);
  if (storm.state === 'calm') hud.setStormTimer(`Storm closes in ${Math.ceil(storm.timeUntilShrink())}s`);
  else if (storm.state === 'shrinking') hud.setStormTimer('Storm is closing!');
  else hud.setStormTimer('Final circle');
  hud.drawMinimap({ playerPos: player.position, playerYaw: player.yaw, mapRadius: terrain.radius, storm, bots });

  if (bots.length === 0 && !match.ended) {
    match.phase = 'victory';
    match.cinematic = {
      t: 0, duration: 3.5,
      center: player.position.clone(), startAngle: player.yaw, radius: 6.5,
    };
  }
}

// ---------------------------------------------------------------------
// Victory Royale: freeze gameplay, slow orbiting camera, then the banner.
// ---------------------------------------------------------------------
function updateVictoryCinematic(dt) {
  const c = match.cinematic;
  c.t += dt * 0.4; // slow motion
  const frac = Math.min(1, c.t / c.duration);
  const angle = c.startAngle + frac * Math.PI * 1.2;
  const cx = c.center.x + Math.sin(angle) * c.radius;
  const cz = c.center.z + Math.cos(angle) * c.radius;
  camera.position.set(cx, c.center.y + 2.8, cz);
  camera.lookAt(c.center.x, c.center.y + 1.3, c.center.z);

  if (frac >= 1 && !match.ended) {
    match.ended = true;
    endMatchTo(true, 1, match.totalPlayers);
  }
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());

  if (!match) {
    renderer.render(scene, camera);
    return;
  }

  switch (match.phase) {
    case 'lobby': updateLobbyPhase(dt); break;
    case 'bus': updateBusPhase(dt); break;
    case 'skydive': updateSkydivePhase(dt); break;
    case 'combat': updateCombatPhase(dt); break;
    case 'victory': updateVictoryCinematic(dt); break;
  }
  hud.updateCompass(camera);
  input.endFrame();
  renderer.render(scene, camera);
}

const menu = new MenuTabs(app, { onPlay: (opts) => startMatch(opts), audioManager });

requestAnimationFrame(frame);
