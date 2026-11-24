// UN CAMBIO DE MERCADERÍA NO SUMA, NO PIDE NADA Y NUNCA BLOQUEA EL CIERRE.
//
// ── EL CASO (Emanuel, 2026-11-24) ─────────────────────────────────────────
//
// Factura P 0100-00189744 del 2026-11-23, proveedor con alias
// BEBIDA.VIENTO.FABULA. El papel, transcripto de la foto:
//
//   006073  0.001  CUNNINGTON COLA CLASSIC 4X3LT   *CAMBIO*  *CAMBIO*
//   006073 -0.001  CUNNINGTON COLA CLASSIC 4X3LT   *CAMBIO*  *CAMBIO*
//   004241  4.000  BAGGIO MANZANA 8X1 L      15.00%  12196.41   48785.65
//   004242 12.000  BAGGIO MULTIFRUTA 8X1LT   15.00%  12196.41  146356.97
//   004209  4.000  BAGGIO DURAZNO 8X1LT      15.00%  12196.41   48785.65
//   002000 20.000  VIÑAS DE BALBO TINTO 6X1125 15.70% 12602.84 252056.94
//   TOTAL 495985.22
//
// Antes: "al producto CUNNINGTON le falta la cantidad", el papel MAL_LEIDO, la
// propuesta de costos bloqueada, y la pantalla con "Este papel no cierra" y
// "✓ El papel cierra en $495.985,22" a la vez.
//
// ── DE DÓNDE SALE LA FORMA DE LOS DATOS ───────────────────────────────────
//
// Los números son los del papel, exactos. La forma es la de la respuesta del
// lector (`esquemaInterpretado`): `cantidad`, `precioImpreso`,
// `importeImpreso`, `costoFinal`, `tipo`. Las dos líneas de CUNNINGTON van como
// las devolvía el lector hasta hoy —MERCADERIA, sin precio ni importe y con
// costo 0—, que es la única forma que da el mensaje "le falta la cantidad":
// ese mensaje sale solo de una mercadería con costo y sin cantidad positiva
// (`verificarLecturaInterpretada`). Lo guardado se arma con el mismo mapeo
// que hace `leer/[id]/route.js` al escribir `ComprobanteLinea`.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizarLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { motivoDeEscalada } from "./escalada.js";
import { renglonesQueNoCierran } from "./renglonesQueNoCierran.js";
import { esRenglonDeCambio, TIPO_RENGLON, verificarLecturaInterpretada } from "./lecturaInterpretada.js";
import { lecturaDesdeLoGuardado } from "../lecturaGuardada.js";
import { comoLoEntendio, muestraNoCierra, textoDelResultado } from "../pruebaDeExplicacion.js";

const RECETA = { interpretada: true, explicacion: "Factura de bebidas: el importe de cada renglón es su costo." };

const PRODUCTOS = [
  ["004241", 4, 12196.41, 48785.65, "BAGGIO MANZANA 8X1 L"],
  ["004242", 12, 12196.41, 146356.97, "BAGGIO MULTIFRUTA 8X1LT"],
  ["004209", 4, 12196.41, 48785.65, "BAGGIO DURAZNO 8X1LT"],
  ["002000", 20, 12602.84, 252056.94, "VIÑAS DE BALBO TINTO 6X1125"],
].map(([codigoProveedor, cantidad, precioImpreso, importeImpreso, descripcion]) => ({
  codigoProveedor,
  descripcion,
  cantidad,
  precioImpreso,
  importeImpreso,
  costoFinal: importeImpreso,
  tipo: "MERCADERIA",
}));

/** El par de cambio, como lo devolvía el lector hasta hoy. */
const CAMBIO_EN_PAR = [0.001, -0.001].map((cantidad) => ({
  codigoProveedor: "006073",
  descripcion: "CUNNINGTON COLA CLASSIC 4X3LT",
  cantidad,
  costoFinal: 0,
  tipo: "MERCADERIA",
}));

/** El mismo cambio dicho SOLO con la marca, sin cantidades. */
const CAMBIO_SOLO_MARCA = [1, 2].map(() => ({
  codigoProveedor: "006073",
  descripcion: "CUNNINGTON COLA CLASSIC 4X3LT *CAMBIO*",
}));

const leer = (cambios, extra = {}) =>
  normalizarLectura(
    {
      identidad: { tipo: "P", puntoVenta: "0100", numero: "00189744", fecha: "2026-11-23" },
      lineas: [...cambios, ...PRODUCTOS].map((l) => ({ ...l, ...(extra[l.codigoProveedor] ?? {}) })),
      pie: { total: 495985.22 },
      lineasEnElPapel: 6,
      hayTotalImpreso: true,
      explicacion: RECETA.explicacion,
    },
    { interpretada: true, modelo: "lector-de-prueba" }
  );

