// core.js — convierte una imagen en un patrón de punto de cruz con hilos DMC.
// Sin dependencias: corre igual en el navegador y en Node (para las pruebas).
(function () {
  "use strict";
  const EMPTY = -1;

  // ---------- color ----------
  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  // RGB lineal (0..1) -> CIELAB
  function linToLab(R, G, B) {
    const x = f((R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047);
    const y = f(R * 0.2126729 + G * 0.7151522 + B * 0.072175);
    const z = f((R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const rgbToLab = (r, g, b) => linToLab(LIN[r], LIN[g], LIN[b]);

  // CIEDE2000: la distancia que mejor se parece a lo que ve el ojo.
  function de2000(l1, l2, kL = 1, kC = 1) {
    const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) / rad + 360) % 360;
    const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) / rad + 360) % 360;
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
    let hpm = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360;
      hpm /= 2;
    }
    const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) +
      0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
    const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
    const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
    const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
    const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt((dLp / (kL * Sl)) ** 2 + (dCp / (kC * Sc)) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / (kC * Sc)) * (dHp / Sh));
  }

  // ---------- carta DMC ----------
  let THREADS = null, DIST = null; // DIST: matriz CIEDE2000 entre hilos, se calcula una vez
  function threads() {
    if (THREADS) return THREADS;
    THREADS = globalThis.DMC.map(([code, name, r, g, b]) => ({ code, name, rgb: [r, g, b], lab: rgbToLab(r, g, b) }));
    const n = THREADS.length;
    DIST = new Float32Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) DIST[i * n + j] = DIST[j * n + i] = de2000(THREADS[i].lab, THREADS[j].lab);
    return THREADS;
  }
  const dist = (i, j) => DIST[i * THREADS.length + j];

  // Lab de cada píxel: se calcula una vez por imagen (al mover los controles no se repite).
  const PIX = new WeakMap();
  function pixelLab(img) {
    let p = PIX.get(img);
    if (p) return p;
    const { width: w, height: h, data } = img, n = w * h;
    p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (data[i * 4 + 3] < 128) { p[i * 3] = NaN; continue; }
      const L = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      p[i * 3] = L[0]; p[i * 3 + 1] = L[1]; p[i * 3 + 2] = L[2];
    }
    PIX.set(img, p);
    return p;
  }

  // ---------- 1. reducir la foto a la cuadrícula ----------
  // Foto: cada cuadro es el promedio de sus píxeles (en Lab, como lo percibe el ojo).
  // Dibujo: cada cuadro toma el color que más ocupa, sin mezclas de borde; y si una línea oscura
  // (contorno, raya) cubre buena parte del cuadro, gana la línea: así los contornos negros finos no
  // se pierden ni se vuelven gris.
  // Devuelve Lab por cuadro; NaN si el cuadro es transparente.
  const STROKE = 0.22, STROKE_FOTO = 0.3; // fracción del cuadro que debe cubrir una línea oscura para quedarse con él
  function downsample(img, W, H, mode) {
    const { width: w, height: h } = img;
    const px = pixelLab(img);
    const lab = new Float32Array(W * H * 3);
    const cl = []; // grupos de color del cuadro: [suma L, suma a, suma b, n]
    for (let cy = 0; cy < H; cy++) {
      const y0 = Math.floor((cy * h) / H), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / H));
      for (let cx = 0; cx < W; cx++) {
        const x0 = Math.floor((cx * w) / W), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / W));
        const o = (cy * W + cx) * 3, tot = (y1 - y0) * (x1 - x0);
        let n = 0, sL = 0, sA = 0, sB = 0;
        cl.length = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0, p = (y * w + x0) * 3; x < x1; x++, p += 3) {
            const L = px[p];
            if (Number.isNaN(L)) continue;
            const a = px[p + 1], b = px[p + 2];
            n++; sL += L; sA += a; sB += b;
            let g = null;
            for (const c of cl) {
              const k = c[3];
              if ((c[0] / k - L) ** 2 + (c[1] / k - a) ** 2 + (c[2] / k - b) ** 2 < 144) { g = c; break; }
            }
            if (g) { g[0] += L; g[1] += a; g[2] += b; g[3]++; } else cl.push([L, a, b, 1]);
          }
        if (n < tot / 2) { lab[o] = NaN; continue; }
        let main = cl[0];
        for (const c of cl) if (c[3] > main[3]) main = c;
        const mL = main[0] / main[3];
        // la línea oscura: grupos bastante más oscuros que el color principal
        let ink = 0, best = null;
        for (const c of cl) {
          const L = c[0] / c[3];
          if (c !== main && L < 45 && L < mL - 25) { ink += c[3]; if (!best || c[3] > best[3]) best = c; }
        }
        if (best && ink >= (mode === "dibujo" ? STROKE : STROKE_FOTO) * n) {
          lab[o] = best[0] / best[3]; lab[o + 1] = best[1] / best[3]; lab[o + 2] = best[2] / best[3];
        } else if (mode === "dibujo") {
          lab[o] = main[0] / main[3]; lab[o + 1] = main[1] / main[3]; lab[o + 2] = main[2] / main[3];
        } else { lab[o] = sL / n; lab[o + 1] = sA / n; lab[o + 2] = sB / n; }
      }
    }
    return lab;
  }

  // Pesa un poco más la saturación que la fórmula estándar: los hilos no alcanzan los colores muy vivos
  // de una pantalla, y sin esto un cielo azul intenso sale gris azulado.
  const CHROMA_W = 0.7;
  // El hilo más parecido (CIEDE2000) entre los candidatos. Se guarda en caché por color redondeado:
  // en un dibujo hay pocos colores distintos y en una foto se repiten mucho.
  // Para no medir CIEDE2000 contra todos: se preseleccionan los más cercanos por distancia simple.
  const SHORTLIST = 16, SL_D = new Float64Array(SHORTLIST), SL_K = new Int32Array(SHORTLIST);
  function nearestIn(L, a, b, cand, cache) {
    const key = (Math.round(L) * 256 + Math.round(a) + 128) * 256 + Math.round(b) + 128;
    const v = cache.get(key);
    if (v !== undefined) return v;
    let pool = cand;
    if (cand.length > SHORTLIST) {
      // los SHORTLIST más cercanos por distancia simple (inserción en una lista corta ordenada)
      const sd = SL_D, sk = SL_K;
      let m = 0;
      for (let i = 0; i < cand.length; i++) {
        const k = cand[i], t = THREADS[k].lab;
        const d = (t[0] - L) ** 2 + (t[1] - a) ** 2 + (t[2] - b) ** 2;
        if (m === SHORTLIST && d >= sd[m - 1]) continue;
        let j = m < SHORTLIST ? m++ : m - 1;
        while (j > 0 && sd[j - 1] > d) { sd[j] = sd[j - 1]; sk[j] = sk[j - 1]; j--; }
        sd[j] = d; sk[j] = k;
      }
      pool = sk;
    }
    const lab = [L, a, b];
    let best = -1, bd = Infinity;
    for (const k of pool) {
      const e = de2000(lab, THREADS[k].lab, 1, CHROMA_W);
      if (e < bd) { bd = e; best = k; }
    }
    cache.set(key, best);
    return best;
  }

  // ---------- 2. elegir los N hilos ----------
  // Cada cuadro toma primero su hilo más parecido de toda la carta. Luego se van quitando, uno
  // por uno, los hilos cuya desaparición menos se nota (error cuadrático ponderado por cantidad
  // de puntos). Así un color pequeño pero muy distinto —el brillo de un ojo— sobrevive, y
  // los tonos casi iguales se funden primero.
  function choosePalette(lab, N) {
    const all = THREADS.map((_, i) => i);
    const count = new Map(), cache = new Map();
    for (let i = 0; i < lab.length; i += 3) {
      if (Number.isNaN(lab[i])) continue;
      const k = nearestIn(lab[i], lab[i + 1], lab[i + 2], all, cache);
      count.set(k, (count.get(k) || 0) + 1);
    }
    const bins = [...count.keys()];
    const active = new Set(bins);
    const owner = new Map(bins.map((b) => [b, b]));
    const nearestActive = (b, skip) => {
      let best = -1, bd = Infinity;
      for (const a of active) if (a !== skip && dist(b, a) < bd) { bd = dist(b, a); best = a; }
      return best;
    };
    while (active.size > N) {
      let worst = -1, wc = Infinity;
      for (const a of active) {
        let c = 0;
        for (const b of bins) {
          if (owner.get(b) !== a) continue;
          const alt = nearestActive(b, a);
          c += count.get(b) * (dist(b, alt) ** 2 - dist(b, a) ** 2);
        }
        if (c < wc) { wc = c; worst = a; }
      }
      active.delete(worst);
      for (const b of bins) if (owner.get(b) === worst) owner.set(b, nearestActive(b, -1));
    }
    return [...active];
  }

  // ---------- 3. limpiar puntos sueltos ----------
  // Un punto sin ningún vecino de su mismo color (de los 8 alrededor) toma el color más común
  // de sus vecinos, siempre que se parezca. Los acentos muy distintos se quedan.
  function cleanConfetti(cells, W, H, maxDelta) {
    let changed = 0;
    const out = cells.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = cells[y * W + x];
        if (k === EMPTY) continue;
        const tally = new Map();
        let lonely = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = Math.min(H - 1, Math.max(0, y + dy)), xx = Math.min(W - 1, Math.max(0, x + dx));
            if (yy === y && xx === x) continue;
            const n = cells[yy * W + xx];
            if (n === k) { lonely = false; break; }
            if (n !== EMPTY) tally.set(n, (tally.get(n) || 0) + 1);
          }
        if (!lonely) continue;
        const cand = [...tally.entries()].sort((p, q) => q[1] - p[1]);
        for (const [n] of cand)
          if (dist(n, k) < maxDelta) { out[y * W + x] = n; changed++; break; }
      }
    return { cells: out, changed };
  }

  // ---------- 4. quitar el fondo ----------
  // Toma el color que más aparece en el borde y borra la zona de ese color conectada al borde.
  function removeBackground(cells, W, H) {
    const tally = new Map();
    const border = [];
    for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
    for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);
    for (const i of border) if (cells[i] !== EMPTY) tally.set(cells[i], (tally.get(cells[i]) || 0) + 1);
    if (!tally.size) return 0;
    const [bg] = [...tally.entries()].sort((p, q) => q[1] - p[1])[0];
    const near = (k) => k !== EMPTY && dist(k, bg) < 6;
    const stack = border.filter((i) => near(cells[i]));
    let removed = 0;
    while (stack.length) {
      const i = stack.pop();
      if (!near(cells[i])) continue;
      cells[i] = EMPTY; removed++;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
    }
    return removed;
  }

  // ---------- símbolos ----------
  // Figuras antes que letras (se distinguen mejor). Los hilos oscuros llevan figuras rellenas y los
  // claros figuras huecas: en blanco y negro la página no se vuelve un bloque de tinta y el símbolo
  // ya insinúa el tono.
  const FILLED = ["squareF", "circleF", "triUpF", "diamondF", "triDownF"];
  const HOLLOW = ["circle", "square", "triUp", "diamond", "cross", "plus", "triDown"];
  const CHARS = "ABCDEFGHKMNPRSTUVWYZ2345678#%&@=?$<>abdefghknqrt".split("");
  const MAX_COLORS = 60;
  function assignSymbols(colors) {
    const filled = FILLED.slice(), hollow = HOLLOW.slice(), chars = CHARS.slice();
    for (const c of colors) c.symbol = (c.dark ? filled : hollow).shift() || chars.shift();
  }

  // ---------- madejas ----------
  // Una madeja DMC trae 8 m de 6 hebras. Bordando con 2 hebras en Aida 14 alcanza para unas
  // 1.800 cruces (incluye desperdicio). En tela más gruesa cada cruz gasta más hilo.
  const STITCHES_PER_SKEIN_14 = 1800;
  const skeinsFor = (stitches, fabric) => Math.max(1, Math.ceil(stitches / ((STITCHES_PER_SKEIN_14 * fabric) / 14)));

  // ---------- todo junto ----------
  // opts: {width (puntos), colors, mode: "foto"|"dibujo", fabric (11,14,16,18), noBackground}
  function makePattern(img, opts) {
    threads();
    const W = Math.max(10, Math.round(opts.width));
    const H = Math.max(10, Math.round((W * img.height) / img.width));
    const N = Math.min(MAX_COLORS, Math.max(2, Math.round(opts.colors)));
    const lab = downsample(img, W, H, opts.mode);
    // En un dibujo, el casi negro es negro (310) y el casi blanco es blanco: nadie borda un contorno
    // con "café negruzco" ni compra dos blancos.
    if (opts.mode === "dibujo")
      for (let i = 0; i < lab.length; i += 3) {
        const L = lab[i], C = Math.hypot(lab[i + 1], lab[i + 2]);
        if (L < 16 && C < 16) lab[i] = lab[i + 1] = lab[i + 2] = 0;
        else if (L > 96 && C < 4) { lab[i] = 100; lab[i + 1] = lab[i + 2] = 0; }
      }
    const palette = choosePalette(lab, N);
    let cells = new Int16Array(W * H);
    const cache = new Map();
    for (let i = 0, j = 0; j < cells.length; i += 3, j++)
      cells[j] = Number.isNaN(lab[i]) ? EMPTY : nearestIn(lab[i], lab[i + 1], lab[i + 2], palette, cache);

    // En dibujos los colores son planos: se limpia más fuerte.
    const delta = opts.mode === "dibujo" ? 35 : 20;
    for (let pass = 0; pass < 3; pass++) {
      const r = cleanConfetti(cells, W, H, delta);
      cells = r.cells;
      if (!r.changed) break;
    }
    if (opts.noBackground) removeBackground(cells, W, H);

    // Hilos con poquísimos puntos (< 4) y parecidos a otro: se funden. No vale comprar una madeja.
    const tally = () => { const m = new Map(); for (const k of cells) if (k !== EMPTY) m.set(k, (m.get(k) || 0) + 1); return m; };
    let counts = tally();
    for (const [k, n] of counts) {
      if (n >= 4) continue;
      let best = -1, bd = Infinity;
      for (const [o, m] of counts) if (o !== k && m >= 4 && dist(k, o) < bd) { bd = dist(k, o); best = o; }
      if (best >= 0 && bd < 15) for (let i = 0; i < cells.length; i++) if (cells[i] === k) cells[i] = best;
    }
    counts = tally();

    const fabric = opts.fabric || 14;
    const used = [...counts.entries()].sort((p, q) => q[1] - p[1]);
    const remap = new Map(used.map(([k], i) => [k, i]));
    const out = new Int16Array(cells.length);
    for (let i = 0; i < cells.length; i++) out[i] = cells[i] === EMPTY ? EMPTY : remap.get(cells[i]);
    const colors = used.map(([k, n]) => ({
      ...THREADS[k], count: n, skeins: skeinsFor(n, fabric),
      dark: THREADS[k].lab[0] < 55, // símbolo blanco sobre hilo oscuro
    }));
    assignSymbols(colors);
    const stitches = used.reduce((s, [, n]) => s + n, 0);
    return {
      w: W, h: H, cells: out, colors, fabric, stitches,
      skeins: colors.reduce((s, c) => s + c.skeins, 0),
      cm: [(W / fabric) * 2.54, (H / fabric) * 2.54],
    };
  }

  // ---------- dibujo de símbolos (sirve para canvas y para PDF) ----------
  // g: adaptador con poly(points, fill), circle(cx, cy, r, fill), line(x1,y1,x2,y2), text(ch, cx, cy, size)
  function drawSymbol(g, sym, cx, cy, s) {
    const r = s * 0.34;
    const tri = (up) => up ? [[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]] : [[cx, cy + r], [cx + r, cy - r * 0.8], [cx - r, cy - r * 0.8]];
    const sq = [[cx - r * 0.85, cy - r * 0.85], [cx + r * 0.85, cy - r * 0.85], [cx + r * 0.85, cy + r * 0.85], [cx - r * 0.85, cy + r * 0.85]];
    const dia = [[cx, cy - r * 1.1], [cx + r * 1.1, cy], [cx, cy + r * 1.1], [cx - r * 1.1, cy]];
    switch (sym) {
      case "circleF": return g.circle(cx, cy, r * 0.9, true);
      case "circle": return g.circle(cx, cy, r * 0.85, false);
      case "squareF": return g.poly(sq, true);
      case "square": return g.poly(sq, false);
      case "triUpF": return g.poly(tri(true), true);
      case "triUp": return g.poly(tri(true), false);
      case "triDownF": return g.poly(tri(false), true);
      case "triDown": return g.poly(tri(false), false);
      case "diamondF": return g.poly(dia, true);
      case "diamond": return g.poly(dia, false);
      case "cross": g.line(cx - r, cy - r, cx + r, cy + r); return g.line(cx - r, cy + r, cx + r, cy - r);
      case "plus": g.line(cx - r, cy, cx + r, cy); return g.line(cx, cy - r, cx, cy + r);
      default: return g.text(sym, cx, cy, s);
    }
  }

  const api = { EMPTY, MAX_COLORS, makePattern, drawSymbol, rgbToLab, de2000, threads };
  globalThis.PuntoCruz = api;
  if (typeof module !== "undefined") module.exports = api;
})();
