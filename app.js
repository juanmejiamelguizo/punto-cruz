// app.js — la página: cargar foto, ajustes, vistas y descargas.
(function () {
  "use strict";
  const { makePattern, drawSymbol, EMPTY } = globalThis.PuntoCruz;
  const { buildPDF } = globalThis.PuntoCruzPDF;
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { foto: { colors: 30, longCm: 20 }, dibujo: { colors: 12, longCm: 15 } };
  const MIN_PTS = 10, MAX_PTS = 300;
  const FABRIC_RGB = [243, 239, 230];
  const state = { img: null, mode: "foto", tab: "stitched", pattern: null, wcm: 18 }; // wcm: ancho terminado en cm

  // ---------- cargar la foto ----------
  async function loadFile(file) {
    $("err").hidden = true;
    if (!file) return;
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {
      try {
        src = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(file); });
      } catch (_) {
        $("err").textContent = "No pude abrir esa imagen. Si es una foto de iPhone en formato HEIC, compártela o guárdala como JPG y vuelve a intentar.";
        $("err").hidden = false;
        return;
      }
    }
    const w0 = src.width, h0 = src.height, s = Math.min(1, 1200 / Math.max(w0, h0)); // fotos grandes: se achican primero
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    state.img = ctx.getImageData(0, 0, c.width, c.height);

    setMode(looksLikeDrawing(state.img) ? "dibujo" : "foto");
    // Un dibujo sobre fondo blanco o casi blanco: el fondo no se borda (es la tela).
    $("nobg").checked = state.mode === "dibujo" && whiteBorder(state.img);
    $("title").value = niceTitle(file.name);
    $("pick").hidden = true;
    $("work").hidden = false;
    update();
  }

  // Un dibujo o logo tiene pocos colores que cubren casi todo; una foto, miles. Se agrupa grueso
  // (16 niveles por canal) para que un dibujo comprimido por WhatsApp siga contando como dibujo.
  function looksLikeDrawing(img) {
    const m = new Map(), d = img.data;
    let n = 0;
    const step = Math.max(1, Math.floor(d.length / 4 / 40000)) * 4;
    for (let i = 0; i < d.length; i += step) {
      if (d[i + 3] < 128) continue;
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      m.set(k, (m.get(k) || 0) + 1); n++;
    }
    const top = [...m.values()].sort((a, b) => b - a).slice(0, 24).reduce((a, b) => a + b, 0);
    return n > 0 && top / n > 0.8;
  }

  // ¿El borde de la imagen es casi todo blanco? (Lo transparente no cuenta: ya queda sin bordar, y si
  // se contara, en un PNG recortado se borraría la figura que toca el borde.)
  function whiteBorder(img) {
    const { width: w, height: h, data: d } = img;
    let n = 0, white = 0;
    const look = (x, y) => {
      const i = (y * w + x) * 4;
      n++;
      if (d[i + 3] >= 128 && d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
    };
    for (let x = 0; x < w; x += 2) { look(x, 0); look(x, h - 1); }
    for (let y = 0; y < h; y += 2) { look(0, y); look(w - 1, y); }
    return white / n > 0.9;
  }

  function niceTitle(name) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (!base || /^(img|dsc|pxl|photo|image|whatsapp|screenshot|captura|foto)\b/i.test(base) || /^\d[\d ]*$/.test(base)) return "Mi diseño";
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // ---------- ajustes ----------
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("colors").value = DEFAULTS[mode].colors;
    setLongSide(DEFAULTS[mode].longCm);
  }

  // ---------- tamaño en cm ----------
  // El ancho en cm manda; el alto sale de la proporción de la foto y los puntos, de la tela.
  const ratio = () => state.img.height / state.img.width;
  function setLongSide(cmLong) { state.wcm = ratio() > 1 ? cmLong / ratio() : cmLong; }
  function stitchesWide() {
    const fab = +$("fabric").value;
    const maxW = Math.min(MAX_PTS, MAX_PTS / ratio()), minW = Math.max(MIN_PTS, MIN_PTS / ratio());
    return Math.round(Math.min(maxW, Math.max(minW, (state.wcm / 2.54) * fab)));
  }

  let timer = 0;
  function update(from) {
    clearTimeout(timer);
    const fab = +$("fabric").value, W = stitchesWide(), H = Math.round(W * ratio());
    const wcm = (W / fab) * 2.54, hcm = (H / fab) * 2.54;
    // No se reescribe la casilla que ella está escribiendo.
    if (from !== "wcm") $("wcm").value = round1(wcm);
    if (from !== "hcm") $("hcm").value = round1(hcm);
    const longCm = Math.max(wcm, hcm);
    document.querySelectorAll("[data-cm]").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.cm - longCm) < 0.3)));
    $("widthOut").textContent = `${W} × ${H} puntos`;
    $("colorsOut").textContent = $("colors").value;
    const big = W * H > 40000 ? " Es un diseño grande: muchas horas de bordado." : "";
    $("sizeHint").textContent = `Son ${W} × ${H} puntos en Aida ${fab}.${big}`;
    timer = setTimeout(compute, 120);
  }
  const round1 = (x) => Math.round(x * 2) / 2; // de a medio centímetro

  function compute() {
    state.pattern = makePattern(state.img, {
      width: stitchesWide(), colors: +$("colors").value, mode: state.mode,
      fabric: +$("fabric").value, noBackground: $("nobg").checked,
    });
    render();
  }

  const cm = (x) => x.toLocaleString("es-CO", { maximumFractionDigits: 1 });

  // ---------- dibujo ----------
  function canvasAdapter(ctx) {
    return {
      circle(cx, cy, r, fill) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); },
      poly(pts, fill) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); },
      line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      text(ch, cx, cy, s) { ctx.font = `bold ${s * 0.78}px Helvetica, Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, cx, cy + s * 0.04); },
    };
  }

  function symbolCell(ctx, c, x, y, s) {
    ctx.fillStyle = `rgb(${c.rgb})`; ctx.fillRect(x, y, s, s);
    const ink = c.dark ? "#fff" : "#000";
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * 0.09);
    drawSymbol(canvasAdapter(ctx), c.symbol, x + s / 2, y + s / 2, s);
  }

  // Cómo se verá bordado: cruces de hilo sobre la tela.
  function drawStitched(canvas, p, px) {
    canvas.width = p.w * px; canvas.height = p.h * px;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `rgb(${FABRIC_RGB})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (px >= 5) { // agujeros de la tela Aida
      ctx.fillStyle = "rgba(120,105,85,.22)";
      for (let y = 0; y <= p.h; y++) for (let x = 0; x <= p.w; x++) ctx.fillRect(x * px - 0.6, y * px - 0.6, 1.2, 1.2);
    }
    ctx.lineCap = "round";
    const lw = px * 0.42, m = px * 0.12;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const k = p.cells[y * p.w + x];
        if (k === EMPTY) continue;
        const [r, g, b] = p.colors[k].rgb, X = x * px, Y = y * px;
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgb(${r * 0.8 | 0},${g * 0.8 | 0},${b * 0.8 | 0})`; // hilo de abajo, en sombra
        ctx.beginPath(); ctx.moveTo(X + m, Y + m); ctx.lineTo(X + px - m, Y + px - m); ctx.stroke();
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath(); ctx.moveTo(X + px - m, Y + m); ctx.lineTo(X + m, Y + px - m); ctx.stroke();
      }
  }

  function drawChart(canvas, p, px) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = px * dpr;
    canvas.width = p.w * s; canvas.height = p.h * s;
    canvas.style.width = p.w * px + "px";
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const k = p.cells[y * p.w + x];
        if (k !== EMPTY) symbolCell(ctx, p.colors[k], x * s, y * s, s);
      }
    for (let i = 0; i <= p.w; i++) line(ctx, i * s, 0, i * s, canvas.height, i % 10 === 0 ? 2 * dpr : dpr * 0.5, i % 10 === 0 ? "#222" : "rgba(0,0,0,.25)");
    for (let i = 0; i <= p.h; i++) line(ctx, 0, i * s, canvas.width, i * s, i % 10 === 0 ? 2 * dpr : dpr * 0.5, i % 10 === 0 ? "#222" : "rgba(0,0,0,.25)");
  }
  function line(ctx, x1, y1, x2, y2, w, c) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function render() {
    const p = state.pattern, view = $("view"), canvas = $("canvas");
    if (state.tab === "stitched") {
      view.classList.remove("zoom");
      // Se dibuja a la resolución real de la pantalla: si se achica después, la textura hace moiré.
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const boxW = view.clientWidth || 600, boxH = Math.max(320, window.innerHeight * 0.7);
      const css = Math.min(boxW / p.w, boxH / p.h);
      const px = Math.max(2, Math.floor(css * dpr));
      drawStitched(canvas, p, px);
      canvas.style.width = (p.w * px) / dpr + "px";
    } else {
      view.classList.add("zoom");
      drawChart(canvas, p, Math.max(10, Math.min(18, Math.floor(3000 / Math.max(p.w, p.h)))));
    }
    $("summary").innerHTML = [
      [`${p.w} × ${p.h}`, "puntos"], [`${cm(p.cm[0])} × ${cm(p.cm[1])} cm`, `en Aida ${p.fabric}`],
      [p.colors.length, "colores"], [p.skeins, "madejas aprox."],
    ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");
    const body = $("keyBody");
    body.innerHTML = "";
    for (const c of p.colors) {
      const tr = document.createElement("tr");
      const sw = document.createElement("canvas");
      sw.width = sw.height = 52;
      symbolCell(sw.getContext("2d"), c, 0, 0, 52);
      const td0 = document.createElement("td"); td0.appendChild(sw); tr.appendChild(td0);
      tr.insertAdjacentHTML("beforeend", `<td><b>${c.code}</b></td><td class="name">${c.name}</td><td class="num">${c.count.toLocaleString("es-CO")}</td><td class="num"><b>${c.skeins}</b></td>`);
      body.appendChild(tr);
    }
  }

  // ---------- PDF ----------
  async function download(color) {
    const p = state.pattern;
    if (!p) return;
    const busy = $("busy");
    busy.hidden = false;
    document.querySelectorAll(".downloads .btn").forEach((b) => (b.disabled = true));
    await new Promise((r) => setTimeout(r, 30)); // deja pintar el aviso
    try {
      const prev = document.createElement("canvas");
      drawStitched(prev, p, Math.max(4, Math.min(16, Math.floor(1800 / Math.max(p.w, p.h)))));
      const title = $("title").value.trim() || "Mi diseño";
      const doc = buildPDF(p, { title, preview: prev.toDataURL("image/jpeg", 0.9), color });
      const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "patron";
      doc.save(`${slug}-punto-de-cruz${color ? "" : "-bn"}.pdf`);
    } finally {
      busy.hidden = true;
      document.querySelectorAll(".downloads .btn").forEach((b) => (b.disabled = false));
    }
  }

  // ---------- eventos ----------
  $("file").addEventListener("change", (e) => loadFile(e.target.files[0]));
  $("file2").addEventListener("change", (e) => loadFile(e.target.files[0]));
  const pick = $("pick");
  pick.addEventListener("dragover", (e) => { e.preventDefault(); pick.classList.add("drag"); });
  pick.addEventListener("dragleave", () => pick.classList.remove("drag"));
  pick.addEventListener("drop", (e) => { e.preventDefault(); pick.classList.remove("drag"); loadFile(e.dataTransfer.files[0]); });
  ["colors", "fabric", "nobg"].forEach((id) => $(id).addEventListener("input", () => update()));
  $("wcm").addEventListener("input", () => { const v = parseFloat($("wcm").value); if (v > 0) { state.wcm = v; update("wcm"); } });
  $("hcm").addEventListener("input", () => { const v = parseFloat($("hcm").value); if (v > 0) { state.wcm = v / ratio(); update("hcm"); } });
  ["wcm", "hcm"].forEach((id) => $(id).addEventListener("change", () => update())); // al salir, muestra lo que de verdad quedó
  document.querySelectorAll("[data-cm]").forEach((b) => b.addEventListener("click", () => { setLongSide(+b.dataset.cm); update(); }));
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); update(); }));
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
    if (state.pattern) render();
  }));
  $("pdfColor").addEventListener("click", () => download(true));
  $("pdfBW").addEventListener("click", () => download(false));
  let rz = 0; // al girar el celular o cambiar la ventana, se vuelve a dibujar la vista
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.pattern && render(), 200); });
  // Para las pruebas automáticas
  globalThis.PuntoCruzApp = { loadFile, state, download };
})();
