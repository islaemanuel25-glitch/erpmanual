// EL MISMO PRODUCTO EN DOS PAPELES DE LA MISMA ENTREGA: UNA FILA, COSTO PROMEDIADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/vinos593.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-11 ~9:45, pedido 593) ───────────────────────
//
// Un proveedor de vinos entrega con DOS papeles: el presupuesto 9003-00031612
// (sin impuestos, $1.288.713,84) y la factura A 00080316 (IVA 21 % y
// percepción 3 %, $1.598.005,87). El precio de cada renglón de cada papel no
// es el real: lo que vale es lo que paga en total por cada producto. Hasta acá
// cada renglón era una fila y el cierre escribía el costo de la última que se
// aceptaba.
//
// Regla de Emanuel: las cantidades se suman y el costo es el promedio
// ponderado —lo que costó en todos los papeles, con sus impuestos, ÷ las
// unidades—; la comparación contra el ERP va con ese costo; un solo renglón
// por producto, y la hoja dice de dónde sale. Mientras falte leer un papel de
// la entrega, ningún costo de un papel solo.
//
// `vinos593.fixture.json`: los dos papeles, sus renglones, las líneas del
// pedido y las fichas, como están en la base. Pasan por `conciliar`, que es lo
// que ven la pantalla, aceptar el precio y el cierre.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import D from "./vinos593.fixture.json" with { type: "json" };
import { aplanarDetalles } from "./analisisDeComprobante.js";
import { conciliar } from "./conciliacionDelPedido.js";
import { hayDiferenciaDePrecio, saltoDePrecioAceptable } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { renglonesDeLaTarjeta, textoDeLosPapeles, textoDelCostoDeVariosPapeles } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { formatearMoneda } from "@/lib/moneda";
import HojaCorregirLinea from "../../../components/compras-proveedor/HojaCorregirLinea.jsx";

const PROVEEDOR = { id: 9, nombre: "Vinos", umbralRevisarPct: null, umbralSospechaBajaPct: null };

function conciliacion({ lineas = D.lineas, comprobantes = D.comprobantes } = {}) {
  const fichas = new Map(D.fichas.map((b) => [b.id, b]));
  const contexto = {
    datos: { codigosProveedor: [], productos: [] },
    catalogo: [],
    catalogoNormalizado: [],
    nombrePorBase: new Map(D.fichas.map((b) => [b.id, b.nombre])),
    datosPorBase: fichas,
    decisionPorBase: new Map(),
  };
  const detallesPlanos = aplanarDetalles(
    D.detalles.map((d) => ({ ...d, producto: { id: d.productoLocalId, baseId: d.baseId, base: fichas.get(d.baseId) } }))
  );
  const porProductoLocal = new Map(D.detalles.map((d) => [d.productoLocalId, { id: d.productoLocalId, baseId: d.baseId }]));
  const papeles = comprobantes.map((c) => ({ ...c, proveedor: PROVEEDOR, lineas: lineas.filter((l) => l.comprobanteId === c.id) }));
  const r = conciliar({
    pedido: { id: 593, estado: "ENVIADO", proveedorId: 9, nacidoDeFactura: true },
    detallesPlanos,
    comprobantes: papeles,
    contexto,
    porProductoLocal,
    variacionNormalPct: 10,
  });
  return r.grupos.flatMap((g) => g.filas).map((f) => ({ ...f, variacionNormalPct: 10 }));
}

const delCodigo = (filas, codigo) => filas.filter((f) => f.codigoProveedor === codigo);
const redondo = (v) => Math.round(v * 100) / 100;

// Lo que pidió Emanuel, por unidad. El Dilema Blanco da $3.040,48: 15 a
// $2.714,72 y 15 a $3.366,24 —$91.214,46 ÷ 30—; con los redondeos del papel no
// llega a los $3.040,49 del Rosado.
const ESPERADO = [
  ["45620", 480, 1428.5],
  ["87353", 300, 2117.34],
  ["87349", 240, 2117.34],
  ["86339", 240, 2409.51],
  ["85519", 90, 3040.49],
  ["85514", 30, 3040.48],
];

test("UN SOLO RENGLÓN POR PRODUCTO, CON LAS CANTIDADES SUMADAS Y EL COSTO PROMEDIADO", () => {
  const filas = conciliacion();
  for (const [codigo, unidades, porUnidad] of ESPERADO) {
    const del = delCodigo(filas, codigo);
    assert.equal(del.length, 1, `${codigo} quedó en ${del.length} filas`);
    const [f] = del;
    assert.equal(f.lineaIds.length, 2, "los dos papeles");
    assert.equal(f.unidadesJuntas, unidades);
    assert.equal(redondo(f.porUnidadJunto), porUnidad, codigo);
  }
  // Ningún producto vinculado duplicado.
  const detalles = filas.map((f) => f.pedidoDetalleId).filter((d) => d != null);
  assert.equal(new Set(detalles).size, detalles.length);
});

