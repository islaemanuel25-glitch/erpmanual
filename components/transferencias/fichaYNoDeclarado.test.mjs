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
  // Con diferencia: los tres renglones. 5 cajones de 8 son 40 contra 48.
  const menos = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(menos.includes("Importe del remito"), "faltan los tres renglones de plata");
  assert.ok(menos.includes("Importe corregido"));
  assert.ok(menos.includes("Diferencia"));

  // Sin diferencia: UNO solo. Repetir el mismo número tres veces con tres
  // rótulos sugiere que pasó algo que no pasó.
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  assert.ok(!igual.includes("Importe del remito"), "sin diferencia sobran los renglones");
  assert.ok(igual.includes("Importe"), "sin diferencia igual tiene que decir cuánto vale");
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

test("V24-1 · «Enviado» va en UNA sola línea, con las físicas al lado", () => {
  // Eran dos renglones y el de arriba no decía nada que el de abajo no dijera.
  // Con el panel más corto, el desplegable de motivo tiene lugar para abrirse
  // hacia abajo — que es el defecto que esta tanda vino a cerrar.
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(
    html.includes("6 CAJÓN x8 · 48 unidades físicas"),
    "«Enviado» no quedó en un renglón con sus unidades físicas"
  );
});

test("V24-1b · en KG no cuelga un separador sin nada detrás", () => {
  // `rotuloFisicoDeEnvio` devuelve null en KG, PIEZA y UNIDAD: llamarle
  // "unidades físicas" a 3,250 KG es la mentira que ese helper evita. El
  // renglón tiene que quedar con una sola mitad, no con un "·" colgando.
  const html = pintarFicha(
    lineaCajon({
      presentacionEnvio: "KG",
      factorPresentacion: null,
      factorPack: 1,
      unidadMedida: "kg",
      cantidadEnviada: 3.25,
      cantidadPresentada: 3.25,
    }),
    { enHoja: true }
  );
  assert.ok(!html.includes("unidades físicas"), "llamó «unidades físicas» a kilos");
  assert.ok(!/·\s*<\/span>/.test(html), "quedó un separador sin nada detrás");
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
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  const marco = src.match(/<span className="flex items-center[^"]*rounded-lg border[^"]*">/);
  assert.ok(marco, "no se encontró el marco del campo con pasos");
  assert.ok(!/px-\d/.test(marco[0]), "el marco volvió a tener relleno lateral propio");
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

// ── EL V25 CAMBIÓ LA CABEZA DE ESTE TEXTO, Y POR QUÉ ─────────────────────
//
// Estos dos afirmaban "40 de 48 · faltan 8" y "56 de 48 · sobran 8": los tres
// números en unidades FÍSICAS, sobre una línea que se cuenta en CAJÓN x8. El
// operador tenía 5 cajones en la mano y la pantalla le hablaba de 40.
//
// Ahora la cabeza va en la escala del conteo y la diferencia sigue en unidades,
// con la palabra escrita —"faltan 8 unidades"— porque con la cabeza en cajones
// un 8 pelado se leería como ocho cajones. No se aflojó nada: son las mismas
// afirmaciones, sobre el texto que la pantalla dibuja hoy.

test("V22-2 y 3 · el resultado va TEÑIDO, corto y EN LA ESCALA DEL CONTEO", () => {
  // Sin diferencia: fondo positivo y la cabeza en cajones, no en unidades.
  const igual = pintarFicha(lineaCajon({ cantidadRecibida: 6 }), { enHoja: true });
  assert.ok(
    igual.includes("6 CAJÓN x8 de 6 CAJÓN x8 · sin diferencia"),
    "no está el formato corto en la escala del conteo"
  );
  assert.ok(!igual.includes("48 de 48"), "volvió a hablar en unidades físicas");
  assert.ok(igual.includes("sunmi-state-success"), "el bloque no se tiñe de positivo");
  assert.ok(!igual.includes("Ingreso físico:"), "quedó el texto largo de escritorio");

  // Con diferencia: danger. 5 cajones contra 6, y faltan 8 unidades.
  const menos = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(
    menos.includes("5 CAJÓN x8 de 6 CAJÓN x8 · faltan 8 unidades"),
    "el resultado no dice la diferencia en la escala del conteo"
  );
  assert.ok(menos.includes("sunmi-state-danger"), "el bloque no se tiñe de danger");
});

test("V22-3b · cuando SOBRA se dice al derecho, y el singular se respeta", () => {
  const sobra = pintarFicha(lineaCajon({ cantidadRecibida: 7 }), { enHoja: true });
  assert.ok(
    sobra.includes("7 CAJÓN x8 de 6 CAJÓN x8 · sobran 8 unidades"),
    "un sobrante se está diciendo como falta"
  );
  assert.ok(!sobra.includes("faltan"), "dice 'faltan' sobre un sobrante");
});

test("V25-R · el resto de un bulto se dice como resto, y nunca como fracción", () => {
  // Lo que la cabeza nueva tiene que resolver y la vieja no tenía: un conteo que
  // no cae redondo. 5 cajones y 3 sueltas son 43 físicas contra 48.
  //
  // "5,375 CAJÓN x8" sería un número que no existe en el depósito, y es
  // exactamente el error de exactitud que todo este modelo evita.
  const resto = pintarFicha(
    lineaCajon({ cantidadRecibida: 5, recibidoUnidadesSueltas: 3 }),
    { enHoja: true }
  );
  assert.ok(
    resto.includes("5 CAJÓN x8 + 3 de 6 CAJÓN x8 · faltan 5 unidades"),
    "el resto del bulto no se está diciendo"
  );
  assert.ok(!resto.includes("5,375"), "apareció una fracción de cajón");
});

test("V25-U · una línea en UNIDAD conserva el texto de siempre", () => {
  // La escala de conteo YA era la física, así que acá no había nada que
  // arreglar. Este candado existe para que el arreglo de los agrupados no se
  // lleve puesto el caso más común del ERP.
  const html = pintarFicha(
    lineaCajon({
      unidadEnviada: "UNIDAD",
      unidadMedida: "unidad",
      factorPack: 1,
      presentacionEnvio: null,
      cantidadEnviada: 48,
      cantidadRecibida: 47,
    }),
    { enHoja: true }
  );
  assert.ok(html.includes("47 de 48 · falta 1"), "cambió el texto de una línea en UNIDAD");
  assert.ok(!html.includes("falta 1 unidad"), "se coló el sufijo de los agrupados");
});

test("V22-4 · la línea de explicación nombra la presentación de la línea", () => {
  const html = pintarFicha(lineaCajon(), { enHoja: true });
  assert.ok(
    html.includes("El envío sigue siendo CAJÓN x8."),
    "la explicación no sale de la presentación de la línea"
  );
  assert.ok(html.includes("bulto abierto o una rotura"));
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
  assert.ok(igual.includes("✓ Marcar revisado y seguir"));
  assert.ok(igual.includes("sunmi-btn-primary"), "sin diferencia el botón no es el de acción");

  const dif = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });
  assert.ok(dif.includes("✓ Guardar diferencia y seguir"));
  // `warning` y NO `amber`: `.sunmi-btn-amber` es la misma regla que
  // `.sunmi-btn-primary` —las dos pintan `--pos-accent`—, así que pedir `amber`
  // para distinguirse de `primary` dejaba los dos botones del mismo color en los
  // catorce temas. El cambio de color existía en el código y no en la pantalla.
  assert.ok(dif.includes("sunmi-btn-warning"), "con diferencia el botón no es warning");
  assert.ok(!dif.includes("sunmi-btn-primary"), "quedaron los dos colores a la vez");
});

