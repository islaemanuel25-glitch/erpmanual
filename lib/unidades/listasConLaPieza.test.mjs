// LA REGLA ÚNICA DE UNIDADES, TANDA 4: LAS LISTAS DE PRECIOS LEEN LA FICHA Y
// HACEN LA CUENTA DE ESCALA CON LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/listasConLaPieza.test.mjs
//
// ── DE DÓNDE SALEN LOS CASOS ───────────────────────────────────────────────
//
// De DYSSA, 2026-11-04 (Emanuel), los mismos que ya fijan
// `lib/proveedores/listas/cajaRecordada.test.mjs` y
// `components/proveedores/listas/preguntaQueFaltaArranque.test.mjs`:
//   · DR LEMON 473: caja de 24 a $45.600; el renglón "DR. LEMON VODKA 5%
//     473MLX6X4" a $12.160,32 es un pack de 6.
//   · DR LEMON 473 x6 POMELO, caja de 24, renglón "DR. LEMON VODKA POMELO 5%
//     473MLX6X4": el campo arranca en 6.
//   · DR LEMON LIMON 1L X CAJA, caja de 12: ningún pack del nombre entra en la
//     caja, y el campo queda vacío.
// La fila, la cabecera y el rango tienen la forma de la base, copiada de ese
// candado: el rango del proveedor es de 0 a 12 %.
//
// ── LOS DOS CRITERIOS, CADA UNO EN SU PAPEL ────────────────────────────────
//
// El rango del proveedor dice cuánto suele aumentar, y es el que elige la
// lectura de la lista; el umbral único de 35 % dice si un precio es de la
// unidad, de un pack o del bulto, y es el de la recepción. Lo que se unifica
// es la CUENTA de escala: la caja de la ficha, los packs que la dividen y el
// costo del bulto desde el precio de un pack.

import { test } from "node:test";
import assert from "node:assert/strict";

import { bultoDeLaFicha, costoDelBulto, packsDelBulto } from "./reglaDeUnidades.js";
import { deducirUnidad, divisoresDelBulto, lecturasPosibles, UNIDAD } from "../compras-proveedor/comprobante/unidadPorPrecio.js";
import {
  cajaDelCatalogo,
  conLoRecordado,
  lecturaDelPackDeLaLista,
  packDeLaListaValido,
  packsPosibles,
  respuestaSugerida,
} from "../proveedores/listas/cajaRecordada.js";
import { lecturasDeFila } from "../proveedores/listas/decisionDeLista.js";
import { FALTA, lecturaElegida, lecturasDeLaFila, queFaltaPreguntar } from "../proveedores/listas/lecturasDeLaFila.js";
import { ESTADO_LINEA } from "../proveedores/listas/estados.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** DR LEMON 473, cargado por caja de 24 a $45.600. La forma de `CAMPOS_PRODUCTO`. */
function drLemon(extra = {}) {
  return {
    id: 21, nombre: "dr lemon 473", precio_costo: 45600, precio_venta: 60000, margen: 27, redondeo_100: false,
    es_combo: false, creadoEnLocalId: 1, activo: true, locales: [{ activo: true }],
    unidad_medida: "pack", factor_pack: 24, modoCompraProveedor: null, pesoReferenciaKg: null,
    ...extra,
  };
}
/** El renglón de DYSSA, con los campos que la ruta del resultado le pide a la fila. */
function renglonDrLemon(extra = {}) {
  return {
    id: 5001, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: null, costoAnterior: 45600, productoBaseId: 21,
    excluidaManual: false, aplicada: false, seleccionada: false, diferenciaPct: null,
    aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: null, vinculadoEn: null,
    multiplicadorConfirmado: null, fueraDeRangoAceptadaEn: null, costoMaestroPropuesto: null,
    codigoCrudo: "5000014471", codigoNormalizado: "5000014471", descripcionProveedor: "DR. LEMON VODKA 5% 473MLX6X4",
    precioConIva: 12160.32, unidadesPorBulto: null, unidadProveedor: "",
    ...extra,
  };
}
const CAB = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "DYSSA", parserListaId: null } };
const RANGO = { minPct: 0, maxPct: 12 };
/** La recordada que guarda la ruta cuando contestan "6" con la caja de 24. */
const PACK_DE_6 = { clave: "PACK_DE_LA_LISTA_6", multiplicador: 4, cantidad: 6 };

