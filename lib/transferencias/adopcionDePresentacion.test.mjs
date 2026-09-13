// UNA HISTÓRICA ABIERTA SE PUEDE RECIBIR, SIN INVENTARLE UN PASADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/adopcionDePresentacion.test.mjs
//
// ── EL CASO REAL ────────────────────────────────────────────────────────
//
// La transferencia #176 se creó antes de que el sistema congelara la
// presentación. Lo único escrito es la cantidad física:
//
//     COCA COLA 2L — Enviado 40 UNIDAD
//
// aunque hoy ese producto se trabaja en CAJÓN x8. **Eso es correcto**: nadie
// anotó cómo salió, y dividir 40 por el factor de hoy sería afirmar un hecho que
// nadie observó. Por eso no hay backfill.
//
// Pero el operador tiene cinco cajones en la mano. La salida es que él ADOPTE
// explícitamente la presentación de hoy PARA CONTAR — un hecho nuevo, de la
// recepción, con su autor y su fecha.
//
// ── LO QUE ESTOS CANDADOS DEFIENDEN ─────────────────────────────────────
//
// Que esa adopción no se pueda confundir después con un despacho registrado,
// que no redondee nunca, y que una vez tomada no vuelva a depender del catálogo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { piezasToKg } from "@/lib/conversiones/stock";
import {
  MOTIVOS_ADOPCION,
  ORIGEN_PRESENTACION,
  admiteAdopcion,
  conversionParaAdoptar,
  hayPresentacionDistinta,
  origenDePresentacion,
} from "./adopcionDePresentacion.js";
import { descriptorDeEnvio, firmaDeEdicion, nombreDePresentacion } from "./presentacionEnvio.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FichaProductoRecepcion from "@/components/transferencias/FichaProductoRecepcion";
// Los rótulos del bloque de adopción ya no se importan porque ya no existen. Los
// candados que afirman su AUSENCIA usan el texto literal a propósito: importar
// una constante para comprobar que no está es imposible, y escribirla acá deja
// el texto exacto que hay que buscar si alguien lo reintroduce.
import {
  escalaDeRecepcion,
  esPiezaParaRecepcion,
  pesoPiezaParaRecepcion,
  planificarRecepcion,
} from "./recepcionServidor.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const codigoDe = (rel) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const RUTA = "app/api/transferencias/adoptar-presentacion/route.js";
const FICHA = "components/transferencias/FichaProductoRecepcion.jsx";

/** Una línea histórica con la forma del DTO de `/api/transferencias/detalle`. */
const dtoHistorico = (extra = {}) => ({
  nombre: "COCA COLA 2L",
  cantidadEnviada: 40,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  agregadoEnRecepcion: false,
  unidadEnviada: "UNIDAD",
  factorPack: 8,
  unidadMedida: "cajon",
  presentacionEnvio: null,
  cantidadPresentada: null,
  sueltasEnviadas: null,
  factorPresentacion: null,
  pesoPiezaKg: null,
  presentacionAdoptadaAt: null,
  presentacionActual: { presentacion: "CAJON", factor: 8, pesoPiezaKg: null },
  ...extra,
});

/** La MISMA línea después de que el servidor persistió la adopción. */
const dtoAdoptado = (extra = {}) =>
  dtoHistorico({
    presentacionEnvio: "CAJON",
    cantidadPresentada: 5,
    sueltasEnviadas: 0,
    factorPresentacion: 8,
    presentacionAdoptadaAt: "2026-09-10T12:00:00.000Z",
    ...extra,
  });
const MIGRACION = "prisma/migrations/20260910120000_presentacion_adoptada_en_recepcion/migration.sql";

/** El catálogo de HOY: el producto pasó a trabajarse en cajones de 8. */
const CAJON_X8 = { presentacion: "CAJON", factor: 8, pesoPiezaKg: null };

