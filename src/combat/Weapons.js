import { RARITY_TIERS, rollRarity } from './Rarity.js';

// Base weapon & tool definitions shared by the player and bots. Rarity is
// rolled independently of weapon type (see createWeaponInstance) — any gun
// can drop as Common through Legendary, matching the loot subsystem spec.
export const WEAPONS = {
  pickaxe: {
    id: 'pickaxe',
    name: 'Harvesting Tool',
    kind: 'melee',
    damage: 34,
    harvest: 22,
    range: 2.4,
    fireRate: 1.6, // swings per second
    isPickaxe: true,
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    kind: 'hitscan',
    damage: 22,
    range: 60,
    fireRate: 3.2,
    magSize: 12,
    reloadTime: 1.3,
    spread: 0.014,
    ammoType: 'light',
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    kind: 'hitscan',
    damage: 13,
    range: 40,
    fireRate: 9,
    magSize: 30,
    reloadTime: 1.7,
    spread: 0.032,
    ammoType: 'light',
    auto: true,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Pump Shotgun',
    kind: 'shotgun',
    damage: 16,
    pellets: 8,
    range: 18,
    fireRate: 1.1,
    magSize: 5,
    reloadTime: 2.4,
    spread: 0.095,
    ammoType: 'shell',
  },
  ar: {
    id: 'ar',
    name: 'Assault Rifle',
    kind: 'hitscan',
    damage: 24,
    range: 90,
    fireRate: 5.5,
    magSize: 30,
    reloadTime: 2.0,
    spread: 0.022,
    ammoType: 'medium',
    auto: true,
  },
  sniper: {
    id: 'sniper',
    name: 'Bolt-Action Sniper',
    kind: 'hitscan',
    damage: 95,
    range: 200,
    fireRate: 0.75,
    magSize: 5,
    reloadTime: 2.6,
    spread: 0.003,
    ammoType: 'heavy',
    scoped: true,
  },
};

export const LOOT_WEAPON_POOL = ['pistol', 'smg', 'shotgun', 'ar', 'sniper'];

// Builds a concrete weapon instance: base stats scaled by the rolled
// rarity's damage/spread multipliers, tagged with `rarity` for HUD color
// and full ammo for a fresh pickup.
export function createWeaponInstance(weaponId, rarity) {
  const def = WEAPONS[weaponId];
  const tier = RARITY_TIERS[rarity];
  return {
    ...def,
    rarity,
    damage: Math.round(def.damage * tier.damageMult * 10) / 10,
    spread: def.spread != null ? def.spread * tier.spreadMult : def.spread,
    mag: def.magSize,
    reserve: def.magSize * 2,
  };
}

// Rolls a random {weaponId, rarity} pair for chest/ground loot.
export function rollLootItem(rand = Math.random) {
  const weaponId = LOOT_WEAPON_POOL[Math.floor(rand() * LOOT_WEAPON_POOL.length)];
  const rarity = rollRarity(rand);
  return { weaponId, rarity };
}
