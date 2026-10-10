// CCU #257: LA SEGUNDA PARTE DE LA LECTURA INTERPRETADA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/ccuFacturaB.test.mjs
//
// ── LO QUE SE PIDIÓ (Emanuel, 2026-10-10) ─────────────────────────────────
//
// Tres arreglos que aparecieron usando la lectura interpretada en producción,
// y borrar el código de formato que quedó:
//
//   · IDENTIDAD. La pantalla de CCU #257 decía "B 921-921-620018-7": el Nro
//     IIBB partido en punto de venta y número. El número sale SOLO del número
//     de comprobante rotulado; si no está a la vista, queda vacío. El CAE se
//     guarda y defiende contra el duplicado.
//   · CARGO. "300016 Servicio Logístico" no es mercadería: no pide producto, no
//     entra al stock, y su costo se reparte entre la mercadería en proporción a
//     su costo final. Los envases de Secco siguen sin tocar costos.
//   · UNA EXPLICACIÓN POR TIPO. CCU factura a veces A y a veces B. Cada tipo
//     tiene la suya; un tipo sin confirmada lo lee el grande y deja pendiente
//     LA DE ESE TIPO, sin tocar las otras.
//
// ── DE DÓNDE SALEN LOS DATOS ──────────────────────────────────────────────
//
// El papel es el de la orden, en `lecturaInterpretada.fixture.json` («ccu»),
// con el porqué de cada número en su `_origen`. Viaja con la forma de
// `generateContent` por los lectores de verdad, con un `fetch` de mentira.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { crearLectorGemini, armarInterpretes } from "./gemini.js";
import { leerConCadena } from "./cadena.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { identidadDelComprobante, normalizarLectura } from "./contrato.js";
import { escalarAlModeloGrande, ESCALADA } from "./escalada.js";
import { esquemaInterpretado, instruccionesInterpretadas } from "./lecturaInterpretada.js";
import { analizarPrecioDeLinea } from "../precioDeLinea.js";
import { cargosDelPapel, esRenglonDeCargo } from "../cargos.js";
import { analizarLineas, aplanarDetalles } from "../analisisDeComprobante.js";
import { filasDeConciliacion } from "../filasDeConciliacion.js";
import { comprobanteConLaMismaIdentidad, textoDeDuplicado } from "../facturaRepetida.js";
import { puedeAceptarse, MOTIVO_NO_ACEPTAR, ACCION_PRECIO } from "../aceptarPrecio.js";
import { rotuloDelEstado } from "../../estadoDeLineaFacturada.js";
import { loQueHayQueSembrar } from "../../pedidoDesdeFactura.js";

const { _origen, ...PAPELES } = JSON.parse(
  fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const CCU = PAPELES.ccu;
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const ENV = { GEMINI_API_KEY: "x" };
const RAIZ = new URL("../../../../", import.meta.url);
const codigoDe = (ruta) =>
  fs
    .readFileSync(new URL(ruta, RAIZ), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** La respuesta del modelo sobre el papel de CCU. */
const respuesta = (quien, cambios = {}) => ({
  identidad: CCU.identidad,
  lineasEnElPapel: CCU.lineasEnElPapel,
  hayTotalImpreso: CCU.hayTotalImpreso,
  pie: CCU.pie,
  lineas: CCU.lineas,
  explicacion: quien === "pro" ? CCU.explicacionPro : CCU.explicacionFlash,
  ...cambios,
});

const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800 },
  }),
});

/** La explicación confirmada de las facturas B de CCU, como la guarda `ExplicacionPorTipo`. */
const CONFIRMADA_B = [{ tipoComprobante: "B", explicacion: CCU.explicacionFlash, version: 5 }];

/**
 * LO QUE HACE LA RUTA DE LEER, PASO POR PASO —el mismo armado que
 * `escaladaAlModeloGrande.test.mjs`—: Flash con todas las confirmadas, y la
 * escalada decide con la del tipo que leyó.
 */
