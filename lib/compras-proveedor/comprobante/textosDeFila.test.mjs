// LA FILA DICE EL ESTADO UNA SOLA VEZ, Y NO MUESTRA VALORES VACÍOS.
//
// Emanuel abrió la lista con sus datos y la misma fila decía tres cosas sobre lo
// mismo, dos opuestas: "Pedido —", "Sin línea del pedido: vinculala primero" y
// "Está en el pedido". La tercera era la peor: describe DE DÓNDE salió el
// candidato, no cómo está la línea, pero puesta arriba se leía como el estado.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  formaDeLaFila,
  textoDelProducto,
  ladosDeLaFila,
  PIDE,
  estadoDeLaFila,
  origenDelCandidato,
  numerosDeLaFila,
  ESTADO_FILA,
} from "@/lib/compras-proveedor/comprobante/textosDeFila";

// LOS TEXTOS REALES DEL PAPEL DE MAURO. El caso que esta columna tiene que
// resolver es de esa factura, así que se mide con ella y no con textos armados.
const require = createRequire(import.meta.url);
const REAL = require("./datosReales.mauro.json");

// ── EL ESTADO: UNA PALABRA, UN SOLO LUGAR ──────────────────────────────────

test("vinculada a mano, vinculada sola y sin vincular son los tres estados", () => {
  assert.equal(estadoDeLaFila({ productoLocalId: 5 }).codigo, ESTADO_FILA.VINCULADO);
  assert.equal(estadoDeLaFila({ vinculadaSola: true }).codigo, ESTADO_FILA.VINCULADO_SOLO);
  assert.equal(estadoDeLaFila({}).codigo, ESTADO_FILA.SIN_VINCULAR);
});

test("EL VÍNCULO HECHO GANA sobre lo que haya sugerido la búsqueda", () => {
  const e = estadoDeLaFila({ productoLocalId: 5, vinculadaSola: true, origen: "LINEA_DEL_PEDIDO" });
  assert.equal(e.codigo, ESTADO_FILA.VINCULADO);
});

test("que la búsqueda no encuentre nada NO es un estado distinto", () => {
  // Sigue sin vincular. "No se encontró ninguno" es un resultado de la búsqueda
  // y se cuenta al lado del candidato, no arriba como si fuera el estado.
  const e = estadoDeLaFila({ origen: "SIN_CANDIDATOS" });
  assert.equal(e.codigo, ESTADO_FILA.SIN_VINCULAR);
  assert.equal(e.palabra, "Sin vincular");
});

test("EL ESTADO NUNCA DICE «está en el pedido»", () => {
  // Esa frase habla del origen del candidato. Si volviera a aparecer como
  // estado, vuelve la contradicción que este módulo vino a sacar.
  for (const f of [{}, { productoLocalId: 5 }, { vinculadaSola: true }, { origen: "LINEA_DEL_PEDIDO" }]) {
    assert.doesNotMatch(estadoDeLaFila(f).palabra, /pedido/i, JSON.stringify(f));
  }
});

// ── EL ORIGEN: PEGADO AL CANDIDATO ─────────────────────────────────────────

test("cada origen se dice en criollo, y el del catálogo avisa", () => {
  assert.match(origenDelCandidato("LINEA_DEL_PEDIDO").texto, /de tu pedido/);
  assert.match(origenDelCandidato("UNIVERSO_PROVEEDOR").texto, /le comprás a este proveedor/);
  const cat = origenDelCandidato("ERP_COMPLETO");
  assert.match(cat.texto, /catálogo/);
  assert.equal(cat.tono, "sunmi-text-warning", "el del catálogo es el único que avisa");
});

test("un origen desconocido no inventa una frase", () => {
  assert.equal(origenDelCandidato("ALGO_NUEVO"), null);
  assert.equal(origenDelCandidato(undefined), null);
});

// ── QUÉ PIDE CADA FILA, Y CUÁL ARRANCA ABIERTA ─────────────────────────────

test("TODAS ARRANCAN CERRADAS: la forma ya no decide apertura", () => {
  // La decidía, y con ninguna línea vinculada abría las 21: todas piden algo.
  // Volvía el scroll infinito que la tabla vino a sacar. Ahora lo que dice
  // cuáles piden algo es la columna de decisión, sin abrir nada.
  for (const f of [{}, { productoLocalId: 5 }, { productoLocalId: 5, unidad: { requiereDecision: true } }]) {
    assert.equal("abierta" in formaDeLaFila(f), false, JSON.stringify(f));
  }
});

