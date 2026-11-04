// VINCULAR UN RENGLÓN SIN PRODUCTO: `filas/[filaId]/vincular` (2026-11-04).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/vincularFilaSinProducto.test.mjs
//
// Lo que se afirma, que es lo que pidió Emanuel:
//
//   · escribe el código del proveedor, y lo escribe `servicioIdentidad`
//     —confirmado por la persona, con el código como queda normalizado—;
//   · reconcilia el renglón con `conciliarFila`: deja de ser NO_MACHEADO y
//     queda con el producto, sin borrar lo leído del archivo;
//   · no duplica: un segundo vínculo del mismo renglón al mismo producto no
//     escribe nada, y guardar dos veces la identidad actualiza la misma fila.
//
// ── DE DÓNDE SALEN LOS FIXTURES ────────────────────────────────────────────
//
// El renglón sin producto sale del motor (`conciliarFila` sin vínculos →
// `filaAPersistir`), que es como lo deja la lectura en la base. La base de
// `persistirIdentidad` es un `tx` en memoria con los tres métodos que la función
// usa y la clave única del modelo: grupo + proveedor + código.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "./conciliarLista.js";
import { filaAPersistir } from "./persistencia.js";
import { resolverParserPorId } from "./registro.js";
import { ESTADO_LINEA } from "./estados.js";
import { filaParaElMotor, motorParaEstaLista } from "./vincularConUnaFila.js";
import { persistirIdentidad } from "@/lib/proveedores/identidad/persistirIdentidad";
import { ORIGEN_ALTA, nivelDeCerteza, CERTEZA } from "@/lib/proveedores/identidad/servicioIdentidad";
import {
  RECHAZO_VINCULO,
  datosDeLaFilaVinculada,
  decidirVinculoDeLaFila,
  identidadDelVinculo,
  reconciliarLaFila,
} from "./vincularFilaSinProducto.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const GRUPO = 1;
const PROVEEDOR = 2;
const USUARIO = 7;
const AHORA = new Date("2026-11-04T12:00:00Z");
const CABECERA = Object.freeze({
  id: 22,
  estado: "CONCILIADA",
  proveedorId: PROVEEDOR,
  parser: "GENERICO",
  recargoPct: 5,
  impuestoAdicionalPct: 0,
  modo: null,
  aumentoEsperadoMinPct: 2,
  aumentoEsperadoMaxPct: 15,
});
/** El producto con el `select` de la ruta: los campos del motor y sus tres lugares. */
const PRODUCTO = Object.freeze({
  id: 1358,
  nombre: "ALFAJOR TRIPLE",
  precio_costo: 880,
  factor_pack: 1,
  unidad_medida: "unidad",
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
  es_combo: false,
  proveedor_id: PROVEEDOR,
  proveedor2_id: null,
  proveedor3_id: null,
});

const motor = () => {
  const reg = resolverParserPorId(CABECERA.parser);
  assert.ok(reg.ok);
  return motorParaEstaLista({ cab: CABECERA, reg, grupoId: GRUPO, operandoEnLocalId: 1, depositoLocalId: null });
};

/** El renglón como lo deja la lectura: sin vínculos, el motor no lo machea. */
function renglonSinProducto(over = {}) {
  const r = {
    id: 5514,
    filaExcel: 90,
    hojaNombre: "Hoja1",
    codigoCrudo: "AL-0045",
    codigoNormalizado: "AL0045",
    codigoComparableSinCeros: null,
    codigoBarraProveedor: null,
    descripcionProveedor: "ALFAJOR TRIPLE CHOCOLATE",
    unidadProveedor: "",
    unidadesPorBulto: null,
    contenidoMl: 55,
    precioConIva: 900,
    precioSinIva: null,
    categoriaCruda: null,
    preciosPorColumna: { 4: 900, 5: 1100 },
    ...over,
  };
  const { config, contexto } = motor();
  const res = conciliarFila({
    fila: { ...filaParaElMotor(r, { vinculadoEn: null }), contenidoMl: r.contenidoMl, preciosPorColumna: r.preciosPorColumna },
    indice: indexarCodigosProveedor([]),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map(),
    contexto,
    config,
  });
  return { id: r.id, ...filaAPersistir(res) };
}