async function leer({ flash, explicaciones, grande }) {
  const pedidosFlash = [];
  const lector = crearLectorGemini({
    env: ENV,
    fetchImpl: async (_u, init) => {
      pedidosFlash.push(JSON.parse(init.body));
      return respuestaDeGoogle(flash);
    },
  });
  const llamadasGrande = [];
  const interpretes = armarInterpretes({
    env: ENV,
    fetchImpl: async (url) => {
      llamadasGrande.push(String(url));
      return respuestaDeGoogle(grande);
    },
  });
  let resultado =
    explicaciones.length === 0
      ? { ok: false, motivo: null, lector: null, intentos: [], usoRespaldo: false, porQuePaso: null }
      : await leerConCadena({
          cadena: { titular: { ok: true, lector }, respaldo: null },
          archivos: FOTO,
          receta: { interpretada: true, explicaciones },
        });
  const escalada = await escalarAlModeloGrande({
    resultado, explicaciones, sinExplicacion: explicaciones.length === 0,
    interpretes, archivos: FOTO, proveedorNombre: "CCU",
  });
  let receta = escalada.recetaDeFlash;
  let version = escalada.versionDeFlash;
  if (escalada.cerro || (escalada.lectura && resultado.ok !== true)) {
    resultado = { ...resultado, ok: true, lectura: escalada.lectura };
    receta = escalada.receta;
    version = escalada.recetaVersion;
  }
  const puerta = pasarPorLaPuerta({ lectura: resultado.lectura, receta, recetaVersion: version });
  return { escalada, puerta, lectura: resultado.lectura, pedidosFlash, llamadasGrande };
}

/** Los renglones como los guarda la ruta de leer: el mismo mapeo de columnas. */
const guardados = (lectura) =>
  lectura.lineas.map((l, i) => ({
    id: 2570 + i, orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor ?? null,
    cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso ?? null,
    subtotalCorregido: null, internoUnitario: l.internoUnitario ?? null, pesoKg: l.peso ?? null,
    bonificacionPct: l.bonificacion ?? null, ivaPct: l.alicuotaIva ?? null,
    costoFinalRenglon: l.costoFinal ?? null, enQueViene: l.enQueViene ?? null, tipoRenglon: l.tipo ?? null,
    productoLocalId: null, pedidoDetalleId: null, unidadElegida: null,
  }));

// ══════════════════════════════════════════════════════════════════════════
// 1. CCU CIERRA
// ══════════════════════════════════════════════════════════════════════════

test("CCU CON LA EXPLICACIÓN DE SU FACTURA B: lee Flash, cierra en 1.450.756,63, sin el grande", async () => {
  const { escalada, puerta, llamadasGrande, pedidosFlash } = await leer({
    flash: respuesta("flash"), explicaciones: CONFIRMADA_B, grande: respuesta("pro"),
  });
  assert.equal(escalada.motivo, null, "con la de su tipo confirmada no escala");
  assert.equal(llamadasGrande.length, 0);
  assert.equal(puerta.estado, ESTADO.CARGADO, puerta.porque);
  assert.equal(puerta.diferenciaCentavos, 0, "los once costos finales suman el total exacto");
  assert.equal(puerta.aGuardar.totalLeido, 1450756.63);
  assert.equal(puerta.aGuardar.recetaVersion, 5, "se leyó con la versión 5 de la B");
  assert.equal(puerta.aGuardar.recetaUsada.tipoComprobante, "B");
  // Flash recibió la explicación rotulada con su tipo.
  const pedido = pedidosFlash[0].contents[0].parts.find((p) => p.text).text;
  assert.match(pedido, /<<<EXPLICACIÓN Factura B\n[\s\S]*Factura B de CCU[\s\S]*\nEXPLICACIÓN>>>/);
});

test("CONTRAPRUEBA: con un costo final corrido, CCU NO cierra y no propone costos", async () => {
  const corrido = respuesta("flash", {
    lineas: CCU.lineas.map((l, i) => (i === 7 ? { ...l, costoFinal: l.costoFinal + 100 } : l)),
  });
  const { puerta } = await leer({ flash: corrido, explicaciones: CONFIRMADA_B, grande: corrido });
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.equal(puerta.proponeCostos, false);
  assert.equal(puerta.diferenciaCentavos, 10000);
});

// ══════════════════════════════════════════════════════════════════════════
// 2. EL SERVICIO LOGÍSTICO ES UN CARGO
// ══════════════════════════════════════════════════════════════════════════

