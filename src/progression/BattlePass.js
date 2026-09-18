// A 10-tier Battle Pass progression track, persisted in localStorage so
// progress survives across sessions. XP is awarded for eliminations and
// survival time at the end of each match (see main.js).
const STORAGE_KEY = 'br-battlepass-v1';
const XP_PER_TIER = 500;
const TIER_COUNT = 10;

const TIER_REWARDS = [
  'Spray: Storm Sigil',
  'Pickaxe Skin: Rustbreaker',
  'Emote: Victory Point',
  'Banner Icon: Falcon Crest',
  'Contrail: Ember Trail',
  'Glider Wrap: Stormrider',
  'Weapon Wrap: Toxic Bloom',
  'Emote: Storm Dance',
  'Loading Screen: Last Circle',
  'Legendary Skin Style',
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupted storage */ }
  return { xp: 0 };
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export class BattlePass {
  constructor() {
    this.state = load();
  }

  get totalXp() { return this.state.xp; }
  get tier() { return Math.min(TIER_COUNT, Math.floor(this.state.xp / XP_PER_TIER)); }
  get xpIntoTier() { return this.state.xp % XP_PER_TIER; }
  get xpForNextTier() { return XP_PER_TIER; }

  addXp(amount) {
    const beforeTier = this.tier;
    this.state.xp = Math.max(0, this.state.xp + amount);
    save(this.state);
    return this.tier > beforeTier; // true if a new tier was just unlocked
  }

  getTiers() {
    const currentTier = this.tier;
    return TIER_REWARDS.map((reward, i) => ({
      tier: i + 1,
      reward,
      unlocked: i + 1 <= currentTier,
    }));
  }
}

// XP awarded for a completed match.
export function computeMatchXp({ kills, survivalSeconds, won }) {
  let xp = kills * 60;
  xp += Math.floor(survivalSeconds) * 1.5;
  if (won) xp += 400;
  return Math.round(xp);
}
