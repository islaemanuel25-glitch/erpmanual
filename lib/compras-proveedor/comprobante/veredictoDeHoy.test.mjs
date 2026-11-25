// SI EL PAPEL CIERRA LO DECIDE HOY LA PUERTA, NO EL ESTADO GUARDADO.
//
// ── EL CASO (Emanuel, 2026-11-25, producción en 50c253e6) ─────────────────
//
// Factura P 0100-00189744 (alias BEBIDA.VIENTO.FABULA). Con el cambio de
// mercadería ya bien —CUNNINGTON en "Cambio · no suma", Todas 4, Coinciden 4—
// el resumen decía "Ganancia sobre 0 de 4 productos — Ninguno de los 4
// productos entra en la ganancia. El papel no cierra, así que no propone
// ningún costo." Y el papel cierra: 495.985,21 contra 495.985,22.
//
// La causa: el estado MAL_LEIDO quedó GUARDADO por la lectura de antes, y la
// conciliación (`papelNoCierra`), aceptar un precio, el cierre de la recepción
// (`papelQueNoCierra`) y la lista leían ese estado. El recálculo al abrir el
// pedido (`completarLosCostosDelImporte`) lo salteaba porque no le faltaba
// ningún costo.
//
// ── DE DÓNDE SALE LA FORMA DE LOS DATOS ───────────────────────────────────
//
// El papel, como queda en la base: las columnas de `COMPROBANTE_SELECT` y de
// `ComprobanteLinea`, con los Decimal como string, y el estado MAL_LEIDO de
// producción. Los cinco renglones son los de la relectura: CUNNINGTON 0,001
// con importe y costo 0, y los cuatro productos con su importe impreso como
// costo. Los productos del catálogo y las líneas del pedido NO salen de
// producción —ids, packs y costos supuestos—; por eso de la ganancia se
// afirma que se calcula sobre los cuatro, no cuánto da.

import test from "node:test";
import assert from "node:assert/strict";

import { conciliar } from "./conciliacionDelPedido.js";
import { completarLosCostosDelImporte } from "./fusionarHojas.js";
import { conElVeredictoDeHoy, veredictoDeLoGuardado } from "./lecturaGuardada.js";
import { esFilaDeEnvase, motivoSinComparacion, sePuedeCompararElPrecio } from "../estadoDeLineaFacturada.js";
import { gananciaDelDeposito, textoDeLaGanancia } from "../gananciaDelDeposito.js";
import { papelQueNoCierra } from "../cierreDeRecepcion.js";
import { filasDelPapelPorDetalle, precioDeLaLectura } from "../lecturaDelCierre.js";
import { ESTADO } from "./lector/puerta.js";

const TEXTO_DE_HOY = "El papel no cierra, así que no propone ningún costo.";

const PRODUCTOS = [
  ["004241", 4, "12196.41", "48785.65", "BAGGIO MANZANA 8X1 L"],
  ["004242", 12, "12196.41", "146356.97", "BAGGIO MULTIFRUTA 8X1LT"],
  ["004209", 4, "12196.41", "48785.65", "BAGGIO DURAZNO 8X1LT"],
  ["002000", 20, "12602.84", "252056.94", "VIÑAS DE BALBO TINTO 6X1125"],
];

const renglon = (orden, d, { textoCrudo, codigoProveedor, cantidad, netoUnitario, importe }) => ({
  id: 1000 + orden, orden, textoCrudo, codigoProveedor, cantidad: String(cantidad), netoUnitario,
  subtotalImpreso: importe, costoFinalRenglon: importe, internoUnitario: null, subtotalCorregido: null,
  pesoKg: null, bonificacionPct: null, descuento: null, enQueViene: null, tipoRenglon: "MERCADERIA",
  descuentoAplicaA: null, ivaPct: null, productoLocalId: 200 + d, pedidoDetalleId: d, precioPedidoPrevio: null,
  revisadoEnRecepcion: false, revisadoEnRecepcionAt: null, unidadElegida: null, propuestaIa: null,
  costoEscrito: false, noVino: false, corregidoAManoEn: null,
});