test("DR LEMON: LA CAJA DE LA FICHA MANDA, SE PREGUNTA EL PACK, Y CONTESTADO 6 LA RECOMENDADA ES × 4 = $48.641,28 (+6,7 %)", () => {
  assert.equal(bultoDeLaFicha(drLemon()), 24);
  assert.equal(cajaDelCatalogo(drLemon()), 24);

  // Sin respuesta: tal cual da −73,3 % y × 24, +540 %. Ninguna cae en el rango
  // y la caja está cargada: aparece "¿De cuántas unidades es el precio de la lista?".
  const sin = lecturasDeLaFila({ fila: renglonDrLemon(), producto: drLemon(), cab: CAB, rango: RANGO });
  const sinLectura = lecturaElegida({ lecturas: sin.lecturas, fila: renglonDrLemon() });
  assert.equal(queFaltaPreguntar({ ...sin, lectura: sinLectura, precioLista: 12160.32 }), FALTA.CAJA);
  assert.equal(respuestaSugerida({ textos: ["DR. LEMON VODKA 5% 473MLX6X4", "dr lemon 473"], caja: 24 }), 6);

  // Contestado 6: el pack de la lista, con la caja de la ficha, es la recomendada.
  const con = lecturasDeLaFila({ fila: renglonDrLemon(), producto: conLoRecordado(drLemon(), PACK_DE_6), cab: CAB, rango: RANGO });
  assert.equal(con.recomendada, "PACK_DE_LA_LISTA_6");
  const pack = con.lecturas.find((l) => l.clave === "PACK_DE_LA_LISTA_6");
  assert.equal(pack.multiplicador, 4);
  assert.equal(pack.costoNuevo, 48641.28);
  assert.equal(Math.round(((pack.costoNuevo - 45600) / 45600) * 1000) / 10, 6.7);
  // Lo que se ve, tal cual estaba.
  assert.equal(pack.titulo, "Es el precio de un PACK de 6");
  assert.match(pack.cuenta, /^Caja de 24 = 4 packs de 6 × \$ 12\.160,32/);

  // Una respuesta recordada no pisa la caja: con la ficha en 20, el 6 no la
  // divide y el pack no se arma.
  const otraCaja = lecturasDeLaFila({ fila: renglonDrLemon(), producto: conLoRecordado(drLemon({ factor_pack: 20 }), PACK_DE_6), cab: CAB, rango: RANGO });
  assert.ok(!otraCaja.lecturas.some((l) => l.clave === "PACK_DE_LA_LISTA_6"));
});

test("POMELO, CAJA DE 24: EL CAMPO SE PRECARGA CON EL PACK 6 DEL NOMBRE, NUNCA CON LA CAJA", () => {
  const caja = cajaDelCatalogo(drLemon({ nombre: "DR LEMON 473 x6 POMELO" }));
  assert.equal(caja, 24);
  assert.equal(respuestaSugerida({ textos: ["DR. LEMON VODKA POMELO 5% 473MLX6X4", "DR LEMON 473 x6 POMELO"], caja }), 6);
  // Solo acepta números que entren justo en la caja, y menores que ella.
  assert.equal(packDeLaListaValido(6, caja), true);
  for (const malo of [24, 5, 7, 1, 48]) assert.equal(packDeLaListaValido(malo, caja), false, String(malo));
});

test("LIMÓN 1L, CAJA DE 12: NINGÚN PACK DEL NOMBRE ENTRA EN LA CAJA Y EL CAMPO QUEDA VACÍO", () => {
  const caja = cajaDelCatalogo(drLemon({ nombre: "DR LEMON LIMON 1L X CAJA", factor_pack: 12 }));
  assert.equal(caja, 12);
  assert.equal(respuestaSugerida({ textos: ["DR LEMON LIMON 1L X CAJA"], caja }), null);
  assert.equal(packDeLaListaValido(12, caja), false, "la caja entera no es un pack de la lista");
});

test("LISTAS Y RECEPCIÓN CONTESTAN LO MISMO PARA EL MISMO PRECIO CONTRA LA MISMA FICHA", () => {
  // Los mismos packs: los que listas pregunta son los intermedios que prueba la recepción.
  for (const bulto of [2, 6, 7, 12, 20, 24, 30]) {
    assert.deepEqual(packsPosibles(bulto), divisoresDelBulto(bulto).filter((d) => d > 1 && d < bulto), `bulto ${bulto}`);
    assert.deepEqual(packsPosibles(bulto), packsDelBulto(bulto));
  }

  // El mismo costo del bulto para cada lectura: la unidad (× 24), cada pack de
  // la lista (× 24 ÷ n) y el bulto entero, de $500 a $600.000.
  const caja = bultoDeLaFicha(drLemon());
  const packs = packsPosibles(caja);
  for (let precio = 500; precio <= 600000; precio = Math.round(precio * 1.13 * 100) / 100) {
    const recepcion = lecturasPosibles({ cantidad: 1, precioFinal: precio, factorPack: caja, posibles: packs });
    // La unidad suelta: `lecturasDeFila` de listas contra la recepción.
    const porUnidad = lecturasDeFila({ fila: { factorPack: caja }, precio }).find((l) => l.multiplicador === caja);
    assert.equal(porUnidad.costoNuevo, round2(recepcion.porUnidad.costoPorBulto), `unidad, $${precio}`);
    // Cada pack de la lista.
    for (const n of packs) {
      const listas = lecturaDelPackDeLaLista({ precio, n, caja });
      const enRecepcion = recepcion.intermedias.find((l) => l.unidadesPorFacturada === n);
      assert.equal(listas.costoNuevo, round2(enRecepcion.costoPorBulto), `pack de ${n}, $${precio}`);
      assert.equal(listas.costoNuevo, round2(costoDelBulto({ precio, unidades: n, bulto: caja })));
    }
    // El bulto entero: el precio tal cual en los dos lados.
    assert.equal(lecturasDeFila({ fila: { factorPack: caja }, precio })[0].costoNuevo, round2(recepcion.porBulto.costoPorBulto));
  }

  // Y sobre el renglón real, la recepción lee el mismo pack que listas recomienda.
  const papel = deducirUnidad({ costoAnteriorFinal: 45600, precioFacturaFinal: 12160.32, factorPack: 24, descripcion: "DR. LEMON VODKA 5% 473MLX6X4" });
  assert.equal(papel.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(papel.unidadesPorFacturada, 6);
});