test("SERVICIO LOGÍSTICO: es CARGO, no producto, no stock, y sus 1.765,64 se reparten entre los diez", async () => {
  const { lectura } = await leer({ flash: respuesta("flash"), explicaciones: CONFIRMADA_B, grande: respuesta("pro") });
  const lineas = guardados(lectura);
  const servicio = lineas[10];
  assert.equal(esRenglonDeCargo(servicio), true);
  assert.equal(lineas.filter(esRenglonDeCargo).length, 1, "solo el servicio es cargo");

  const reparto = cargosDelPapel(lineas);
  assert.equal(reparto.has(11), false, "el cargo no se reparte a sí mismo");
  assert.equal([...reparto.values()].reduce((a, b) => a + b, 0), 176564, "se reparte entero, al centavo");
  // En proporción al costo final: Heineken carga más que Miller.
  assert.ok(reparto.get(8) > reparto.get(9) * 40);

  // El costo de un producto lleva su parte: Santa Fe 1x24, dos cajas.
  const producto = { precio_costo: 30000, factor_pack: 1, unidad_medida: "unidad" };
  const con = analizarPrecioDeLinea({ linea: lineas[0], producto, cargoDeLaLinea: reparto.get(1) });
  const sin = analizarPrecioDeLinea({ linea: lineas[0], producto, cargoDeLaLinea: 0 });
  assert.equal(con.precioFinal, 32997.38, "(65.914,44 + su parte del servicio) ÷ 2");
  assert.equal(sin.precioFinal, 32957.22, "CONTRAPRUEBA: sin el reparto, el costo es el renglón solo");

  // Y los diez costos con su parte suman el papel entero.
  const sumaCentavos = lineas
    .slice(0, 10)
    .reduce((a, l) => a + Math.round(Number(l.costoFinalRenglon) * 100) + (reparto.get(l.orden) ?? 0), 0);
  assert.equal(sumaCentavos, 145075663);
});

test("EN LA RECEPCIÓN EL CARGO NO PIDE PRODUCTO NI VA AL PEDIDO, y se rotula «Cargo»", async () => {
  const { lectura } = await leer({ flash: respuesta("flash"), explicaciones: CONFIRMADA_B, grande: respuesta("pro") });
  const comprobante = { id: 257, estado: "CARGADO", lineas: guardados(lectura) };
  // La forma de `cargarContexto`, con el catálogo vacío: nada que encontrar.
  const contexto = {
    datos: { codigosProveedor: [], productos: [] }, catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map(),
    datosPorBase: new Map(), decisionPorBase: new Map(),
  };
  const analizadas = analizarLineas({ comprobante, contexto, detallesPlanos: aplanarDetalles([]) });
  const servicio = analizadas[10];
  assert.equal(servicio.envase, true, "va por el camino que no pide producto ni entra al stock");
  assert.equal(servicio.cargo, true);
  assert.equal(servicio.productoBaseId, null);
  assert.equal(servicio.precio, null, "no tiene costo propio que proponer");

  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...comprobante, lineas: analizadas }], detalles: [] });
  const fila = grupos.flatMap((g) => g.filas).find((f) => f.cargo === true);
  assert.ok(fila, "la fila del cargo no llegó a la pantalla");
  assert.equal(rotuloDelEstado(fila), "Cargo");
  // Un pedido que nace de esta factura no siembra el servicio como producto.
  const siembra = loQueHayQueSembrar({ filas: [fila], detalles: [] });
  assert.equal(siembra.sinProducto ?? 0, 0);
});

test("LOS ENVASES DE SECCO SIGUEN SIN TOCAR COSTOS: no son cargo y no se reparten", () => {
  const secco = PAPELES.secco.lineas.map((l, i) => ({ orden: i + 1, tipoRenglon: l.tipo, costoFinalRenglon: l.costoFinal }));
  assert.equal(secco.filter(esRenglonDeCargo).length, 0);
  assert.equal(cargosDelPapel(secco).size, 0, "un papel sin cargos no le suma nada a nadie");
});

// ══════════════════════════════════════════════════════════════════════════
// 3. LA IDENTIDAD SALE SOLO DEL NÚMERO DE COMPROBANTE
// ══════════════════════════════════════════════════════════════════════════

test("EL NRO IIBB NUNCA ES EL NÚMERO DE COMPROBANTE: «B 921-921-620018-7» queda sin número", () => {
  const base = { tipo: "B", cuit: "30-50577985-8", cae: "86395263000660" };
  // Las formas en que el IIBB 921-620018-7 se hizo pasar por punto de venta y número.
  for (const [puntoVenta, numero] of [
    ["921", "921-620018-7"],
    ["921-921", "620018-7"],
    ["921", "620018-7"],
  ]) {
    const id = identidadDelComprobante({ ...base, puntoVenta, numero });
    assert.equal(id.puntoVenta, null, `${puntoVenta} ${numero}`);
    assert.equal(id.numero, null, `${puntoVenta} ${numero}`);
    // La letra, el CUIT y el CAE sí quedan: son de su propio recuadro.
    assert.equal(id.tipo, "B");
    assert.equal(id.cae, "86395263000660");
  }
});

