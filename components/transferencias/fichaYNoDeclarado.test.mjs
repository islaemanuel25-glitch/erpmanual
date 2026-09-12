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

import FichaProductoRecepcion, {
  ROTULO_SUELTAS,
  ROTULO_SUELTAS_CAMPO,
} from "./FichaProductoRecepcion.jsx";
import {
  motivosParaDiferencia,
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

// ── V22 · EL PANEL DE CORRECCIÓN EN EL TELÉFONO ──────────────────────────
//
// Cinco cambios, todos detrás de `enHoja`. Cada uno tiene su candado Y su par
// de escritorio: lo que hace que esto sea seguro no es que el teléfono quede
// bien, es que escritorio no se mueva, y eso hay que afirmarlo por separado —la
// huella de 1366 se exige en cero—.

test("V22-1 · los dos campos van LADO A LADO, con la presentación en el rótulo", () => {
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(html.includes("CAJÓN x8 completos"), "el rótulo no dice la presentación");
  assert.ok(html.includes(ROTULO_SUELTAS_CAMPO), "no está el rótulo del campo de sueltas");
  // Los dos campos existen de entrada, sin tocar nada.
  assert.ok(valorDelCampo(html, "Cantidad recibida en CAJÓN x8") !== null);
  assert.ok(valorDelCampo(html, "Unidades sueltas") !== null);
});

test("V22-1b · y NO se dibuja dos veces el campo de sueltas", () => {
  // El defecto que esto ataja es mudo y caro: dos inputs escribiendo la misma
  // variable. El segundo tapa al primero y lo que se ve escrito no es lo que se
  // guarda. Pasa si el bloque viejo del pack incompleto sigue montándose.
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  const campos = (html.match(/aria-label="Unidades sueltas"/g) || []).length;
  assert.equal(campos, 1, `hay ${campos} campos de sueltas; tiene que haber exactamente uno`);
  assert.ok(!html.includes(ROTULO_SUELTAS), "volvió el botón de escritorio al teléfono");
});

test("V23-1 · los dos campos tienen − y +, y el mínimo es 0", () => {
  // El V22 ponía la unidad adentro de la caja. El V23 le puso a cada campo un −
  // y un + en el mismo marco, y con los dos botones la etiqueta ya no entra: la
  // unidad se mudó al RÓTULO, que es donde no pelea por el espacio. Lo que se
  // afirma es lo mismo —que se sepa en qué escala se escribe cada campo— dicho
  // donde ahora vive.
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(html.includes("CAJÓN x8 completos"), "el rótulo no dice la presentación");
  assert.ok(html.includes(ROTULO_SUELTAS_CAMPO), "el rótulo del campo de sueltas");

  for (const etiqueta of ["Cantidad recibida en CAJÓN x8", "Unidades sueltas"]) {
    assert.ok(
      html.includes(`aria-label="Restar uno a ${etiqueta}"`),
      `falta el − en «${etiqueta}»`
    );
    assert.ok(
      html.includes(`aria-label="Sumar uno a ${etiqueta}"`),
      `falta el + en «${etiqueta}»`
    );
  }

  // El mínimo es 0, y se afirma sobre el fuente porque un render no dispara el
  // clic: una cantidad recibida negativa no existe y dejarla escribir obligaría
  // a validarla después.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.match(src, /Math\.max\(0,/, "el − puede bajar de cero");
});

test("V23-2 · el bloque de plata se recalcula con lo tipeado, y no fabrica un cero", () => {
  // ── EL V26 LE SACÓ LOS RÓTULOS Y EL RENGLÓN DE LA RESTA ────────────────
  //
  // Eran tres renglones rotulados —"Importe del remito", "Importe corregido",
  // "Diferencia"— y ahora son dos números: el del remito TACHADO arriba y el
  // corregido abajo, en 22 px y en danger. Dos cifras, una tachada, ya dicen de
  // cuánto a cuánto sin nombrarlo, y la resta es la resta de las dos.
  //
  // Lo que este candado defiende no cambió: que la plata se RECALCULE con lo que
  // se está tipeando y que no aparezca un cero fabricado. Cambió cómo se lee.

  // Con diferencia: los dos números, y el viejo tachado. 5 cajones de 8 son 40
  // contra 48, y el remito son $48.000 contra $40.000 recibidos.
  const menos = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(menos.includes("line-through"), "el importe del remito no está tachado");
  assert.ok(menos.includes("$48.000,00"), "falta el importe del remito");
  assert.ok(menos.includes("$40.000,00"), "falta el importe corregido");
  assert.ok(menos.includes("sunmi-text-danger"), "el importe corregido no va en danger");
  // Y ninguno de los tres rótulos vuelve: eran el texto que el V26 sacó.
  for (const r of ["Importe del remito", "Importe corregido", "Diferencia"]) {
    assert.ok(!menos.includes(r), `volvió el rótulo «${r}»`);
  }

  // Sin diferencia: UN solo número, sin tachado y sin danger.
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  assert.ok(igual.includes("$48.000,00"), "sin diferencia igual tiene que decir cuánto vale");
  assert.ok(!igual.includes("line-through"), "tachó un importe que nadie corrigió");
});

test("V23-2b · UN NO DECLARADO NO SE VALORIZA EN $0,00 mientras se lo carga", () => {
  // ── EL DEFECTO QUE ESTO ATAJA, VISTO EN UNA CAPTURA ─────────────────────
  //
  // Para una agregada lo enviado es CERO, así que la regla de tres sobre el
  // remito no existe y el bloque caía en `subtotalRecibido` — que hasta que no
  // se guarda sigue siendo el del último guardado, o sea cero para una línea
  // recién agregada. El panel decía "$0,00" mientras alguien escribía 3,25 KG.
  //
  // Es el $0,00 de la #195 otra vez, adentro del panel. El precio sale de
  // `costoUnitarioFisico`, que el endpoint manda y que no depende de la cantidad.
  const html = pintarFicha(
    lineaCajon({
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadPresentada: 0,
      subtotal: 0,
      subtotalRecibido: 0,
      costoUnitarioFisico: 125,
      cantidadRecibida: 3,
    }),
    { enHoja: true }
  );
  // 3 cajones de 8 son 24 físicas × $125 = $3.000.
  assert.ok(html.includes("3.000"), `el no declarado no se valoriza con lo que se está cargando`);
  assert.ok(!/\$\s?0,00/.test(html), "volvió el $0,00 sobre mercadería que sí llegó");
});

// ── V24 · EL PANEL SE ACORTA PARA QUE EL MOTIVO QUEPA ────────────────────

test("V24-1 · «Enviado» va en UNA sola línea, y con PESO", () => {
  // Eran dos renglones y el de arriba no decía nada que el de abajo no dijera.
  // Con el panel más corto, el desplegable de motivo tiene lugar para abrirse
  // hacia abajo — que es el defecto que la tanda V24 vino a cerrar.
  //
  // ── EL V26 LE SACÓ LAS FÍSICAS Y LE SUBIÓ EL PESO ─────────────────────
  //
  // Decía "6 CAJÓN x8 · 48 unidades físicas". Las dos mitades son la misma
  // cantidad, y la segunda en la escala en la que NO se cuenta. Y dejó de ser un
  // subtítulo gris: es la referencia contra la que se cuenta, así que el rótulo
  // va chico y gris y el dato en 15 semibold y en el color de la marca.
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(html.includes("Enviado"), "se perdió el rótulo del enviado");
  assert.ok(html.includes("6 CAJÓN x8"), "se perdió la referencia del remito");
  assert.ok(!html.includes("unidades físicas"), "volvieron las físicas al renglón del enviado");
  assert.ok(html.includes("text-base2"), "el dato del enviado no está en 15 px");
  assert.ok(html.includes("sunmi-text-accent"), "el dato del enviado no está en el color de la marca");
});

test("V24-1b · el teléfono NO dice unidades físicas en NINGUNA presentación", () => {
  // ── DÓNDE VIVE LA REGLA, QUE NO ES ACÁ ────────────────────────────────
  //
  // Este candado nació para que en KG no colgara un "·" sin nada detrás:
  // `rotuloFisicoDeEnvio` devuelve null en KG, PIEZA y UNIDAD porque llamarle
  // "unidades físicas" a 3,250 KG es una mentira.
  //
  // Esa regla NO se aflojó y no depende de esta pantalla: vive en
  // `rotuloFisicoDeEnvio`, con un candado por presentación en
  // `presentacionEnvio.test.mjs` —UNIDAD, PACK, CAJÓN, KG y PIEZA—. Escritorio
  // lo sigue usando y esos candados lo siguen cubriendo.
  //
  // Lo que este afirma ahora es lo NUEVO, y es más fuerte que lo anterior: en el
  // teléfono las físicas no aparecen en ninguna presentación, ni siquiera donde
  // decirlas sería cierto.
  for (const [caso, extra] of [
    ["CAJÓN", {}],
    ["KG", {
      presentacionEnvio: "KG",
      factorPresentacion: null,
      factorPack: 1,
      unidadMedida: "kg",
      cantidadEnviada: 3.25,
      cantidadPresentada: 3.25,
    }],
  ]) {
    const html = pintarFicha(lineaCajon(extra), { enHoja: true });
    assert.ok(!html.includes("unidades físicas"), `en ${caso} el teléfono dijo unidades físicas`);
    assert.ok(!/·\s*<\/span>/.test(html), `en ${caso} quedó un separador sin nada detrás`);
  }
});

test("V24-2 · los dos campos van al 35 % y NO llenan el ancho", () => {
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  // Dos veces la clase: un campo cada una. El hueco del medio queda vacío.
  assert.equal(
    (html.match(/w-35p/g) || []).length,
    2,
    "los dos campos tienen que ir al 35 %, ni uno ni tres"
  );
  assert.ok(!html.includes("grid-cols-2 gap-2"), "quedó el grid que llenaba el ancho");

  // Y los rótulos bajan a 10 px, que es `text-xs2` y no un valor escrito a mano.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.ok(!/text-\[10px\]/.test(src), "el rótulo usa una medida mágica en vez del token");
});

test("V24-2b · el botón del stepper NO se achicó: lo que cede es el número", () => {
  // El área tocable es lo único que no se negocia por espacio. El botón se queda
  // con el relleno del kit; lo que se apretó es el marco —sin `gap` ni padding
  // lateral propio—.
  //
  // El marco dejó de ser una cadena fija con el V26: ahora negocia su borde
  // —2 px y danger cuando lo contado difiere—, así que se lo busca por la
  // expresión y no por el literal. Un candado anclado al literal habría quedado
  // rojo sobre un cambio que no toca lo que defiende.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  const marco = src.match(/className=\{`flex items-center rounded-lg \$\{[\s\S]{0,160}?`\}/);
  assert.ok(marco, "no se encontró el marco del campo con pasos");
  assert.ok(!/px-\d/.test(marco[0]), "el marco volvió a tener relleno lateral propio");
  // Y las dos ramas del borde siguen siendo del kit, no colores escritos a mano.
  assert.match(marco[0], /border-2 sunmi-border-danger/, "el borde de la diferencia no es del kit");
  assert.match(marco[0], /border sunmi-divider/, "se perdió el borde normal del campo");
  // Y el botón sigue sin declarar padding: usa el del kit, que da 36 px de alto.
  assert.ok(
    !/aria-label=\{`Restar uno[\s\S]{0,200}px-0|py-0/.test(src),
    "se le sacó el relleno al botón, que es lo que se toca con el pulgar"
  );
});

test("V23-1b · la unidad ya NO va adentro de la caja, y el kit no quedó con un prop muerto", () => {
  // `sufijo` era del V22 y se quedó sin un solo consumidor. Un prop del kit que
  // nadie pasa se lee como capacidad disponible y es la familia del `conImporte`
  // que CLAUDE.md tiene anotado: doce candados montando una prop que ya nadie
  // pasaba. Se saca, no se deja.
  const src = codigoDe("components/sunmi/SunmiInput.jsx");
  assert.ok(!/sufijo/.test(src), "quedó el prop `sufijo` en el kit sin nadie que lo pase");
  const ficha = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.ok(!/sufijo=/.test(ficha), "la ficha sigue pasando un prop que el kit ya no tiene");
});

// ── LOS CINCO CANDADOS DEL RENGLÓN TEÑIDO Y DE LA EXPLICACIÓN: DE BAJA ───
//
// Acá vivían V22-2y3, V22-3b, V25-R, V25-U y V22-4. Los cinco afirmaban TEXTO
// del panel, y el V26 sacó los dos bloques que lo dibujaban:
//
//   · el renglón teñido —"5 CAJÓN x8 de 6 CAJÓN x8 · faltan 8 unidades"—, que
//     decía el enviado que ya está arriba, lo contado que está en el campo, y la
//     resta de los dos;
//   · el párrafo "El envío sigue siendo CAJÓN x8. Las unidades sueltas solo
//     explican un bulto abierto o una rotura", que es una regla del sistema y no
//     un dato de esta línea.
//
// Con ellos se dio de baja `resultadoDeConteo`: quedó sin un solo consumidor,
// que es el patrón del `conImporte`.
//
// ── QUÉ SE MIRÓ ANTES DE BORRARLOS, UNO POR UNO ─────────────────────────
//
// Un candado que solo afirma que un texto está se va con el texto. Uno que
// defiende una regla se reescribe donde la regla vive ahora. De los cinco, solo
// UNO defendía una regla:
//
//   · V25-R, "el resto de un bulto se dice como resto y nunca como fracción".
//     Eso SÍ es una regla —5,958 packs es un número que no existe en el
//     depósito— y su casa no era este renglón: es `conversionParaAdoptar`, con
//     el candado 11d, "media unidad suelta no se puede representar y no se
//     redondea". Sigue verde y sin tocar. Que la PANTALLA la respete se afirma
//     ahora en la tarjeta, en V21-9.
//
//   · Los otros cuatro afirmaban la redacción: el formato corto, el sentido al
//     derecho, el singular, y que una línea en UNIDAD conservara su texto. Sin
//     renglón no hay redacción que defender.
//
// Lo que reemplaza a los cinco es más chico y está repartido: el campo en danger
// —V26-1—, el importe tachado —V23-2— y que ninguna de las cadenas vuelva
// —V26-2—.

// ═══════════════════════════════════════════════════════════════════════════
// V28 · EL PESO CON TRES DECIMALES Y LOS DOS PRECIOS
// ═══════════════════════════════════════════════════════════════════════════

/** La línea por PESO, con snapshot en KG. 3,250 kg a $16.500 el kilo. */
const lineaKg = (extra = {}) =>
  lineaCajon({
    nombre: "Queso cremoso",
    presentacionEnvio: "KG",
    factorPresentacion: null,
    factorPack: 1,
    unidadMedida: "kg",
    cantidadEnviada: 3.25,
    cantidadPresentada: 3.25,
    precioCosto: 16500,
    costoUnitarioFisico: 16500,
    subtotal: 53625,
    ...extra,
  });

test("V28-1 · el peso va con TRES decimales en el rótulo Y en el campo", () => {
  const html = pintarFicha(lineaKg(), { enHoja: true });

  // El rótulo del enviado, con la coma del castellano.
  assert.ok(html.includes("3,250 KG"), "el enviado no muestra los tres decimales");
  assert.ok(!html.includes("3,25 KG"), "quedó el peso con dos decimales");

  // Y el campo, con PUNTO: es un `input type="number"` y ahí "3,250" no es un
  // valor válido. La diferencia de separador ya existía —el campo decía "3.25"—
  // y no la introduce la precisión. Lo que queda igual es cuántos dígitos se ven.
  assert.equal(
    valorDelCampo(html, "Cantidad recibida en KG"),
    "3.250",
    "el campo no arranca con la misma precisión que el rótulo"
  );
});

test("V28-1b · los ceros a la derecha son el caso que se perdía", () => {
  // `4,075` ya salía completo antes del cambio: el máximo era 3. Lo que se comía
  // el formateador eran los CEROS A LA DERECHA, y ahí está la pérdida real —no se
  // podía distinguir "la balanza dijo 730 gramos" de "0,73 redondeado"—.
  const conCeros = pintarFicha(lineaKg({ cantidadEnviada: 0.73, cantidadPresentada: 0.73 }), { enHoja: true });
  assert.ok(conCeros.includes("0,730 KG"), "el cero de la derecha se sigue perdiendo");

  const significativo = pintarFicha(lineaKg({ cantidadEnviada: 4.075, cantidadPresentada: 4.075 }), { enHoja: true });
  assert.ok(significativo.includes("4,075 KG"), "se perdió un decimal que ya funcionaba");
});

test("V28-1c · y NO se desborda: los packs y la PLATA siguen como estaban", () => {
  // Tres decimales son del peso. Si la regla viviera en el formateador genérico,
  // "6 CAJÓN x8" pasaría a "6,000 CAJÓN x8".
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(html.includes("6 CAJÓN x8"), "el cajón perdió su rótulo");
  assert.ok(!html.includes("6,000"), "los tres decimales se desbordaron a los bultos");
  assert.equal(valorDelCampo(html, "Cantidad recibida en CAJÓN x8"), "5", "el campo se rellenó de ceros");

  // La plata, en dos decimales en los dos estados y en las dos líneas.
  for (const [caso, l] of [["cajón", lineaCajon({ cantidadRecibida: 5 })], ["peso", lineaKg()]]) {
    const h = pintarFicha(l, { enHoja: true });
    assert.ok(!/\$[\d.]+,\d{3}/.test(h), `en ${caso} un importe salió con tres decimales`);
    assert.ok(/\$[\d.]+,\d\d/.test(h), `en ${caso} no se encontró ningún importe`);
  }
});

test("V28-2 · el precio de la PRESENTACIÓN va al lado del enviado, con su sufijo", () => {
  // El número que se compara contra el remito del proveedor. Sale de
  // `d.precioCosto`, que en el DTO es `costoPresentacion` y no la columna cruda.
  const cajon = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(cajon.includes("/ cajón"), "el sufijo no nombra la presentación de la línea");

  const kg = pintarFicha(lineaKg(), { enHoja: true });
  assert.ok(kg.includes("/ kg"), "una línea por peso no rotula su precio por kilo");

  const unidad = pintarFicha(
    lineaCajon({ presentacionEnvio: "UNIDAD", factorPresentacion: null, factorPack: 1, unidadMedida: "unidad" }),
    { enHoja: true }
  );
  assert.ok(unidad.includes("/ un"), "una línea en UNIDAD no rotula su precio por unidad");
});

test("V28-3 · el precio POR UNIDAD aparece SOLO al lado del campo de sueltas", () => {
  // Es el pedido textual: fuera de ese campo no aporta y ensucia. Y debajo de
  // "CAJÓN x8" el costo de la unidad suelta sería una afirmación falsa.
  const cajon = pintarFicha(lineaCajon({ costoUnitarioFisico: 125 }), { enHoja: true });
  const posUnidad = cajon.indexOf("/ un");
  const posSueltas = cajon.indexOf(ROTULO_SUELTAS_CAMPO);
  assert.ok(posUnidad > 0, "no está el precio por unidad");
  assert.ok(posSueltas > 0, "no está el campo de sueltas");
  assert.ok(
    posUnidad > posSueltas,
    "el precio por unidad no está pegado al campo de sueltas: aparece antes"
  );

  // Y en una línea SIN sueltas —KG no agrupa— no hay campo, así que el precio por
  // unidad no tiene dónde ir. Lo único que se ve es el del kilo.
  const kg = pintarFicha(lineaKg(), { enHoja: true });
  assert.ok(!kg.includes(ROTULO_SUELTAS_CAMPO), "apareció el campo de sueltas en una línea por peso");
  assert.equal(
    (kg.match(/\/ (un|kg)/g) || []).join(","),
    "/ kg",
    "en KG tiene que haber UN solo sufijo, el del kilo"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// V26 · LO QUE SE FUE, Y LO ÚNICO QUE QUEDÓ PARA DECIR LA DIFERENCIA
// ═══════════════════════════════════════════════════════════════════════════

test("V26-1 · el campo que difiere va en danger, el número Y el borde", () => {
  // Es TODO lo que quedó para decir que hay una diferencia, junto con el importe
  // tachado. Nada de texto explicándola.
  const dif = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(dif.includes("border-2 sunmi-border-danger"), "el borde del campo no va en danger");
  assert.ok(dif.includes("sunmi-text-danger"), "el número del campo no va en danger");

  // Sin diferencia, el campo va normal: si se pintara siempre, el color no
  // distinguiría nada — que es peor que no tenerlo.
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  assert.ok(!igual.includes("border-2 sunmi-border-danger"), "pintó un campo que coincide");
  assert.ok(igual.includes("border sunmi-divider"), "el campo normal perdió su borde");
});

test("V26-1b · un NO DECLARADO no se pinta en danger: no contradice a nadie", () => {
  // Una agregada no tiene remito contra el cual compararse, así que nunca
  // difiere. Pintarla de rojo diría que algo está mal cuando lo único que pasa
  // es que llegó mercadería de más. Es el mismo criterio que el `$0,00` de la
  // #195: no inventar un defecto donde hay un hecho.
  const html = pintarFicha(
    lineaCajon({
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadPresentada: 0,
      subtotal: 0,
      costoUnitarioFisico: 125,
      cantidadRecibida: 3,
    }),
    { enHoja: true }
  );
  assert.ok(!html.includes("border-2 sunmi-border-danger"), "pintó en rojo un no declarado");
});

test("V26-2 · ninguna de las cadenas que el V26 sacó sobrevive en el panel", () => {
  // Por TEXTO y sobre los dos estados. Un rediseño que saca prosa deja fácil una
  // rama olvidada que la sigue dibujando en el caso que nadie miró.
  for (const [caso, linea] of [
    ["coincide", lineaCajon({ cantidadRecibida: 6 })],
    ["difiere", lineaCajon({ cantidadRecibida: 5 })],
  ]) {
    const html = pintarFicha(linea, { enHoja: true });
    for (const t of [
      "sin diferencia",
      "faltan",
      "sobran",
      "Ingreso físico",
      "unidades físicas",
      "El envío sigue siendo",
      "bulto abierto o una rotura",
      "Pendiente de revisar",
      "Sin categoría",
      "Importe del remito",
      "Importe corregido",
      "Diferencia",
      "Marcar",
    ]) {
      assert.ok(!html.includes(t), `en «${caso}» el panel sigue diciendo «${t}»`);
    }
  }
});

test("V26-3 · el panel queda en CINCO elementos, y el código de barras no es uno", () => {
  // El subtítulo llevaba categoría y código de barras. No ayudan a contar, y en
  // el celular empujaban los campos —lo único que hay que tocar— más abajo.
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(!html.includes("7790895000997"), "quedó el código de barras en la hoja");

  // Y lo que SÍ tiene que estar, los cinco: el enviado, los dos campos, el
  // importe, el motivo y el botón.
  assert.ok(html.includes("Enviado"), "falta el enviado");
  assert.ok(html.includes("6 CAJÓN x8"), "falta la referencia del remito");
  assert.equal((html.match(/w-35p/g) || []).length, 2, "faltan los dos campos");
  assert.ok(html.includes("$40.000,00"), "falta el importe");
  assert.ok(html.includes("Motivo de la diferencia"), "falta el motivo");
  assert.ok(html.includes("y seguir"), "falta el botón");
});

// ═══════════════════════════════════════════════════════════════════════════
// V25-3 · EL PANEL NO CRECE CUANDO APARECE EL MOTIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, VISTO EN PRODUCCIÓN: en la hoja, tocar el − o el + hasta que la
// cantidad deja de coincidir hacía APARECER el bloque de motivo, y el panel
// crecía de golpe. El botón de guardar está justo abajo, así que se corría
// mientras el dedo iba hacia él y se terminaba tocando otra cosa.
//
// El hueco se reserva con el bloque REAL en `visibility: hidden`, no con un alto
// en píxeles escrito a mano: así mide exactamente lo que va a ocupar, y lo sigue
// midiendo el día que cambie el tipo de letra.
//
// Este candado mira el MARCADO, que es lo único que se puede afirmar sin
// navegador: `renderToStaticMarkup` no tiene geometría. Que el alto no cambie de
// verdad lo mide el arnés de 390 px, que abre el panel y compara los dos altos.
// Las dos mitades hacen falta y ninguna reemplaza a la otra.

test("V25-3 · en la hoja el bloque de motivo ocupa su lugar aunque la línea coincida", () => {
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });

  // Está en el marcado —ocupa alto— pero invisible y fuera de todo alcance.
  assert.ok(igual.includes('data-motivo-reservado="1"'), "no se reservó el hueco del motivo");
  assert.ok(igual.includes("Motivo de la diferencia"), "el hueco no mide lo que va a medir");
  assert.ok(igual.includes("invisible"), "el hueco reservado se ve");
  assert.ok(igual.includes('aria-hidden="true"'), "un lector de pantalla leería el hueco vacío");
  assert.ok(igual.includes("pointer-events-none"), "el select invisible se puede tocar");
});

test("V25-3b · y con diferencia es el bloque de verdad, sin marca de reserva", () => {
  const dif = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });

  assert.ok(dif.includes("Motivo de la diferencia"), "falta el motivo cuando SÍ hay diferencia");
  assert.ok(!dif.includes("data-motivo-reservado"), "el bloque real quedó marcado como reserva");

  // La apertura del ENVOLTORIO del motivo, y no el HTML entero: la ficha con
  // diferencia trae otros `aria-hidden` legítimos —los iconos decorativos del
  // bloque teñido— y mirar todo el render los tomaría por éste. Es el mismo
  // error de mirar el lugar equivocado que ya se pagó una vez en este módulo.
  const envoltorio = dif.slice(0, dif.indexOf("Motivo de la diferencia")).lastIndexOf("<div");
  const apertura = dif.slice(envoltorio, dif.indexOf("Motivo de la diferencia"));
  assert.ok(!/aria-hidden/.test(apertura), "el motivo obligatorio quedó oculto al lector");
  assert.ok(!/invisible/.test(apertura), "el motivo obligatorio quedó invisible");

  // Las OPCIONES no se pueden mirar acá y conviene saber por qué: `SunmiSelectAdv`
  // dibuja su lista en un portal, solo cuando está abierta, así que en el
  // marcado estático no hay ningún `<option>`. Un candado que buscara "Faltante"
  // en este HTML daría rojo sobre un render correcto. Qué motivos corresponden
  // se afirma donde se decide, que es la función pura.
  assert.deepEqual(
    motivosParaDiferencia({ enviada: 48, recibida: 40 }).map((m) => m.value),
    ["Faltante", "Producto dañado", "Otro"]
  );
});

test("V25-3c · escritorio NO reserva nada: ahí el bloque aparece y desaparece", () => {
  // La ficha de escritorio vive al lado de un listado largo y esos 60 px no
  // mueven ningún botón. Reservar ahí sería un hueco en blanco permanente.
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }));
  assert.ok(!igual.includes("Motivo de la diferencia"), "escritorio empezó a reservar el hueco");
  assert.ok(!igual.includes("data-motivo-reservado"), "escritorio empezó a reservar el hueco");

  const dif = pintarFicha(lineaCajon({ cantidadRecibida: 5 }));
  assert.ok(dif.includes("Motivo de la diferencia"), "escritorio perdió el motivo");
});

// ═══════════════════════════════════════════════════════════════════════════
// V25-4 · EL PIE DE LA HOJA VA ANCLADO
// ═══════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, MEDIDO: a 390×440 —el teléfono con el teclado grande abierto— el
// contenido no entra y el botón de guardar quedaba ABAJO del borde: top 443 en
// un viewport de 440, en los dos estados. No se podía tocar.
//
// Ya pasaba antes del V25, así que no lo causó reservar el alto del motivo y
// reservar más tampoco lo arreglaba. Lo que faltaba era anclar.
//
// Este candado mira el MARCADO. Que el botón quede DENTRO del viewport lo mide
// el arnés de 390 px en las tres alturas, y esa es la mitad que tiene los
// números. Las dos hacen falta.

test("V25-4 · en la hoja el pie es pegajoso y tiene fondo OPACO", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  const pie = html.slice(0, html.indexOf("y seguir")).lastIndexOf("<div");
  const apertura = html.slice(pie, html.indexOf("y seguir"));

  assert.match(apertura, /sticky/, "el pie de la hoja no queda anclado abajo");
  assert.match(apertura, /bottom-0/, "el pie está pegajoso pero no contra el borde de abajo");

  // El fondo NO es decoración: sin él se lee el importe a través de los botones
  // mientras el contenido scrollea por detrás.
  //
  // Y tiene que ser `sunmi-surface` —`--app-bg`— que es el único token opaco en
  // los catorce temas. `--card-bg` es translúcido en `sunmiDark`, que es el del
  // Sunmi: usarlo acá sería el defecto del desplegable de motivo otra vez.
  assert.match(apertura, /sunmi-surface/, "el pie anclado no tiene fondo opaco");
});

test("V25-4b · y escritorio NO lo lleva: ahí taparía la fila siguiente", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 6 }));
  const pie = html.slice(0, html.indexOf("Marcar como revisado")).lastIndexOf("<div");
  const apertura = html.slice(pie, html.indexOf("Marcar como revisado"));

  assert.ok(!/sticky/.test(apertura), "escritorio se llevó el pie pegajoso del teléfono");
  assert.ok(!/sunmi-surface/.test(apertura), "escritorio se llevó el fondo del pie del teléfono");
});

test("V22-5 · el botón cambia de nombre Y de color según haya diferencia", () => {
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  // El V26 les sacó dos palabras: "Marcar" no agrega nada al tilde que ya está
  // adelante, y "diferencia" la dicen el campo en rojo y el importe tachado.
  // Lo que el candado defiende —que el nombre Y el color sigan al hecho— no
  // cambió. El color es lo que más importa acá: nació de que `amber` era un
  // alias de `primary` y el cambio existía en el código y no en la pantalla.
  assert.ok(igual.includes("✓ Revisado y seguir"));
  assert.ok(!igual.includes("Marcar"), "volvió la palabra que el V26 sacó");
  assert.ok(igual.includes("sunmi-btn-primary"), "sin diferencia el botón no es el de acción");

  const dif = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(dif.includes("✓ Guardar y seguir"));
  assert.ok(!dif.includes("Guardar diferencia"), "volvió la palabra que el V26 sacó");
  // `warning` y NO `amber`: `.sunmi-btn-amber` es la misma regla que
  // `.sunmi-btn-primary` —las dos pintan `--pos-accent`—, así que pedir `amber`
  // para distinguirse de `primary` dejaba los dos botones del mismo color en los
  // catorce temas. El cambio de color existía en el código y no en la pantalla.
  assert.ok(dif.includes("sunmi-btn-warning"), "con diferencia el botón no es warning");
  assert.ok(!dif.includes("sunmi-btn-primary"), "quedaron los dos colores a la vez");
});

// ── Y EL OTRO LADO: ESCRITORIO NO SE MUEVE ───────────────────────────────

// ── ESTE CANDADO SE DIO VUELTA CON EL V26, Y ES LA PARTE QUE IMPORTA ─────
//
// Afirmaba por AUSENCIA: que escritorio NO tuviera las cadenas del teléfono
// —"40 de 48 · faltan 8", el bloque teñido, "El envío sigue siendo"—.
//
// El V26 sacó esas tres cadenas del TELÉFONO. O sea que ya no existen en ningún
// lado, y una afirmación de ausencia sobre algo que no existe en ninguna parte
// queda verde para siempre sin defender nada. Es exactamente el patrón del
// `conImporte`: doce candados montando una prop que nadie pasaba.
//
// Así que ahora afirma lo que de verdad importa y lo que de verdad puede
// romperse: que escritorio SIGA teniendo lo suyo. Cada una de estas cosas se la
// puede llevar puesta una tanda del teléfono por descuido, y eso es lo que hay
// que atrapar.
test("V22-E · escritorio conserva TODO lo suyo, tanda tras tanda del teléfono", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5 }));

  // El botón de las sueltas, y el campo detrás de él.
  assert.ok(html.includes(ROTULO_SUELTAS), "desapareció el botón de escritorio");
  assert.equal(valorDelCampo(html, "Unidades sueltas"), null, "el campo dejó de estar oculto");
  // Su rótulo, que no es el de la presentación del teléfono.
  assert.ok(html.includes(">Recibido<"), "escritorio perdió su rótulo «Recibido»");
  // Su texto largo de ingreso físico.
  assert.ok(html.includes("Ingreso físico:"), "escritorio perdió su línea de ingreso físico");
  // Las unidades físicas secundarias, que el V26 sacó SOLO del teléfono. Acá es
  // donde vive el consumidor de `rotuloFisicoDeEnvio` que queda.
  assert.ok(html.includes("48 unidades físicas"), "escritorio perdió las unidades físicas");
  // El subtítulo y el estado, que el V26 sacó SOLO del teléfono.
  assert.ok(html.includes("Sin categoría"), "escritorio perdió el subtítulo");
  assert.ok(html.includes("Pendiente de revisar"), "escritorio perdió el estado");
  // Y el botón sigue en ámbar con su texto de siempre.
  assert.ok(html.includes("sunmi-btn-amber"), "escritorio cambió el color del botón");
  assert.ok(html.includes("Marcar como revisado"), "escritorio perdió su texto de botón");
  assert.ok(!html.includes("y seguir"), "se filtró el texto del teléfono");

  // Y lo del teléfono que NO puede filtrarse hacia acá. Éstas sí siguen siendo
  // afirmaciones de ausencia legítimas, porque las cadenas EXISTEN en el
  // teléfono: si aparecieran acá, escritorio se movió.
  assert.ok(!html.includes("CAJÓN x8 completos"), "se filtró el rótulo del teléfono");
  assert.ok(!html.includes("sticky bottom-0"), "se filtró el pie anclado del teléfono");
  assert.ok(!html.includes("line-through"), "se filtró el importe tachado del teléfono");
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
