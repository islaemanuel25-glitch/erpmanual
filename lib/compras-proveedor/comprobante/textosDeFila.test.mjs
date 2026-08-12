// LA FILA DICE EL ESTADO UNA SOLA VEZ, Y NO MUESTRA VALORES VACÍOS.
//
// Emanuel abrió la lista con sus datos y la misma fila decía tres cosas sobre lo
// mismo, dos opuestas: "Pedido —", "Sin línea del pedido: vinculala primero" y
// "Está en el pedido". La tercera era la peor: describe DE DÓNDE salió el
// candidato, no cómo está la línea, pero puesta arriba se leía como el estado.

import test from "node:test";
import assert from "node:assert/strict";

import {
  formaDeLaFila,
  PIDE,
  estadoDeLaFila,
  origenDelCandidato,
  numerosDeLaFila,
  ESTADO_FILA,
} from "@/lib/compras-proveedor/comprobante/textosDeFila";

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

test("ARRANCA ABIERTA LA QUE PIDE ALGO, cerrada la resuelta", () => {
  // La pantalla muestra sola lo que necesita atención. Con 21 líneas, abrirlas
  // todas es lo mismo que no agrupar nada.
  assert.equal(formaDeLaFila({}).abierta, true, "sin vincular pide producto");
  assert.equal(
    formaDeLaFila({ productoLocalId: 5, unidad: { requiereDecision: true } }).abierta,
    true,
    "unidad sin resolver"
  );
  assert.equal(
    formaDeLaFila({ productoLocalId: 5, precio: { decision: { ofreceAceptar: true } } }).abierta,
    true,
    "precio esperando respuesta"
  );
  assert.equal(formaDeLaFila({ productoLocalId: 5 }).abierta, false, "resuelta");
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

test("un precio que solo se informa NO abre la fila", () => {
  // Una baja se muestra sin botón: no hay nada que contestar, así que no es una
  // fila que pida atención.
  const f = formaDeLaFila({
    productoLocalId: 5,
    precio: { decision: { accion: "SOLO_INFORMAR", ofreceAceptar: false } },
  });
  assert.equal(f.pide, null);
  assert.equal(f.abierta, false);
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
