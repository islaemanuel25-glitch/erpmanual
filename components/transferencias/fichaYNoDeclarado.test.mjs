// LO QUE LA PANTALLA PROPONE, Y LO QUE DEJÓ DE PREGUNTAR.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/fichaYNoDeclarado.test.mjs
//
// Dos correcciones distintas sobre la misma idea: **la presentación ya está
// decidida, la pantalla no tiene que volver a deducirla ni a preguntarla.**
//
//   · LA FICHA proponía la cantidad FÍSICA persistida debajo de un rótulo que
//     habla de cajones. Con un envío de 6 CAJÓN x8 el campo arrancaba en 48, así
//     que el caso feliz —llegó todo, un toque a "Marcar revisado"— guardaba 48
//     cajones: 384 unidades.
//
//   · PRODUCTO NO DECLARADO le pedía al operador que tradujera el producto al
//     enum técnico UNIDAD / BULTO, algo que el catálogo del origen ya contesta.
//
// Acá se RENDERIZA de verdad con `react-dom/server` donde se puede. Un candado
// de texto sobre el JSX no ve un componente que explota al montarse.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FichaProductoRecepcion, { ROTULO_SUELTAS } from "./FichaProductoRecepcion.jsx";
import {
  presentacionDeProductoNuevo,
  unidadDeProductoNuevo,
  previsualizarIngresoFisico,
  validarLineaNueva,
} from "@/lib/transferencias/recepcionUI";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const AGREGAR = "components/transferencias/AgregarProductoRecibido.jsx";

/**
 * Una línea tal como la manda `/api/transferencias/detalle`.
 *
 * Los números son los del caso: la venta interna persistió la cantidad FÍSICA
 * consolidada —48— y el snapshot dice que salieron 6 cajones de 8.
 */
const lineaCajon = (extra = {}) => ({
  id: 1,
  nombre: "Coca-Cola 2,25 L",
  codigoBarra: "7790895000997",
  cantidadEnviada: 48,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  precioCosto: 1000,
  subtotal: 48000,
  ajusteOrigen: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  unidadEnviada: "UNIDAD",
  factorPack: 8,
  unidadMedida: "cajon",
  esFiambreFijo: false,
  pesoReferenciaKg: null,
  presentacionEnvio: "CAJON",
  cantidadPresentada: 6,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  ...extra,
});

const pintarFicha = (producto, props = {}) =>
  renderToStaticMarkup(
    React.createElement(FichaProductoRecepcion, {
      producto,
      puedeRecibir: true,
      onRevisar: () => {},
      ...props,
    })
  );

/** El `value` del input cuyo aria-label coincide. */
function valorDelCampo(html, etiqueta) {
  const campos = html.match(/<input[^>]*>/g) || [];
  const buscado = campos.find((c) => c.includes(`aria-label="${etiqueta}"`));
  if (!buscado) return null;
  const m = buscado.match(/value="([^"]*)"/);
  return m ? m[1] : "";
}

// ═══════════════════════════════════════════════════════════════════════════
// LA FICHA PROPONE 6, NO 48
// ═══════════════════════════════════════════════════════════════════════════

test("1. sin recepción cargada, la ficha propone la cantidad EN LA PRESENTACIÓN", () => {
  const html = pintarFicha(lineaCajon());

  // El rótulo dice cajones…
  assert.ok(html.includes("6 CAJÓN x8"), "el envío no se rotuló en su presentación");
  // …y el campo arranca en 6, en la misma escala.
  assert.equal(
    valorDelCampo(html, "Cantidad recibida en CAJÓN x8"),
    "6",
    "el input propuso la cantidad física en vez de la presentada"
  );
  assert.ok(
    valorDelCampo(html, "Cantidad recibida en CAJÓN x8") !== "48",
    "el input volvió a proponer 48"
  );

  // Y las 48 siguen visibles como información secundaria, que es su lugar.
  assert.ok(html.includes("48 unidades físicas"), "se perdió la línea de unidades físicas");
});

test("2. con recepción cargada gana lo persistido, no lo propuesto", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5, recibidoUnidadesSueltas: 7 }));
  assert.equal(valorDelCampo(html, "Cantidad recibida en CAJÓN x8"), "5");
  assert.equal(valorDelCampo(html, "Unidades sueltas"), "7");
});