test("TORO: LA FACTURA CON IVA Y PERCEPCIÓN, EL PRESUPUESTO SIN, Y LA HOJA DICE DE DÓNDE SALE", () => {
  const [toro] = delCodigo(conciliacion(), "45620");
  assert.equal(
    textoDeLosPapeles(toro),
    `Presupuesto: 240 a ${formatearMoneda(1275.45)} · Factura: 240 a ${formatearMoneda(1581.56)} → queda ${formatearMoneda(1428.5)} la unidad`
  );
  const h = renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: toro, abierta: true, onCerrar() {}, onGuardar() {} }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  assert.ok(h.includes(textoDeLosPapeles(toro)), h);
});

test("LA COMPARACIÓN CONTRA EL ERP VA CON EL COSTO PROMEDIADO, NO CON EL DE UN PAPEL", () => {
  const [toro] = delCodigo(conciliacion(), "45620");
  // El pack de 12 a $19.200 en el ERP contra el promedio del pack.
  const pct = renglonesDeLaTarjeta(toro).erp.pct;
  assert.equal(Math.round(pct * 10) / 10, Math.round(((19200 - toro.costoFactura) / 19200) * 1000) / 10);
  assert.equal(redondo(toro.costoFactura / 12), 1428.5, "el costo de la fila es el promedio, por pack");
  assert.equal(toro.precio.precioAEscribir, toro.costoFactura, "lo que se aceptaría es el promedio");
  assert.equal(hayDiferenciaDePrecio(toro), true, "con los dos papeles leídos, se propone");
});

test("VARIANTE: PRECIOS Y CANTIDADES DISTINTOS ENTRE PAPELES — (100 × 1.100 × 1,24 + 140 × 1.500) ÷ 240", () => {
  const lineas = D.lineas.map((l) => {
    if (l.codigoProveedor !== "45620") return l;
    return l.comprobanteId === 88
      ? { ...l, cantidad: 100, netoUnitario: 1100, subtotalImpreso: 110000, costoFinalRenglon: 136400 }
      : { ...l, cantidad: 140, netoUnitario: 1500, subtotalImpreso: 210000, costoFinalRenglon: 210000 };
  });
  const [toro] = delCodigo(conciliacion({ lineas }), "45620");
  assert.equal(toro.unidadesJuntas, 240);
  assert.equal(redondo(toro.porUnidadJunto), redondo((100 * 1100 * 1.24 + 140 * 1500) / 240));
  assert.match(textoDeLosPapeles(toro), /^Presupuesto: 140 a .* · Factura: 100 a .* → queda /);
});

test("MIENTRAS FALTE LEER UN PAPEL DE LA ENTREGA, NINGÚN COSTO DE UNO SOLO", () => {
  const comprobantes = [...D.comprobantes, { id: 99, estado: "PENDIENTE_LECTURA", tipo: null, leidoEn: null }];
  const [toro] = delCodigo(conciliacion({ comprobantes }), "45620");
  assert.equal(toro.faltaLeerUnPapel, true);
  assert.equal(hayDiferenciaDePrecio(toro), false);
  assert.equal(saltoDePrecioAceptable(toro), false);
  assert.match(textoDelCostoDeVariosPapeles(toro), /^Falta leer otro papel de esta entrega/);
});

test("SI LOS PAPELES CUENTAN EL PRODUCTO DE DISTINTA FORMA, NO SE JUNTA NI SE PROPONE UN COSTO DE UNO SOLO", () => {
  const lineas = D.lineas.map((l) =>
    l.codigoProveedor === "45620" && l.comprobanteId === 87
      ? { ...l, cantidad: 20, enQueViene: "bulto de 12", netoUnitario: 15305.4, subtotalImpreso: 306108, unidadElegida: "POR_BULTO" }
      : l
  );
  const toros = delCodigo(conciliacion({ lineas }), "45620");
  assert.equal(toros.length, 2);
  for (const f of toros) {
    assert.equal(f.sinJuntar, true);
    assert.equal(hayDiferenciaDePrecio(f), false);
    assert.match(textoDelCostoDeVariosPapeles(f), /no se propone de un papel solo/);
  }
});

test("REVISAR, ELEGIR EN QUÉ VIENE Y ACEPTAR EL PRECIO ESCRIBEN EN TODOS LOS RENGLONES DEL PRODUCTO", () => {
  const sin = (ruta) =>
    fs.readFileSync(new URL(ruta, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const revisada = sin("../../../app/api/compras-proveedor/comprobantes/marcar-revisada/route.js");
  assert.match(revisada, /const hermanos = await hermanosDelRenglon\(prisma, linea\)/);
  assert.match(revisada, /updateMany\(\{ where: \{ id: \{ in: otros \} \}, data: marca \}\)/);
  const aceptar = sin("../../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(aceptar, /updateMany\(\{\s*where: \{ id: \{ in: hermanos \} \},\s*data: \{\s*precioPedidoPrevio: detalle\.precioCosto,\s*costoFinalUnitario: precioAEscribir,/);
  const correccion = sin("../../../app/api/compras-proveedor/recepcion/correccion/route.js");
  assert.match(correccion, /updateMany\(\{ where: \{ id: \{ in: hermanos \} \}, data: \{ unidadElegida: elegida \} \}\)/);
});
