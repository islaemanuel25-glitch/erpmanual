// Candados del vínculo entre la línea de la factura y el producto del ERP.
//
// Lo que se protege, y es una sola cosa: QUE UN TEXTO PARECIDO NUNCA VINCULE
// SOLO. Un vínculo equivocado no se ve — la línea queda al lado de un producto
// plausible, alguien acepta el precio, y el costo entra en el que no era.
//
// Las descripciones son las REALES de la factura de DYSSA 0011-00794708, con sus
// códigos de artículo. No son inventadas.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buscarCandidatos,
  aliasAEscribir,
  lineaDelPedido,
  esAutomatico,
  ORIGEN_VINCULO,
  ORIGENES_AUTOMATICOS,
  TEXTO_ORIGEN,
  MAX_SUGERENCIAS,
} from "./vinculo.js";

// ── Las líneas reales de DYSSA ─────────────────────────────────────────────

const LINEAS_DYSSA = [
  { codigoProveedor: "010027", descripcion: "AMARGO OBRERO 19 950MLX12" },
  { codigoProveedor: "010193", descripcion: "PREFERIDO PAN RALLADO 500GR+50GRX20" },
  { codigoProveedor: "013680", descripcion: 'PRONTO BIT 4.5" 473MLX6X4' },
  { codigoProveedor: "014882", descripcion: 'GANCIA LIMA ONE 3.5" 473MLX6X4' },
  { codigoProveedor: "021066", descripcion: "COCINERO ACEITE GIRASOL 900MLX15" },
  { codigoProveedor: "029761", descripcion: "LADYSOFT TF COMFORT EXT ALGODON 8X54" },
  { codigoProveedor: "037030", descripcion: "DURACELL PILA ALC AAA x 12 TIRA" },
];

const vinculo = (codigo, productoBaseId, extra = {}) => ({
  id: productoBaseId * 10,
  codigoInterno: codigo,
  productoBaseId,
  activo: true,
  nombre: `Producto ${productoBaseId}`,
  ...extra,
});

// ── 1. El código, que es el único que no interpreta ────────────────────────

test("EL CÓDIGO DEL PROVEEDOR VINCULA SOLO, y las siete líneas de DYSSA salen", () => {
  const vinculos = LINEAS_DYSSA.map((l, i) => vinculo(l.codigoProveedor, 100 + i));
  for (const [i, linea] of LINEAS_DYSSA.entries()) {
    const r = buscarCandidatos({ linea, vinculos });
    assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR, linea.descripcion);
    assert.equal(r.vinculoAutomatico?.productoBaseId, 100 + i, linea.descripcion);
    assert.equal(r.requiereDecision, false);
  }
});

test("el código se compara normalizado: los ceros y guiones no importan", () => {
  const vinculos = [vinculo("010027", 7)];
  for (const c of ["010027", "010-027", " 010027 ", "010 027"]) {
    const r = buscarCandidatos({ linea: { codigoProveedor: c, descripcion: "x" }, vinculos });
    assert.equal(r.vinculoAutomatico?.productoBaseId, 7, c);
  }
});

test("un vínculo INACTIVO no vincula", () => {
  // El soft-delete existe para dejar de usar un vínculo sin perderlo. Si igual
  // vinculara, borrarlo no serviría de nada.
  const r = buscarCandidatos({
    linea: LINEAS_DYSSA[0],
    vinculos: [vinculo("010027", 7, { activo: false })],
  });
  assert.notEqual(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
});

test("DOS PRODUCTOS CON EL MISMO CÓDIGO NO ELIGEN UNO: frenan", () => {
  // El índice único lo impide, así que si pasa el dato está roto. Elegir
  // cualquiera sería tapar un problema escribiendo un costo.
  const r = buscarCandidatos({
    linea: LINEAS_DYSSA[0],
    vinculos: [vinculo("010027", 7), vinculo("010027", 8)],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.SIN_CANDIDATOS);
  assert.equal(r.vinculoAutomatico, null);
  assert.match(r.problema, /2 productos vinculados al código/i);
});

// ── 2. El alias, que es lo que hace que la próxima salga sola ──────────────

test("EL ALIAS POR DESCRIPCIÓN VINCULA SOLO cuando es exacto", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "AMARGO OBRERO 19 950MLX12" },
    vinculos: [vinculo("TXT:algo", 42, { descripcionProveedor: "AMARGO OBRERO 19 950MLX12" })],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
  assert.equal(r.vinculoAutomatico?.productoBaseId, 42);
});