/** Una fila de `TransferenciaDetalle` histórica, tal como la devuelve Prisma. */
const historica = (extra = {}, base = {}) => ({
  id: 1,
  cantidad: 40,
  unidadEnviada: "UNIDAD",
  recibido: null,
  recibidoUnidadesSueltas: null,
  motivoPrincipal: null,
  agregadoEnRecepcion: false,
  presentacionEnvio: null,
  cantidadPresentada: null,
  sueltasEnviadas: null,
  factorPresentacion: null,
  pesoPiezaKg: null,
  presentacionAdoptadaAt: null,
  presentacionAdoptadaPorId: null,
  producto: {
    base: {
      id: 10,
      nombre: "COCA COLA 2L",
      unidad_medida: "cajon",
      factor_pack: 8,
      es_combo: false,
      ...base,
    },
  },
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. SIN ADOPTAR, LA HISTÓRICA SIGUE DICIENDO LO QUE DECÍA
// ═══════════════════════════════════════════════════════════════════════════

test("9. una histórica sin adopción conserva su lectura legacy", () => {
  const d = historica();
  const e = escalaDeRecepcion(d);

  assert.equal(e.registrado, false, "se hizo pasar por registrada");
  assert.equal(e.unidad, "UNIDAD");
  assert.equal(e.factorPack, 1);
  assert.equal(e.cantidad, 40, "la cantidad histórica es la física y no se reinterpreta");
  assert.equal(origenDePresentacion(d), null, "sin snapshot no hay procedencia que declarar");
});

test("9b. y el catálogo de hoy sí dice otra cosa, que es lo que habilita ofrecerlo", () => {
  const d = historica();
  assert.equal(hayPresentacionDistinta(CAJON_X8, escalaDeRecepcion(d).envio), true);
  assert.equal(admiteAdopcion(d).ok, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10-11. LA CONVERSIÓN: COMPLETOS Y RESTO, NUNCA UNA FRACCIÓN DE BULTO
// ═══════════════════════════════════════════════════════════════════════════

test("10. 40 físicas en CAJÓN x8 son 5 completos y 0 sueltas", () => {
  const c = conversionParaAdoptar({ fisicasM: 40000, presentacion: "CAJON", factor: 8 });
  assert.equal(c.ok, true, c.motivo);
  assert.equal(c.cantidadPresentada, 5);
  assert.equal(c.sueltasEnviadas, 0);
  assert.equal(c.factorPresentacion, 8);
  assert.equal(c.pesoPiezaKg, null);
  // Y la cuenta cierra contra la física, que es la autoridad.
  assert.equal(c.cantidadPresentada * c.factorPresentacion + c.sueltasEnviadas, 40);
});

test("11. 42 físicas en CAJÓN x8 son 5 completos y 2 sueltas", () => {
  const c = conversionParaAdoptar({ fisicasM: 42000, presentacion: "CAJON", factor: 8 });
  assert.equal(c.ok, true, c.motivo);
  assert.equal(c.cantidadPresentada, 5);
  assert.equal(c.sueltasEnviadas, 2);
  assert.equal(c.cantidadPresentada * c.factorPresentacion + c.sueltasEnviadas, 42);

  // Lo que NO es: 5,25 cajones. Ese número no existe en el depósito, y el
  // decimal es el mismo error de exactitud que todo este modelo evita.
  assert.notEqual(c.cantidadPresentada, 5.25);
  assert.ok(Number.isInteger(c.cantidadPresentada));
  assert.ok(Number.isInteger(c.sueltasEnviadas));
});

test("11b. un PACK y un KG también, cada uno en su escala", () => {
  const pack = conversionParaAdoptar({ fisicasM: 29000, presentacion: "PACK", factor: 6 });
  assert.deepEqual(
    { c: pack.cantidadPresentada, s: pack.sueltasEnviadas },
    { c: 4, s: 5 },
    "4 × 6 + 5 = 29"
  );

  // Los kilos admiten decimales: no hay conversión, se nombra lo mismo bien.
  const kg = conversionParaAdoptar({ fisicasM: 3250, presentacion: "KG" });
  assert.equal(kg.ok, true);
  assert.equal(kg.cantidadPresentada, 3.25);
  assert.equal(kg.sueltasEnviadas, 0);
  assert.equal(kg.factorPresentacion, null);
});

test("11c. un agrupado sin factor conocido NO se adopta: no se inventa un bulto", () => {
  for (const factor of [null, 1, 0, "x"]) {
    const c = conversionParaAdoptar({ fisicasM: 40000, presentacion: "CAJON", factor });
    assert.equal(c.ok, false, `factor ${factor} pasó`);
    assert.equal(c.motivo, MOTIVOS_ADOPCION.FACTOR_INVALIDO);
  }
});

test("11d. media unidad suelta no se puede representar, y no se redondea", () => {
  // 42,5 físicas en cajones de 8: el resto sería media unidad. No existe.
  const c = conversionParaAdoptar({ fisicasM: 42500, presentacion: "CAJON", factor: 8 });
  assert.equal(c.ok, false);
  assert.equal(c.motivo, MOTIVOS_ADOPCION.NO_REPRESENTABLE);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12-13. UNA VEZ ADOPTADA, GOBIERNA ELLA Y NO EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

/** La misma línea, después de que el servidor persistió la adopción. */
const adoptada = (extra = {}, base = {}) =>
  historica(
    {
      presentacionEnvio: "CAJON",
      cantidadPresentada: 5,
      sueltasEnviadas: 0,
      factorPresentacion: 8,
      pesoPiezaKg: null,
      presentacionAdoptadaAt: new Date("2026-09-10T12:00:00Z"),
      presentacionAdoptadaPorId: 4,
      ...extra,
    },
    base
  );

test("12. guardar y recargar conserva la adopción, y su procedencia", () => {
  const d = adoptada();
  const e = escalaDeRecepcion(d);

  assert.equal(e.unidad, "BULTO");
  assert.equal(e.factorPack, 8);
  assert.equal(e.cantidad, 5);
  assert.equal(e.sueltas, 0);

  // ── Y NO SE HACE PASAR POR UN DESPACHO REGISTRADO ───────────────────
  //
  // Es lo que más importa de este archivo: los cinco campos son los mismos que
  // usa el snapshot de despacho, así que sin la marca esta línea afirmaría que
  // el origen la despachó en cajones. Nadie registró eso.
  assert.equal(origenDePresentacion(d), ORIGEN_PRESENTACION.ADOPTADA);
  assert.notEqual(origenDePresentacion(d), ORIGEN_PRESENTACION.DESPACHO);

  // La cantidad física histórica sigue intacta: es la que movió stock.
  assert.equal(Number(d.cantidad), 40);
});

test("12b. las tres procedencias se distinguen, y el default no necesita backfill", () => {
  // Sin snapshot: reconstruida del catálogo de hoy.
  assert.equal(origenDePresentacion(historica()), null);

  // Con snapshot y SIN marca de adopción: se despachó así. Es el default
  // correcto para las filas que la tanda anterior escribió, sin tocarlas.
  assert.equal(
    origenDePresentacion(historica({ presentacionEnvio: "CAJON", cantidadPresentada: 6 })),
    ORIGEN_PRESENTACION.DESPACHO
  );

  // Agregada en recepción: la escala salió del catálogo al informarla.
  assert.equal(
    origenDePresentacion(
      historica({ presentacionEnvio: "PACK", cantidadPresentada: 0, agregadoEnRecepcion: true })
    ),
    ORIGEN_PRESENTACION.NO_DECLARADO
  );

  // Y adoptada.
  assert.equal(origenDePresentacion(adoptada()), ORIGEN_PRESENTACION.ADOPTADA);
});

test("13. cambiar el factor del catálogo DESPUÉS de adoptar no cambia la recepción", () => {
  // Alguien edita `factor_pack` de 8 a 12 entre adoptar y confirmar.
  const d = adoptada({ recibido: 5, recibidoUnidadesSueltas: 0 }, { factor_pack: 12 });

  assert.equal(escalaDeRecepcion(d).factorPack, 8, "leyó el factor de hoy");

  const r = planificarRecepcion([d]);
  assert.equal(r.ok, true, `no se pudo planificar: ${r.error}`);
  const plan = r.planes.get(1);
  assert.equal(plan.enviadaUnidades, 40, "5 × 8, con el factor congelado");
  assert.equal(plan.recibidaUnidades, 40);
  assert.equal(plan.hayDiferencia, false);

  // CONTRAPRUEBA: sin adoptar, esa misma edición sí se cuela en la lectura.
  const sinAdoptar = historica({ unidadEnviada: "BULTO", cantidad: 5 }, { factor_pack: 12 });
  assert.equal(escalaDeRecepcion(sinAdoptar).factorPack, 12, "la contraprueba dejó de probar");
});

test("13b. y una línea ya adoptada no se puede volver a adoptar", () => {
  const r = admiteAdopcion(adoptada());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT);
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. PIEZA: NI SE REDONDEA NI SE INVENTA
// ═══════════════════════════════════════════════════════════════════════════

test("14. una PIEZA solo se adopta si la equivalencia es exacta", () => {
  // 2 piezas enteras: válido, y el peso queda congelado.
  const ok = conversionParaAdoptar({ fisicasM: 2000, presentacion: "PIEZA", pesoPiezaKg: 4.5 });
  assert.equal(ok.ok, true, ok.motivo);
  assert.equal(ok.cantidadPresentada, 2);
  assert.equal(ok.pesoPiezaKg, 4.5);
  assert.equal(piezasToKg(ok.cantidadPresentada, ok.pesoPiezaKg), 9);

  // 3,25 físicas: eso no es una cantidad de piezas. No se redondea a 3.
  const roto = conversionParaAdoptar({ fisicasM: 3250, presentacion: "PIEZA", pesoPiezaKg: 4.5 });
  assert.equal(roto.ok, false);
  assert.equal(roto.motivo, MOTIVOS_ADOPCION.NO_REPRESENTABLE);
  assert.equal(roto.cantidadPresentada, undefined, "devolvió un número igual");

  // Sin peso tampoco: de ese número sale cuántos kilos entran al destino.
  for (const peso of [null, 0, -1, "x"]) {
    const sinPeso = conversionParaAdoptar({ fisicasM: 2000, presentacion: "PIEZA", pesoPiezaKg: peso });
    assert.equal(sinPeso.ok, false, `peso ${peso} pasó`);
    assert.equal(sinPeso.motivo, MOTIVOS_ADOPCION.PESO_INVALIDO);
  }
});

test("14b. una PIEZA adoptada acredita kilos con el peso congelado", () => {
  const d = adoptada({
    presentacionEnvio: "PIEZA",
    cantidadPresentada: 2,
    factorPresentacion: null,
    pesoPiezaKg: 4.5,
    cantidad: 2,
    recibido: 2,
  }, {
    unidad_medida: "kg", modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA",
    pesoReferenciaKg: 9.9, factor_pack: 1,
  });

  assert.equal(esPiezaParaRecepcion(d), true);
  assert.equal(pesoPiezaParaRecepcion(d), 4.5, "leyó el peso vivo");

  const plan = planificarRecepcion([d]).planes.get(1);
  assert.equal(piezasToKg(plan.recibida, pesoPiezaParaRecepcion(d)), 9, "2 × 4,5 = 9 KG");
});

// ═══════════════════════════════════════════════════════════════════════════
// 15-16. LOS LÍMITES: NI BACKFILL, NI PISAR UNA HISTORIA REGISTRADA
// ═══════════════════════════════════════════════════════════════════════════

test("15. la migración es ADITIVA y no rellena ninguna de las 6388 históricas", () => {
  const sql = leer(MIGRACION).replace(/^\s*--.*$/gm, "");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS "presentacionAdoptadaAt"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "presentacionAdoptadaPorId"/);

  // ── LOS PATRONES SON A NIVEL SENTENCIA, NO PALABRA SUELTA ────────────
  //
  // `\bUPDATE\b` matchea "ON UPDATE CASCADE", que es la acción referencial que
  // Prisma genera para toda clave foránea opcional — justo lo que SÍ queremos
  // que haya. Un candado que se dispara con la forma correcta no informa nada, y
  // el remedio sería sacarle el `ON UPDATE` a la FK, que además haría derivar el
  // schema. Es el mismo criterio que `precisionStock.test.mjs` ya escribió para
  // la baseline; se reusa en vez de inventar un tercero.
  for (const [nombre, patron] of [
    ["DROP", /\bDROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX|TYPE)\b/i],
    ["UPDATE de datos", /UPDATE\s+"/],
    ["INSERT INTO", /INSERT\s+INTO/i],
    ["DELETE FROM", /DELETE\s+FROM/i],
    ["TRUNCATE", /\bTRUNCATE\b/i],
    ["ALTER COLUMN", /\bALTER\s+COLUMN\b/i],
  ]) {
    assert.equal(patron.test(sql), false, `la migración contiene ${nombre}: es estructura, no datos`);
  }
  assert.ok(!/NOT NULL/i.test(sql), "una columna nueva quedó obligatoria");

  // Contraprueba del criterio: sobre un texto con el defecto puesto a mano, el
  // patrón de datos SÍ se dispara. Sin esto, un patrón que no matchea nada se
  // leería igual que uno que pasa.
  assert.equal(/UPDATE\s+"/.test('UPDATE "TransferenciaDetalle" SET x = 1;'), true);
  assert.equal(/UPDATE\s+"/.test("ON DELETE SET NULL ON UPDATE CASCADE;"), false);

  // Y son DOS migraciones en el árbol de esta rama, no una más.
  const dirs = fs
    .readdirSync(path.join(RAIZ, "prisma/migrations"))
    .filter((x) => /^\d/.test(x))
    .sort();
  assert.equal(dirs.length, 10);
  assert.equal(dirs[dirs.length - 1], "20260910120000_presentacion_adoptada_en_recepcion");
});

test("16. una línea CON snapshot de despacho no ofrece adoptar nada", () => {
  // Es la protección central: adoptar acá reemplazaría un hecho observado por
  // una preferencia de hoy.
  const conDespacho = historica({
    presentacionEnvio: "CAJON", cantidadPresentada: 6, factorPresentacion: 8,
  });
  const r = admiteAdopcion(conDespacho);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT);
});

test("16b. y una línea agregada en recepción tampoco: no tiene historia que adoptar", () => {
  const r = admiteAdopcion(historica({ agregadoEnRecepcion: true }));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS_ADOPCION.ES_AGREGADA);
});

test("16c. si el catálogo dice lo mismo, no hay nada que adoptar", () => {
  const d = historica({ unidadEnviada: "BULTO", cantidad: 5 });
  const e = escalaDeRecepcion(d);
  assert.equal(e.factorPack, 8, "la reconstrucción ya lo lee como cajón de 8");
  assert.equal(hayPresentacionDistinta(CAJON_X8, e.envio), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL SERVIDOR ES EL QUE DECIDE
// ═══════════════════════════════════════════════════════════════════════════

test("la ruta no lee presentación, factor ni peso del cuerpo del pedido", () => {
  const src = codigoDe(RUTA);

  // Del cuerpo salen DOS ids y nada más.
  assert.match(src, /const transferenciaId = Number\(body\?\.transferenciaId \|\| 0\)/);
  assert.match(src, /const detalleId = Number\(body\?\.detalleId \|\| 0\)/);
  for (const campo of [
    "body?.presentacion", "body?.factor", "body?.pesoPiezaKg",
    "body.presentacionEnvio", "body?.cantidadPresentada",
  ]) {
    assert.ok(!src.includes(campo), `la ruta lee ${campo} del cliente`);
  }

  // La presentación sale del catálogo releído, con la función canónica y sin
  // `contadoEn`: el pedido no puede influir en qué ES el producto.
  assert.match(src, /const actual = presentacionDeProducto\(\{/);
  assert.ok(!/contadoEn:/.test(src), "la resolución del servidor mira lo que mandó el cliente");

  // Y con el mismo mutex y la misma relectura que las otras escrituras.
  assert.match(src, /await reclamarOFallar\(tx, transferencia\.id, "Recibiendo"\)/);
  assert.match(src, /tx\.transferenciaDetalle\.findFirst\(/);

  // Vuelve a preguntar si la línea admite adopción, sobre SU relectura.
  assert.match(src, /const admite = admiteAdopcion\(d\)/);

  // Persiste la marca de procedencia junto con los cinco campos.
  assert.match(src, /presentacionAdoptadaAt: new Date\(\)/);
  assert.match(src, /presentacionAdoptadaPorId: usuarioId/);

  // Y NO toca la cantidad física, que es la autoridad.
  assert.ok(!/cantidad:\s*conv\./.test(src), "la ruta reescribió la cantidad física");
});

test("18. confirmar sigue moviendo el stock físico correcto sobre una adoptada", () => {
  // 40 físicas adoptadas como 5 CAJÓN x8. Llegan 4 cajones y 3 sueltas: 35.
  const d = adoptada({ recibido: 4, recibidoUnidadesSueltas: 3, motivoPrincipal: "Faltante" });
  const plan = planificarRecepcion([d]).planes.get(1);

  assert.equal(plan.enviadaUnidades, 40);
  assert.equal(plan.recibidaUnidades, 35, "4 × 8 + 3 = 35");
  assert.equal(plan.ajusteOrigenUnidades, 5, "al origen le vuelven 5 unidades físicas");
  assert.equal(plan.devolucionUnidades, 5);
  assert.equal(plan.tocaTransito, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ADOPTAR NO PUEDE DEJAR EL NÚMERO VIEJO EN EL CAMPO
// ═══════════════════════════════════════════════════════════════════════════

test("1c. adoptar 40 UNIDAD → CAJÓN x8 REMONTA la ficha, con el MISMO detalleId", () => {
  // ── EL DEFECTO ────────────────────────────────────────────────────────
  //
  // La ficha inicializa su estado una sola vez y se montaba con
  // `key={seleccionado.id}`. Adoptar cambia la ESCALA sin cambiar el id, así que
  // React conservaba el estado: el rótulo pasaba a "5 CAJÓN x8" y el campo
  // seguía diciendo 40. Y 40 cajones de 8 son 320 unidades.
  const antes = { id: 7, ...dtoHistorico({ cantidadEnviada: 40 }) };
  const despues = { id: 7, ...dtoAdoptado({ cantidadEnviada: 40, cantidadPresentada: 5 }) };

  assert.equal(antes.id, despues.id, "el caso pierde sentido si cambia el id");
  assert.notEqual(
    firmaDeEdicion(antes),
    firmaDeEdicion(despues),
    "la identidad no cambió: React conservaría el 40 en el campo"
  );

  // Y lo que el campo propone después de remontar es 5, no 40.
  assert.equal(descriptorDeEnvio(antes).cantidad, 40);
  assert.equal(descriptorDeEnvio(despues).cantidad, 5);
});

test("1d. 42 físicas quedan en 5 completos + 2 sueltas, y la firma también cambia", () => {
  const antes = { id: 7, ...dtoHistorico({ cantidadEnviada: 42 }) };
  const conv = conversionParaAdoptar({ fisicasM: 42000, presentacion: "CAJON", factor: 8 });
  const despues = {
    id: 7,
    ...dtoAdoptado({
      cantidadEnviada: 42,
      cantidadPresentada: conv.cantidadPresentada,
      sueltasEnviadas: conv.sueltasEnviadas,
    }),
  };

  assert.equal(conv.cantidadPresentada, 5);
  assert.equal(conv.sueltasEnviadas, 2);
  assert.notEqual(firmaDeEdicion(antes), firmaDeEdicion(despues));
  assert.equal(descriptorDeEnvio(despues).cantidad, 5);
  assert.equal(descriptorDeEnvio(despues).sueltas, 2);
});

test("1e. la firma NO cambia por escribir: solo por la escala", () => {
  // Si cambiara con cualquier cosa, la ficha se remontaría mientras el operador
  // escribe y le borraría lo que está tipeando. La `key` es identidad, no un
  // efecto que sincroniza.
  const base = { id: 7, ...dtoAdoptado({ cantidadEnviada: 40, cantidadPresentada: 5 }) };
  const conConteo = { ...base, cantidadRecibida: 4, recibidoUnidadesSueltas: 3 };
  assert.equal(firmaDeEdicion(base), firmaDeEdicion(conConteo));

  // Y sí cambia si cambia el producto.
  assert.notEqual(firmaDeEdicion(base), firmaDeEdicion({ ...base, id: 8 }));
});

test("1f. LAS DOS COMPOSICIONES montan con la firma, no con el id", () => {
  for (const rel of [
    "components/transferencias/WorkspaceRecepcion.jsx",
    "components/transferencias/RecepcionMovil.jsx",
  ]) {
    const src = codigoDe(rel);
    assert.match(src, /key=\{firmaDeEdicion\(seleccionado\)\}/, `${rel} no usa la firma`);
    assert.ok(
      !/key=\{seleccionado\.id\}/.test(src),
      `${rel} volvió a montar por id: adoptar dejaría el número viejo en el campo`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LA HISTÓRICA SE CUENTA SOLA, Y NO SE PREGUNTA NADA
// ═══════════════════════════════════════════════════════════════════════════
//
// Acá había cuatro candados que defendían el bloque de adopción: que mostrara el
// remito original, la presentación de hoy y la equivalencia; que el CTA nombrara
// la presentación de verdad; y que la hoja fuera una vista DEDICADA a decidir,
// sin conteo, hasta que alguien eligiera.
//
// No se aflojaron: se dieron vuelta. Lo que defienden ahora es lo contrario —que
// no se pregunte— y siguen siendo la misma cantidad de afirmaciones sobre las
// mismas dos superficies. El motivo del cambio está en
// `docs/business-rules/unidad-medida-es-como-se-compra.md`.

/** La hoja, tal como la monta `RecepcionMovil`. */
const pintarHoja = (d, props = {}) =>
  renderToStaticMarkup(
    React.createElement(FichaProductoRecepcion, {
      producto: d,
      puedeRecibir: true,
      enHoja: true,
      onRevisar: () => {},
      ...props,
    })
  );

test("10. una histórica abierta muestra el CONTEO, no una decisión", () => {
  // El candado viejo exigía que en la hoja NO hubiera input hasta decidir. Éste
  // exige exactamente lo contrario, que es el arreglo: la línea entra derecho al
  // conteo porque su escala ya está resuelta.
  const html = pintarHoja({ id: 7, ...dtoHistorico({ cantidadEnviada: 40 }) });

  assert.ok(/<input/.test(html), "la histórica no llegó a tener campo de conteo");
  // "y seguir" y no "Marcar revisado": el V26 le sacó al botón las dos palabras
  // que no aportaban. Lo que este candado afirma es que la línea SE PUEDA
  // CERRAR, no cómo se llama el botón — el nombre lo defiende V22-5.
  assert.ok(html.includes("y seguir"), "no se puede cerrar la línea");
  assert.ok(
    !html.includes("Transferencia histórica"),
    "sigue rotulando la línea como un caso especial que hay que resolver"
  );
});

test("10b. y ninguno de los siete rótulos del bloque sobrevivió en el fuente", () => {
  // Por texto Y por constante. Una constante exportada que ningún render usa se
  // lee como capacidad disponible, y el próximo la vuelve a dibujar.
  const src = codigoDe(FICHA);
  for (const t of [
    "Transferencia histórica",
    "no registró cómo salió del depósito",
    "Remito original",
    "Presentación actual del depósito",
    "No cambia el remito original",
    "ROTULO_HISTORICA",
    "ACCION_ADOPTAR",
    "SUFIJO_ADOPTAR",
    "AYUDA_ADOPTAR",
    "bloqueAdopcion",
    "soloDecision",
  ]) {
    assert.ok(!src.includes(t), `quedó "${t}" en la ficha`);
  }
});

test("11. las dos funciones que solo servían para preguntar se BORRARON", () => {
  // Es el corolario de CLAUDE.md: cuando un candado se vuelve inalcanzable, la
  // salida no es arreglarle el fixture — es preguntar si la rama todavía tiene
  // que existir. Acá la respuesta fue que no.
  const dominio = codigoDe("lib/transferencias/adopcionDePresentacion.js");
  assert.ok(
    !/export function modoAdopcionHistorica/.test(dominio),
    "`modoAdopcionHistorica` sigue exportada sin un solo consumidor"
  );
  assert.ok(
    !/export function equivalenciaParaAdoptar/.test(dominio),
    "`equivalenciaParaAdoptar` sigue exportada sin un solo consumidor"
  );
});

test("11b. pero lo que el SERVIDOR usa sigue en pie, y no se tocó", () => {
  // Seis líneas adoptadas en producción dependen de que esta validación siga
  // siendo la misma. Aflojar acá sí sería aflojar un candado.
  const dominio = codigoDe("lib/transferencias/adopcionDePresentacion.js");
  for (const f of ["admiteAdopcion", "conversionParaAdoptar", "hayPresentacionDistinta"]) {
    assert.match(dominio, new RegExp(`export function ${f}`), `desapareció ${f}`);
  }
  // Y la conversión sigue dando lo mismo que antes de esta tanda.
  const conv = conversionParaAdoptar({ fisicasM: 42000, presentacion: "CAJON", factor: 8 });
  assert.equal(conv.cantidadPresentada, 5);
  assert.equal(conv.sueltasEnviadas, 2);
  const roto = conversionParaAdoptar({ fisicasM: 42500, presentacion: "CAJON", factor: 8 });
  assert.equal(roto.ok, false);
  assert.equal(roto.motivo, MOTIVOS_ADOPCION.NO_REPRESENTABLE);
});

test("12b. una línea YA adoptada sigue leyéndose en su presentación, y dice de dónde salió", () => {
  // Éste es el que protege a las seis líneas reales. Sacar la pregunta no puede
  // llevarse puesta la lectura de las que ya contestaron.
  const html = pintarHoja({ id: 7, ...dtoAdoptado({ cantidadEnviada: 40, cantidadPresentada: 5 }) });

  assert.ok(html.includes("CAJÓN x8 completos"), "perdió el rótulo de su presentación");
  const campo = (html.match(/<input[^>]*aria-label="Cantidad recibida en CAJÓN x8"[^>]*>/) || [])[0];
  assert.ok(campo, "el input no está rotulado en la presentación adoptada");
  assert.match(campo, /value="5"/, "el campo no nace en 5");
  assert.ok(
    html.includes("Presentación adoptada en la recepción"),
    "la ficha dejó de declarar que la presentación no la registró el origen"
  );
});

test("12. para 42 físicas el campo nace en 5 y las sueltas en 2", () => {
  const conv = conversionParaAdoptar({ fisicasM: 42000, presentacion: "CAJON", factor: 8 });
  const html = pintarHoja({
    id: 7,
    ...dtoAdoptado({
      cantidadEnviada: 42,
      cantidadPresentada: conv.cantidadPresentada,
      sueltasEnviadas: conv.sueltasEnviadas,
      cantidadRecibida: conv.cantidadPresentada,
      recibidoUnidadesSueltas: conv.sueltasEnviadas,
    }),
  });

  const campo = (t) => {
    const m = html.match(new RegExp('<input[^>]*aria-label="' + t + '"[^>]*>'));
    return m ? (m[0].match(/value="([^"]*)"/) || [])[1] : null;
  };
  assert.equal(campo("Cantidad recibida en CAJÓN x8"), "5");
  assert.equal(campo("Unidades sueltas"), "2");
});

test("la ficha no volvió a armar la condición por su cuenta en ningún lado", () => {
  // Éste sobrevive a la tanda casi intacto, y es el que más importa de los tres:
  // el peligro de sacar una derivación compartida es que alguien la reescriba a
  // mano en la pantalla. Antes defendía que la ficha NO rearmara las cinco
  // preguntas; ahora defiende que no rearme ninguna, que es más fuerte.
  const ficha = codigoDe(FICHA);

  for (const f of ["hayPresentacionDistinta", "admiteAdopcion", "conversionParaAdoptar"]) {
    assert.ok(!new RegExp(`${f}\\(`).test(ficha), `la ficha volvió a preguntar con ${f}`);
  }
  assert.ok(
    !/presentacionActual/.test(ficha),
    "la ficha volvió a mirar el catálogo de hoy para decidir cómo contar"
  );
  // Y no se quedó con una división de bultos escrita al lado de la canónica.
  assert.ok(!/Math\.floor\(/.test(ficha), "apareció una conversión de bulto hecha a mano");
});

// ═══════════════════════════════════════════════════════════════════════════
// V25 · NO SE PREGUNTA LA PRESENTACIÓN. MANDA EL FORMATO DE SALIDA.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LA CAUSA RAÍZ, MEDIDA EN PRODUCCIÓN ─────────────────────────────────
//
// `POETT PERFUMINA SOLO PARA TI` tiene en su ficha `unidad_medida: "pack"` y
// `factor_pack: 12`. Sus cuatro líneas históricas —#132, #149, #195— salieron
// con `unidadEnviada: "UNIDAD"` y sin snapshot.
//
// Los dos datos son CIERTOS y no se contradicen: el producto se COMPRA por pack
// de 12 y se VENDE de a una. `unidad_medida` guarda cómo se compra.
//
// Para contar una recepción manda el FORMATO DE SALIDA: si el depósito despachó
// suelto, se cuenta suelto. La ficha contesta otra pregunta y no se consulta.
//
// Es la SEGUNDA vez del mismo error con el mismo campo: la tarjeta de producto
// rotulaba con `unidad_medida` en 5.450 de 10.521 filas y se arregló en
// `ad10fcf`. El criterio quedó escrito en
// `docs/business-rules/unidad-medida-es-como-se-compra.md`.

/** La línea real de la #195: la ficha dice PACK x12, el remito dice UNIDAD. */
const dtoPoett = (extra = {}) =>
  dtoHistorico({
    nombre: "POETT PERFUMINA SOLO PARA TI",
    cantidadEnviada: 5,
    unidadEnviada: "UNIDAD",
    unidadMedida: "pack",
    factorPack: 12,
    presentacionEnvio: null,
    presentacionActual: { presentacion: "PACK", factor: 12, pesoPiezaKg: null },
    ...extra,
  });

test("V25-1. NO se pregunta la presentación, ni en la hoja ni en escritorio", () => {
  for (const [donde, props] of [
    ["la hoja", { enHoja: true }],
    ["escritorio", {}],
  ]) {
    const html = pintarHoja(dtoPoett(), props);
    assert.ok(
      !html.includes("Transferencia histórica"),
      `en ${donde} sigue el bloque "Transferencia histórica"`
    );
    assert.ok(
      !html.includes("para esta recepción"),
      `en ${donde} sigue ofreciendo adoptar una presentación`
    );
    assert.ok(
      !html.includes("Presentación actual del depósito"),
      `en ${donde} sigue mostrando la presentación del catálogo`
    );
  }
});

test("V25-2. y la línea se cuenta con la UNIDAD DEL REMITO, no con la de la ficha", () => {
  // La ficha dice PACK x12. Si mandara la ficha, el campo se rotularía
  // "PACK x12 completos" y las 5 unidades serían sueltas. Manda la línea.
  //
  // ── EL RÓTULO CAMBIÓ EL 2026-09-13, LA AFIRMACIÓN NO ──────────────────
  //
  // Decía "Cantidad recibida en UNIDAD". En la hoja, la escala unidad pasó a
  // rotularse "Unidades" —un solo nombre para los dos casos que terminan en la
  // misma escala: la línea que salió por unidad y la que salió sin ningún bulto
  // entero—. Lo que este candado defiende es de qué FUENTE sale la escala, y eso
  // es lo mismo: si mandara la ficha diría "PACK x12 completos".
  //
  // En escritorio el rótulo no se tocó, y lo afirma `V25-3` unas líneas abajo con
  // una línea que sí tiene snapshot.
  const html = pintarHoja(dtoPoett(), { enHoja: true });
  assert.ok(
    html.includes('aria-label="Unidades"'),
    "el campo no está rotulado en la unidad del remito"
  );
  assert.ok(!html.includes("PACK x12 completos"), "se coló la presentación de la ficha");
});

test("V25-3. una línea que SÍ tiene snapshot sigue contándose con el suyo", () => {
  // Lo que no cambia: si el despacho registró cómo salió, ese snapshot manda.
  // Sacar la pregunta no puede llevarse puesta la lectura de las que sí saben.
  const html = pintarHoja(dtoAdoptado(), { enHoja: true });
  assert.ok(
    html.includes('aria-label="Cantidad recibida en CAJÓN x8"'),
    "una línea con snapshot perdió su presentación registrada"
  );
});

test("V25-4. el prop de adoptar no queda colgando en ninguna pantalla", () => {
  // Un prop que nadie pasa y nadie usa se lee como capacidad disponible. Es la
  // familia del `conImporte`: doce candados montando algo que ya no existía.
  for (const f of [
    "components/transferencias/FichaProductoRecepcion.jsx",
    "components/transferencias/RecepcionMovil.jsx",
    "components/transferencias/WorkspaceRecepcion.jsx",
  ]) {
    assert.ok(
      !/onAdoptarPresentacion/.test(codigoDe(f)),
      `${f} sigue cableando la adopción`
    );
  }
});
