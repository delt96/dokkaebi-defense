# Third-party code and assets

## pixelfx

Combat and skill effects are baked from **pixelfx** v0.3.1 (https://github.com/patch-gg/pixelfx), pinned at commit
`5294518ce7c72e48b6100a744596e0acf57f2826`. MIT License, Copyright (c) 2026 Patch.

- `packages/client/scripts/bake-fx.mjs` renders pixelfx effects into `packages/client/public/fx/*.png|json`
  (`npm run bake:fx -w @dorandi/client`). The game loads only those sheets; pixelfx code is not bundled.
- `packages/client/scripts/fx-src/blast.js` is adapted from pixelfx's `explosions/plasma-explosion`, whose release is
  adapted from Sprite Fusion's open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx),
  MIT License, Copyright (c) 2026 Hugo Duprez.
- `packages/client/scripts/fx-src/ring-burst.js` is our own effect written against the pixelfx core API.
- The stun and frost sheets are pixelfx's `status/stunned` and `status/frozen` regenerated against our enemy sprites.

The Patch Pixel font in pixelfx's `gallery/fonts` is not covered by its MIT license and is not used or shipped here.
