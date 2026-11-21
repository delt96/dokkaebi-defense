// A top-down blast sized to a radius. Adapted from pixelfx's explosions/plasma-explosion
// (https://github.com/patch-gg/pixelfx, MIT), whose release is in turn adapted from Sprite Fusion's open-source
// energy (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
// Changes: a fire palette, the ball and shock ring scaled to `reach`, shorter, no tilted ring.
import { Particles, Lights, P, Rng, fit, flare, clamp, smooth, ease, noise, TAU, WHITE } from "pixelfx";

export const meta = {
  name: "Blast",
  desc: "A fireball punched out to the blast radius with a shock ring at its edge.",
  tags: ["explosion", "top-down"],
  size: [140, 140],
  origin: [70, 70],
  duration: 0.75,
  loop: false,
  fps: 24,
  bg: "dark",
  options: {
    palette: ["#2a0a08", "#6e1a10", "#c8361a", "#f47a24", "#ffc23c", "#fff07a", "#ffffff"],
    smoke: ["#1e1820", "#3a3038", "#5a4c50", "#7e6e6a"],
    reach: 48,
    seed: 7,
  },
};

const BALL = 0.42;

export function create(o) {
  const C = fit(o.palette, 7), S = fit(o.smoke, 4), R = new Rng(o.seed), reach = o.reach;
  const ps = new Particles({ rng: R, sparks: [C[6], C[5], C[4]] }), lights = new Lights();
  lights.add(0, 0, reach * 1.6, C[4], 1, 0.5);
  lights.add(0, 0, reach * 0.6, WHITE, 0.9, 0.12);
  for (let i = 0; i < 30; i++) {
    const a = R.range(0, TAU), sp = R.range(1.6, 3.2) * reach;
    ps.spawn(P.MOTE, Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.18, 0.34), R.pick([C[6], C[5], C[4]]), R.range(0.7, 1.1));
  }
  for (let i = 0; i < 10; i++) {
    const a = R.range(0, TAU), d = R.range(0.2, 0.6) * reach;
    ps.spawn(P.SMOKE, Math.cos(a) * d, Math.sin(a) * d, Math.cos(a) * 12, Math.sin(a) * 12 - 6, R.range(0.35, 0.55), S[R.int(1, 3)], R.range(0.8, 1.3), R.range(0.12, 0.25));
  }
  let t = 0;
  const shell = (tt) => 3 + reach * 0.5 * ease.outCubic(clamp(tt / BALL));
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      if (t < BALL) {
        const u = t / BALL, r = shell(t), hollow = smooth(0.4, 1, u), boil = Math.floor(t * 20);
        p.shade(-r - 3, -r - 3, r + 3, r + 3, (x, y, out) => {
          const d = Math.hypot(x, y), a = Math.atan2(y, x), edge = r * (1 + 0.12 * noise(a * 3 + boil * 0.7, 3));
          if (d > edge) return;
          const v = d / edge;
          if (v < hollow * 0.9) return;
          const n = noise(a * 4 + d * 0.3 + boil * 0.5, 5), w = v + n * 0.16;
          out.k = 0.3 * (1 - u);
          if (v > 0.88) return u < 0.5 ? C[3] : C[2];
          return w < 0.3 - u * 0.25 ? WHITE : w < 0.5 ? C[5] : w < 0.7 ? C[4] : w < 0.85 ? C[3] : C[2];
        });
        p.glow(0, 0, r * 1.5 + 4, C[4], 0.6 * (1 - u));
      }
      if (t < 0.06) p.circle(0, 0, 8 - t * 60, WHITE);
      if (t < 0.2) flare(p, 0, 0, reach * 0.9 * Math.pow(1 - t / 0.2, 1.3), 1 - t / 0.2, C);
      const u1 = t / 0.32;
      if (u1 < 1) {
        const rr = 6 + (reach - 6) * ease.outCubic(u1);
        p.ring(0, 0, rr, Math.max(1, 3 * (1 - u1)), u1 < 0.25 ? WHITE : C[5], 1.2 - u1 * 0.6);
        p.glowRing(0, 0, rr, 5, C[4], 0.4 * (1 - u1));
      } else if (t < 0.5) {
        // the edge holds a moment at the real radius
        p.ring(0, 0, reach, 1, C[4], clamp(1 - (t - 0.32) / 0.18) * 0.8);
      }
      ps.draw(p);
      lights.draw(p);
    },
  };
}