test("el alias tolera mayúsculas y acentos, no otra cosa", () => {
  const vinculos = [vinculo("TXT:x", 42, { descripcionProveedor: "Café La Virginia 500g" })];
  const igual = buscarCandidatos({ linea: { descripcion: "CAFE LA VIRGINIA 500G" }, vinculos });
  assert.equal(igual.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);

  // Un texto PARECIDO no es el mismo alias: cae a sugerencia, no a vínculo.
  const parecido = buscarCandidatos({ linea: { descripcion: "Café La Virginia 250g" }, vinculos });
  assert.notEqual(parecido.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
});

test("el mismo nombre vinculado a dos productos ofrece los dos y no elige", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "COCINERO ACEITE GIRASOL 900MLX15" },
    vinculos: [
      vinculo("TXT:a", 1, { descripcionProveedor: "COCINERO ACEITE GIRASOL 900MLX15" }),
      vinculo("TXT:b", 2, { descripcionProveedor: "cocinero aceite girasol 900mlx15" }),
    ],
  });
  assert.equal(r.vinculoAutomatico, null);
  assert.equal(r.requiereDecision, true);
  assert.equal(r.candidatos.length, 2);
  assert.match(r.problema, /más de un producto/i);
});

// ── 3 y 4. La cascada de texto: SUGIERE, no decide ─────────────────────────

test("EL TEXTO NUNCA VINCULA SOLO, por más que sea el único candidato", () => {
  // EL CANDADO CENTRAL. Un vínculo equivocado no se ve, y de acá salen los
  // equivocados.
  const universo = [{ productoBaseId: 9, nombre: "AMARGO OBRERO 950ML" }];
  const r = buscarCandidatos({ linea: LINEAS_DYSSA[0], vinculos: [], universoProveedor: universo });
  assert.equal(r.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);
  assert.ok(r.candidatos.length >= 1, "tiene que sugerir");
  assert.equal(r.vinculoAutomatico, null, "pero NUNCA vincular solo");
  assert.equal(r.requiereDecision, true);
});