/** La factura como quedó guardada en producción: MAL_LEIDO. */
const GUARDADA = Object.freeze({
  id: 77, estado: "MAL_LEIDO", diferenciaCentavos: null,
  tipo: null, puntoVenta: null, numero: null, fecha: null, cuitLeido: null, cae: null,
  confirmadoEn: null, imagenBorradaEn: null, leidoEn: new Date("2026-11-25T12:00:00Z"),
  recetaUsada: null, modeloLectura: "lector", explicacionLeida: "Factura de bebidas: el importe es el costo.",
  totalLeido: "495985.22", lineasEnElPapel: 5, lineasTranscriptas: 5, hojaImpresa: null,
  netoLeido: null, ivaLeido: null, internoLeido: null, percepcionesLeido: null, conceptosDelPieLeidos: null,
  proveedor: { id: 9, nombre: "Bebidas", umbralRevisarPct: null, umbralSospechaBajaPct: null },
  lineas: [
    renglon(1, 5, { textoCrudo: "CUNNINGTON COLA CLASSIC 4X3LT", codigoProveedor: "006073", cantidad: "0.001", netoUnitario: "0", importe: "0" }),
    ...PRODUCTOS.map(([codigoProveedor, cantidad, netoUnitario, importe, textoCrudo], i) =>
      renglon(i + 2, i + 1, { textoCrudo, codigoProveedor, cantidad, netoUnitario, importe })
    ),
  ],
});

const COSTO = { 1: 12196.41, 2: 12196.41, 3: 12196.41, 4: 12602.84, 5: 1837.5 };
const DETALLES = [1, 2, 3, 4, 5].map((id) => ({
  id, nombre: id === 5 ? "Cunnington cola" : PRODUCTOS[id - 1][4], cantidad: id === 5 ? 0.001 : PRODUCTOS[id - 1][1],
  unidad: "UNIDAD", precioCosto: COSTO[id], precioCostoDelPedido: COSTO[id], costoMaestroHoy: COSTO[id],
  productoBaseId: 300 + id, productoLocalId: 200 + id, factorPack: 1, cantidadRecibida: null,
}));

