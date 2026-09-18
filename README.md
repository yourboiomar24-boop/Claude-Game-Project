# Battle Island

A browser-based, Fortnite-inspired battle royale built with Three.js: drop from a flying battle bus, skydive and glide in, then build, edit, loot, and fight bots down to a last-one-standing "Victory Royale" — all running client-side with no backend.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL, pick a skin, choose an opponent count, and click **Drop In**. Click the game canvas once to lock your mouse.

`npm run build` produces a static production build in `dist/` (deployable to any static host).

## Match flow

1. **Lobby** — a small isolated pre-game island. Wander for a 15-second countdown; weapons and the storm are inactive.
2. **Battle Bus** — the camera cinematically tracks a flying bus carrying everyone across the map. Press **Space** to jump (or ride until it reaches the far edge, which forces the drop).
3. **Skydive & Glide** — freefall with mouse look and WASD drift; a glider auto-deploys at altitude 25 and slows your descent until you touch down.
4. **Combat** — the real battle royale: loot, build, fight, and survive the shrinking storm until one player remains, capped off by a slow-motion Victory Royale camera sweep.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move / air-drift while skydiving |
| Mouse | Look / aim |
| Space | Jump / drop from the bus |
| Shift | Sprint |
| C | Crouch |
| Left click | Fire / swing pickaxe / place structure |
| Right click (hold) | Aim down sights |
| R | Reload |
| 1 | Pickaxe |
| 2–5 | Weapon slots (fill up as you collect chest drops) |
| 6–8 | Build: Wall / Floor / Ramp |
| T | Cycle build material tier (wood → brick → metal) |
| F | Freeze and open the 3×3 editor on the wall/floor you're aiming at; F again cuts the marked tiles |
| E (hold 1.5s) | Open a nearby supply chest |

## What's here

- **Full match flow**: lobby → battle bus → skydive/glide → combat, each its own module (`src/match/`)
- **Grid building**: a strict 4×4 voxel grid — walls, floors, and ramps only snap to the grid and must rest on terrain or an existing piece (no floating structures)
- **Piece editing**: press F to freeze and pop a real-cursor 3×3 grid over the targeted wall/floor; click tiles to mark them grey, press F again to cut them out of the mesh (doors/windows)
- **5-tier loot rarity**: Common/Uncommon/Rare/Epic/Legendary, each scaling weapon damage up and spread ("recoil") down, shown as a colored border on your hotbar
- **Chests**: hold E for 1.5 seconds (with a progress bar) to pop 3 floating pickups — a random-rarity weapon, matching ammo, and a shield potion — that auto-collect on walkover
- Hitscan weapons (pistol, SMG, shotgun, assault rifle, sniper) plus a pickaxe for harvesting wood/stone/metal and melee damage
- A shrinking storm with multiple phases and increasing damage (inactive until the combat phase begins)
- Bot opponents with a simple perception/combat/roam AI that loot, fight, flee the storm, and skydive in alongside you
- 8 selectable cosmetic skins with distinct colors, accessories, and rarities
- Full HUD: bottom-center health/shield, left-side inventory dock, right-side build & material dock, minimap, kill feed, and a Victory Royale cinematic

## Scope notes

This is a single-player experience — you fight AI bots, not other people online. Real-time networked multiplayer would require a dedicated server architecture and is out of scope for this project.