test("PRIMERO EL UNIVERSO DEL PROVEEDOR, DESPUÉS TODO EL ERP", () => {
  // Un homónimo de otro rubro no puede ganarle al producto que efectivamente se
  // le compra a este proveedor.
  const r = buscarCandidatos({
    linea: { descripcion: "COCINERO ACEITE GIRASOL 900MLX15" },
    vinculos: [],
    universoProveedor: [{ productoBaseId: 5, nombre: "COCINERO ACEITE GIRASOL 900ML" }],
    catalogo: [{ productoBaseId: 99, nombre: "COCINERO ACEITE GIRASOL 900ML" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);
  assert.equal(r.candidatos[0].productoBaseId, 5);
});

test("si no hay nada en el universo, se busca en todo el ERP y SE AVISA", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "DURACELL PILA ALC AAA x 12 TIRA" },
    vinculos: [],
    universoProveedor: [],
    catalogo: [{ productoBaseId: 77, nombre: "DURACELL PILA ALCALINA AAA" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.ERP_COMPLETO);
  assert.equal(r.vinculoAutomatico, null);
  // El texto tiene que avisar que viene de afuera de lo que se le compra.
  assert.match(TEXTO_ORIGEN[r.origen], /fuera de lo que se le compra/i);
});

test("sin ningún parecido, lo dice y no inventa", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "ALGO QUE NO EXISTE EN NINGUN LADO ZZZ" },
    vinculos: [],
    universoProveedor: [{ productoBaseId: 1, nombre: "Coca Cola 2.25" }],
    catalogo: [{ productoBaseId: 2, nombre: "Pan lactal" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.SIN_CANDIDATOS);
  assert.equal(r.candidatos.length, 0);
  assert.match(TEXTO_ORIGEN[r.origen], /crealo si es nuevo/i);
});

test("las sugerencias están acotadas", () => {
  const muchos = Array.from({ length: 40 }, (_, i) => ({ productoBaseId: i + 1, nombre: `AMARGO OBRERO ${i}` }));
  const r = buscarCandidatos({ linea: LINEAS_DYSSA[0], vinculos: [], universoProveedor: muchos });
  assert.ok(r.candidatos.length <= MAX_SUGERENCIAS, `${r.candidatos.length} sugerencias es una lista, no una sugerencia`);
});

test("SOLO DOS ORÍGENES VINCULAN SOLOS, y la lista es cerrada", () => {
  // Agregar uno tiene que caer acá en rojo y obligar a justificarlo.
  assert.deepEqual([...ORIGENES_AUTOMATICOS].sort(), ["ALIAS_DESCRIPCION", "CODIGO_PROVEEDOR"]);
  assert.equal(esAutomatico(ORIGEN_VINCULO.UNIVERSO_PROVEEDOR), false);
  assert.equal(esAutomatico(ORIGEN_VINCULO.ERP_COMPLETO), false);
  assert.equal(esAutomatico(ORIGEN_VINCULO.SIN_CANDIDATOS), false);
});

test("cada origen tiene su texto, y ninguno muestra el código crudo", () => {
  for (const o of Object.values(ORIGEN_VINCULO)) {
    assert.ok(TEXTO_ORIGEN[o], `falta el texto de ${o}`);
    assert.doesNotMatch(TEXTO_ORIGEN[o], /_/);
  }
});

test("basura no rompe nada", () => {
  for (const linea of [null, undefined, {}, { descripcion: "" }]) {
    const r = buscarCandidatos({ linea, vinculos: [], universoProveedor: [], catalogo: [] });
    assert.equal(r.origen, ORIGEN_VINCULO.SIN_CANDIDATOS, JSON.stringify(linea));
    assert.equal(r.vinculoAutomatico, null);
  }
  assert.equal(buscarCandidatos().origen, ORIGEN_VINCULO.SIN_CANDIDATOS);
});

// ── La línea del pedido ────────────────────────────────────────────────────

test("la línea del pedido se encuentra por producto, sin adivinar", () => {
  const detalles = [{ id: 1, productoBaseId: 10 }, { id: 2, productoBaseId: 20 }];
  assert.equal(lineaDelPedido({ productoBaseId: 20, detalles }).detalle.id, 2);
});

test("QUE NO ESTUVIERA PEDIDO NO ES UN ERROR: es información", () => {
  // El proveedor mandó algo de más. La pantalla tiene que mostrarlo, no
  // esconderlo ni tratarlo como falla.
  const r = lineaDelPedido({ productoBaseId: 99, detalles: [{ id: 1, productoBaseId: 10 }] });
  assert.equal(r.detalle, null);
  assert.equal(r.motivo, "NO_ESTABA_PEDIDO");
});

test("varias líneas del mismo producto piden que alguien elija", () => {
  const detalles = [{ id: 1, productoBaseId: 10 }, { id: 2, productoBaseId: 10 }];
  const r = lineaDelPedido({ productoBaseId: 10, detalles });
  assert.equal(r.detalle, null);
  assert.equal(r.motivo, "VARIAS_LINEAS");
  assert.equal(r.cuantas, 2);
});

// ── El alias que se escribe ────────────────────────────────────────────────

test("AL VINCULAR A MANO SE GUARDA EL ALIAS, con el código del proveedor", () => {
  // Es lo único que hace que el trabajo manual de hoy ahorre trabajo mañana.
  const a = aliasAEscribir({ linea: LINEAS_DYSSA[0], productoBaseId: 42, grupoId: 1, proveedorId: 17 });
  assert.equal(a.codigoInterno, "010027");
  assert.equal(a.descripcionProveedor, "AMARGO OBRERO 19 950MLX12");
  assert.equal(a.productoBaseId, 42);
  assert.equal(a.origenAlta, "VINCULACION_MANUAL");
  assert.equal(a.activo, true);
});

test("SIN CÓDIGO IGUAL SE GUARDA, usando el texto", () => {
  // Sin fila no hay alias, y sin alias la próxima factura vuelve a preguntar lo
  // mismo. Que el proveedor no numere sus artículos no puede costarnos eso.
  const a = aliasAEscribir({
    linea: { descripcion: "AMARGO OBRERO 19 950MLX12" },
    productoBaseId: 42, grupoId: 1, proveedorId: 17,
  });
  assert.ok(a.codigoInterno.startsWith("TXT:"));
  assert.equal(a.descripcionProveedor, "AMARGO OBRERO 19 950MLX12");
});

test("sin nada con qué reconocerlo, no se escribe un alias vacío", () => {
  assert.equal(aliasAEscribir({ linea: {}, productoBaseId: 42, grupoId: 1, proveedorId: 17 }), null);
  assert.equal(aliasAEscribir({ linea: LINEAS_DYSSA[0], grupoId: 1, proveedorId: 17 }), null);
  assert.equal(aliasAEscribir({}), null);
});

test("EL ALIAS ESCRITO HACE QUE LA SEGUNDA FACTURA SALGA SOLA", () => {
  // El ciclo completo, que es el punto de toda la tanda: se vincula a mano una
  // vez, se guarda el alias, y la próxima línea igual ya no pregunta.
  const linea = { descripcion: "PREFERIDO PAN RALLADO 500GR+50GRX20" }; // sin código
  const primera = buscarCandidatos({ linea, vinculos: [], universoProveedor: [] });
  assert.equal(primera.requiereDecision, true, "la primera vez tiene que preguntar");

  const alias = aliasAEscribir({ linea, productoBaseId: 55, grupoId: 1, proveedorId: 17 });
  const segunda = buscarCandidatos({ linea, vinculos: [{ ...alias, id: 1 }] });
  assert.equal(segunda.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
  assert.equal(segunda.vinculoAutomatico.productoBaseId, 55);
  assert.equal(segunda.requiereDecision, false, "la segunda ya no");
});
