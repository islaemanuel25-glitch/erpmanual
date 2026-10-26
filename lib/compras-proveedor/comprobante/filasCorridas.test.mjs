// EL PAPEL DE MAURO #298, LEÍDO CORRIDO UNA FILA EN EL BLOQUE M.CRAFTED.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/filasCorridas.test.mjs
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// `mauro298Corrido.fixture.json` es una foto de producción del 2026-10-26, de
// solo lectura: el comprobante 34 con sus 19 filas TAL COMO QUEDARON GUARDADAS
// —corridas—, las 24 líneas del pedido, los vínculos y productos del proveedor
// y sus decisiones de precio. Con eso corre la MISMA conciliación que dibuja la
// pantalla (`conciliar`), sin base.
//
// Lo que dice el papel, verificado a mano por Emanuel fila por fila:
//
//   M.CRAFTED 20 BOX CONV   · sin cantidad · $4.050 · $0 (no se mandó)
//   M.CRAFTED 20 BOX RED    · 10 · $4.050 · $40.500
//   M.CRAFTED 20 BOX CORAL  · 30 · $4.050 · $121.500
//   M.CRAFTED 20 BOX UVA    · 30 · $4.050 · $121.500
//   M.CRAFTED 20 KS RED     · 90 · $3.650 · $328.500
//   M.CRAFTED 20 CONV KS    · 50 · $3.650 · $182.500
//   M.CRAFTED 20 suave KS   · 10 · $3.650 · $36.500

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { conciliar } from "./conciliacionDelPedido.js";
import { aplanarDetalles } from "./analisisDeComprobante.js";
import { filaCoincideConElPedido } from "./filasCorridas.js";
import { normalizarLectura } from "./lector/contrato.js";
import { instruccionesInterpretadas } from "./lector/lecturaInterpretada.js";
import { AVISO_PAPEL_CORRIDO, hayDiferenciaDePrecio, motivoSinComparacion } from "../estadoDeLineaFacturada.js";

const FOTO = JSON.parse(fs.readFileSync(new URL("./mauro298Corrido.fixture.json", import.meta.url), "utf8"));

const CONTEXTO = {
  datos: FOTO.datos,
  catalogo: FOTO.catalogo,
  catalogoNormalizado: FOTO.catalogo.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
  nombrePorBase: new Map(FOTO.catalogo.map((p) => [p.id, p.nombre])),
  datosPorBase: new Map(FOTO.catalogo.map((p) => [p.id, p])),
  decisionPorBase: new Map(FOTO.decisiones),
};
const PEDIDO = { id: 298, estado: "ENVIADO", proveedorId: 3, nacidoDeFactura: false };

const conciliarCon = ({ lineas = FOTO.comprobante.lineas, detalles = FOTO.detalles } = {}) =>
  conciliar({
    pedido: PEDIDO,
    detallesPlanos: aplanarDetalles(detalles),
    comprobantes: [{ ...FOTO.comprobante, lineas }],
    contexto: CONTEXTO,
    porProductoLocal: new Map(FOTO.productosLocales.map((p) => [p.id, p])),
    variacionNormalPct: FOTO.variacionNormalPct,
  });

const porTexto = (lineas, texto) => lineas.find((l) => l.textoCrudo === texto);
const numeros = (l) => [Number(l.cantidad), Number(l.subtotalImpreso)];

test("ASÍ QUEDÓ GUARDADO: el bloque M.CRAFTED corrido una fila, y la suma igual cierra", () => {
  const l = FOTO.comprobante.lineas;
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 BOX CONV")), [10, 40500], "tiene los números de BOX RED");
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 BOX UVA")), [90, 328500], "tiene los de KS RED");
  assert.equal(porTexto(l, "M.CRAFTED 20 CONV KS"), undefined, "el nombre de CONV KS no se transcribió");
  const suma = l.reduce((a, x) => a + Number(x.subtotalImpreso), 0);
  assert.equal(suma, 2026100, "la suma cierra: no la delata");
});

test("1 · CON EL PEDIDO SE DETECTA Y SE ACOMODA: los números bajan una fila y BOX CONV no aparece", () => {
  const r = conciliarCon().corrimientos.get(FOTO.comprobante.id);
  assert.ok(r.acomodo, "el bloque se tiene que poder acomodar");
  assert.equal(r.acomodo.sentido, 1);
  const l = r.acomodo.lineas;
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 BOX RED")), [10, 40500]);
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 BOX CORAL")), [30, 121500]);
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 BOX UVA")), [30, 121500]);
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 KS RED")), [90, 328500]);
  assert.deepEqual(numeros(porTexto(l, "M.CRAFTED 20 SUAVE KS")), [10, 36500], "la de abajo del bloque no se toca");
  assert.equal(porTexto(l, "M.CRAFTED 20 BOX CONV"), undefined, "la fila que no se mandó no aparece");
  // Los números que el lector dejó sin nombre van al producto del pedido con el
  // que coinciden y que nadie más reclama: CONV KS es el crafted mentolado común.
  const huerfana = l.find((x) => x.pedidoDetalleId === 3202);
  assert.deepEqual(numeros(huerfana), [50, 182500]);
  assert.equal(huerfana.textoCrudo, "Marlboro 20 crafted mentolado común");
  // Nada de plata se movió de más: la suma es la misma.
  assert.equal(l.reduce((a, x) => a + Number(x.subtotalImpreso), 0), 2026100);
});

