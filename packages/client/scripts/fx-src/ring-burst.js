// A top-down area ring for the lane, written against pixelfx's core (https://github.com/patch-gg/pixelfx, MIT):
// a pop at the centre, a shock ring that runs out to exactly `reach` px and holds there for a beat so the
// player reads the real radius, glints thrown off its edge, and (for frost) snowflakes drifting out.
import { Particles, P, Rng, fit, sparkle, ease, clamp, TAU, WHITE } from "pixelfx";

export const meta = {
  name: "Ring burst",
  desc: "Top-down shock ring that stops at the skill's real radius.",
  tags: ["ring", "area", "top-down"],
  size: [120, 120],
  origin: [60, 60],
  duration: 0.6,
  loop: false,
  fps: 24,
  bg: "dark",
  options: {
    palette: ["#202028", "#4a4a58", "#7a7a8c", "#a8a8b8", "#d4d4e0", "#f0f0f8", "#ffffff"],
    reach: 40,
    flakes: 0,
    seed: 5,
  },
};

const RUN = 0.26;
const HOLD = 0.18;

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), reach = o.reach;
  const ps = new Particles({ rng: R, sparks: [C[6], C[5], C[4]] });
  for (let i = 0; i < o.flakes; i++) {
    const a = R.range(0, TAU), sp = R.range(0.5, 1.1) * reach * 2.2;
    ps.spawn(P.FLAKE, Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.35, 0.55), R.pick([C[6], C[5], WHITE]), R.range(0.8, 1.4));
  }
  let t = 0, thrown = false;
  return {
    update(dt) {
      t += dt;
      if (!thrown && t >= RUN * 0.8) {
        thrown = true;
        const n = Math.round(8 + reach / 5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + R.range(-0.2, 0.2), sp = R.range(14, 34);
          ps.spawn(P.STAR, Math.cos(a) * reach, Math.sin(a) * reach, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.18, 0.32), R.pick([C[6], C[5], WHITE]), R.range(0.6, 1.2));
        }
      }
      ps.update(dt);
    },
    draw(p) {
      if (t < 0.08) {
        p.circle(0, 0, 6 - t * 50, WHITE);
        sparkle(p, 0, 0, 9 * (1 - t / 0.08), WHITE, C[5], 0.6);
      }
      const u = clamp(t / RUN), r = 3 + (reach - 3) * ease.outCubic(u);
      const fade = t < RUN ? 1 : clamp(1 - (t - RUN) / HOLD);
      if (fade > 0) {
        // a faint wash over the area, the ring itself, and a softer one trailing inside it
        p.disc(0, 0, r, C[3], 0.12 * fade);
        p.ring(0, 0, r, Math.max(1, 2.5 * (1 - u) + 1), u < 0.3 ? WHITE : C[6], fade);
        p.glowRing(0, 0, r, 4, C[4], 0.4 * fade);
        if (u > 0.15) p.ring(0, 0, r * 0.62, 1, C[4], 0.7 * fade * (1 - u * 0.5));
      }
      ps.draw(p);
    },
  };
}