test("3. un 0 guardado NO se re-propone como el total enviado", () => {
  // `0` es un dato —no llegó nada— y `null` es "nadie contó". Colapsarlos ya
  // costó una corrección en esta misma pantalla.
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 0 }));
  assert.equal(valorDelCampo(html, "Cantidad recibida en CAJÓN x8"), "0");
});

test("4. en una línea SIN snapshot la propuesta sigue siendo la de siempre", () => {
  // Un histórico en unidades: propone 48 porque el envío ES de 48 unidades. La
  // corrección no puede reinterpretar lo que no se registró.
  const html = pintarFicha(
    lineaCajon({
      presentacionEnvio: null, cantidadPresentada: null, sueltasEnviadas: null,
      factorPresentacion: null, unidadMedida: "unidad", factorPack: 1,
    })
  );
  assert.equal(valorDelCampo(html, "Cantidad recibida en UNIDAD"), "48");
});

test("5. la ficha no vuelve a leer `cantidadEnviada` para proponer", () => {
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.match(src, /descriptorDeEnvio\(d \|\| \{\}\)\.cantidad/);
  assert.ok(
    !/cantidadRecibida == null \? d\?\.cantidadEnviada/.test(src),
    "volvió el valor propuesto en escala física"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTO NO DECLARADO: LA PRESENTACIÓN SALE DEL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

/** Un resultado del buscador del origen, tal como lo proyecta la ruta. */
const delCatalogo = (extra = {}) => ({
  productoLocalId: 55,
  baseId: 10,
  nombre: "Coca-Cola 2,25 L",
  codigoBarra: "779",
  unidadMedida: "unidad",
  factorPack: 1,
  modoVentaDeposito: null,
  pesoReferenciaKg: null,
  modoCompraProveedor: null,
  ...extra,
});

const CINCO = [
  {
    caso: "UNIDAD",
    producto: delCatalogo(),
    presentacion: "UNIDAD",
    unidad: "UNIDAD",
  },
  {
    caso: "PACK con sueltas",
    producto: delCatalogo({ unidadMedida: "pack", factorPack: 6 }),
    presentacion: "PACK",
    unidad: "BULTO",
  },
  {
    caso: "CAJÓN con sueltas",
    producto: delCatalogo({ unidadMedida: "cajon", factorPack: 8 }),
    presentacion: "CAJON",
    unidad: "BULTO",
  },
  {
    caso: "KG",
    producto: delCatalogo({ unidadMedida: "kg" }),
    presentacion: "KG",
    unidad: "UNIDAD",
  },
  {
    caso: "PIEZA",
    producto: delCatalogo({
      unidadMedida: "kg", modoCompraProveedor: "UNIDAD",
      modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5,
    }),
    presentacion: "PIEZA",
    unidad: "UNIDAD",
  },
];

test("6. las CINCO presentaciones salen del catálogo, sin preguntar nada", () => {
  for (const c of CINCO) {
    assert.equal(
      presentacionDeProductoNuevo(c.producto).presentacion,
      c.presentacion,
      `${c.caso}: el catálogo no resolvió la presentación`
    );
    assert.equal(
      unidadDeProductoNuevo(c.producto),
      c.unidad,
      `${c.caso}: la traducción al enum técnico salió mal`
    );
  }
});

test("7. NO DECLARADO en UNIDAD manda un solo número", () => {
  const r = validarLineaNueva({
    transferenciaId: 9,
    producto: delCatalogo(),
    unidadEnviada: unidadDeProductoNuevo(delCatalogo()),
    recibido: 3,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.deepEqual(r.cuerpo, {
    transferenciaId: 9, productoLocalId: 55, unidadEnviada: "UNIDAD", recibido: 3,
  });
  // Sin campo de sueltas: en UNIDAD no hay bulto que completar.
  assert.ok(!("recibidoUnidadesSueltas" in r.cuerpo));
});

test("8. NO DECLARADO en KG manda kilos, en un solo campo", () => {
  const p = delCatalogo({ unidadMedida: "kg" });
  const r = validarLineaNueva({
    transferenciaId: 9, producto: p, unidadEnviada: unidadDeProductoNuevo(p), recibido: 3.25,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.cuerpo.unidadEnviada, "UNIDAD", "un kilo no se recibe en BULTO");
  assert.equal(r.cuerpo.recibido, 3.25);
  assert.ok(!("recibidoUnidadesSueltas" in r.cuerpo));
});

test("9. NO DECLARADO en PIEZA manda piezas, en un solo campo", () => {
  const p = CINCO.find((c) => c.caso === "PIEZA").producto;
  const r = validarLineaNueva({
    transferenciaId: 9, producto: p, unidadEnviada: unidadDeProductoNuevo(p), recibido: 2,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.cuerpo.unidadEnviada, "UNIDAD");
  assert.equal(r.cuerpo.recibido, 2);
  assert.ok(!("recibidoUnidadesSueltas" in r.cuerpo));
});

test("10. NO DECLARADO PACK x6: 2 completos + 1 suelta llegan como BULTO 2 y 1", () => {
  // El caso obligatorio, tal cual.
  const p = delCatalogo({ unidadMedida: "pack", factorPack: 6 });
  const r = validarLineaNueva({
    transferenciaId: 9,
    producto: p,
    unidadEnviada: unidadDeProductoNuevo(p),
    recibido: 2,
    recibidoUnidadesSueltas: 1,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.deepEqual(r.cuerpo, {
    transferenciaId: 9,
    productoLocalId: 55,
    unidadEnviada: "BULTO",
    recibido: 2,
    recibidoUnidadesSueltas: 1,
  });
  // Y NO se manda ya convertido: el servidor multiplica una sola vez.
  assert.notEqual(r.cuerpo.recibido, 13);
  assert.equal(previsualizarIngresoFisico({ cantidad: 2, sueltas: 1, unidad: "BULTO", factorPack: 6 }), 13);
});

test("11. NO DECLARADO CAJÓN x8: 5 completos + 7 sueltas llegan como BULTO 5 y 7", () => {
  const p = delCatalogo({ unidadMedida: "cajon", factorPack: 8 });
  const r = validarLineaNueva({
    transferenciaId: 9,
    producto: p,
    unidadEnviada: unidadDeProductoNuevo(p),
    recibido: 5,
    recibidoUnidadesSueltas: 7,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.cuerpo.unidadEnviada, "BULTO");
  assert.equal(r.cuerpo.recibido, 5);
  assert.equal(r.cuerpo.recibidoUnidadesSueltas, 7);
  assert.equal(previsualizarIngresoFisico({ cantidad: 5, sueltas: 7, unidad: "BULTO", factorPack: 8 }), 47);
});

test("12. un desglose sobre una presentación que NO agrupa se rechaza", () => {
  // Misma regla que el servidor aplica con SUELTAS_SIN_BULTO. Con la unidad
  // derivada del catálogo esto no puede llegar desde la pantalla, pero el
  // candado se queda: es la puerta que impide mandar un dato sobre una escala
  // que no existe.
  const p = delCatalogo({ unidadMedida: "kg" });
  const r = validarLineaNueva({
    transferenciaId: 9, producto: p, unidadEnviada: unidadDeProductoNuevo(p),
    recibido: 3, recibidoUnidadesSueltas: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "UNIDADES_SUELTAS_SIN_BULTO");
});

test("13. llegó un bulto abierto y ninguno entero: sigue siendo una línea válida", () => {
  const p = delCatalogo({ unidadMedida: "pack", factorPack: 6 });
  const r = validarLineaNueva({
    transferenciaId: 9, producto: p, unidadEnviada: unidadDeProductoNuevo(p),
    recibido: "", recibidoUnidadesSueltas: 4,
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.cuerpo.recibido, 0);
  assert.equal(r.cuerpo.recibidoUnidadesSueltas, 4);
});

test("14. una línea que no informa nada se sigue rechazando", () => {
  const p = delCatalogo({ unidadMedida: "pack", factorPack: 6 });
  for (const args of [
    { recibido: "", recibidoUnidadesSueltas: "" },
    { recibido: 0, recibidoUnidadesSueltas: 0 },
    { recibido: -2 },
  ]) {
    const r = validarLineaNueva({
      transferenciaId: 9, producto: p, unidadEnviada: unidadDeProductoNuevo(p), ...args,
    });
    assert.equal(r.ok, false, `se aceptó una línea vacía: ${JSON.stringify(args)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Y EL SELECTOR UNIDAD / BULTO NO ESTÁ MÁS EN ESTA PANTALLA
// ═══════════════════════════════════════════════════════════════════════════

test("15. la pantalla de no declarado ya no pregunta UNIDAD ni BULTO", () => {
  const src = codigoDe(AGREGAR);

  assert.ok(
    !/SunmiSelectorUnidad/.test(src),
    "volvió el selector del enum técnico a la pantalla de producto no declarado"
  );
  assert.ok(!/opcionesDeUnidad/.test(src), "volvió la lista de opciones de unidad");
  assert.ok(!/setUnidad\(/.test(src), "la unidad volvió a ser algo que se toca");
  assert.ok(
    !/¿Cómo lo contaste\?/.test(src),
    "volvió la pregunta que el catálogo ya contesta"
  );

  // La unidad se DERIVA, y la presentación se muestra.
  assert.match(src, /unidadDeProductoNuevo\(producto\)/);
  assert.match(src, /nombreDePresentacion\(presentacionDelCatalogo\)/);
  assert.match(src, /unidadEnviada: unidad/);
});

test("16. y dibuja los dos campos SOLO cuando la presentación agrupa", () => {
  const src = codigoDe(AGREGAR);
  // Completos y sueltas, detrás de la condición.
  assert.match(src, /const esAgrupada = unidad === "BULTO"/);
  assert.match(src, /\{esAgrupada && \(/);
  assert.match(src, /\{ROTULO_SUELTAS\}/);
  assert.match(src, /\? ROTULO_COMPLETOS/);
  // Y el desglose viaja solo en ese caso.
  assert.match(src, /recibidoUnidadesSueltas: esAgrupada \? sueltas : undefined/);
});

test("17. el catálogo del origen manda: la elección ya no puede pisarlo", () => {
  const src = codigoDe(AGREGAR);
  assert.ok(
    !/contadoEn: unidad/.test(src),
    "la presentación volvió a depender de lo que el operador eligió"
  );
});

// ── LOS DOS CAMPOS DEL DESGLOSE, Y DÓNDE ─────────────────────────────────
//
// En el teléfono el panel es el ÚNICO lugar donde se carga la cantidad: el V21
// sacó el contador de la tarjeta. Esconder la mitad del desglose detrás de un
// botón es pedirle al que tiene la mercadería en la mano que adivine que hay un
// segundo campo. Se vio recibiendo la #191.
//
// En escritorio la pantalla es ancha y el botón deja el formulario corto, así
// que ahí no cambia. El eje es `enHoja`, que ya existía y es presentación.

test("EN HOJA · los dos campos están SIEMPRE, sin botón de por medio", () => {
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(
    valorDelCampo(html, "Unidades sueltas") !== null,
    "en el teléfono el campo de sueltas no está visible de entrada"
  );
  assert.ok(
    !html.includes(ROTULO_SUELTAS),
    "quedó el botón «Hay unidades sueltas» en el camino del teléfono"
  );
  // Y el de la cantidad sigue estando: son DOS, no uno.
  assert.ok(
    valorDelCampo(html, "Cantidad recibida en CAJÓN x8") !== null,
    "se perdió el campo de la cantidad"
  );
});

test("EN ESCRITORIO · el botón sigue ahí y el segundo campo empieza oculto", () => {
  // Esto es lo que hace que la huella de 1366 no se mueva por esta tanda.
  const html = pintarFicha(lineaCajon());
  assert.ok(html.includes(ROTULO_SUELTAS), "desapareció el botón de escritorio");
  assert.equal(
    valorDelCampo(html, "Unidades sueltas"),
    null,
    "en escritorio el campo de sueltas dejó de estar detrás del botón"
  );
});

test("EN HOJA · lo que se escribe en sueltas CUENTA, no queda de adorno", () => {
  // El defecto silencioso sería mostrar el campo y seguir mandando 0 porque la
  // cuenta mira `conSueltas`, que en el teléfono nadie toca. Se afirma sobre el
  // fuente porque un render a string no dispara el guardado.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.ok(
    !/agrupaEsta && conSueltas \? sueltas/.test(src),
    "la cuenta volvió a mirar `conSueltas` en vez de `usaSueltas`"
  );
  assert.equal(
    (src.match(/agrupaEsta && usaSueltas \? sueltas/g) || []).length,
    2,
    "las dos cuentas —la del ingreso físico y la del guardado— tienen que mirar lo mismo"
  );
});
