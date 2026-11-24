// pdf.js — arma el PDF del patrón (tamaño carta) con jsPDF.
(function () {
  "use strict";
  const { EMPTY, drawSymbol } = globalThis.PuntoCruz;
  const PW = 215.9, PH = 279.4, M = 12; // carta, en mm
  const MAX_COLS = 50, MAX_ROWS = 70, OVER = 2; // puntos por página y filas repetidas de la página vecina
  const INK = [43, 38, 34], GREY = [120, 112, 104];
  const PT = 2.835; // puntos tipográficos por mm

  // Cortes de página alineados a múltiplos de 10 y parejos (nunca una última página con 3 columnas).
  function splits(total, max) {
    const n = Math.ceil(total / max);
    const size = Math.min(max, Math.ceil(total / n / 10) * 10);
    const out = [];
    for (let s = 0; s < total; s += size) out.push([s, Math.min(total, s + size)]);
    return out;
  }

  const fmt = (n) => n.toLocaleString("es-CO");
  const cm = (x) => x.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  const mix = (rgb, t) => rgb.map((v) => Math.round(v + (255 - v) * t));

  function adapter(doc, color) {
    return {
      circle(cx, cy, r, fill) { doc.circle(cx, cy, r, fill ? "F" : "S"); },
      poly(pts, fill) {
        const d = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
        doc.lines(d, pts[0][0], pts[0][1], [1, 1], fill ? "F" : "S", true);
      },
      line(x1, y1, x2, y2) { doc.line(x1, y1, x2, y2); },
      text(ch, cx, cy, s) {
        doc.setFontSize(s * PT * 0.82);
        doc.text(ch, cx, cy, { align: "center", baseline: "middle" });
      },
      set(rgb) { doc.setFillColor(...rgb); doc.setDrawColor(...rgb); doc.setTextColor(...rgb); doc.setLineWidth(0.22); },
      color,
    };
  }

  function symbolIn(doc, c, x, y, s, { color, faded }) {
    // color: celda rellena del hilo y símbolo en contraste; blanco y negro: celda blanca y símbolo negro.
    if (color) {
      doc.setFillColor(...(faded ? mix(c.rgb, 0.6) : c.rgb));
      doc.rect(x, y, s, s, "F");
    }
    const g = adapter(doc);
    let ink = color ? (c.dark ? [255, 255, 255] : [0, 0, 0]) : [0, 0, 0];
    if (faded) ink = color ? mix(ink, 0.45) : [170, 170, 170];
    g.set(ink);
    doc.setFont("helvetica", "bold");
    drawSymbol(g, c.symbol, x + s / 2, y + s / 2, s);
  }

  function header(doc, title, right) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(title, M, M + 2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
    doc.text(right, PW - M, M + 2, { align: "right" });
  }

  // Mapa de páginas: un rectángulo del diseño dividido en sus páginas numeradas.
  function pageMap(doc, x, y, maxW, maxH, p, xs, ys, current) {
    const s = Math.min(maxW / p.w, maxH / p.h);
    doc.setLineWidth(0.2); doc.setDrawColor(...GREY);
    let n = 0;
    for (const [r0, r1] of ys)
      for (const [c0, c1] of xs) {
        n++;
        const rx = x + c0 * s, ry = y + r0 * s, rw = (c1 - c0) * s, rh = (r1 - r0) * s;
        if (n === current) { doc.setFillColor(242, 214, 220); doc.rect(rx, ry, rw, rh, "FD"); }
        else doc.rect(rx, ry, rw, rh, "S");
        doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
        doc.setFontSize(Math.min(14, Math.max(5, Math.min(rw, rh) * 1.2)));
        doc.text(String(n), rx + rw / 2, ry + rh / 2, { align: "center", baseline: "middle" });
      }
  }

  function cover(doc, p, title, preview, xs, ys) {
    doc.setFont("times", "bold"); doc.setFontSize(24); doc.setTextColor(...INK);
    doc.text(title, M, M + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
    doc.text("Patrón de punto de cruz · hilos DMC", M, M + 15);

    // Vista de cómo quedará
    const boxW = PW - 2 * M, boxH = 115, top = M + 21;
    const s = Math.min(boxW / p.w, boxH / p.h);
    const iw = p.w * s, ih = p.h * s;
    doc.addImage(preview, "JPEG", M + (boxW - iw) / 2, top + (boxH - ih) / 2, iw, ih);

    // Ficha
    let y = top + boxH + 12;
    const rows = [
      ["Tamaño en puntos", `${p.w} × ${p.h} puntos`],
      ["Tamaño terminado", `${cm(p.cm[0])} × ${cm(p.cm[1])} cm en Aida ${p.fabric}`],
      ["Tela a cortar", `${Math.ceil(p.cm[0] + 10)} × ${Math.ceil(p.cm[1] + 10)} cm (5 cm de margen por lado)`],
      ["Colores", `${p.colors.length} hilos DMC`],
      ["Total de puntos", fmt(p.stitches)],
      ["Madejas", `${p.skeins} en total (aproximado, bordando con 2 hebras)`],
    ];
    for (const [k, v] of rows) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
      doc.text(k, M, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(v, M + 40, y);
      y += 6.2;
    }

    // Cómo usarlo + mapa
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text("Cómo leer el patrón", M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    const tips = [
      "Cada cuadro es una cruz completa del color de su símbolo (ver la lista de hilos).",
      "Empieza por el centro: está marcado con flechas en los bordes de la cuadrícula.",
      "Las líneas gruesas van cada 10 puntos y los números del borde ayudan a no perderse.",
      "Las 2 filas y columnas claras del borde se repiten en la página vecina, para empatar.",
      "Los cuadros en blanco no se bordan.",
    ];
    const tw = 118;
    let ty = y + 5;
    for (const t of tips) {
      const lines = doc.splitTextToSize(t, tw - 4);
      doc.text("•", M, ty);
      doc.text(lines, M + 4, ty);
      ty += lines.length * 4.2 + 0.8;
    }
    const mapX = M + tw + 8, mapW = PW - M - mapX;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`Páginas del patrón (${xs.length * ys.length})`, mapX, y);
    pageMap(doc, mapX, y + 4, mapW, PH - M - y - 10, p, xs, ys, 0);
  }

  function key(doc, p, title) {
    const rowH = 6.4, top = M + 14;
    const perPage = Math.floor((PH - top - M - 12) / rowH);
    const cols = [M, M + 18, M + 38, M + 130, M + 160];
    p.colors.forEach((c, i) => {
      const r = i % perPage;
      if (r === 0) {
        doc.addPage();
        header(doc, title, "Lista de hilos");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...GREY);
        ["Símbolo", "DMC", "Nombre del color", "Puntos", "Madejas"].forEach((h, j) => doc.text(h, cols[j] + (j >= 3 ? 20 : 0), top - 3, { align: j >= 3 ? "right" : "left" }));
      }
      const y = top + r * rowH;
      if (r % 2 === 0) { doc.setFillColor(246, 243, 238); doc.rect(M - 2, y, PW - 2 * M + 4, rowH, "F"); }
      const s = rowH - 1.4;
      symbolIn(doc, c, cols[0] + 1, y + 0.7, s, { color: true });
      doc.setFillColor(255, 255, 255); doc.setDrawColor(200, 195, 188); doc.setLineWidth(0.15);
      doc.rect(cols[0] + 2 + s, y + 0.7, s, s, "FD");
      symbolIn(doc, c, cols[0] + 2 + s, y + 0.7, s, { color: false });
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
      doc.text(c.code, cols[1], y + rowH / 2, { baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.text(c.name, cols[2], y + rowH / 2, { baseline: "middle" });
      doc.text(fmt(c.count), cols[3] + 20, y + rowH / 2, { baseline: "middle", align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(String(c.skeins), cols[4] + 20, y + rowH / 2, { baseline: "middle", align: "right" });
      if (i === p.colors.length - 1) {
        const yy = y + rowH + 7;
        doc.setFontSize(10);
        doc.text(`Total: ${p.skeins} madejas`, cols[4] + 20, yy, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
        doc.text(`Cálculo aproximado para Aida ${p.fabric} con 2 hebras; una madeja DMC trae 8 m. Conviene comprar una de más en los colores grandes.`, M, yy + 6);
      }
    });
  }

  function chartPage(doc, p, title, color, xs, ys, xi, yi, n, total) {
    const [c0, c1] = xs[xi], [r0, r1] = ys[yi];
    const cEnd = Math.min(p.w, c1 + OVER), rEnd = Math.min(p.h, r1 + OVER);
    const cStart = Math.max(0, c0 - (c0 > 0 ? OVER : 0)), rStart = Math.max(0, r0 - (r0 > 0 ? OVER : 0));
    const gx = M + 9, gy = M + 16;
    // Mismo tamaño de cuadro en todas las páginas: el más grande que deja caber la página más llena.
    const cols = Math.max(...xs.map(([a, b]) => b - a)), rows = Math.max(...ys.map(([a, b]) => b - a));
    const cell = Math.min(4.5, (PW - M - 6 - gx) / (cols + 2 * OVER), (PH - M - 6 - gy) / (rows + 2 * OVER));
    const X = (c) => gx + (c - cStart) * cell, Y = (r) => gy + (r - rStart) * cell;

    doc.addPage();
    header(doc, title, `Página ${n} de ${total}`);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY);
    doc.text(`Columnas ${c0 + 1}–${c1} · Filas ${r0 + 1}–${r1}`, M, M + 7);
    pageMap(doc, PW - M - 22, M + 4, 22, 9, p, xs, ys, n);

    for (let r = rStart; r < rEnd; r++)
      for (let c = cStart; c < cEnd; c++) {
        const k = p.cells[r * p.w + c];
        if (k === EMPTY) continue;
        const faded = c < c0 || c >= c1 || r < r0 || r >= r1;
        symbolIn(doc, p.colors[k], X(c), Y(r), cell, { color, faded });
      }

    // Cuadrícula: fina en cada punto, gruesa cada 10 (contando desde el diseño completo)
    for (let c = cStart; c <= cEnd; c++) {
      const thick = c % 10 === 0 || c === p.w;
      doc.setDrawColor(...(thick ? [30, 30, 30] : [175, 170, 165])); doc.setLineWidth(thick ? 0.32 : 0.08);
      doc.line(X(c), Y(rStart), X(c), Y(rEnd));
    }
    for (let r = rStart; r <= rEnd; r++) {
      const thick = r % 10 === 0 || r === p.h;
      doc.setDrawColor(...(thick ? [30, 30, 30] : [175, 170, 165])); doc.setLineWidth(thick ? 0.32 : 0.08);
      doc.line(X(cStart), Y(r), X(cEnd), Y(r));
    }
    // Borde de la página propia (lo claro de afuera se repite en la vecina)
    doc.setDrawColor(180, 68, 92); doc.setLineWidth(0.45);
    doc.rect(X(c0), Y(r0), (c1 - c0) * cell, (r1 - r0) * cell, "S");

    // Números cada 10
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GREY);
    for (let c = Math.ceil(cStart / 10) * 10; c <= cEnd; c += 10) if (c > 0) doc.text(String(c), X(c), Y(rStart) - 1.2, { align: "center" });
    for (let r = Math.ceil(rStart / 10) * 10; r <= rEnd; r += 10) if (r > 0) doc.text(String(r), X(cStart) - 1.2, Y(r), { align: "right", baseline: "middle" });

    // Flechas del centro
    doc.setFillColor(180, 68, 92);
    const mc = p.w / 2, mr = p.h / 2, a = 1.8;
    if (mc >= cStart && mc <= cEnd) {
      const x = X(mc), yb = Y(rEnd);
      doc.triangle(x - a, Y(rStart) - 7, x + a, Y(rStart) - 7, x, Y(rStart) - 4.8, "F");
      doc.triangle(x - a, yb + 3.5, x + a, yb + 3.5, x, yb + 1.3, "F");
    }
    if (mr >= rStart && mr <= rEnd) {
      const y = Y(mr), xr = X(cEnd);
      doc.triangle(X(cStart) - 8.2, y - a, X(cStart) - 8.2, y + a, X(cStart) - 6, y, "F");
      doc.triangle(xr + 3.5, y - a, xr + 3.5, y + a, xr + 1.3, y, "F");
    }
  }

  // p: patrón de PuntoCruz.makePattern; preview: dataURL JPEG de "cómo quedará"
  function buildPDF(p, { title, preview, color = true }) {
    const doc = new globalThis.jspdf.jsPDF({ unit: "mm", format: "letter", compress: true });
    doc.setProperties({ title, creator: "Punto de cruz" });
    const xs = splits(p.w, MAX_COLS), ys = splits(p.h, MAX_ROWS);
    cover(doc, p, title, preview, xs, ys);
    key(doc, p, title);
    const total = xs.length * ys.length;
    let n = 0;
    for (let yi = 0; yi < ys.length; yi++)
      for (let xi = 0; xi < xs.length; xi++) chartPage(doc, p, title, color, xs, ys, xi, yi, ++n, total);
    return doc;
  }

  globalThis.PuntoCruzPDF = { buildPDF, splits };
})();
