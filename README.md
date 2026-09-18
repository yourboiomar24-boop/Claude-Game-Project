# Battle Island

A browser-based, Fortnite-inspired battle royale built with Three.js: a full out-of-game dashboard, procedural audio, a free-look battle bus, procedural landmarks, a live radar, and a smart bot FSM — drop in, build, edit, loot, and fight down to a last-one-standing "Victory Royale," all running client-side with no backend.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL. From the dashboard, check your **Battle Pass**, pick a skin in the **Locker**, preview the **Map**, then head to **Play** to drop in. Click the game canvas once to lock your mouse.

`npm run build` produces a static production build in `dist/` (deployable to any static host).

## Match flow

1. **Lobby** — a small isolated pre-game island. Wander for a 15-second countdown; weapons and the storm are inactive.
2. **Battle Bus** — full free-look (pointer lock) while the bus flies a fixed route across the map; use the compass to get your bearings, then press **Space** to jump (or ride until it reaches the far edge, which forces the drop).
3. **Skydive & Glide** — freefall with mouse look and WASD drift; a glider auto-deploys at altitude 25 and slows your descent. Landmark titles fade in as you approach and out as you near the ground.
4. **Combat** — the real battle royale: loot, build, fight, and survive the shrinking storm until one player remains, capped off by a slow-motion Victory Royale camera sweep. Bots spend the first 30 seconds scavenging before they'll fight back.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move / air-drift while skydiving |
| Mouse | Look / aim (free 360° look on the bus, too) |
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

The **Fullscreen** button (top-left of the HUD) toggles fullscreen; the viewport reflows cleanly on any resize or fullscreen change.

## What's here

- **Lobby dashboard**: a tabbed out-of-game menu (Lobby / Battle Pass / Locker / Map / Play) with match stats, a 10-tier Battle Pass that earns XP from eliminations and survival time, a Locker with 8 skins and a live rotating 3D preview, and a Map tab previewing the island's landmarks
- **Procedural audio**: every sound is synthesized live with the Web Audio API (no asset files) — a looping chiptune menu theme, a battle-bus engine drone, a skydiving wind rush, and a victory fanfare
- **Free-look battle bus**: full pointer-lock mouse look while riding (no locked camera), plus a sliding HUD compass showing your heading
- **Procedural POI landmarks**: Tilted Towers (a cluster of windowed tower blocks), Salty Springs (scattered houses), and Retail Row (a strip of warehouses stocked with chests) — each with a floating title that fades as you glide in
- **Radar HUD**: a circular minimap showing your facing arrow, nearby bots, and the glowing purple shrinking storm wall
- **Grid building**: a strict 4×4 voxel grid — walls, floors, and ramps only snap to the grid and must rest on terrain or an existing piece (no floating structures)
- **Piece editing**: press F to freeze and pop a real-cursor 3×3 grid over the targeted wall/floor; click tiles to mark them grey, press F again to cut them out of the mesh (doors/windows)
- **Smart bot AI**: a real finite-state machine — bots land near a landmark, spend a 30-second scavenging window looting chests/ground pickups for weapons and materials (peaceful unless shot at), only engage once armed and the window expires (with human-like reaction and reload delays and terrain/wall-blocked line of sight), and immediately throw up 1–2 defensive walls facing an attacker when hit
- **5-tier loot rarity**: Common/Uncommon/Rare/Epic/Legendary, each scaling weapon damage up and spread ("recoil") down, shown as a colored border on your hotbar
- Hitscan weapons (pistol, SMG, shotgun, assault rifle, sniper) plus a pickaxe for harvesting wood/stone/metal and melee damage
- A shrinking storm with multiple phases and increasing damage (inactive until the combat phase begins)
- Full HUD: bottom-center health/shield, left-side inventory dock, right-side build & material dock, kill feed, and a Victory Royale cinematic

## Scope notes

This is a single-player experience — you fight AI bots, not other people online. Real-time networked multiplayer would require a dedicated server architecture and is out of scope for this project.
