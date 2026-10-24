// VINCULAR DESDE LA LISTA GUARDA EL CÓDIGO EN EL MOTOR ÚNICO, Y LA FACTURA LO
// ENCUENTRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/vincularDesdeLaListaLoLeeLaFactura.test.mjs
//
// ── LO QUE SE AFIRMA (Emanuel, 2026-10-23) ────────────────────────────────
//
// La hoja de la revisión dice "Guardo el código 1612 de Dab en este producto:
// las próximas listas, facturas y recepciones de Dab lo reconocen solas". Eso es
// una promesa sobre DOS piezas que este repo prueba por separado: la que
// escribe —`guardarCodigoDeLaFila`, que usan `en-la-lista` y `otra-fila`— y la
// que lee en la factura —`buscarProductoDeLaLinea`, con el contexto que arma
// `cargarContexto` desde `ProductoCodigoProveedor`—. El defecto, si lo hay,
// vive entre las dos (regla 2 de CLAUDE.md): una escribe con una clave y la
// otra busca con otra, y cada candado sigue en verde.
//
// Por eso acá lo que lee la factura es EXACTAMENTE lo que escribió la lista:
// los argumentos del `upsert` capturados, convertidos en la fila que la tabla
// guardaría. La misma corrida se ejerció contra Postgres (ver el commit).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guardarCodigoDeLaFila } from "./vincularConUnaFila.js";
import { ORIGEN_ALTA_VINCULO } from "./vinculacion.js";
import { clavesDeCodigo } from "./normalizarCodigo.js";
import { buscarProductoDeLaLinea } from "../../compras-proveedor/comprobante/analisisDeComprobante.js";
import { ORIGEN_VINCULO } from "../../compras-proveedor/comprobante/vinculo.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const GRUPO = 1;
const DAB = 7;
const SOLITAS = 55;

/**
 * El renglón de la lista como lo guarda la importación: el código crudo del
 * archivo y el normalizado que sale de `clavesDeCodigo`, la misma función que
 * usa la importación al leer.
 */
const RENGLON = {
  codigoCrudo: "1612",
  codigoNormalizado: clavesDeCodigo("1612").normalizado,
  descripcionProveedor: "SOLITAS ANIMACION 400G",
};

/** Una transacción que solo anota lo que se le pidió escribir. */
function txQueAnota() {
  const upserts = [];
  return {
    upserts,
    productoCodigoProveedor: {
      upsert: async (args) => {
        upserts.push(args);
        return { id: 1, ...args.create };
      },
    },
  };
}

/** La fila de `ProductoCodigoProveedor` que deja el `upsert` al crear. */
function filaGuardada(upsert) {
  return { id: 901, ...upsert.create };
}

/** El contexto con la forma de `cargarContexto`, armado con lo que se guardó. */
function contextoDeLaFactura(vinculos) {
  return {
    datos: {
      codigosProveedor: vinculos,
      productos: [{ id: SOLITAS, nombre: "Solitas Animación 400 g" }],
    },
    catalogoNormalizado: [{ productoBaseId: SOLITAS, nombre: "Solitas Animación 400 g" }],
    nombrePorBase: new Map([[SOLITAS, "Solitas Animación 400 g"]]),
  };
}

test("VINCULAR DESDE LA LISTA ESCRIBE EL CÓDIGO EN ProductoCodigoProveedor, POR LA CLAVE ÚNICA DEL PROVEEDOR", async () => {
  const tx = txQueAnota();
  const guardado = await guardarCodigoDeLaFila(tx, {
    grupoId: GRUPO,
    proveedorId: DAB,
    productoBaseId: SOLITAS,
    fila: RENGLON,
  });
  assert.equal(guardado, "1612");
  assert.equal(tx.upserts.length, 1);
  const [u] = tx.upserts;
  assert.deepEqual(u.where, {
    codigo_interno_unico_por_proveedor: { grupoId: GRUPO, proveedorId: DAB, codigoInterno: "1612" },
  });
  assert.equal(u.create.productoBaseId, SOLITAS);
  assert.equal(u.create.activo, true);
  // Lo confirmó una persona: el motor de identidad lo trata como decisión.
  assert.equal(u.create.origenAlta, ORIGEN_ALTA_VINCULO.VINCULACION_MANUAL);
  assert.equal(u.update.productoBaseId, SOLITAS);
  assert.equal(u.update.activo, true);
});

test("UNA FACTURA DE ESE PROVEEDOR CON ESE CÓDIGO ENCUENTRA EL PRODUCTO, SOLA", async () => {
  const tx = txQueAnota();
  await guardarCodigoDeLaFila(tx, { grupoId: GRUPO, proveedorId: DAB, productoBaseId: SOLITAS, fila: RENGLON });
  const contexto = contextoDeLaFactura([filaGuardada(tx.upserts[0])]);

  // El papel lo imprime con espacios y otra descripción: lo que manda es el
  // código, que es el único escalón que no interpreta nada.
  const r = buscarProductoDeLaLinea({
    linea: { codigoProveedor: " 16 12 ", descripcion: "GALL SOLITAS ANIM X 400" },
    contexto,
  });
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].productoBaseId, SOLITAS);
  // Lo ata sin preguntar: es lo que la hoja promete.
  assert.equal(r.requiereDecision, false, "la factura tuvo que preguntar por un código que la lista ya enseñó");
  assert.equal(r.vinculoAutomatico?.productoBaseId, SOLITAS);
});

test("CONTRAPRUEBA: SIN EL VÍNCULO, ESA MISMA FACTURA NO LO ENCUENTRA POR CÓDIGO", () => {
  // Sin esto, el candado de arriba podría estar en verde por otro escalón —el
  // nombre, el universo— y no por lo que guardó la lista.
  const r = buscarProductoDeLaLinea({
    linea: { codigoProveedor: "1612", descripcion: "GALL SOLITAS ANIM X 400" },
    contexto: contextoDeLaFactura([]),
  });
  assert.notEqual(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
  assert.equal(r.vinculoAutomatico?.productoBaseId === SOLITAS && r.origen === ORIGEN_VINCULO.CODIGO_PROVEEDOR, false);
});

test("LAS DOS PUERTAS DE LA HOJA ESCRIBEN CON ESA FUNCIÓN, Y LA FACTURA LEE ESA TABLA", () => {
  // La hoja de vincular llama a `en-la-lista` (Sin vincular) o a `otra-fila`
  // (No es este producto). Si una escribiera por otro lado, el candado de
  // arriba probaría una función que la pantalla no usa.
  for (const ruta of [
    "app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js",
    "app/api/proveedores/listas/[id]/filas/[filaId]/otra-fila/route.js",
  ]) {
    assert.match(codigoDe(ruta), /await guardarCodigoDeLaFila\(tx, \{/, `${ruta} dejó de guardar el código`);
  }
  // Y lo que la factura recibe sale de la tabla, por la carga compartida.
  assert.match(
    codigoDe("lib/compras-proveedor/comprobante/analisisDeComprobante.js"),
    /const datos = await cargarDatosDeConciliacion\(\{ grupoId, proveedorId, localId \}, prisma\)/
  );
  assert.match(codigoDe("lib/proveedores/listas/cargaErp.js"), /productoCodigoProveedor\.findMany\(/);
});