function abrirElPedido(papel = GUARDADA) {
  const ids = [1, 2, 3, 4, 5];
  return conciliar({
    pedido: { id: 55, estado: "ENVIADO", proveedorId: 9, nacidoDeFactura: true },
    detallesPlanos: DETALLES,
    comprobantes: [papel],
    contexto: {
      datosPorBase: new Map(ids.map((id) => [300 + id, { id: 300 + id, nombre: DETALLES[id - 1].nombre, factor_pack: 1, precio_costo: COSTO[id], unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" }])),
      decisionPorBase: new Map(),
      nombrePorBase: new Map(ids.map((id) => [300 + id, DETALLES[id - 1].nombre])),
      listaGuardada: null,
    },
    porProductoLocal: new Map(ids.map((id) => [200 + id, { id: 200 + id, baseId: 300 + id }])),
    variacionNormalPct: 10,
  });
}

test("LA FACTURA GUARDADA «NO CIERRA», AL ABRIRLA SIN RELEER: cierra, propone los 4 costos y calcula la ganancia", () => {
  // El veredicto de hoy sobre lo guardado.
  const puerta = veredictoDeLoGuardado(GUARDADA);
  assert.equal(puerta.cierra, true, puerta.porque ?? "");
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.diferenciaCentavos, -1, "495.985,21 contra 495.985,22");

  const c = abrirElPedido();
  const filas = c.grupos[0].filas;
  assert.equal(c.grupos[0].comprobante.estado, "CARGADO", "la pantalla ve el papel cerrado");
  const productos = filas.filter((f) => !esFilaDeEnvase(f));
  assert.equal(productos.length, 4);
  for (const f of productos) {
    assert.equal(f.papelNoCierra, false, `${f.textoCrudo}: el papel cierra`);
    assert.equal(motivoSinComparacion(f), null, `${f.textoCrudo}: ${motivoSinComparacion(f)}`);
    assert.ok(sePuedeCompararElPrecio(f));
  }
  // El costo propuesto de cada uno es su importe dividido su cantidad, al
  // centavo (`costoUnitarioFinalCentavos`, la división de todo el módulo).
  const propuesto = Object.fromEntries(productos.map((f) => [f.codigoProveedor, precioDeLaLectura(f)]));
  assert.equal(propuesto["004241"], 12196.41, "48.785,65 ÷ 4");
  assert.equal(propuesto["004242"], 12196.41, "146.356,97 ÷ 12");
  assert.equal(propuesto["004209"], 12196.41, "48.785,65 ÷ 4");
  assert.equal(propuesto["002000"], 12602.85, "252.056,94 ÷ 20");
  // La ganancia, sobre los cuatro.
  const g = gananciaDelDeposito(filas);
  assert.equal(g.total, 4);
  assert.equal(g.enLaCuenta, 4);
  assert.doesNotMatch(textoDeLaGanancia(g) ?? "", /no cierra/);
  // La línea de cambio sigue sin traer nada.
  assert.ok(!filasDelPapelPorDetalle(c).has(5));
});

test("AL RECIBIR, EL CIERRE TAMPOCO LEE EL «NO CIERRA» GUARDADO: los costos no se excluyen", () => {
  assert.equal(papelQueNoCierra([GUARDADA]).noCierra, true, "con lo guardado, como antes");
  assert.equal(papelQueNoCierra([GUARDADA].map(conElVeredictoDeHoy)).noCierra, false);
  // Cada línea del pedido de los productos tiene su fila del papel con precio.
  const porDetalle = filasDelPapelPorDetalle(abrirElPedido());
  for (const id of [1, 2, 3, 4]) assert.ok(precioDeLaLectura(porDetalle.get(id)[0]) > 0, `la ${id} propone costo`);
});

test("AL ABRIR, EL «NO CIERRA» GUARDADO SE PISA CON EL DE HOY, AUNQUE NO FALTE NINGÚN COSTO", async () => {
  const escritos = [];
  const db = {
    comprobanteProveedor: {
      findMany: async ({ where }) => {
        assert.ok(where.estado.in.includes("MAL_LEIDO") && where.estado.in.includes("CARGADO"));
        return [structuredClone(GUARDADA)];
      },
      updateMany: async (args) => {
        escritos.push(args);
        return { count: 1 };
      },
    },
  };
  const tocados = await completarLosCostosDelImporte(db, { grupoId: 1, pedidoId: 55 });
  assert.deepEqual(tocados, [77]);
  assert.equal(escritos.length, 1);
  assert.deepEqual(escritos[0].data, { estado: "CARGADO", diferenciaCentavos: -1 });
  // Solo si sigue siendo el que se leyó: una relectura en el medio gana.
  assert.equal(escritos[0].where.estado, "MAL_LEIDO");
});

test("CONTRAPRUEBA: un papel que de verdad no cierra sigue sin cerrar, y lo dice", () => {
  const mal = {
    ...GUARDADA,
    lineas: GUARDADA.lineas.map((l) => (l.codigoProveedor === "002000" ? { ...l, subtotalImpreso: "252956.94", costoFinalRenglon: "252956.94" } : l)),
  };
  assert.equal(veredictoDeLoGuardado(mal).cierra, false);
  const g = gananciaDelDeposito(abrirElPedido(mal).grupos[0].filas);
  assert.equal(g.enLaCuenta, 0);
  assert.equal(textoDeLaGanancia(g), `Ninguno de los 4 productos entra en la ganancia. ${TEXTO_DE_HOY}`);
  // Y uno guardado CARGADO que con las reglas de hoy no cierra, tampoco pasa.
  assert.equal(conElVeredictoDeHoy({ ...mal, estado: "CARGADO" }).estado, "MAL_LEIDO");
  // Lo que no tiene lectura que juzgar queda como está.
  assert.equal(conElVeredictoDeHoy({ ...mal, estado: "PENDIENTE_LECTURA" }).estado, "PENDIENTE_LECTURA");
});