test("1 · ACOMODADO, TODO EL BLOQUE COINCIDE CON EL PEDIDO Y NO HAY NADA QUE AVISAR", () => {
  const acomodo = conciliarCon().corrimientos.get(FOTO.comprobante.id).acomodo;
  const despues = conciliarCon({ lineas: acomodo.lineas });
  const r = despues.corrimientos.get(FOTO.comprobante.id);
  assert.equal(r.acomodo, null, "una vez acomodado no se vuelve a mover: es idempotente");
  assert.deepEqual(r.sospechosas, []);
  const filas = despues.grupos[0].filas;
  for (const texto of ["M.CRAFTED 20 BOX RED", "M.CRAFTED 20 BOX CORAL", "M.CRAFTED 20 BOX UVA", "M.CRAFTED 20 KS RED"]) {
    const f = filas.find((x) => x.textoCrudo === texto);
    assert.ok(filaCoincideConElPedido(f, { variacionPct: 10 }), `${texto} coincide con el pedido`);
  }
});

test("2 · SI NO SE PUEDE ACOMODAR, SE AVISA Y ESE BLOQUE NO PROPONE COSTOS", () => {
  // El mismo papel corrido, sin la línea del pedido que explica los números
  // sin nombre: el acomodo no se puede cerrar.
  const sinLaHuerfana = FOTO.detalles.filter((d) => d.id !== 3202);
  const c = conciliarCon({ detalles: sinLaHuerfana });
  const r = c.corrimientos.get(FOTO.comprobante.id);
  assert.equal(r.acomodo, null);
  const ids = new Set(r.sospechosas);
  const id = (texto) => porTexto(FOTO.comprobante.lineas, texto).id;
  for (const t of ["M.CRAFTED 20 BOX RED", "M.CRAFTED 20 BOX UVA", "M.CRAFTED 20 KS RED"]) assert.ok(ids.has(id(t)), `${t} queda marcada`);
  // Lo que la pantalla y aceptar-precio hacen con la marca.
  const fila = { ...c.grupos[0].filas.find((f) => f.lineaId === id("M.CRAFTED 20 BOX UVA")), corridaSospechada: true };
  assert.equal(motivoSinComparacion(fila), AVISO_PAPEL_CORRIDO);
  assert.match(AVISO_PAPEL_CORRIDO, /^Puede que el papel se haya leído corrido/);
  assert.equal(hayDiferenciaDePrecio(fila), false, "no se propone su costo");
});

test("CONTRAPRUEBA: UN PROVEEDOR QUE MANDA DE MENOS NO ES UN PAPEL CORRIDO", () => {
  // El papel bien leído, con dos productos seguidos que vinieron de menos y que
  // ningún vecino explica: diferencias de cantidad legítimas.
  const bien = conciliarCon().corrimientos.get(FOTO.comprobante.id).acomodo.lineas;
  const deMenos = bien.map((l) =>
    l.textoCrudo === "M.CRAFTED 20 BOX CORAL" || l.textoCrudo === "M.CRAFTED 20 BOX UVA"
      ? { ...l, cantidad: 20, subtotalImpreso: 81000, costoFinalRenglon: 81000 }
      : l
  );
  const r = conciliarCon({ lineas: deMenos }).corrimientos.get(FOTO.comprobante.id);
  assert.equal(r.acomodo, null);
  assert.deepEqual(r.sospechosas, [], "no se frenan los costos de una recepción bien leída");
});

test("2 · AL LECTOR: CADA FILA ES UNA UNIDAD, Y LA FILA EN $0 SE TRANSCRIBE EN SU LUGAR", () => {
  const pedido = instruccionesInterpretadas({});
  assert.match(pedido, /CADA FILA DE LA TABLA ES UNA UNIDAD/);
  assert.match(pedido, /Nunca le pongas a un nombre los números de la fila de arriba o de abajo/);
  assert.match(pedido, /transcribila igual EN SU LUGAR, con su descripción, importeImpreso 0 y sin cantidad/);
  // Y el sistema la descarta: BOX CONV como la tiene que transcribir el lector.
  const lectura = normalizarLectura(
    {
      lineas: [
        { descripcion: "M.CRAFTED 20 BOX CONV", precioImpreso: 4050, importeImpreso: 0, tipo: "MERCADERIA" },
        { descripcion: "M.CRAFTED 20 BOX RED", cantidad: 10, precioImpreso: 4050, importeImpreso: 40500, tipo: "MERCADERIA" },
      ],
      pie: {},
      hayTotalImpreso: false,
      discriminaImpuestos: false,
      explicacion: "Planilla de Mauro.",
    },
    { interpretada: true }
  );
  assert.deepEqual(lectura.lineas.map((x) => x.descripcion), ["M.CRAFTED 20 BOX RED"]);
  assert.equal(lectura.lineas[0].subtotalImpreso, 40500, "BOX RED con sus propios números");
  // CONTRAPRUEBA: un renglón regalado trae su cantidad, y se queda.
  const regalado = normalizarLectura(
    { lineas: [{ descripcion: "DR. LEMON", cantidad: 6, importeImpreso: 0, costoFinal: 0 }], pie: {}, explicacion: "x" },
    { interpretada: true }
  );
  assert.equal(regalado.lineas.length, 1);
});
