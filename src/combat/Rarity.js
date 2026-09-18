// The 5-tier weapon rarity ladder. Higher tiers hit harder and are more
// accurate (less spread == less "recoil" in our hitscan model).
export const RARITY_TIERS = {
  common: { name: 'Common', color: 0x9e9e9e, weight: 45, damageMult: 1.0, spreadMult: 1.3 },
  uncommon: { name: 'Uncommon', color: 0x2ecc71, weight: 28, damageMult: 1.12, spreadMult: 1.1 },
  rare: { name: 'Rare', color: 0x3b82f6, weight: 16, damageMult: 1.26, spreadMult: 0.92 },
  epic: { name: 'Epic', color: 0xa855f7, weight: 8, damageMult: 1.42, spreadMult: 0.75 },
  legendary: { name: 'Legendary', color: 0xffd700, weight: 3, damageMult: 1.6, spreadMult: 0.6 },
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export function rollRarity(rand = Math.random) {
  const total = RARITY_ORDER.reduce((sum, k) => sum + RARITY_TIERS[k].weight, 0);
  let r = rand() * total;
  for (const key of RARITY_ORDER) {
    r -= RARITY_TIERS[key].weight;
    if (r <= 0) return key;
  }
  return 'common';
}

export function rarityColorCSS(key) {
  return `#${RARITY_TIERS[key].color.toString(16).padStart(6, '0')}`;
}