test("NI EL CUIT NI EL CAE: un número sacado de ellos queda vacío", () => {
  const base = { tipo: "B", cuit: "30-50577985-8", cae: "86395263000660" };
  assert.equal(identidadDelComprobante({ ...base, puntoVenta: "30", numero: "50577985" }).numero, null);
  assert.equal(identidadDelComprobante({ ...base, puntoVenta: "8639", numero: "52630006" }).numero, null);
  // CONTRAPRUEBA: un número de comprobante de verdad, rotulado, pasa entero.
  const bueno = identidadDelComprobante({ ...base, puntoVenta: "0921", numero: "00456123" });
  assert.equal(bueno.puntoVenta, "0921");
  assert.equal(bueno.numero, "00456123");
});

test("SIN NÚMERO A LA VISTA, CCU CIERRA CON LA IDENTIDAD VACÍA: no se deduce nada", async () => {
  const { puerta } = await leer({ flash: respuesta("flash"), explicaciones: CONFIRMADA_B, grande: respuesta("pro") });
  assert.equal(puerta.aGuardar.tipo, "B");
  assert.equal(puerta.aGuardar.puntoVenta, null);
  assert.equal(puerta.aGuardar.numero, null);
  assert.equal(puerta.aGuardar.cae, "86395263000660");
  // Con la identidad que dio producción —el IIBB— tampoco queda número.
  const conIibb = respuesta("flash", { identidad: { ...CCU.identidad, puntoVenta: "921", numero: "921-620018-7" } });
  const r = await leer({ flash: conIibb, explicaciones: CONFIRMADA_B, grande: conIibb });
  assert.equal(r.puerta.aGuardar.numero, null);
  assert.equal(r.puerta.aGuardar.puntoVenta, null);
});

test("EL PROMPT LO DICE: el número sale solo del número de comprobante, nunca del IIBB", () => {
  const t = instruccionesInterpretadas({});
  assert.match(t, /SOLO del número de comprobante/);
  assert.match(t, /Ingresos Brutos \(IIBB\)/);
  assert.match(t, /no los deduzcas/);
  assert.ok(esquemaInterpretado().properties.identidad.properties.cae, "el esquema no pide el CAE");
});

// ══════════════════════════════════════════════════════════════════════════
// 4. EL CAE SE GUARDA Y DEFIENDE CONTRA EL DUPLICADO
// ══════════════════════════════════════════════════════════════════════════

test("EL CAE SE GUARDA AUNQUE EL PAPEL NO CIERRE, Y LA IDENTIDAD NO", async () => {
  const corrido = respuesta("flash", {
    lineas: CCU.lineas.map((l, i) => (i === 0 ? { ...l, costoFinal: l.costoFinal + 1000 } : l)),
  });
  const { puerta } = await leer({ flash: corrido, explicaciones: CONFIRMADA_B, grande: corrido });
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.equal(puerta.aGuardar.cae, "86395263000660", "el papel que no cierra es el que más se sube dos veces");
  assert.equal("tipo" in puerta.aGuardar, false, "la identidad va al índice único solo si cierra");
  // El consumo se guarda igual: la lectura fallida consumió.
  assert.equal(puerta.aGuardar.tokensEntrada, 2400);
});

test("UN SEGUNDO COMPROBANTE CON EL MISMO CAE SE RECHAZA COMO DUPLICADO", async () => {
  const consultas = [];
  const db = {
    comprobanteProveedor: {
      findFirst: async ({ where }) => {
        consultas.push(where);
        return where.cae === "86395263000660"
          ? { id: 257, proveedorId: 12, tipo: "B", puntoVenta: null, numero: null, estado: "CARGADO", pedidoId: 300, cae: where.cae }
          : null;
      },
      findMany: async () => [],
    },
  };
  const choca = await comprobanteConLaMismaIdentidad(db, {
    grupoId: 1, proveedorId: 12, identidad: { cae: "86395263000660", puntoVenta: null, numero: null }, exceptoId: 301,
  });
  assert.equal(choca?.id, 257);
  // Por grupo, sin el ANULADO, y sin chocar consigo mismo al releer.
  assert.deepEqual(consultas[0], { grupoId: 1, cae: "86395263000660", estado: { not: "ANULADO" }, id: { not: 301 } });
  assert.match(textoDeDuplicado(choca), /CAE 86395263000660/);
  // CONTRAPRUEBA: otro CAE y sin número, no hay con qué chocar.
  const otro = await comprobanteConLaMismaIdentidad(db, {
    grupoId: 1, proveedorId: 12, identidad: { cae: "86395263000661" },
  });
  assert.equal(otro, null);
});

