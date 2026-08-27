// LISTAS DE PRECIOS Y FACTURAS COMPARTEN LA MEMORIA, DE VERDAD.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE APARTE ─────────────────────────────────────
//
// `servicioIdentidad.test.mjs` prueba la PIEZA: que el servicio arme bien las
// filas. Esto prueba el CAMINO: que el módulo A escriba con esa pieza y que el
// módulo B lea lo mismo. Es la lección de siempre de este repo — las piezas
// pueden estar todas bien y el defecto vivir en el espacio entre dos.
//
// Y hay una parte que solo se puede afirmar leyendo el código: que las dos rutas
// llamen a la misma función. Si una volviera a escribir su propio upsert, los
// candados de arriba seguirían verdes y la memoria volvería a partirse en dos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { aliasesDeImportacion } from "@/lib/compras-proveedor/importacion/aliases";
import { buscarCandidatosDeProveedor, MOTIVO_CANDIDATO } from "./motorCandidatos.js";
import {
  CERTEZA,
  METODO_DETECCION,
  filasDeIdentidad,
  nivelDeCerteza,
  presentacionesDe,
} from "./servicioIdentidad.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const leerSinComentarios = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const AHORA = new Date("2026-08-27T12:00:00.000Z");

// El producto del ejemplo: el proveedor cotiza x6 y el ERP maneja pack x24.
const GANCIA_ERP = { productoBaseId: 700, baseId: 700, nombre: "Gancia pack x24", factor_pack: 24, unidad_medida: "pack" };

// ── DE LISTAS A FACTURAS ──────────────────────────────────────────────────

test("INTERCAMBIO 1. lo confirmado en Listas queda asociado en Facturas", () => {
  // Listas: alguien vincula a mano la fila "GANCIA X6" al pack del ERP.
  const guardadoPorListas = filasDeIdentidad({
    grupoId: 3,
    proveedorId: 9,
    productoBaseId: 700,
    codigoProveedor: "77-401",
    descripcionProveedor: "GANCIA X6",
    metodoDeteccion: METODO_DETECCION.MANUAL,
    presentacionProveedor: "x6",
    unidadesPorPresentacion: 6,
    confirmadaPorUsuarioId: 12,
    confirmadaEn: AHORA,
  });

  // Facturas: llega un documento del mismo proveedor con el mismo código.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "GANCIA X6",
    codigoLeido: "77401",
    vinculos: guardadoPorListas,
    productos: [GANCIA_ERP],
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.CODIGO_EXACTO);
  assert.equal(r.elegido.productoBaseId, 700, "Facturas no vio lo que Listas confirmó");
  assert.equal(r.automatico, true);
  assert.equal(nivelDeCerteza(r.elegido.vinculo), CERTEZA.CONFIRMADA_USUARIO);
});

test("INTERCAMBIO 1bis. y lo ve TAMBIÉN cuando el documento no trae código", () => {
  // Es el caso que antes se perdía: se guardaba solo el código, así que un
  // documento sin código volvía a preguntar lo mismo.
  const guardadoPorListas = filasDeIdentidad({
    grupoId: 3,
    proveedorId: 9,
    productoBaseId: 700,
    codigoProveedor: "77-401",
    descripcionProveedor: "GANCIA X6",
    metodoDeteccion: METODO_DETECCION.MANUAL,
    confirmadaPorUsuarioId: 12,
    confirmadaEn: AHORA,
  });
  const r = buscarCandidatosDeProveedor({
    textoLeido: "gancia   x6",
    codigoLeido: null,
    vinculos: guardadoPorListas,
    productos: [GANCIA_ERP],
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.ALIAS_CONFIRMADO);
  assert.equal(r.elegido.productoBaseId, 700);
});

// ── DE FACTURAS A LISTAS ──────────────────────────────────────────────────

test("INTERCAMBIO 2. lo confirmado en Facturas queda asociado en Listas", () => {
  // Facturas: una persona elige el producto de un renglón y se guarda el pedido.
  const guardadoPorFacturas = aliasesDeImportacion({
    grupoId: 3,
    proveedorId: 9,
    productosPorLocal: new Map([[55, { baseId: 700 }]]),
    confirmadaPorUsuarioId: 44,
    confirmadaEn: AHORA,
    items: [{
      productoLocalId: 55,
      aliases: [{
        codigoProveedor: "77-401",
        descripcionProveedor: "GANCIA X6",
        productoElegidoAMano: true,
        presentacionProveedor: "x6",
      }],
    }],
  });

  // Listas: la próxima lista del proveedor consulta el MISMO índice.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "GANCIA X6",
    codigoLeido: "77401",
    vinculos: guardadoPorFacturas,
    productos: [GANCIA_ERP],
  });
  assert.equal(r.elegido.productoBaseId, 700, "Listas no vio lo que Facturas confirmó");
  assert.equal(nivelDeCerteza(r.elegido.vinculo), CERTEZA.CONFIRMADA_USUARIO);
  assert.equal(r.elegido.vinculo.confirmadaPorUsuarioId, 44);
});

