# Punto de cruz

Página web que convierte una foto en un patrón de punto de cruz con hilos DMC, listo para imprimir.
Todo corre en el navegador: la foto no sale del aparato.

**Cómo se usa:** abrir el enlace → *Elegir foto* → ajustar tamaño en cm, colores y tela → *Descargar PDF*.

## Qué hace
- Reduce la foto a la cuadrícula promediando cada cuadro y escoge los N hilos DMC que mejor la
  representan (distancia de color CIEDE2000; los tonos casi iguales se funden primero y los acentos
  pequeños pero distintos, como el brillo de un ojo, sobreviven).
- Limpia los puntos sueltos ("confeti") y, si se pide, quita el fondo liso.
- Reconoce solo si la imagen es foto o dibujo/logo y ajusta los valores iniciales.
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
