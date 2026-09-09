// LOS SIETE DEFECTOS DE LA REVISIÓN ARQUITECTÓNICA, CON SU CANDADO CADA UNO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/revisionSueltas.test.mjs
//
// La suite estaba verde y ninguno de estos se veía. Vale la pena decir por qué,
// porque es la lección repetible: los candados que había probaban cada pieza —la
// aritmética, la ruta de revisar, el resumen— y estos defectos viven ENTRE las
// piezas, o en un camino que ningún test recorría.
//
// El peor, desmarcar, no era ni siquiera un camino nuevo: era el MISMO validador
// llamado con un cuerpo parcial, y el fallback "sin recepción cargada se propone
// lo enviado" —correcto en su lugar— reescribía un conteo terminado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validarDetalleRecepcion, unidadesFisicasDe } from "./recepcion.js";
import { categoriasDelRemito, codigosDeLinea } from "./controlFisico.js";
import { codigosDeItem } from "@/lib/productos/busquedaCodigoBarra";
import { cantidadAValorizar } from "./costoTransferencia.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const REVISAR = "app/api/transferencias/revisar-producto/route.js";
const AGREGAR = "components/transferencias/AgregarProductoRecibido.jsx";
const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";
const MOVIL = "components/transferencias/RecepcionMovil.jsx";
const TABLA = "components/transferencias/TablaDetalleTransferencia.jsx";
const DETALLE = "app/api/transferencias/detalle/route.js";
const PAGINA = "app/modulos/transferencias/[id]/page.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// 1. DESMARCAR NO PUEDE REESCRIBIR EL CONTEO
// ═══════════════════════════════════════════════════════════════════════════

test("1. desmarcar toca SOLO los tres campos de la revisión", () => {
  const src = leerSinComentarios(REVISAR);

  // Tiene un camino propio que corta ANTES de validar: desmarcar no es una
  // captura, así que no hay nada que validar ni que recalcular.
  const posCamino = src.indexOf("if (!revisado)");
  const posValidar = src.indexOf("validarDetalleRecepcion(");
  assert.ok(posCamino > 0, "desmarcar no tiene camino propio");
  assert.ok(posCamino < posValidar, "desmarcar sigue pasando por la validación");

  // Y lo que escribe son exactamente los tres campos.
  const bloque = src.slice(posCamino, src.indexOf("return { detalle: desmarcado", posCamino));
  assert.match(bloque, /revisadoEnRecepcion: false/);
  assert.match(bloque, /revisadoEnRecepcionPorId: null/);
  assert.match(bloque, /revisadoEnRecepcionAt: null/);
  for (const campo of ["recibido:", "recibidoUnidadesSueltas:", "motivoPrincipal:", "motivoDetalle:"]) {
    assert.ok(
      !bloque.includes(campo),
      `desmarcar escribe ${campo}: eso no es desmarcar, es borrar el conteo`
    );
  }
});

test("1b. y marcar con un cuerpo PARCIAL conserva lo persistido", () => {
  // El mismo defecto por otra puerta: si el request no manda `recibido`, el
  // validador tiene que ver lo que hay guardado y no el fallback de lo enviado.
  const src = leerSinComentarios(REVISAR);
  assert.match(src, /recibido: d\.recibido/, "lo persistido no es la base de la validación");
  assert.match(src, /recibidoUnidadesSueltas: d\.recibidoUnidadesSueltas/);
  // Y se distingue "no lo mandó" de "lo mandó vacío".
  assert.match(src, /hasOwnProperty\.call\(body \|\| \{\}, clave\)/);
  assert.match(src, /trae\("recibido"\) \? body\.recibido : undefined/);
});

