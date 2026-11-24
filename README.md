# Punto de cruz

Página web que convierte una foto en un patrón de punto de cruz con hilos DMC, listo para imprimir.
Todo corre en el navegador: la foto no sale del aparato.

**Cómo se usa:** abrir el enlace → *Elegir foto* → ajustar tamaño en cm, colores y tela → *Descargar PDF*.

## Qué hace
- Reduce la imagen a la cuadrícula. En **dibujos** cada cuadro toma el color que más ocupa (sin mezclas de
  borde) y, si una línea oscura cubre ≥22 % del cuadro, gana la línea: los contornos negros finos salen
  negros y cerrados. En **fotos** se promedia en Lab, con la misma regla para trazos oscuros (≥30 %).
- Escoge los N hilos DMC que mejor la representan (CIEDE2000 con un poco más de peso a la saturación;
  los tonos casi iguales se funden primero y los acentos pequeños pero distintos sobreviven).
- En dibujos, el casi negro se vuelve 310 y el casi blanco B5200 (no dos negros ni dos blancos).
- Limpia los puntos sueltos ("confeti"). Si el dibujo tiene fondo blanco, marca solo "No bordar el fondo".
- Reconoce solo si la imagen es foto o dibujo/logo (aguanta la compresión de WhatsApp).
- PDF tamaño carta: portada con vista previa y ficha (tamaño, tela a cortar, madejas), lista de hilos y
  patrón por páginas con líneas cada 10, numeración, flechas de centro y 2 filas de empalme entre páginas.
  Versión a color y en blanco y negro (hilos oscuros = figuras rellenas, claros = huecas).

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | la página |
| `app.js` | carga de foto, ajustes, vistas y descargas |
| `core.js` | la conversión (sin dependencias; corre también en Node) |
| `pdf.js` | el PDF |
| `dmc.js` | carta DMC clásica, 454 colores (de `data/dmc.csv`, MIT, ver `data/LICENSE-dmc`) |
| `vendor/jspdf.umd.min.js` | jsPDF 2.5.1 (MIT) |

Prueba: `node test/core.test.cjs`

## Pendiente (fase 2)
Modo "tejer": marcar en el celular los puntos ya bordados y ver cuánto falta.
