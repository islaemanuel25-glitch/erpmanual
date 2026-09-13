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
  ROTULO_UNIDADES,
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

// ═══════════════════════════════════════════════════════════════════════════
// EL ENVÍO MIXTO: LAS SUELTAS SE PROPONEN DEL ENVÍO, IGUAL QUE LOS PACKS
// ═══════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, VISTO EN PRODUCCIÓN. `CERVEZA 361 1L`, enviada como
// "0 PACK x6 + 1 unidad suelta": el campo de packs precargaba 0 —bien, es lo
// enviado— y el de sueltas quedaba EN BLANCO. Con eso el panel calculaba
// 0 × 6 + 0 = 0 físicas contra 1 enviada, concluía que había diferencia, y
// dibujaba el borde en danger y un "$0,00" con el importe tachado, sobre una
// línea que coincide.
//
// La causa: los dos campos leían fuentes distintas. Packs, lo ENVIADO; sueltas,
// lo ya RECIBIDO —que en una línea pendiente es 0—.
//
// ── Y ES LA SEXTA VEZ DEL MISMO PATRÓN ──────────────────────────────────
//
// Ningún fixture de este archivo tenía la combinación que lo destapa: una línea
// con `sueltasEnviadas > 0` y SIN contar. `lineaCajon` tiene `sueltasEnviadas: 0`
// y todos los casos con sueltas traían `recibidoUnidadesSueltas`. O sea que había
// candados sobre el campo de sueltas y ninguno podía ver esto.
//
// Por eso el fixture va primero y con nombre propio.

/**
 * La línea real: 0 packs de 6 y una unidad suelta, sin contar todavía.
 *
 * Los dos costos son los de producción: el PACK vale 8880 —es lo que el DTO manda
 * en `precioCosto`, que es el costo de la presentación— y la unidad 1480.
 */
const lineaMixtaSinContar = (extra = {}) =>
  lineaCajon({
    nombre: "CERVEZA 361 1L",
    presentacionEnvio: "PACK",
    factorPresentacion: 6,
    factorPack: 6,
    unidadMedida: "pack",
    cantidadEnviada: 1,
    cantidadPresentada: 0,
    sueltasEnviadas: 1,
    cantidadRecibida: null,
    recibidoUnidadesSueltas: 0,
    precioCosto: 8880,
    costoUnitarioFisico: 1480,
    subtotal: 1480,
    ...extra,
  });

/** El mixto DE VERDAD: dos packs enteros y tres sueltas, sin contar. */
const lineaMixtaConBultos = (extra = {}) =>
  lineaMixtaSinContar({
    cantidadEnviada: 15,
    cantidadPresentada: 2,
    sueltasEnviadas: 3,
    subtotal: 22200,
    ...extra,
  });

// ── ESTOS TRES CANDADOS SE REESCRIBIERON, Y CONVIENE SABER POR QUÉ ────────
//
// Nacieron el 2026-09-12 afirmando que la línea de arriba abría con DOS campos:
// packs en 0 y sueltas en 1. El 2026-09-13 se decidió que una línea que salió sin
// ningún bulto entero se cuenta por unidad —el pack no está en juego, así que no
// se nombra ni se ofrece contarlo—, y con eso esa forma dejó de existir en la
// hoja. Ver `seCuentaPorUnidad`.
//
// No se aflojaron: el DEFECTO que defendían es el mismo y sigue defendido. Era
// que el campo del desglose se precargaba de lo RECIBIDO en vez de lo ENVIADO, y
// por eso salía vacío y el panel declaraba una diferencia inexistente. Lo que
// cambió es dónde se ejerce: el caso de los dos campos se mudó al mixto de
// verdad —`lineaMixtaConBultos`, que sí tiene bultos completos y sueltas— y el de
// un campo se afirma sobre la línea real.
//
// La forma nueva vive en `lineaSoloSueltas.test.mjs`, con la tarjeta y el panel
// juntos.

test("MIXTO · las sueltas del envío se PRECARGAN, no quedan en blanco", () => {
  // El caso donde los dos campos siguen existiendo: 2 packs enteros y 3 sueltas.
  // Es acá donde el defecto original todavía se puede cometer.
  const html = pintarFicha(lineaMixtaConBultos(), { enHoja: true });

  assert.equal(valorDelCampo(html, "Cantidad recibida en PACK x6"), "2", "los packs no precargan lo enviado");
  assert.equal(
    valorDelCampo(html, ROTULO_SUELTAS_CAMPO),
    "3",
    "el campo de sueltas quedó vacío: el panel va a declarar una diferencia que no existe"
  );
});