test("1c. el fallback que causaba el daño sigue existiendo donde SÍ corresponde", () => {
  // No se rompió `resolverRecibido`: sin recepción cargada, proponer lo enviado
  // sigue siendo lo correcto. Lo que estaba mal era llegar ahí con una recepción
  // ya cargada.
  const sinCargar = validarDetalleRecepcion({
    detalle: { cantidad: 6, unidadEnviada: "BULTO", recibido: null },
    factorPack: 6,
  });
  assert.equal(sinCargar.recibida, 6, "sin recepción cargada se propone lo enviado");

  // Y con lo persistido presente, se conserva.
  const conCargado = validarDetalleRecepcion({
    detalle: {
      cantidad: 6, unidadEnviada: "BULTO",
      recibido: 5, recibidoUnidadesSueltas: 5, motivoPrincipal: "Faltante",
    },
    factorPack: 6,
  });
  assert.equal(conCargado.recibida, 5);
  assert.equal(conCargado.recibidaSueltas, 5);
  assert.equal(conCargado.recibidaUnidades, 35, "35 físicas, no 36");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. NI STOCK NI COSTO EN LA PANTALLA DE RECEPCIÓN
// ═══════════════════════════════════════════════════════════════════════════

test("2. la búsqueda de producto no declarado no muestra stock ni costo", () => {
  const src = leerSinComentarios(AGREGAR);
  assert.ok(!/Stock origen/i.test(src), 'volvió el rótulo "Stock origen"');
  assert.ok(!/stockActual/.test(src), "se sigue leyendo stockActual");
  assert.ok(!/precioCosto/.test(src), "se sigue leyendo precioCosto");
  for (const prohibido of ["Disponible", "Hay stock", "Costo"]) {
    assert.ok(!src.includes(prohibido), `apareció "${prohibido}"`);
  }
  // Y sí lo que hace falta para identificar el producto en la mano.
  assert.match(src, /p\.codigoBarra/);
  assert.match(src, /p\.factorPack/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3-4. EL CATÁLOGO DEL ORIGEN ES EXCEPCIÓN, Y SE INFORMA
// ═══════════════════════════════════════════════════════════════════════════

test("3. la acción del catálogo del origen solo existe tras no encontrar", () => {
  const src = leerSinComentarios(WORKSPACE);

  // ── AHORA SON DOS SUPERFICIES, Y LAS DOS TIENEN QUE ESTAR GUARDADAS ─────
  //
  // Esto miraba un solo archivo y toda aparición de `setAgregarAbierto(true)`.
  // El 2026-09-09 la composición móvil se mudó a `RecepcionMovil`, así que la
  // puerta del teléfono ya no se escribe acá: `WorkspaceRecepcion` le pasa un
  // `onAbrirAgregar` y la que decide CUÁNDO se dibuja el botón es la
  // composición.
  //
  // Se reescribe afirmando sobre lo que se RENDERIZA en cada una, que es donde
  // vive la regla. Pasar el callback hacia abajo no es una puerta: es cableado.
  // Si esto siguiera contando toda aparición de `setAgregarAbierto(true)`, el
  // cableado lo habría puesto en rojo sin que nada estuviera mal — y la
  // tentación entonces habría sido aflojarlo.
  const superficies = [
    // [archivo, cómo se escribe el opener, cómo se escribe su guarda]
    [src, /onClick=\{\(\) => setAgregarAbierto\(true\)\}/g, /aviso === MENSAJE_NO_FIGURA && puedeRecibir && \(/],
    [leerSinComentarios(MOVIL), /onClick=\{onAbrirAgregar\}/g, /aviso === mensajeNoFigura && puedeRecibir && \(/],
  ];

  let puertas = 0;
  for (const [texto, opener, guarda] of superficies) {
    const aperturas = [...texto.matchAll(opener)];
    assert.ok(aperturas.length >= 1, "una composición se quedó sin puerta al catálogo");
    puertas += aperturas.length;
    for (const m of aperturas) {
      const antes = texto.slice(Math.max(0, m.index - 200), m.index);
      assert.match(antes, guarda, "hay una puerta al catálogo sin condicionar al aviso de que no figura");
    }
  }
  assert.ok(puertas >= 2, "se perdió una de las dos superficies: el candado dejó de cubrirla");
  // El aviso se limpia al elegir un producto, así que encontrar uno del remito
  // hace desaparecer la acción de excepción.
  assert.match(src, /const elegir = \(d\) => \{[\s\S]{0,160}setAviso\(""\)/);
  // Y el aviso solo aparece cuando la búsqueda falló.
  assert.match(src, /setAviso\(MENSAJE_NO_FIGURA\)/);
});

test("4. el lenguaje es INFORMAR una inconsistencia, no agregarse mercadería", () => {
  const src = leerSinComentarios(AGREGAR);
  assert.match(src, /TITULO_AGREGAR = "Producto no declarado"/);
  assert.match(src, /ACCION_AGREGAR = "Informar producto no declarado"/);
  assert.ok(!/"Agregar a recepción"/.test(src), "quedó el copy viejo");
  assert.ok(!/TITULO_AGREGAR = "Agregar producto recibido"/.test(src));

  // Los nombres internos NO se renombraron: mover una ruta desplegada y una
  // columna por una cuestión de redacción sería un cambio de otra tanda. Se
  // miran donde de verdad viven —la página hace el fetch, el componente solo
  // arma el cuerpo— y no donde uno supone.
  const pagina = leerSinComentarios(PAGINA);
  assert.match(pagina, /transferencias\/linea-recepcion/, "se renombró la ruta por cosmética");
  const ws = leerSinComentarios(WORKSPACE);
  assert.match(ws, /agregadoEnRecepcion/, "se renombró el campo por cosmética");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. LAS CATEGORÍAS DEL REMITO SON DEL REMITO
// ═══════════════════════════════════════════════════════════════════════════

test("5. un producto no declarado NO contamina las categorías del remito", () => {
  const items = [
    { id: 1, categoria: { id: 9, nombre: "Golosinas" }, agregadoEnRecepcion: false },
    { id: 2, categoria: { id: 4, nombre: "Limpieza" }, agregadoEnRecepcion: true },
  ];
  const cats = categoriasDelRemito(items);
  assert.deepEqual(cats.map((c) => c.nombre), ["Golosinas"]);
  assert.ok(
    !cats.some((c) => c.nombre === "Limpieza"),
    "el chip aparecería y al tocarlo daría una lista vacía: los tabs del remito excluyen los agregados"
  );
  // Y el conteo del chip también deja de contarlo.
  assert.equal(cats[0].cantidad, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. EL HISTÓRICO ENTIENDE EL PACK INCOMPLETO
// ═══════════════════════════════════════════════════════════════════════════

test("6. la tabla histórica mide la diferencia en FÍSICO", () => {
  const src = leerSinComentarios(TABLA);
  // Ya no resta cantidades de presentación.
  assert.ok(
    !/const diff = recibido == null \? null : recibido - enviada/.test(src),
    "volvió la resta en la escala del pack"
  );
  assert.match(src, /unidadesFisicasDe\(/, "no usa la función canónica");
  assert.match(src, /sueltas: d\.recibidoUnidadesSueltas/, "ignora el pack incompleto");
  assert.match(src, /const diff = envFis == null \|\| recFis == null \? null : recFis - envFis/);
  // Y muestra el DESGLOSE, no solo el total.
  assert.match(src, /desgloseFisico\(d, recibido\)/);
});

test("6b. el endpoint de detalle pasa las sueltas al ajuste del origen", () => {
  const src = leerSinComentarios(DETALLE);
  assert.match(
    src,
    /recibidaSueltas: d\.recibidoUnidadesSueltas/,
    "el ajuste informativo ignora el pack incompleto y contradice al stock"
  );
  // Y los acumulados que deciden "tiene diferencias" van en físico.
  assert.match(src, /milesimasFisicas\(\{/);
  assert.ok(
    !/itemsRecibidos \+= cantidadRecibida \?\? 0/.test(src),
    "los totales vuelven a sumar la escala del pack"
  );
});

test("6c. el tile de la página cuenta diferencias con el MISMO estado que las cards", () => {
  const src = leerSinComentarios(PAGINA);
  assert.ok(
    !/num\(d\.cantidadRecibida\) !== num\(d\.cantidadEnviada\)/.test(src),
    "volvió la comparación en la escala del pack"
  );
  assert.match(src, /estadoDeProducto\(\{ \.\.\.d, revisadoEnRecepcion: true \}\)/);
});

test("6d. los tres casos del pedido, medidos", () => {
  const fis = (cantidad, sueltas) =>
    unidadesFisicasDe({ cantidad, sueltas, unidad: "BULTO", factorPack: 6 });

  // 6 packs + 1 suelta = 37 contra 36 → +1, NO "exacto".
  assert.equal(fis(6, 1) - fis(6, 0), 1);
  // 5 packs + 5 sueltas = 35 contra 36 → falta 1, NO 6.
  assert.equal(fis(6, 0) - fis(5, 5), 1);
  // 5 packs + 6 sueltas = 36 contra 36 → no falta nada, aunque 5 ≠ 6.
  assert.equal(fis(5, 6) - fis(6, 0), 0);
});

test("6e. la VALORIZACIÓN incluye las sueltas, y esa división es de dinero", () => {
  // Su semántica ya era "cuánto vale lo recibido": ignorar las sueltas subvalúa.
  assert.equal(cantidadAValorizar({ cantidad: 6, recibido: 5 }), 5, "sin sueltas, como antes");
  assert.equal(
    cantidadAValorizar({
      cantidad: 6, recibido: 5, recibidoUnidadesSueltas: 5,
      unidadEnviada: "BULTO", factorPack: 6,
    }),
    5 + 5 / 6,
    "5 unidades de un pack de 6 valen 5/6 de pack"
  );
  // En UNIDAD no hay división que hacer.
  assert.equal(
    cantidadAValorizar({
      cantidad: 10, recibido: 8, recibidoUnidadesSueltas: 2, unidadEnviada: "UNIDAD", factorPack: 1,
    }),
    8
  );
  // Y los casos viejos no se movieron.
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: 0 }), 0);
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: null }), 20);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. UNA SOLA DEFINICIÓN DE CÓDIGO ESCANEABLE
// ═══════════════════════════════════════════════════════════════════════════

test("7. los códigos escaneables salen de `codigosDeItem`, no de una lista propia", () => {
  const src = leerSinComentarios("lib/transferencias/controlFisico.js");
  assert.match(src, /return codigosDeItem\(d\)/, "la recepción tiene su propia lista de códigos");
  assert.ok(
    !/d\.codigoBarraPropio, d\.codigoBarra, d\.codigoBarraSecundario/.test(src),
    "quedó la copia de los tres nombres"
  );

  // Y contesta lo mismo que la central, campo por campo.
  const linea = { codigoBarraPropio: "P", codigoBarra: "B", codigoBarraSecundario: "S" };
  assert.deepEqual(codigosDeLinea(linea), codigosDeItem(linea));
  assert.deepEqual(codigosDeLinea(linea), ["P", "B", "S"]);
  // Incluido el filtrado de vacíos.
  assert.deepEqual(codigosDeLinea({ codigoBarra: "B" }), ["B"]);
});