test("SIN PRODUCTO, la primera pregunta tapa a las otras dos", () => {
  // Sin producto no hay unidad que deducir ni costo con qué comparar: preguntar
  // las tres a la vez sería pedir que se conteste algo que todavía no existe.
  const f = formaDeLaFila({
    productoLocalId: null,
    unidad: { requiereDecision: true },
    precio: { decision: { ofreceAceptar: true } },
  });
  assert.equal(f.pide, PIDE.PRODUCTO);
});

test("la unidad va ANTES que el precio", () => {
  // El precio que se propone depende de la unidad: preguntarlo al revés sería
  // pedir que se acepte un número que todavía puede cambiar.
  const f = formaDeLaFila({
    productoLocalId: 5,
    unidad: { requiereDecision: true },
    precio: { decision: { ofreceAceptar: true } },
  });
  assert.equal(f.pide, PIDE.UNIDAD);
});

test("un precio que solo se informa NO cuenta como pendiente", () => {
  // Una baja se muestra sin botón: no hay nada que contestar, así que la fila no
  // pide nada y la columna de decisión tiene que decir "Listo".
  const f = { productoLocalId: 5, precio: { decision: { accion: "SOLO_INFORMAR", ofreceAceptar: false } } };
  assert.equal(formaDeLaFila(f).pide, null);
});

test("la que pide algo dice POR QUÉ, en criollo", () => {
  for (const f of [{}, { productoLocalId: 5, unidad: { requiereDecision: true } }]) {
    assert.ok(formaDeLaFila(f).porque.length > 15, JSON.stringify(f));
  }
  assert.equal(formaDeLaFila({ productoLocalId: 5 }).porque, null, "la resuelta no explica nada");
});

// ── LOS NÚMEROS: NI UN GUION SUELTO ────────────────────────────────────────

test("SIN LÍNEA DEL PEDIDO NO SE ARMA EL PEDAZO «Pedido»", () => {
  // Antes mostraba "Pedido —" y eso se leía como una afirmación sobre el pedido.
  const n = numerosDeLaFila({ cantidad: 40, costoFactura: 3360, subtotal: 134400 });
  assert.deepEqual(n.partes.map((p) => p.clave), ["factura", "subtotal"]);
  assert.ok(!n.partes.some((p) => /—/.test(p.valor)), "ningún guion suelto");
});

test("cada pedazo lleva su etiqueta PEGADA al valor", () => {
  // La fila de encabezados aparte se separaba de los valores en 360 y dejaba
  // números sin nombre.
  const n = numerosDeLaFila({ cantidadPedida: 10, costoCatalogo: 100, cantidad: 6, costoFactura: 102, subtotal: 612 });
  assert.deepEqual(
    n.partes.map((p) => `${p.etiqueta} ${p.valor}`),
    ["Pedido 10 × $100.00", "Factura 6 × $102.00", "Subtotal $612.00"]
  );
});

test("con media información se arma lo que hay, no un hueco", () => {
  const n = numerosDeLaFila({ cantidadPedida: 10, cantidad: 6 });
  assert.deepEqual(n.partes.map((p) => `${p.etiqueta} ${p.valor}`), ["Pedido 10", "Factura 6"]);
});

test("AUSENTE NO ES CERO — quinta vez en este módulo", () => {
  // `Number(null)` es 0 y `isFinite(0)` es verdadero, así que una fila sin línea
  // del pedido armaba "Pedido 0 × $0.00": un dato inventado, y justo en las
  // filas cuyo problema era afirmar cosas del pedido que no existen. Se vio en
  // la captura con las 21 líneas reales, no leyendo el código.
  const n = numerosDeLaFila({ cantidadPedida: null, costoCatalogo: null, cantidad: 40, costoFactura: null });
  assert.deepEqual(n.partes.map((p) => p.clave), ["factura"], "sin pedido no hay pedazo de pedido");
  assert.equal(n.partes[0].valor, "40", "y el costo ausente no se inventa en $0.00");
});

