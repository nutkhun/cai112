// Blackhole Timer — the eclipse dial and the starfield, drawn on <canvas>.
// A port of the Mac app's EclipseView, ColorTemperature and StarfieldView.
(() => {
  'use strict';

  const TAU = Math.PI * 2;

  function hash(x) {
    const v = Math.sin(x * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }
  const fract = (x) => x - Math.floor(x);
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  // Smooth, wandering value in roughly 0…1.
  const noise = (x) => 0.5 + 0.5 * (0.6 * Math.sin(x) + 0.4 * Math.sin(x * 1.618 + 1.3));

  function rgba([r, g, b], a) {
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${clamp01(a)})`;
  }

  function disc(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0.01), 0, TAU);
  }

  /** Fills a circle with a radial gradient; stops are [location, rgb, alpha]. */
  function radial(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(r, 0.01));
    for (const [at, rgb, a] of stops) g.addColorStop(clamp01(at), rgba(rgb, a));
    ctx.fillStyle = g;
    disc(ctx, x, y, r);
    ctx.fill();
  }

  // MARK: Colour temperature — icy blues at the start, through cyan, violet and amber, to red.

  const RIM = [[0, [0.92, 0.96, 1]], [0.6, [1, 0.95, 0.92]], [0.8, [1, 0.88, 0.75]], [1, [1, 0.78, 0.7]]];
  const INNER = [[0, [0.8, 0.88, 1]], [0.35, [0.55, 0.85, 0.95]], [0.6, [0.78, 0.62, 1]],
                 [0.8, [1, 0.62, 0.35]], [1, [1, 0.25, 0.18]]];
  const OUTER = [[0, [0.12, 0.3, 0.85]], [0.35, [0.1, 0.45, 0.7]], [0.6, [0.42, 0.22, 0.85]],
                 [0.8, [0.75, 0.18, 0.45]], [1, [0.65, 0.05, 0.12]]];

  function sample(stops, t) {
    const x = clamp01(t);
    let i = stops.findIndex(([at]) => at >= x);
    if (i === -1) return stops[stops.length - 1][1];
    if (i === 0) return stops[0][1];
    const [a0, c0] = stops[i - 1];
    const [a1, c1] = stops[i];
    const f = (x - a0) / (a1 - a0);
    const s = f * f * (3 - 2 * f);
    return c0.map((v, k) => v + (c1[k] - v) * s);
  }

  function desaturate(rgb, amount) {
    const grey = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) * 0.8;
    return rgb.map((c) => c + (grey - c) * amount);
  }

  /** Eclipse colours at a point in the countdown (0 = just started, 1 = time's up). */
  function palette(elapsed, desat = 0) {
    const d = (rgb) => desaturate(rgb, desat);
    return {
      rim: d(sample(RIM, elapsed)),
      warm: d(sample(INNER, elapsed)),
      cool: d(sample(OUTER, elapsed)),
      aura: d(sample(INNER, elapsed + 0.15)),
    };
  }

  // MARK: Eclipse

  /**
   * Draws the eclipse into a square canvas of `size` CSS pixels.
   * o: { time, wavePhase, breathPhase, progress (1 → 0), palette, intensity, marks: [{minutes, fraction}] }
   */
  function drawEclipse(ctx, size, o) {
    const c = size / 2;
    const radius = size * 0.24;
    const t = o.time;
    const pal = o.palette;
    const k = o.intensity;
    const breath = 0.5 + 0.5 * Math.sin(o.breathPhase);
    const lightAngle = -Math.PI / 2 + 0.35 * Math.sin(t * 0.17);
    const litX = c + Math.cos(lightAngle) * radius * 0.12;
    const litY = c + Math.sin(lightAngle) * radius * 0.12;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1. Cool outer corona, gently lopsided in a slowly turning direction.
    const squash = 0.07 + 0.05 * Math.sin(t * 0.11);
    ctx.save();
    ctx.translate(litX, litY);
    ctx.rotate(t * 0.03);
    ctx.scale(1 + squash, 1 - squash * 0.6);
    ctx.translate(-litX, -litY);
    radial(ctx, litX, litY, radius * (1.86 + 0.06 * breath), [
      [0.42, pal.cool, 0], [0.6, pal.cool, 0.5 * k], [0.8, pal.cool, 0.18 * k], [1, pal.cool, 0],
    ]);
    ctx.restore();

    // 2. Spreading aura: each wave gets its own random direction, lean and strength.
    for (let w = 0; w < 3; w++) {
      const position = o.wavePhase + w / 3;
      const cycle = Math.floor(position);
      const p = position - cycle;
      const seed = cycle * 3 + w;
      const direction = hash(seed) * TAU;
      const lean = 0.35 + 0.5 * hash(seed + 17.3);
      const strength = 0.55 + 0.45 * hash(seed + 41.7);
      const shift = radius * lean * 0.35 * p;
      const wx = c + Math.cos(direction) * shift;
      const wy = c + Math.sin(direction) * shift;
      const r = radius * (1 + 0.85 * p);
      const width = radius * (0.1 + 0.25 * p);
      const outer = r + width;
      const fade = Math.pow(1 - p, 1.6) * 0.42 * strength * k;

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(direction);
      ctx.scale(1 + 0.18 * lean * p, 1 - 0.1 * lean * p);
      ctx.translate(-wx, -wy);
      for (const [rgb, weight] of [[pal.aura, 1 - p], [pal.cool, p]]) {
        radial(ctx, wx, wy, outer, [
          [Math.max(0, (r - width) / outer), rgb, 0], [r / outer, rgb, fade * weight], [1, rgb, 0],
        ]);
      }
      ctx.restore();
    }

    // Flares: soft plumes that swell and fade at drifting points around the rim.
    for (let i = 0; i < 4; i++) {
      const drift = i % 2 === 0 ? 1 : -1;
      const angle = i * 1.7 + 0.3 * Math.sin(t * 0.05 + i) + t * 0.02 * drift;
      const swell = noise(o.breathPhase * 0.35 + i * 2.3);
      const reach = radius * (1.1 + 0.35 * swell);
      const px = c + Math.cos(angle) * reach;
      const py = c + Math.sin(angle) * reach;
      const rgb = i % 2 === 0 ? pal.aura : pal.cool;
      radial(ctx, px, py, radius * (0.45 + 0.25 * swell), [[0, rgb, 0.28 * swell * k], [1, rgb, 0]]);
    }

    // 3. Warm inner corona hugging the rim.
    radial(ctx, litX, litY, radius * (1.45 + 0.05 * breath), [
      [0.55, pal.warm, 0], [0.68, pal.rim, 0.75 * k], [0.78, pal.warm, 0.5 * k], [1, pal.warm, 0],
    ]);

    ctx.restore();

    // 4. The black disc.
    radial(ctx, c, c, radius, [[0, [0, 0, 0], 1], [0.66, [0, 0, 0], 1], [1, [0.07, 0.05, 0.03], 1]]);

    // 5. Rim: faint all the way round, bright for the time remaining (clockwise from 12).
    const shown = clamp01(o.progress);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(pal.rim, 0.16 * k);
    ctx.lineWidth = 1;
    disc(ctx, c, c, radius);
    ctx.stroke();

    if (shown > 0) {
      const start = -Math.PI / 2;
      const end = start + shown * TAU;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(pal.rim, 0.2 * k);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(c, c, radius, start, end);
      ctx.stroke();
      ctx.restore();

      const g = ctx.createLinearGradient(c, c - radius, c, c + radius);
      g.addColorStop(0, rgba(pal.rim, k));
      g.addColorStop(1, rgba(pal.warm, 0.7 * k));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(c, c, radius, start, end);
      ctx.stroke();

      ctx.strokeStyle = rgba(pal.rim, 0.35 * k);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(c, c, radius * 0.975, start, end);
      ctx.stroke();

      // Spark at the leading edge.
      if (shown < 1) {
        const sx = c + Math.cos(end) * radius;
        const sy = c + Math.sin(end) * radius;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, sx, sy, 11, [[0, pal.rim, 0.9 * k], [1, pal.warm, 0]]);
        ctx.restore();
        ctx.fillStyle = `rgba(255,255,255,${k})`;
        disc(ctx, sx, sy, 1.6);
        ctx.fill();
      }
    }

    // Small ▾ marker at 12 o'clock, just inside the rim.
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(c - 4, c - radius + 6);
    ctx.lineTo(c + 4, c - radius + 6);
    ctx.lineTo(c, c - radius + 12);
    ctx.closePath();
    ctx.fill();

    // Reminder times: a dot on the rim and a label outside it; faded once passed.
    ctx.font = '600 11px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const mark of o.marks || []) {
      const angle = -Math.PI / 2 + mark.fraction * TAU;
      const upcoming = mark.fraction < o.progress;
      ctx.fillStyle = upcoming ? '#fff' : 'rgba(255,255,255,0.25)';
      disc(ctx, c + Math.cos(angle) * radius, c + Math.sin(angle) * radius, 2);
      ctx.fill();
      ctx.fillStyle = upcoming ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(`${mark.minutes}m`, c + Math.cos(angle) * radius * 1.3, c + Math.sin(angle) * radius * 1.3);
      ctx.shadowBlur = 0;
    }
  }

  // MARK: Starfield

  const STAR_COUNT = 320;
  const NEBULAE = [
    { x: 0.8, y: 0.55, r: 0.55, stretch: 1.8, tilt: -0.9, a: 0.16, rgb: [0.55, 0.32, 0.75] },
    { x: 0.25, y: 0.75, r: 0.6, stretch: 2.0, tilt: -0.5, a: 0.14, rgb: [0.25, 0.32, 0.72] },
    { x: 0.15, y: 0.2, r: 0.45, stretch: 1.5, tilt: 0.6, a: 0.1, rgb: [0.3, 0.4, 0.8] },
    { x: 0.65, y: 0.15, r: 0.4, stretch: 1.6, tilt: 0.3, a: 0.1, rgb: [0.6, 0.35, 0.7] },
    { x: 0.5, y: 0.95, r: 0.5, stretch: 2.2, tilt: -0.2, a: 0.12, rgb: [0.4, 0.3, 0.75] },
  ];

  function starTint(s) {
    const h = hash(s * 7.7);
    if (h < 0.15) return [0.72, 0.85, 1];
    if (h < 0.22) return [1, 0.78, 0.55];
    return [1, 1, 1];
  }

  /**
   * Deep space: nebula clouds and stars flying towards us from their own spots across the
   * window, faster as `speed` rises. `hole` (0 → 1) is the black hole pulling them in.
   */
  function drawStars(ctx, w, h, o) {
    const { center, time: t, travel, speed, hole } = o;
    const unit = Math.min(w, h);
    const pull = hole * hole * (3 - 2 * hole);

    ctx.clearRect(0, 0, w, h);

    // Nebula clouds.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    NEBULAE.forEach((n, i) => {
      const cx = w * (n.x + 0.03 * Math.sin(t * 0.02 + i * 1.9));
      const cy = h * (n.y + 0.03 * Math.cos(t * 0.017 + i * 1.9));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(n.tilt);
      ctx.scale(n.stretch, 1);
      ctx.translate(-cx, -cy);
      radial(ctx, cx, cy, unit * n.r, [[0, n.rgb, n.a], [1, n.rgb, 0]]);
      ctx.restore();
    });
    ctx.restore();

    ctx.lineCap = 'round';
    for (let i = 0; i < STAR_COUNT; i++) {
      // Each star flies towards us from its own spot (spread over the window): it moves out
      // from the centre, faster as it nears (1× → 4×), then starts again far away.
      const ax = (hash(i * 1.31) * 1.1 - 0.05) * w - center.x;
      const ay = (hash(i * 2.71) * 1.1 - 0.05) * h - center.y;
      const pace = 0.6 + 0.8 * hash(i * 3.37);
      const cycle = fract(hash(i * 4.13) + travel * pace);
      const at = (cc) => {
        const zoom = 1 / (1 - 0.75 * cc);
        return [center.x + ax * zoom, center.y + ay * zoom];
      };
      let [px, py] = at(cycle);
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;

      const sizeRoll = hash(i * 5.17);
      let radius = (0.35 + 1.5 * Math.pow(sizeRoll, 3)) * (1 + 0.5 * cycle);
      const fadeIn = Math.min(cycle / 0.12, 1);
      let alpha = (0.35 + 0.65 * hash(i * 6.29)) * fadeIn
        * (0.7 + 0.3 * Math.sin(t * (0.8 + 1.6 * hash(i * 8.1)) + i * 2.3));
      let [tx, ty] = at(Math.max(cycle - speed * pace * 0.25, 0));

      // Black hole: each star falls in with its own delay, spiralling faster.
      if (pull > 0) {
        const dx = px - center.x, dy = py - center.y;
        const r = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const delay = hash(i * 5.97) * 0.45;
        const kk = clamp01((pull - delay) / 0.55);
        const swirl = 2.5 + 3.5 * hash(i * 9.3);
        const fall = kk * kk;
        const before = Math.max(0, kk - 0.06) ** 2;
        px = center.x + Math.cos(angle + fall * swirl) * r * (1 - fall);
        py = center.y + Math.sin(angle + fall * swirl) * r * (1 - fall);
        tx = center.x + Math.cos(angle + before * swirl) * r * (1 - before);
        ty = center.y + Math.sin(angle + before * swirl) * r * (1 - before);
        alpha *= 1 - 0.6 * fall;
        radius *= 1 - 0.5 * fall;
        if (r * (1 - fall) < unit * 0.02) continue;
      }

      const rgb = starTint(i);
      if (Math.hypot(px - tx, py - ty) > 1.2) {
        const g = ctx.createLinearGradient(tx, ty, px, py);
        g.addColorStop(0, rgba(rgb, 0));
        g.addColorStop(1, rgba(rgb, alpha));
        ctx.strokeStyle = g;
        ctx.lineWidth = radius * 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(rgb, alpha);
        disc(ctx, px, py, radius);
        ctx.fill();
      }

      // A few bright stars sparkle: a soft glow and cross-shaped glints.
      if (sizeRoll > 0.965) {
        const glint = radius * 6 * (0.8 + 0.2 * Math.sin(t * 1.3 + i));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, px, py, radius * 4, [[0, rgb, 0.5 * alpha], [1, rgb, 0]]);
        ctx.strokeStyle = rgba(rgb, 0.6 * alpha);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(px - glint, py); ctx.lineTo(px + glint, py);
        ctx.moveTo(px, py - glint); ctx.lineTo(px, py + glint);
        ctx.stroke();
        ctx.restore();
      }
    }

    // The accretion glow flares while the stars fall in, then everything goes dark.
    if (hole > 0) {
      const flare = Math.sin(Math.PI * Math.min(hole * 1.2, 1));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, center.x, center.y, unit * 0.38, [
        [0.6, [1, 0.55, 0.25], 0], [0.75, [1, 0.55, 0.25], 0.45 * flare], [1, [1, 0.55, 0.25], 0],
      ]);
      ctx.restore();
      ctx.fillStyle = `rgba(0,0,0,${0.7 * pull})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** A soft aurora (for behind the setup digits). */
  function drawAurora(ctx, size, time) {
    const c = size / 2;
    const radius = size * 0.38;
    const colors = [[0.95, 0.68, 0.36], [0.36, 0.62, 0.98], [0.12, 0.25, 0.72], [0.97, 0.53, 0.33]];
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    colors.forEach((rgb, i) => {
      const angle = time * 0.2 + i * Math.PI / 2;
      const x = c + Math.cos(angle) * radius * 0.55;
      const y = c + Math.sin(angle) * radius * 0.55;
      radial(ctx, x, y, radius * 0.95, [[0, rgb, 0.21], [1, rgb, 0]]);
    });
    ctx.restore();
  }

  window.Visuals = { palette, drawEclipse, drawStars, drawAurora, rgba };
})();