test("SIN BULTOS · y con un solo campo, la suelta igual se precarga", () => {
  // El mismo defecto en la forma nueva: si el campo único saliera vacío, el panel
  // calcularía 0 contra 1 enviada y volvería a pintar el danger sobre una línea
  // que coincide.
  const html = pintarFicha(lineaMixtaSinContar(), { enHoja: true });
  assert.equal(valorDelCampo(html, ROTULO_UNIDADES), "1", "el campo único salió vacío");
  assert.equal(
    valorDelCampo(html, "Cantidad recibida en PACK x6"),
    null,
    "volvió el campo de packs sobre una línea que no trajo ningún pack"
  );
});

test("MIXTO · y por lo tanto NO declara una diferencia que no existe", () => {
  // La consecuencia, que es lo que se vio en la pantalla. Con las sueltas
  // precargadas la línea coincide, así que no hay borde en danger, no hay importe
  // tachado y no se pide motivo.
  const html = pintarFicha(lineaMixtaSinContar(), { enHoja: true });

  assert.ok(!html.includes("border-2 sunmi-border-danger"), "pintó en danger una línea que coincide");
  assert.ok(!html.includes("line-through"), "tachó el importe de una línea que coincide");
  assert.ok(!html.includes("$0,00"), "volvió el $0,00 sobre una línea que sí llegó");
  assert.ok(html.includes("$1.480,00"), "perdió el importe de la línea");
  // Y el precio del PACK no aparece en ningún lado: es el de algo que no vino.
  assert.ok(
    !html.includes("$8.880,00"),
    "mostró el costo de un pack sobre una línea que salió por unidad"
  );
  assert.ok(
    html.includes("data-motivo-reservado"),
    "pidió motivo sobre una línea que coincide: el hueco tendría que estar reservado, no ocupado"
  );
});