/** Lo que `leer/[id]/route.js` escribe en `ComprobanteLinea`, y cómo vuelve de Prisma (Decimal → string). */
function comoQuedaGuardado(lectura) {
  const s = (v) => (v === null || v === undefined ? null : String(v));
  const lineas = lectura.lineas
    .filter((l) => l.cantidad !== null && l.netoUnitario !== null)
    .map((l, i) => ({
      orden: i + 1,
      textoCrudo: l.descripcion ?? "(sin descripción)",
      codigoProveedor: l.codigoProveedor ?? null,
      cantidad: s(l.cantidad),
      netoUnitario: s(l.netoUnitario),
      subtotalImpreso: s(l.subtotalImpreso ?? l.netoUnitario * l.cantidad),
      subtotalCorregido: null,
      internoUnitario: s(l.internoUnitario),
      pesoKg: null,
      bonificacionPct: s(l.bonificacion),
      ivaPct: null,
      costoFinalRenglon: s(l.costoFinal),
      enQueViene: l.enQueViene ?? null,
      tipoRenglon: l.tipo ?? null,
      descuentoAplicaA: null,
    }));
  return lecturaDesdeLoGuardado({
    estado: ESTADO.CARGADO,
    explicacionLeida: RECETA.explicacion,
    modeloLectura: "lector-de-prueba",
    lineasEnElPapel: 6,
    totalLeido: "495985.22",
    netoLeido: null,
    ivaLeido: null,
    internoLeido: null,
    conceptosDelPieLeidos: null,
    lineas,
  });
}

/** Lo que el candado afirma de una lectura del papel, venga como venga el cambio. */
function afirmarQueCierra(lectura) {
  const cambios = lectura.lineas.filter((l) => esRenglonDeCambio(l));
  const productos = lectura.lineas.filter((l) => !esRenglonDeCambio(l));
  assert.equal(cambios.length, 2, "las dos líneas de CUNNINGTON son cambio");
  assert.equal(productos.length, 4, "quedan los cuatro productos");
  for (const c of cambios) {
    assert.equal(c.tipo, TIPO_RENGLON.CAMBIO);
    assert.equal(c.costoFinal, 0, "un cambio no suma");
    assert.equal(c.subtotalImpreso, 0);
  }

  const puerta = pasarPorLaPuerta({ lectura, receta: RECETA });
  assert.equal(puerta.cierra, true, puerta.porque ?? "");
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.proponeCostos, true);
  assert.equal(puerta.porque, null);
  assert.deepEqual(puerta.verificacion.invalidos, []);
  // La suma de las líneas contra el total: hasta $1 de diferencia.
  assert.ok(Math.abs(puerta.diferenciaCentavos) <= 100, `difiere ${puerta.diferenciaCentavos} centavos`);

  // Sin relectura con el lector grande.
  assert.deepEqual(renglonesQueNoCierran(lectura), []);
  assert.equal(motivoDeEscalada({ resultado: { ok: true, lectura }, puerta }), null);

  // Los cuatro productos con su costo, y el unitario es importe / cantidad.
  const r = comoLoEntendio({ lectura });
  const conCosto = r.productos.filter((p) => !p.cambio && p.importeFinal > 0);
  assert.equal(conCosto.length, 4);
  assert.equal(r.productos.find((p) => p.nombre === "BAGGIO MANZANA 8X1 L").costoUnitario, 12196.41);
  assert.equal(r.productos.find((p) => p.nombre === "VIÑAS DE BALBO TINTO 6X1125").costoUnitario, 12602.85);
  assert.equal(r.productos.filter((p) => p.cambio).length, 2);
  return { puerta, resultado: r };
}

test("el par +0,001 / −0,001 de CUNNINGTON es un cambio: el papel CIERRA, sin relectura, y propone los cuatro costos", () => {
  const { puerta } = afirmarQueCierra(leer(CAMBIO_EN_PAR));
  // 495.985,21 de las líneas contra 495.985,22 del papel: un centavo, adentro.
  assert.equal(puerta.diferenciaCentavos, -1);
});

test("el cambio dicho SOLO con *CAMBIO*, sin cantidades, también se reconoce y el papel cierra", () => {
  const lectura = leer(CAMBIO_SOLO_MARCA);
  afirmarQueCierra(lectura);
  assert.deepEqual(
    lectura.lineas.filter((l) => esRenglonDeCambio(l)).map((l) => l.cantidad),
    [0, 0],
    "sin cantidad leída queda en cero: neto cero, y la base exige la columna"
  );
});