test("un CERO de verdad sí se muestra: es un dato", () => {
  // La contracara. Una línea facturada en cero es información, no ausencia.
  const n = numerosDeLaFila({ cantidad: 0, costoFactura: 0 });
  assert.equal(n.partes[0].valor, "0 × $0.00");
});

test("los importes llevan el signo de peso", () => {
  const n = numerosDeLaFila({ cantidad: 2, costoFactura: 1500 });
  assert.match(n.partes[0].valor, /\$1500\.00/);
});

test("una fila totalmente vacía no arma ningún pedazo", () => {
  assert.deepEqual(numerosDeLaFila({}).partes, []);
  assert.deepEqual(numerosDeLaFila(null).partes, []);
});

// ── LO QUE VINO SIN HABERSE PEDIDO ─────────────────────────────────────────

test("vinculada pero sin línea del pedido: SE DICE que no estaba pedido", () => {
  // Es el proveedor facturando algo que no se encargó. Información real, que
  // antes se perdía entre los guiones.
  const n = numerosDeLaFila({ productoLocalId: 7, pedidoDetalleId: null, cantidad: 3, costoFactura: 50 });
  assert.equal(n.noEstabaEnElPedido, true);
});

test("sin vincular todavía NO se afirma que no estaba pedido", () => {
  // Sin producto no se sabe: puede estar en el pedido y faltar vincularla.
  // Decirlo ahí sería afirmar algo que nadie comprobó.
  const n = numerosDeLaFila({ productoLocalId: null, pedidoDetalleId: null, cantidad: 3 });
  assert.equal(n.noEstabaEnElPedido, false);
});

test("vinculada y con su línea del pedido: no se avisa nada", () => {
  const n = numerosDeLaFila({ productoLocalId: 7, pedidoDetalleId: 2, cantidadPedida: 10, cantidad: 6 });
  assert.equal(n.noEstabaEnElPedido, false);
});

// ── EL NOMBRE NUNCA ES UN ESTADO ───────────────────────────────────────────

test("SIN VINCULAR, arriba va el TEXTO DEL PAPEL — nunca «Sin vincular»", () => {
  // Ponía "Sin vincular" en el lugar del nombre y con la factura de Mauro daban
  // quince filas seguidas idénticas: no se podía distinguir una de otra sin
  // abrirlas. El estado se ve en el tono de la fila; el lugar del nombre nombra.
  const t = textoDelProducto({ textoCrudo: "CHESTERFIELD 20 CONV KS", candidatos: [{ nombre: "Chester 20 convertible" }] });
  assert.equal(t.arriba, "CHESTERFIELD 20 CONV KS");
  assert.notEqual(t.arriba, "Sin vincular");
});

test("LOS CHESTERFIELD DEL PAPEL REAL SE DISTINGUEN ENTRE SÍ, CERRADOS", () => {
  // Es la prueba de que la fila cerrada sirve, y va contra la factura de Mauro
  // —no contra textos inventados— porque el caso es de ese papel: cinco
  // Chesterfield cuyo nombre solo difiere en las últimas letras.
  //
  // Antes esta columna decía "Sin vincular" en los cinco. Después decía el
  // texto del papel pero en un renglón, y el corte caía JUSTO donde difieren:
  // "CHESTERFIELD 20 C…" dos veces. Por eso la identidad puede usar dos
  // renglones, y por eso esto se mide con los textos reales.
  const chester = REAL.lineas.filter((t) => /CHESTER/i.test(t));
  assert.ok(chester.length >= 5, `el papel real trae ${chester.length}`);
  const arriba = chester.map((textoCrudo) => textoDelProducto({ textoCrudo }).arriba);
  assert.equal(new Set(arriba).size, chester.length, arriba.join(" | "));
});

test("NINGUNA de las 21 líneas del papel real queda igual a otra", () => {
  // El caso general del anterior: si dos filas cerradas dicen exactamente lo
  // mismo, revisar la factura obliga a abrirlas todas.
  const arriba = REAL.lineas.map((textoCrudo) => textoDelProducto({ textoCrudo }).arriba);
  assert.equal(new Set(arriba).size, REAL.lineas.length, arriba.join(" | "));
});

