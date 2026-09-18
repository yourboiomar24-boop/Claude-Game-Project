// Skin definitions: procedural (no external texture assets needed).
// Each skin tints the body/head/limb materials and can add an emissive
// "pattern" accent color plus a cosmetic accessory flag rendered by
// CharacterModel.

export const SKINS = [
  {
    id: 'recon-ranger',
    name: 'Recon Ranger',
    rarity: 'common',
    body: 0x3d5a3d,
    head: 0xd9b38c,
    limbs: 0x2f4a2f,
    accent: 0x8fae5a,
    accessory: 'none',
  },
  {
    id: 'crimson-strike',
    name: 'Crimson Strike',
    rarity: 'rare',
    body: 0x7a1f2b,
    head: 0xe0b090,
    limbs: 0x4a1017,
    accent: 0xff3b4a,
    accessory: 'shoulderPad',
  },
  {
    id: 'void-walker',
    name: 'Void Walker',
    rarity: 'epic',
    body: 0x1b1730,
    head: 0x2a2440,
    limbs: 0x120f24,
    accent: 0x8a5cff,
    accessory: 'hood',
    emissive: 0x6a3bff,
  },
  {
    id: 'golden-champion',
    name: 'Golden Champion',
    rarity: 'legendary',
    body: 0xd4af37,
    head: 0xe8c79a,
    limbs: 0xb8860b,
    accent: 0xfff2b0,
    accessory: 'cape',
    emissive: 0xffd700,
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    rarity: 'rare',
    body: 0xdfeffb,
    head: 0xcfe8f5,
    limbs: 0xa9cfe6,
    accent: 0x5bc8ff,
    accessory: 'none',
  },
  {
    id: 'toxic-scrapper',
    name: 'Toxic Scrapper',
    rarity: 'epic',
    body: 0x2f3b1a,
    head: 0xb7c98a,
    limbs: 0x1c2410,
    accent: 0xaaff33,
    accessory: 'shoulderPad',
    emissive: 0x66ff00,
  },
  {
    id: 'shadow-agent',
    name: 'Shadow Agent',
    rarity: 'common',
    body: 0x22242b,
    head: 0x3a3d47,
    limbs: 0x16171c,
    accent: 0x5a5f6e,
    accessory: 'none',
  },
  {
    id: 'inferno-lord',
    name: 'Inferno Lord',
    rarity: 'legendary',
    body: 0x2b1210,
    head: 0x4a1f16,
    limbs: 0x190a08,
    accent: 0xff6a1a,
    accessory: 'cape',
    emissive: 0xff4400,
  },
];

export const RARITY_COLORS = {
  common: '#b0b3b8',
  rare: '#4fa8ff',
  epic: '#b74fff',
  legendary: '#ff9d2f',
};

export function getSkinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}