test("INTERCAMBIO 3. la presentación y el factor cruzan el puente", () => {
  const guardado = filasDeIdentidad({
    grupoId: 3,
    proveedorId: 9,
    productoBaseId: 700,
    codigoProveedor: "77-401",
    descripcionProveedor: "GANCIA X6",
    presentacionProveedor: "x6",
    unidadesPorPresentacion: 6,
    confirmadaPorUsuarioId: 12,
    confirmadaEn: AHORA,
  });
  const r = buscarCandidatosDeProveedor({
    textoLeido: "GANCIA X6",
    codigoLeido: "77401",
    vinculos: guardado,
    productos: [GANCIA_ERP],
  });

  const p = presentacionesDe({ vinculo: r.elegido.vinculo, productoBase: GANCIA_ERP });
  assert.equal(p.proveedor, "x6");
  assert.equal(p.erp, "Pack x24");
  assert.equal(p.unidadesProveedor, 6);
  assert.equal(p.unidadesErp, 24);
  assert.equal(p.factor, 4, "el factor 24 ÷ 6 no cruzó de un módulo al otro");
});

// ── LO QUE SOLO SE PUEDE AFIRMAR LEYENDO ──────────────────────────────────

test("NO HAY DOS ESCRITURAS: las dos rutas de Facturas usan la pieza compartida", () => {
  // Si una volviera a armar su propio upsert, todos los candados de arriba
  // seguirían verdes y la memoria se partiría igual.
  for (const ruta of [
    "app/api/compras-proveedor/crear/route.js",
    "app/api/compras-proveedor/importar/aplicar/[id]/route.js",
  ]) {
    const src = leerSinComentarios(ruta);
    assert.match(src, /persistirIdentidad\(/, `${ruta} dejó de usar la pieza compartida`);
    assert.doesNotMatch(
      src,
      /productoCodigoProveedor\.upsert\(/,
      `${ruta} volvió a escribir la memoria por su cuenta`
    );
  }
});

test("NO HAY DOS MACHEADORES: el importador usa el motor compartido", () => {
  const src = leerSinComentarios("lib/compras-proveedor/importacion/prepararLineas.js");
  assert.match(src, /buscarCandidatosDeProveedor\(/, "el importador volvió a su macheador propio");
});

test("LA MEMORIA LA ESCRIBE UNA FUNCIÓN, Y RESPETA LO CONFIRMADO", () => {
  // El escritor tiene que CONSULTAR antes de pisar. Un upsert ciego dejaría que
  // una deducción reemplace lo que una persona eligió, desde el otro módulo.
  const src = leerSinComentarios("lib/proveedores/identidad/persistirIdentidad.js");
  assert.match(src, /findUnique\(/, "el escritor dejó de mirar lo que ya estaba");
  assert.match(src, /datosDeActualizacion\(/, "el escritor decide por su cuenta si pisa");
});

test("RECEPCIÓN NO CAMBIA: su macheador conserva el contrato estricto", () => {
  // `analisisDeComprobante` es el camino de recepción. Sigue llamando a
  // `buscarCandidatos` del módulo de comprobante y NO habilita nada nuevo.
  const src = leerSinComentarios("lib/compras-proveedor/comprobante/analisisDeComprobante.js");
  assert.match(src, /buscarCandidatos\(/);
  assert.doesNotMatch(
    src,
    /permitirCodigoAproximado/,
    "recepción habilitó la escalera por terminación"
  );
  assert.doesNotMatch(
    src,
    /buscarCandidatosDeProveedor/,
    "recepción cambió de motor en una tanda que dijo no tocarla"
  );
});