/** Un `tx` en memoria con lo que usa `persistirIdentidad`. */
function baseEnMemoria(inicial = []) {
  const filas = new Map();
  const clave = (k) => `${k.grupoId}|${k.proveedorId}|${k.codigoInterno}`;
  for (const f of inicial) filas.set(clave(f), { ...f });
  return {
    filas,
    productoCodigoProveedor: {
      async findUnique({ where }) {
        return filas.get(clave(where.codigo_interno_unico_por_proveedor)) ?? null;
      },
      async create({ data }) {
        const k = clave(data);
        assert.equal(filas.has(k), false, `la clave única ${k} ya existe: Postgres rechazaría este create`);
        filas.set(k, { ...data });
      },
      async update({ where, data }) {
        const k = clave(where.codigo_interno_unico_por_proveedor);
        filas.set(k, { ...filas.get(k), ...data });
      },
    },
  };
}

test("el fixture es real: el renglón leído llega sin producto", () => {
  const f = renglonSinProducto();
  assert.equal(f.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(f.productoBaseId, null);
});

test("qué se vincula y qué no", () => {
  const libre = renglonSinProducto();
  const ok = decidirVinculoDeLaFila({ fila: libre, productoBaseId: PRODUCTO.id });
  assert.deepEqual(ok, { ok: true, yaEstaba: false, codigo: "AL0045" });

  const mismo = decidirVinculoDeLaFila({ fila: { ...libre, productoBaseId: PRODUCTO.id }, productoBaseId: PRODUCTO.id });
  assert.equal(mismo.ok, true);
  assert.equal(mismo.yaEstaba, true, "el mismo producto otra vez: ya estaba, no se escribe nada");

  const otro = decidirVinculoDeLaFila({ fila: { ...libre, productoBaseId: 999 }, productoBaseId: PRODUCTO.id });
  assert.equal(otro.rechazo, RECHAZO_VINCULO.DE_OTRO_PRODUCTO);
  assert.equal(otro.status, 409);

  const aplicada = decidirVinculoDeLaFila({ fila: { ...libre, aplicada: true }, productoBaseId: PRODUCTO.id });
  assert.equal(aplicada.rechazo, RECHAZO_VINCULO.FILA_APLICADA);

  const sinCodigo = decidirVinculoDeLaFila({
    fila: { ...libre, codigoCrudo: "", codigoNormalizado: "" },
    productoBaseId: PRODUCTO.id,
  });
  assert.equal(sinCodigo.rechazo, RECHAZO_VINCULO.SIN_CODIGO);
});

test("escribe el código del proveedor por servicioIdentidad, confirmado por quien vinculó", async () => {
  const fila = renglonSinProducto();
  const identidad = identidadDelVinculo({
    grupoId: GRUPO,
    proveedorId: PROVEEDOR,
    productoBaseId: PRODUCTO.id,
    fila,
    usuarioId: USUARIO,
    ahora: AHORA,
  });
  const delCodigo = identidad.find((i) => i.codigoInterno === "AL0045");
  assert.ok(delCodigo, "una fila con el código normalizado del renglón");
  assert.equal(delCodigo.productoBaseId, PRODUCTO.id);
  assert.equal(delCodigo.proveedorId, PROVEEDOR);
  assert.equal(delCodigo.origenAlta, ORIGEN_ALTA.VINCULACION_MANUAL);
  assert.equal(delCodigo.confirmadaPorUsuarioId, USUARIO);
  assert.equal(nivelDeCerteza(delCodigo), CERTEZA.CONFIRMADA_USUARIO);
  assert.equal(delCodigo.unidadesPorPresentacion, null, "el UxB de la lista no es la presentación que factura");

  const tx = baseEnMemoria();
  const r = await persistirIdentidad(tx, identidad);
  assert.equal(r.creadas, identidad.length);
  assert.equal(tx.filas.get(`${GRUPO}|${PROVEEDOR}|AL0045`).productoBaseId, PRODUCTO.id);
});

test("no duplica: guardar dos veces actualiza la misma fila, y una deducción vieja se corrige", async () => {
  const fila = renglonSinProducto();
  const args = { grupoId: GRUPO, proveedorId: PROVEEDOR, productoBaseId: PRODUCTO.id, fila, usuarioId: USUARIO, ahora: AHORA };
  const tx = baseEnMemoria();
  await persistirIdentidad(tx, identidadDelVinculo(args));
  const cuantas = tx.filas.size;
  const segunda = await persistirIdentidad(tx, identidadDelVinculo(args));
  assert.equal(segunda.creadas, 0);
  assert.equal(tx.filas.size, cuantas, "la misma cantidad de filas");

  // El código estaba deducido para otro producto: la persona lo corrige.
  const conDeduccion = baseEnMemoria([
    { grupoId: GRUPO, proveedorId: PROVEEDOR, codigoInterno: "AL0045", productoBaseId: 444, origenAlta: ORIGEN_ALTA.APLICACION_AUTOMATICA, confirmadaEn: null, activo: true },
  ]);
  const r = await persistirIdentidad(conDeduccion, identidadDelVinculo(args));
  assert.equal(r.actualizadas >= 1, true);
  assert.equal(conDeduccion.filas.get(`${GRUPO}|${PROVEEDOR}|AL0045`).productoBaseId, PRODUCTO.id);
});

test("reconcilia la fila con el motor, sin borrar lo leído del archivo", () => {
  const fila = renglonSinProducto();
  const { config, contexto } = motor();
  const decision = decidirVinculoDeLaFila({ fila, productoBaseId: PRODUCTO.id });
  const recalculada = reconciliarLaFila({ fila, producto: PRODUCTO, codigo: decision.codigo, config, contexto, ahora: AHORA });
  assert.equal(recalculada.producto?.productoBaseId, PRODUCTO.id);
  assert.notEqual(recalculada.estado, ESTADO_LINEA.NO_MACHEADO);

  const datos = datosDeLaFilaVinculada(recalculada, { ahora: AHORA });
  assert.equal(datos.productoBaseId, PRODUCTO.id);
  assert.equal(datos.estado, recalculada.estado);
  assert.equal(datos.vinculadoEn, AHORA);
  // 900 + 5 % = 945 contra 880: +7,4 %, dentro del rango → lista para aplicar.
  assert.equal(datos.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  for (const c of ["contenidoMl", "preciosPorColumna", "descuentoPct", "descripcionProveedor", "codigoCrudo", "filaExcel"]) {
    assert.equal(c in datos, false, `${c} es del archivo: el vínculo no lo pisa`);
  }
});

test("la ruta usa esas piezas, en una transacción, y no escribe nada si ya estaba", () => {
  const ruta = codigoDe("app/api/proveedores/listas/[id]/filas/[filaId]/vincular/route.js");
  assert.match(ruta, /requirePerm\(req, "proveedores\.listas"\)/);
  assert.match(ruta, /decidirVinculoDeLaFila\(\{ fila, productoBaseId \}\)/);
  assert.match(ruta, /await persistirIdentidad\(tx, identidad\)/);
  assert.match(ruta, /data: datosDeLaFilaVinculada\(recalculada, \{ ahora \}\)/);
  assert.match(ruta, /await recalcularContadores\(tx, importacionId\)/);
  // «Ya estaba» contesta antes de abrir la transacción.
  const yaEstaba = ruta.indexOf('accion: "YA_VINCULADA"');
  assert.ok(yaEstaba > 0 && yaEstaba < ruta.indexOf("prisma.$transaction"));
  // Nadie escribe `ProductoCodigoProveedor` a mano en esta ruta.
  assert.doesNotMatch(ruta, /productoCodigoProveedor\.(upsert|create|update)/);
});
