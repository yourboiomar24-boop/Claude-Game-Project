# Battle Island

A browser-based, Fortnite-inspired battle royale built with Three.js: build, edit, loot, and fight bots down to a last-one-standing "Victory Royale," all running client-side with no backend.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL, pick a skin, choose an opponent count, and click **Drop In**. Click the game canvas once to lock your mouse.

`npm run build` produces a static production build in `dist/` (deployable to any static host).

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look / aim |
| Space | Jump |
| Shift | Sprint |
| C | Crouch |
| Left click | Fire / swing pickaxe / place structure / toggle edit segment |
| Right click (hold) | Aim down sights |
| R | Reload |
| 1 | Pickaxe |
| 2–5 | Weapon slots (fill up as you loot chests) |
| 6–9 | Build: Wall / Floor / Ramp / Roof |
| T | Cycle build material tier (wood → brick → metal) |
| F | Toggle edit mode on the structure piece you're aiming at |
| 1–4 (while editing) | Apply edit preset: Full / Window / Door / Clear |
| E | Open a nearby supply chest |

## What's here

- Procedural island terrain with trees, rock/metal resource nodes, and 40+ loot chests
- A voxel-grid building system (walls, floors, ramps, roofs) with a Fortnite-style 3×3 segment editor for cutting windows/doors into placed pieces
- Hitscan weapons (pistol, SMG, shotgun, assault rifle, sniper) plus a pickaxe for harvesting wood/stone/metal and melee damage
- A shrinking storm with multiple phases and increasing damage
- Bot opponents with a simple perception/combat/roam AI that loot, fight, and flee the storm
- 8 selectable cosmetic skins with distinct colors, accessories, and rarities
- Full HUD: health/shield, materials, weapon & build hotbars, minimap, kill feed, and victory/elimination screens

## Scope notes

This is a single-player experience — you fight AI bots, not other people online. Real-time networked multiplayer would require a dedicated server architecture and is out of scope for this project.
