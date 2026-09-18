// Shared building constants — the world uses a fixed 4m voxel grid,
// Fortnite-style: pieces snap to grid cells regardless of terrain slope.
export const TILE = 4;
export const WALL_THICKNESS = 0.25;
export const SEG = TILE / 3; // 3x3 edit-segment size

export const MATERIAL_TIERS = {
  wood: { name: 'Wood', hp: 150, color: 0x8a5a2f, cost: 10 },
  brick: { name: 'Brick', hp: 250, color: 0x9a9a92, cost: 10 },
  metal: { name: 'Metal', hp: 400, color: 0xaeb6bd, cost: 10 },
};

export const RESOURCE_FOR_TIER = { wood: 'wood', brick: 'stone', metal: 'metal' };

export const PIECE_COST = 10;

export function snapToGrid(v) {
  return Math.round(v / TILE);
}