test("DOS PRODUCTOS DISTINTOS CON EL MISMO NOMBRE DEL ERP se separan por el papel", () => {
  // Pasa de verdad en esta factura: "CHESTERFIELD 10" y "CHESTERFIELD 10 CONV"
  // están vinculados los dos a "Chester 10". Arriba dicen lo mismo, y lo que
  // los distingue es el texto del papel de abajo — que por eso no se va nunca.
  const a = textoDelProducto({ productoLocalId: 1, producto: "Chester 10", textoCrudo: "CHESTERFIELD 10" });
  const b = textoDelProducto({ productoLocalId: 2, producto: "Chester 10", textoCrudo: "CHESTERFIELD 10 CONV" });
  assert.equal(a.arriba, b.arriba);
  assert.notEqual(a.abajo, b.abajo);
});

test("sin vincular, abajo va el candidato COMO PREGUNTA", () => {
  const t = textoDelProducto({ textoCrudo: "CHESTERFIELD 20 CONV KS", candidatos: [{ nombre: "Chester 20 convertible" }] });
  assert.equal(t.abajo, "\u00bfChester 20 convertible?");
  assert.equal(t.esPregunta, true);
});

test("sin vincular y SIN candidato, abajo no se inventa nada", () => {
  const t = textoDelProducto({ textoCrudo: "ALGO RARO", candidatos: [] });
  assert.equal(t.abajo, null);
  assert.equal(t.esPregunta, false);
});

test("VINCULADA: el nombre del ERP arriba y el del papel abajo, como en listas", () => {
  // Y el del papel no desaparece nunca: es lo único que deja comprobar que el
  // vínculo es correcto sin abrir la fila.
  const t = textoDelProducto({ productoLocalId: 5, producto: "Chester 10", textoCrudo: "CHESTERFIELD 10" });
  assert.equal(t.arriba, "Chester 10");
  assert.equal(t.abajo, "CHESTERFIELD 10");
  assert.equal(t.esPregunta, false);
});

test("vinculada sin nombre guardado: cae al texto del papel, no a un hueco", () => {
  const t = textoDelProducto({ productoLocalId: 5, producto: null, textoCrudo: "CHESTERFIELD 10" });
  assert.equal(t.arriba, "CHESTERFIELD 10");
});

// ── LOS DOS LADOS QUE SE COMPARAN ──────────────────────────────────────────

test("PEDIDO Y FACTURA, cada uno con su cantidad y su precio", () => {
  const l = ladosDeLaFila({ cantidadPedida: 10, costoCatalogo: 3000, cantidad: 10, costoFactura: 3360 });
  assert.deepEqual(l.pedido, { cantidad: "10", precio: "$3000.00" });
  assert.deepEqual(l.factura, { cantidad: "10", precio: "$3360.00" });
});

test("el lado que no existe queda en null, y la columna dibuja el guion", () => {
  // Acá el guion SÍ va: el encabezado dice "Pedido", así que tiene nombre. Lo
  // que no puede pasar es un hueco en blanco, que se lee como dato sin cargar.
  const l = ladosDeLaFila({ cantidad: 20, costoFactura: 3360 });
  assert.deepEqual(l.pedido, { cantidad: null, precio: null });
});

test("EL ÁMBAR SOLO CON LOS DOS NÚMEROS: con uno no se sabe si difiere", () => {
  assert.equal(ladosDeLaFila({ costoCatalogo: 3000, costoFactura: 3360 }).difiere, true);
  assert.equal(ladosDeLaFila({ costoCatalogo: 3360, costoFactura: 3360 }).difiere, false);
  assert.equal(ladosDeLaFila({ costoFactura: 3360 }).difiere, false, "sin catálogo no se afirma");
  assert.equal(ladosDeLaFila({ costoCatalogo: 3000 }).difiere, false, "sin factura tampoco");
});

test("un costo de catálogo en CERO no se toma por ausente", () => {
  // Sexta vez que `Number(null)` es 0 en este módulo. Un cero es un dato: si el
  // catálogo dice 0 y la factura 3360, eso difiere y hay que verlo.
  const l = ladosDeLaFila({ costoCatalogo: 0, costoFactura: 3360 });
  assert.equal(l.pedido.precio, "$0.00");
  assert.equal(l.difiere, true);
});
