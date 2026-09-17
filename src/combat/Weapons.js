// Weapon & tool definitions shared by the player and bots.
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
    spread: 0.012,
    ammoType: 'light',
    rarity: 'common',
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
    spread: 0.03,
    ammoType: 'light',
    rarity: 'rare',
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
    spread: 0.09,
    ammoType: 'shell',
    rarity: 'epic',
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
    spread: 0.02,
    ammoType: 'medium',
    rarity: 'rare',
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
    spread: 0.002,
    ammoType: 'heavy',
    rarity: 'legendary',
    scoped: true,
  },
};

export const LOOT_WEAPON_POOL = ['pistol', 'smg', 'shotgun', 'ar', 'sniper'];

export const RARITY_WEIGHTS = { common: 40, rare: 30, epic: 20, legendary: 10 };

export function rollLootWeapon(rand = Math.random) {
  const total = LOOT_WEAPON_POOL.reduce((sum, id) => sum + RARITY_WEIGHTS[WEAPONS[id].rarity], 0);
  let r = rand() * total;
  for (const id of LOOT_WEAPON_POOL) {
    r -= RARITY_WEIGHTS[WEAPONS[id].rarity];
    if (r <= 0) return id;
  }
  return LOOT_WEAPON_POOL[0];
}