test("LA BASE TAMBIÉN LO DEFIENDE: índice único del CAE por grupo, salvo los anulados", () => {
  const sql = fs.readFileSync(
    new URL("prisma/migrations/20261010180000_explicacion_por_tipo/migration.sql", RAIZ),
    "utf8"
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "ComprobanteProveedor_cae_key"\s+ON "ComprobanteProveedor" \("grupoId", "cae"\)\s+WHERE "cae" IS NOT NULL AND estado <> 'ANULADO'/
  );
  // Y la ruta de leer pregunta ANTES de escribir, con lo que va a guardar.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /comprobanteConLaMismaIdentidad\(prisma, \{[\s\S]*identidad: puerta\.aGuardar,/);
});

// ══════════════════════════════════════════════════════════════════════════
// 5. FACTURA A CON LA B CONFIRMADA
// ══════════════════════════════════════════════════════════════════════════

test("UNA FACTURA A DE CCU CON LA B CONFIRMADA: lee el grande y deja pendiente LA A, sin tocar la B", async () => {
  const facturaA = (quien) => respuesta(quien, { identidad: { ...CCU.identidad, tipo: "A" } });
  const explicaciones = CONFIRMADA_B.map((e) => ({ ...e }));
  const { escalada, puerta, llamadasGrande } = await leer({
    flash: facturaA("flash"), explicaciones, grande: facturaA("pro"),
  });
  assert.equal(escalada.motivo, ESCALADA.SIN_RECETA, "la A no tiene explicación confirmada");
  assert.equal(llamadasGrande.length, 1, "el grande, una vez");
  assert.equal(escalada.cerro, true);
  assert.deepEqual(escalada.propuesta, { explicacion: CCU.explicacionPro, tipoComprobante: "A" });
  assert.equal(escalada.recetaVersion, null, "lo que propone no es la versión confirmada de nadie");
  assert.equal(puerta.estado, ESTADO.CARGADO);
  // La B quedó como estaba.
  assert.deepEqual(explicaciones, CONFIRMADA_B);
});

test("CONTRAPRUEBA: la misma factura como B lee Flash y no propone nada", async () => {
  const { escalada, llamadasGrande } = await leer({
    flash: respuesta("flash"), explicaciones: CONFIRMADA_B, grande: respuesta("pro"),
  });
  assert.equal(escalada.motivo, null);
  assert.equal(llamadasGrande.length, 0);
  assert.equal(escalada.propuesta, undefined);
});