test("MIXTO · pero una línea YA CONTADA con 0 sueltas reales se queda en 0", () => {
  // El otro lado, y es el que el arreglo podía romper: si ya se contó y no había
  // ninguna suelta, ese 0 es un DATO —se miró y no había— y no puede volver al
  // envío. Lo que lo distingue es `cantidadRecibida`, no las sueltas.
  //
  // Con la forma nueva el campo es uno solo y lo que se afirma es lo mismo: un
  // cero CONTADO no vuelve a la cantidad del envío. Lo que lo distingue sigue
  // siendo `cantidadRecibida`, no las sueltas.
  const html = pintarFicha(
    lineaMixtaSinContar({ cantidadRecibida: 0, recibidoUnidadesSueltas: 0 }),
    { enHoja: true }
  );
  assert.equal(
    valorDelCampo(html, ROTULO_UNIDADES),
    "0",
    "una línea contada en cero volvió a proponer lo del envío"
  );
  // Y ahí sí hay diferencia: se contó 0 contra 1 enviada.
  assert.ok(html.includes("border-2 sunmi-border-danger"), "no marcó la diferencia de lo contado");
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
  assert.match(src, /const env = descriptorDeEnvio\(d \|\| \{\}\)/);
  assert.match(src, /sinContar \? env\.cantidad : d\.cantidadRecibida/);
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
  // El piso ya no está en esta pantalla: el − y el + viven en
  // `SunmiCampoCantidad`. Lo que esta pantalla tiene que seguir haciendo es
  // PEDIR el mínimo 0 — el default del kit también es 0, pero pasarlo explícito
  // es lo que hace que el día que el carrito lo cambie, recepción no lo herede.
  assert.match(src, /minimo=\{0\}/, "la pantalla dejó de pedir el mínimo 0");
  const kit = codigoDe("components/sunmi/SunmiCampoCantidad.jsx");
  assert.match(kit, /Math\.max\(minimo,/, "el kit dejó de respetar el mínimo que le pasan");
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

test("V24-2b · el marco es del NÚMERO, y sus dos bordes son del kit", () => {
  // El marco pasó por cuatro formas: cadena fija, expresión con el borde
  // negociado —V26—, envolviendo solo al número con los botones afuera —V29—, y
  // ahora VIVE EN EL KIT: `SunmiCampoCantidad`, compartido con el carrito del POS.
  //
  // Así que lo que se afirma se partió en dos, y cada mitad donde vive:
  //   · el kit dibuja el marco y sus dos bordes;
  //   · esta pantalla PIDE que el marco crezca, que es lo suyo.
  const kit = codigoDe("components/sunmi/SunmiCampoCantidad.jsx");
  const marco = kit.match(/className=\{`min-w-0 rounded-lg \$\{[\s\S]{0,200}?`\}/);
  assert.ok(marco, "no se encontró el marco del campo en el kit");
  assert.ok(!/px-\d/.test(marco[0]), "el marco volvió a tener relleno lateral propio");
  assert.match(marco[0], /border-2 sunmi-border-danger/, "el borde de la diferencia no es del kit");
  assert.match(marco[0], /border sunmi-divider/, "se perdió el borde normal del campo");
  assert.match(marco[0], /min-w-0/, "sin min-w-0 el input empuja a los botones afuera del campo");

  // Y la pantalla le pide el `flex-1`: sin eso el marco no ocupa lo que sobra
  // entre los dos botones y el número queda apretado en su ancho intrínseco.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.match(src, /claseMarco="flex-1"/, "la pantalla dejó de pedir que el marco crezca");
});

// ── UNA CORRECCIÓN A ESTE CANDADO, Y CONVIENE SABER QUÉ AFIRMABA MAL ─────
//
// La versión anterior cerraba con esto: "el botón sigue sin declarar padding: usa
// el del kit, que da 36 px de alto", y lo comprobaba buscando que no apareciera
// un `px-0` cerca del `aria-label`.
//
// **Eso era falso y además vacío.** `SunmiLinkButton` no trae `px-2 py-1`: su
// clase es `text-xs sunmi-text-accent underline` y nada más. La premisa de los 36
// px venía de `SunmiButton`, que es otra pieza. Y la afirmación no podía fallar
// nunca, porque nadie iba a escribir `px-0` ahí.
//
// El alto real del botón no se puede medir en un render a string. Lo mide el
// arnés a 390 px —`cajasDelCampo`, que devuelve la caja de las tres piezas— y es
// ahí donde se afirma. Si el área tocable resulta más chica de lo cómodo, el
// número está en la corrida y no en este comentario.

test("V24-2b · el botón lo dimensiona el KIT, no la pantalla", () => {
  // Este candado ya afirmó algo falso una vez —decía que el botón traía el
  // `px-2 py-1` del kit y 36 px de alto, y el alto real eran 16— así que conviene
  // decir qué afirma ahora y dónde.
  //
  // El botón se fue al kit con el resto del control. La pantalla no le escribe
  // NADA: ni tamaño, ni fondo, ni radio. Si algún día hace falta agrandarlo se
  // agranda en el kit y lo heredan el carrito y recepción.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  assert.ok(
    !/Restar uno a/.test(src),
    "la pantalla volvió a dibujar el botón en vez de pedirle el campo al kit"
  );

  const kit = codigoDe("components/sunmi/SunmiCampoCantidad.jsx");
  // Los dos tamaños, los dos de la escala. Dos cosas salieron mal antes de dar
  // con esto y las dos las encontró medir: el trinquete atrapó un `w-[30px]`
  // escrito a mano, y después `w-8` resultó ser 28 px y no 32 —en este proyecto
  // `1rem` son 14—. El escalón que pasa los 30 es el 9.
  assert.match(kit, /normal: "w-9 h-9"/, "el tamaño normal dejó de ser w-9");
  assert.match(kit, /compacto: "w-7 h-7"/, "el compacto dejó de ser el del carrito");
  // Y el fondo relleno, que es lo que el POS tenía bien y se conservó.
  assert.match(kit, /pos-control/, "el botón perdió su fondo relleno");
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
// V29 · EL − Y EL + AFUERA DEL MARCO DEL NÚMERO
// ═══════════════════════════════════════════════════════════════════════════
//
// Eran `[ − 1 + ]`, todo en una caja con borde. Ahora son tres piezas y el borde
// rodea SOLO al número. El motivo de fondo no es estético: el borde danger tiene
// que decir "este NÚMERO no coincide", y envolviendo a los botones diría "estos
// controles están mal".
//
// Este candado mira la ESTRUCTURA del marcado. Que los botones queden fuera del
// marco medido en el DOM, y cuántos dígitos entran en el número que queda, lo
// mide el arnés a 390 px con `cajasDelCampo` — un render a string no tiene
// geometría y ahí "afuera" no se puede medir.

test("V29-1 · el marco con borde envuelve al número y NO a los botones", () => {
  const html = pintarFicha(lineaCajon({ cantidadRecibida: 5 }), { enHoja: true });

  // El input está dentro de un span con borde; los botones están fuera de él.
  // Se busca el fragmento que va del botón − al botón +: si el borde estuviera
  // en el envoltorio de los tres, aparecería ANTES del botón −.
  const desdeMenos = html.indexOf("Restar uno a");
  const hastaMas = html.indexOf("Sumar uno a");
  assert.ok(desdeMenos > 0 && hastaMas > desdeMenos, "no se encontraron los dos botones");

  // Lo que hay entre los dos botones: ahí y solo ahí va el borde.
  const entre = html.slice(desdeMenos, hastaMas);
  assert.match(entre, /border-2 sunmi-border-danger/, "el borde no está en la caja del número");

  // Y el contenedor de los tres —lo que está justo antes del botón −— no lo
  // lleva. Se toma la apertura del span inmediatamente anterior.
  const aperturaContenedor = html.slice(0, desdeMenos).lastIndexOf("<span");
  const contenedor = html.slice(aperturaContenedor, desdeMenos);
  assert.ok(
    !/border/.test(contenedor),
    `el contenedor de las tres piezas volvió a llevar el borde: ${contenedor}`
  );
});

test("V29-1b · los botones llevan su fondo y su radio, y el borde es del número", () => {
  // Se mide sobre el KIT, que es donde se dibujan desde que el control se
  // unificó. `<button` y no `<a`: es un botón de verdad y solo toma prestada la
  // apariencia de un enlace en recepción — en el carrito nunca la tuvo.
  const kit = codigoDe("components/sunmi/SunmiCampoCantidad.jsx");
  const claseBoton = kit.match(/rounded pos-control[^"`]*/);
  assert.ok(claseBoton, "no se encontró la clase del botón en el kit");
  assert.ok(!/border/.test(claseBoton[0]), "el botón se llevó un borde que es del número");
  // El radio y el fondo, que son los que lo hacen leer como un control.
  assert.match(kit, /rounded pos-control/, "el botón perdió su fondo o su radio");
});

test("V29-1c · y sigue conservando los tres decimales del peso al tocar", () => {
  // Lo que la tanda del peso arregló y la mudanza al kit no puede romper: un
  // toque al + sobre 0,730 no puede dejar 1,73.
  //
  // Vive en dos lados y los dos se afirman: el kit aplica los decimales al paso,
  // y esta pantalla se los PASA. Con uno solo de los dos el candado quedaría
  // verde sobre la mitad del camino.
  const kit = codigoDe("components/sunmi/SunmiCampoCantidad.jsx");
  assert.match(kit, /decimales > 0 \? n\.toFixed\(decimales\) : String\(n\)/,
    "el kit dejó de conservar los decimales al dar un paso");
  assert.match(kit, /Math\.max\(minimo,/, "el − volvió a poder bajar del mínimo");

  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  // Los decimales salen de la presentación MOSTRADA y no de la del snapshot: son
  // los del número que está escrito en el campo. Hoy las dos coinciden en KG
  // —el peso nunca agrupa, así que nunca se colapsa—, y la que manda es la
  // mostrada porque es la escala en la que se tipea.
  assert.match(
    src,
    /decimales=\{decimalesDeCantidad\(mostrado\.presentacion\)\}/,
    "el campo dejó de pasarle los decimales al kit"
  );
});

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
  //
  // ── SE MIRA CON EL ESPACIADO NORMALIZADO, Y NO ES UN DETALLE ───────────
  //
  // La versión anterior buscaba la expresión tal como estaba escrita en una
  // línea. Cuando la condición creció y el formateo la partió en varias, el
  // candado se puso rojo sin que nada del comportamiento cambiara — y el riesgo
  // simétrico es peor: si lo que crece es otra cosa, un candado atado al
  // espaciado puede dejar de encontrar lo que defiende y no avisar.
  const src = codigoDe("components/transferencias/FichaProductoRecepcion.jsx");
  const plano = src.replace(/\s+/g, " ");
  assert.ok(
    !/agrupaEsta && conSueltas \? sueltas/.test(plano),
    "la cuenta volvió a mirar `conSueltas` en vez de `usaSueltas`"
  );
  assert.equal(
    (plano.match(/muestraSueltas && usaSueltas \? sueltas \|\| 0 : 0/g) || []).length,
    2,
    "las dos cuentas —la del ingreso físico y la del guardado— tienen que mirar lo mismo"
  );
  // Y la rama del campo único, que es la otra mitad de las mismas dos cuentas: lo
  // tipeado va al hueco de las sueltas con los completos en cero. Si una de las
  // dos se olvidara, el panel mostraría un ingreso físico que no es el que guarda.
  assert.equal(
    (plano.match(/cuentaPorUnidad \? recibido === "" \? 0 : recibido \|\| 0/g) || []).length,
    2,
    "el campo único no entra por el mismo hueco en las dos cuentas"
  );
});
