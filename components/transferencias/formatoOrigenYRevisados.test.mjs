// LA PANTALLA: EL FORMATO DEL ORIGEN Y EL ESTADO "REVISADO".
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/formatoOrigenYRevisados.test.mjs
//
// Dos cosas distintas que la pantalla tiene que decir a la vez sin mezclarlas:
//
//   · EN QUÉ salió la mercadería —"6 CAJÓN x8", no "48 UNIDAD"—;
//   · si ALGUIEN YA LA CONTÓ, que no es lo mismo que si está correcta.
//
// La segunda es la que más fácil se rompe: pintar la tarjeta de verde cuando se
// revisa dice "esto está bien", y un faltante revisado sigue siendo un faltante.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";
const FICHA = "components/transferencias/FichaProductoRecepcion.jsx";
const AGREGAR = "components/transferencias/AgregarProductoRecibido.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// 16-17. REVISADO EN VERDE, Y SEPARADO DEL RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

test("16. el verde de «Revisado» sale del token semántico del tema", () => {
  const src = codigoDe(WORKSPACE);

  // El check y la palabra, con el token del kit.
  assert.match(src, /sunmi-text-success[^"]*">\s*<Check size=\{14\}/);
  assert.match(src, /Revisado\s*<\/span>/);

  // Nada de colores inventados: ni hex, ni rgb, ni la paleta cruda de Tailwind.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), "apareció un color hexadecimal");
  assert.ok(!/rgb\(/.test(src), "apareció un rgb()");
  assert.ok(
    !/\b(?:text|bg|border)-(?:green|emerald|lime|teal)-\d{2,3}\b/.test(src),
    "apareció un verde de la paleta cruda en vez del token del tema"
  );
});

test("2. un producto PENDIENTE no lleva el verde de revisado", () => {
  const src = codigoDe(WORKSPACE);
  // El verde está detrás de la condición, no suelto.
  assert.match(src, /const revisado = d\.revisadoEnRecepcion === true && !d\.agregadoEnRecepcion/);
  assert.match(src, /\{revisado \?/);
  // Y el pendiente cae en la otra rama, con el tono apagado de siempre.
  assert.match(src, /<span className="text-sm2 sunmi-text-muted shrink-0">\{TEXTO_ESTADO\[estado\]\}<\/span>/);
});

test("3. «Revisado» y el RESULTADO son dos dimensiones y no se mezclan", () => {
  const src = codigoDe(WORKSPACE);

  // El resultado va en su propio renglón, con su propio tono.
  assert.match(src, /\{revisado && \(\s*<span className=\{`text-sm2 \$\{TONO_ESTADO_FILA\[estado\]/);
  assert.match(src, /TONO_ESTADO_FILA = Object\.freeze\(/);

  // Y la TARJETA no se pinta de verde al revisar: su única clase condicional
  // sigue siendo la de la fila activa, que es otra cosa.
  assert.match(src, /className=\{activa \? "sunmi-state-success" : ""\}/);
  assert.ok(
    !/revisado \? "sunmi-state-success"/.test(src),
    "se pintó la tarjeta entera de verde: eso diría «está correcto»"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTA Y LA FICHA MUESTRAN LA PRESENTACIÓN DEL ORIGEN
// ═══════════════════════════════════════════════════════════════════════════

test("la lista muestra la presentación registrada, no las unidades físicas", () => {
  const src = codigoDe(WORKSPACE);
  assert.match(src, /const envio = descriptorDeEnvio\(d\)/);
  assert.match(src, /Enviado \$\{rotuloDeEnvio\(envio\)\}/);
  // Ya no arma el texto con la cantidad física y una unidad adivinada.
  assert.ok(
    !/Enviado \$\{fmtCantidad\(d\.cantidadEnviada\)\}/.test(src),
    "volvió a mostrar la cantidad física como principal"
  );
});

test("la ficha deja de decidir por `unidadEnviada` y usa el descriptor", () => {
  const src = codigoDe(FICHA);

  // El descriptor sigue mandando; lo que cambió es que la ficha lo pide a través
  // de `escalaDeEnvio`, la MISMA resolución que usan las cuatro rutas del
  // servidor. Antes la calculaba al lado con tres líneas propias.
  assert.match(src, /const escala = escalaDeEnvio\(d\)/);
  assert.match(src, /const envio = escala\.envio/);
  assert.match(src, /rotuloDeEnvio\(envio\)/);
  assert.match(src, /nombreDePresentacion\(envio\)/);

  // La decisión vieja —BULTO ⇒ pack, resto ⇒ unidad— ya no está.
  assert.ok(
    !/const agrupa = d\.unidadEnviada === "BULTO"/.test(src),
    "quedó la decisión vieja, que confundía cajón con pack"
  );
  assert.ok(
    !/if \(d\.unidadEnviada === "BULTO"\) return factor > 1 \? `PACK/.test(src),
    "quedó la presentación pobre"
  );
});

test("18-19. KG no se dice en «unidades» y PIEZA no se degrada", () => {
  const src = codigoDe(FICHA);
  // La unidad del resultado la decide el dominio, no una constante.
  assert.match(src, /\{unidadDeDiferencia\(envio\)\}/);
  assert.ok(
    !/Ingreso físico: <span className="tabular-nums">\{fmtCantidad\(fisicasEditadas\)\}<\/span>\{" "\}\s*unidades/.test(src),
    "volvió el «unidades» fijo, que para un fiambre es falso"
  );
  // Y las unidades físicas secundarias solo se piden donde significan algo:
  // `rotuloFisicoDeEnvio` devuelve null en KG y en PIEZA.
  assert.match(src, /rotuloFisicoDeEnvio\(envio\)/);
});

test("la ficha usa el factor CONGELADO para su aritmética", () => {
  const src = codigoDe(FICHA);
  assert.match(src, /const factor = escala\.factorPack/);
  // Ya no lee el factor del catálogo que viaja en el DTO.
  assert.ok(
    !/const factor = Number\(d\.factorPack \|\| 1\)/.test(src),
    "volvió a leer el factor vivo: editar el producto reescribiría el remito"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. EL PRODUCTO NO DECLARADO
// ═══════════════════════════════════════════════════════════════════════════

test("13. el no declarado usa la presentación del catálogo del ORIGEN", () => {
  const src = codigoDe(AGREGAR);

  // La resolución se mudó a `presentacionDeProductoNuevo`, en el dominio: los
  // seis campos del catálogo se leen ahí y no en el JSX. El candado sigue al
  // código y de paso afirma más — que ese helper NO recibe `contadoEn`, que era
  // lo que dejaba a la elección manual pisar al catálogo.
  assert.match(src, /presentacionDeProductoNuevo\(producto\)/);
  const ui = codigoDe("lib/transferencias/recepcionUI.js");
  assert.match(ui, /unidadMedida: producto\?\.unidadMedida/);
  assert.match(ui, /modoVentaDeposito: producto\?\.modoVentaDeposito/);
  assert.match(ui, /pesoReferenciaKg: producto\?\.pesoReferenciaKg/);
  assert.match(ui, /modoCompraProveedor: producto\?\.modoCompraProveedor/);

  // Se MUESTRA qué es, en vez de preguntarlo.
  assert.match(src, /Presentación de origen/);

  // ── Y EL SELECTOR SE FUE DEL TODO ─────────────────────────────────────
  //
  // Acá decía `{opciones.length > 1 && (`: la pregunta seguía apareciendo en un
  // pack, que es justo donde el catálogo tiene la respuesta. Lo que queda es la
  // unidad DERIVADA y, en un agrupado, los dos campos del bulto incompleto.
  assert.ok(!/opciones\.length > 1/.test(src), "volvió el selector condicional");
  assert.match(src, /const esAgrupada = unidad === "BULTO"/);
});

test("12. y sigue buscando SOLO en el catálogo del origen", () => {
  const src = codigoDe(AGREGAR);
  assert.match(src, /buscar-productos-origen/);
  for (const prohibido of ["buscar-productos-destino", "catalogo-global", "buscarCatalogoLocal("]) {
    assert.ok(!src.includes(prohibido), `apareció otra fuente de búsqueda: ${prohibido}`);
  }
});

test("14. una línea agregada sigue con enviada 0, autor y fecha, y sin stock", () => {
  const ruta = codigoDe("app/api/transferencias/linea-recepcion/route.js");

  assert.match(ruta, /cantidad: 0,/);
  assert.match(ruta, /agregadoEnRecepcion: true/);
  assert.match(ruta, /agregadoEnRecepcionPorId: usuarioId/);
  assert.match(ruta, /agregadoEnRecepcionAt: new Date\(\)/);

  // 14 · agregar NO mueve stock: esta ruta no toca ninguna tabla de inventario.
  for (const tabla of ["stockLocal", "auditoriaStock", "enTransito"]) {
    assert.ok(
      !new RegExp(`${tabla}\\.(update|create|upsert)`).test(ruta),
      `agregar un producto está moviendo stock: ${tabla}`
    );
  }
});

test("13b. y acepta el desglose de bultos completos + sueltas", () => {
  const ruta = codigoDe("app/api/transferencias/linea-recepcion/route.js");
  assert.match(ruta, /recibidoUnidadesSueltas: sueltas/);
  // Con la MISMA regla que la recepción normal: sueltas solo si agrupa.
  //
  // Y la pregunta se le hace a la unidad AUTORITATIVA —la que el servidor deriva
  // del catálogo del origen— y no a la que mandó el cliente. Acá decía
  // `uni.unidad !== "BULTO"`: con eso, un pedido que declarara "BULTO" sobre un
  // producto por kilo habilitaba un desglose que en esa escala no existe.
  assert.match(ruta, /traeSueltas && uni\.ok && unidadAutoritativa !== "BULTO"/);
  assert.ok(
    !/traeSueltas && uni\.ok && uni\.unidad !== "BULTO"/.test(ruta),
    "el desglose volvió a juzgarse contra la unidad que mandó el cliente"
  );
  assert.match(ruta, /SUELTAS_SIN_BULTO/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. CONFIRMAR SIGUE SIENDO LA ÚNICA AUTORIDAD
// ═══════════════════════════════════════════════════════════════════════════

test("15. revisar no mueve stock y confirmar sigue siendo la autoridad", () => {
  const revisar = codigoDe("app/api/transferencias/revisar-producto/route.js");
  for (const tabla of ["stockLocal", "auditoriaStock"]) {
    assert.ok(
      !new RegExp(`${tabla}\\.(update|create|upsert)`).test(revisar),
      `revisar está moviendo stock: ${tabla}`
    );
  }

  const confirmar = codigoDe("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(confirmar, /stockLocal\.(update|upsert|create)/);
  assert.match(confirmar, /PRODUCTOS_SIN_REVISAR/);
});

test("y confirmar usa el peso CONGELADO para acreditar kilos", () => {
  const confirmar = codigoDe("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(confirmar, /piezasToKg\(recibida, pesoPiezaParaRecepcion\(d\)\)/);
  assert.ok(
    !/piezasToKg\(recibida, Number\(d\.producto\.base\.pesoReferenciaKg\)\)/.test(confirmar),
    "volvió a leer el peso vivo: editar el producto cambiaría el stock acreditado"
  );

  const servidor = codigoDe("lib/transferencias/recepcionServidor.js");
  assert.match(servidor, /export function pesoPiezaParaRecepcion/);

  // ── EL FACTOR YA NO SE PREGUNTA SUELTO ────────────────────────────────
  //
  // `factorParaRecepcion` contestaba SOLO el factor, y eso resultó ser media
  // respuesta: la cantidad y la unidad seguían saliendo de los campos crudos,
  // así que un envío de 6 CAJÓN x8 se validaba en 48 UNIDAD con un factor 8 que
  // la unidad hacía inaplicable. La pregunta correcta es la escala entera, y la
  // contesta `escalaDeRecepcion`. Dejar las dos habría sido dejar dos respuestas
  // para la misma pregunta, que es como empezó este defecto.
  assert.match(servidor, /export function escalaDeRecepcion/);
  assert.match(servidor, /export function detalleParaValidar/);
  assert.match(servidor, /factorPack: escala\.factorPack/);
  assert.ok(
    !/factorParaRecepcion/.test(servidor),
    "volvió la respuesta parcial al lado de la completa"
  );
});