test("LA PROPUESTA SE GUARDA Y SE CONFIRMA POR TIPO: la clave lleva el tipo de papel", () => {
  const schema = fs.readFileSync(new URL("prisma/schema.prisma", RAIZ), "utf8");
  assert.match(schema, /model ExplicacionPorTipo \{[\s\S]*@@unique\(\[grupoId, proveedorId, tipoComprobante\]\)/);
  assert.match(schema, /model RecetaPropuestaProveedor \{[\s\S]*@@unique\(\[grupoId, proveedorId, tipoComprobante\]\)/);
  const confirmar = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(confirmar, /tx\.explicacionPorTipo\.upsert\(\{\s*where: \{ grupoId_proveedorId_tipoComprobante: \{ grupoId, proveedorId, tipoComprobante \} \}/);
});

// ══════════════════════════════════════════════════════════════════════════
// 6. UN PAPEL SIN TOTAL NO SE ACEPTA A MANO
// ══════════════════════════════════════════════════════════════════════════

test("MAURO: UN RENGLÓN DE UN PAPEL SIN_TOTAL NO SE ACEPTA A MANO", () => {
  const listo = {
    productoBaseId: 7, lineaDePedidoId: 70, unidad: { requiereDecision: false },
    decision: { accion: ACCION_PRECIO.OFRECER },
  };
  const r = puedeAceptarse({ ...listo, comprobante: { estado: "SIN_TOTAL" } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.COMPROBANTE_SIN_TOTAL);
  // CONTRAPRUEBA: el mismo renglón de un papel que cerró sí se acepta.
  assert.equal(puedeAceptarse({ ...listo, comprobante: { estado: "CARGADO" } }).ok, true);
});

// ══════════════════════════════════════════════════════════════════════════
// 7. NINGÚN CÓDIGO DE FORMATO DECIDE COSTOS
// ══════════════════════════════════════════════════════════════════════════

const BORRADOS = [
  "lib/compras-proveedor/comprobante/recetaEnCriollo.js",
  "lib/compras-proveedor/comprobante/lector/promptDesdeReceta.js",
  "lib/compras-proveedor/comprobante/repartoDelPie.js",
  "lib/compras-proveedor/comprobante/correccionAutomatica.js",
  "lib/compras-proveedor/comprobante/conceptosDelPie.js",
  "lib/compras-proveedor/comprobante/internoDelRenglon.js",
];

/** Los que deciden el costo, de la lectura a la recepción. */
const DECIDEN_EL_COSTO = [
  "lib/compras-proveedor/comprobante/impuestos.js",
  "lib/compras-proveedor/comprobante/precioDeLinea.js",
  "lib/compras-proveedor/comprobante/analisisDeComprobante.js",
  "lib/compras-proveedor/comprobante/filasDeConciliacion.js",
  "lib/compras-proveedor/comprobante/cargos.js",
  "lib/compras-proveedor/comprobante/aceptarPrecio.js",
  "lib/compras-proveedor/comprobante/lector/puerta.js",
  "lib/compras-proveedor/comprobante/lector/lecturaInterpretada.js",
  "lib/compras-proveedor/comprobante/lector/contrato.js",
  "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js",
  "app/api/compras-proveedor/comprobantes/corregir/[id]/route.js",
  "app/api/compras-proveedor/conciliacion/[pedidoId]/route.js",
];

test("EL CÓDIGO DE FORMATO NO EXISTE, Y NADIE LO IMPORTA", () => {
  for (const f of BORRADOS) {
    assert.equal(fs.existsSync(new URL(f, RAIZ)), false, `volvió ${f}`);
  }
  for (const f of DECIDEN_EL_COSTO) {
    const c = codigoDe(f);
    assert.ok(
      // Con límites de palabra: `conceptosDelPieLeidos` es una columna, no el módulo.
      !/\b(recetaEnCriollo|promptDesdeReceta|repartoDelPie|correccionAutomatica|conceptosDelPie|internoDelRenglon|verificarComprobante|verificarCoherenciaDeLineas)\b/.test(c),
      `${f} volvió a usar código de formato`
    );
  }
});

test("NINGUNO DE LOS QUE DECIDEN EL COSTO LEE UNA REGLA DE FORMATO DE LA RECETA", () => {
  // Alícuota, IVA por renglón, interno, percepciones: eran los campos de la
  // receta estructurada con los que se armaba el costo. Ninguno existe ya en
  // la base, y ningún módulo del costo los puede leer.
  for (const f of DECIDEN_EL_COSTO) {
    const c = codigoDe(f);
    assert.ok(
      !/alicuotaIvaPct|ivaPorLinea|tieneImpuestoInterno|percepcionesEnCosto|ivaIncluyeInternoEnLaBase|percepcionDeLaLinea/.test(c),
      `${f} volvió a decidir con una regla de formato`
    );
  }
  const schema = fs.readFileSync(new URL("prisma/schema.prisma", RAIZ), "utf8");
  const receta = schema.slice(schema.indexOf("model RecetaProveedor {"), schema.indexOf("}", schema.indexOf("model RecetaProveedor {")));
  assert.ok(!/alicuotaIvaPct|ivaPorLinea|percepciones|explicacion/.test(receta), "la receta volvió a tener columnas de formato");
});

test("UNA LECTURA DE ANTES NO SE COSTEA: no hay precio y se pide releer", () => {
  const vieja = normalizarLectura({
    hayTotalImpreso: true, pie: { total: 100 },
    lineas: [{ descripcion: "X", cantidad: 1, netoUnitario: 100, subtotalImpreso: 100 }],
  });
  const p = pasarPorLaPuerta({ lectura: vieja, receta: null });
  assert.equal(p.estado, ESTADO.MAL_LEIDO);
  assert.equal(p.lecturaAnterior, true);
  const a = analizarPrecioDeLinea({
    linea: { cantidad: 1, netoUnitario: 100, subtotalImpreso: 100, lecturaAnterior: true },
    producto: { precio_costo: 90, factor_pack: 1, unidad_medida: "unidad" },
  });
  assert.equal(a.precioFinal, null, "una lectura vieja volvió a costearse con una regla");
  assert.equal(a.lecturaAnterior, true);
});