// ── Y EL OTRO LADO: ESCRITORIO NO SE MUEVE ───────────────────────────────

test("V22-E · escritorio conserva TODO lo que el V22 cambió en el teléfono", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5 }));
  // El botón de las sueltas, y el campo detrás de él.
  assert.ok(html.includes(ROTULO_SUELTAS), "desapareció el botón de escritorio");
  assert.equal(valorDelCampo(html, "Unidades sueltas"), null, "el campo dejó de estar oculto");
  // El rótulo viejo, no el de la presentación.
  assert.ok(html.includes(">Recibido<"), "escritorio perdió su rótulo «Recibido»");
  assert.ok(!html.includes("CAJÓN x8 completos"), "se filtró el rótulo del teléfono");
  // El texto largo, sin teñir.
  assert.ok(html.includes("Ingreso físico:"), "escritorio perdió su línea de ingreso físico");
  assert.ok(!html.includes("40 de 48 · faltan 8"), "se filtró el formato corto del teléfono");
  assert.ok(!html.includes("sunmi-state-danger"), "se filtró el bloque teñido del teléfono");
  // La explicación es del teléfono.
  assert.ok(!html.includes("El envío sigue siendo"), "se filtró la explicación del teléfono");
  // Y el botón sigue en ámbar con su texto de siempre.
  assert.ok(html.includes("sunmi-btn-amber"), "escritorio cambió el color del botón");
  assert.ok(!html.includes("y seguir"), "se filtró el texto del teléfono");
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