test("el cambio que el lector ya clasifica como CAMBIO, sin texto ni importe, también", () => {
  afirmarQueCierra(leer([{ codigoProveedor: "006073", descripcion: "CUNNINGTON COLA CLASSIC 4X3LT", tipo: "CAMBIO" }, { codigoProveedor: "006073", descripcion: "CUNNINGTON COLA CLASSIC 4X3LT", tipo: "CAMBIO", cantidad: -0.001 }]));
});

test("con el «15 %» anotado como bonificación, los renglones igual cierran su cuenta: no hay relectura", () => {
  const conPct = { "004241": { bonificacion: 15 }, "004242": { bonificacion: 15 }, "004209": { bonificacion: 15 }, "002000": { bonificacion: 15.7 } };
  afirmarQueCierra(leer(CAMBIO_EN_PAR, conPct));
});

test("el importe manda: si el lector le suma el «15 %» al costo, el costo vuelve a ser el importe y el papel cierra", () => {
  const conPct = Object.fromEntries(
    PRODUCTOS.map((p) => [p.codigoProveedor, { costoFinal: Math.round(p.importeImpreso * 115) / 100 }])
  );
  const lectura = leer(CAMBIO_EN_PAR, conPct);
  assert.deepEqual(
    lectura.lineas.filter((l) => !esRenglonDeCambio(l)).map((l) => l.costoFinal),
    // El centavo del total (495.985,22 contra 495.985,21) va al renglón de
    // mayor resto en el reparto, que es la VIÑAS.
    [48785.65, 146356.97, 48785.65, 252056.95]
  );
  afirmarQueCierra(lectura);
});

test("guardado y vuelto a abrir sigue cerrando: los cambios se guardan, no se pierden, y no hay dos veredictos", () => {
  const guardada = comoQuedaGuardado(leer(CAMBIO_EN_PAR));
  // Las seis filas llegan a la base: antes el par se descartaba por no traer precio.
  assert.equal(guardada.lineas.length, 6);
  const { resultado } = afirmarQueCierra(guardada);
  // Un solo veredicto: cierra, así que no se dibuja "Este papel no cierra".
  assert.equal(muestraNoCierra(resultado), false);
  assert.match(textoDelResultado(resultado).titulo, /^✓ El papel cierra/);
  assert.match(textoDelResultado(resultado).detalle, /de los 4 productos/);
});

test("un solo veredicto: si no cierra, no hay ✓, y el bloque de «no cierra» sale", () => {
  // Un dígito mal leído en la VIÑAS: la suma ya no da el total.
  const lectura = leer(CAMBIO_EN_PAR, { "002000": { importeImpreso: 252956.94, costoFinal: 252956.94 } });
  const r = comoLoEntendio({ lectura });
  assert.equal(r.cierra, false);
  assert.equal(muestraNoCierra(r), true);
  assert.doesNotMatch(textoDelResultado(r).titulo, /✓/);
  // Y lo que se nombra no es el cambio.
  assert.equal(verificarLecturaInterpretada(lectura).invalidos.length, 0);
});

test("un renglón con importe NO es un cambio aunque diga CAMBIO: una botella de cambio cobra y suma", () => {
  const lectura = normalizarLectura(
    {
      lineas: [{ descripcion: "BOTELLA DE CAMBIO", cantidad: 12, precioImpreso: 0.025, importeImpreso: 0.3, costoFinal: 0.3, tipo: "ENVASE" }],
      pie: { total: 0.3 },
      lineasEnElPapel: 1,
      hayTotalImpreso: true,
      explicacion: "x",
    },
    { interpretada: true }
  );
  assert.equal(esRenglonDeCambio(lectura.lineas[0]), false);
  assert.equal(lectura.lineas[0].tipo, "ENVASE");
});

test("un par del mismo código que NO suma cero no es un cambio", () => {
  const lectura = leer([
    { codigoProveedor: "006073", descripcion: "CUNNINGTON COLA CLASSIC 4X3LT", cantidad: 1, costoFinal: 0, tipo: "MERCADERIA" },
    { codigoProveedor: "006073", descripcion: "CUNNINGTON COLA CLASSIC 4X3LT", cantidad: -2, costoFinal: 0, tipo: "MERCADERIA" },
  ]);
  assert.equal(lectura.lineas.filter((l) => esRenglonDeCambio(l)).length, 0);
  assert.equal(pasarPorLaPuerta({ lectura, receta: RECETA }).cierra, false);
});
