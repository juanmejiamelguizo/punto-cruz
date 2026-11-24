// node test/core.test.cjs — prueba la conversión con una imagen sintética.
const assert = require("node:assert");
require("../dmc.js");
const C = require("../core.js");

// 60×40: fondo azul liso, un cuadrado rojo, puntos sueltos de ruido y un "ojo" blanco de 1 punto.
const w = 60, h = 40, data = new Uint8ClampedArray(w * h * 4);
const put = (x, y, [r, g, b]) => data.set([r, g, b, 255], (y * w + x) * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [30, 60, 140]);
for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) put(x, y, [200, 30, 40]);
put(5, 5, [36, 66, 150]); put(50, 35, [25, 55, 130]); // ruido casi igual al fondo
put(30, 20, [255, 255, 255]); // acento distinto: debe sobrevivir
const img = { width: w, height: h, data };

const p = C.makePattern(img, { width: 60, colors: 6, mode: "foto", fabric: 14 });
assert.equal(p.w, 60); assert.equal(p.h, 40);
assert.ok(p.colors.length <= 6, "respeta el máximo de colores");
const at = (x, y) => p.colors[p.cells[y * p.w + x]];
assert.equal(at(5, 5).code, at(0, 0).code, "el punto suelto parecido al fondo se limpia");
assert.notEqual(at(30, 20).code, at(31, 20).code, "el acento blanco sobrevive");
assert.equal(new Set(p.colors.map((c) => c.symbol)).size, p.colors.length, "un símbolo por color");
assert.equal(p.stitches, 60 * 40);
assert.ok(Math.abs(p.cm[0] - (60 / 14) * 2.54) < 1e-9);

const q = C.makePattern(img, { width: 60, colors: 6, mode: "foto", fabric: 14, noBackground: true });
assert.equal(q.cells[0], C.EMPTY, "sin fondo: el borde queda vacío");
assert.notEqual(q.cells[20 * 60 + 25], C.EMPTY, "sin fondo: el cuadrado rojo se queda");

// Una madeja por cada ~1.800 puntos en Aida 14; en Aida 11 alcanza para menos.
const big = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4).fill(255) };
const r14 = C.makePattern(big, { width: 100, colors: 2, fabric: 14 });
const r11 = C.makePattern(big, { width: 100, colors: 2, fabric: 11 });
assert.equal(r14.skeins, Math.ceil(10000 / 1800));
assert.ok(r11.skeins > r14.skeins);

// Dibujo con contorno negro delgado (medio punto de ancho): el contorno debe salir en negro 310,
// cerrado, y sin grises de borde. Era la falla de los tulipanes (24-nov-2026).
{
  const S = 600, d = new Uint8ClampedArray(S * S * 4).fill(255);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - 300, y - 300), o = (y * S + x) * 4;
    if (r < 200) d.set([255, 200, 60], o); // cara amarilla
    if (Math.abs(r - 200) < 4) d.set([15, 5, 8], o); // contorno casi negro de 8 px
  }
  for (const W of [40, 60, 80]) {
    const p = C.makePattern({ width: S, height: S, data: d }, { width: W, colors: 6, mode: "dibujo", fabric: 14 });
    const codes = p.colors.map((c) => c.code);
    assert.ok(codes.includes("310"), `contorno negro a ${W} puntos: ${codes}`);
    assert.ok(!codes.some((c) => ["3371", "BLANC", "168", "318", "762"].includes(c)), `sin grises ni dobles: ${codes}`);
    const k = codes.indexOf("310");
    // cerrado: rellenando desde el centro sin pisar el negro no se llega al borde
    const seen = new Uint8Array(W * W), st = [(W >> 1) * W + (W >> 1)];
    let leak = false;
    while (st.length) {
      const i = st.pop();
      if (seen[i] || p.cells[i] === k) continue;
      seen[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (!x || !y || x === W - 1 || y === W - 1) { leak = true; break; }
      st.push(i - 1, i + 1, i - W, i + W);
    }
    assert.ok(!leak, `contorno cerrado a ${W} puntos`);
    const ink = p.colors[k].count, ideal = 2 * Math.PI * (W / 3);
    assert.ok(ink < ideal * 1.6, `contorno delgado a ${W} puntos (${ink} vs ${ideal | 0})`);
  }
}
console.log("ok: todas las pruebas pasaron");
