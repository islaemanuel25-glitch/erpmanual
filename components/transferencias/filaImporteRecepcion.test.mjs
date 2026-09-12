// EL DINERO DE LA TARJETA MÓVIL DE RECEPCIÓN, Y QUE ESCRITORIO NO LO MUESTRE.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/filaImporteRecepcion.test.mjs
//
// ── ESTE ARCHIVO CAMBIÓ DE SUJETO EL 2026-09-11, Y CONVIENE SABER POR QUÉ ──
//
// Nació apuntando a `FilaProducto` con una prop `conImporte`: la MISMA fila la
// dibujaban el teléfono y la lista de escritorio, y la prop decidía si aparecía
// la fila de dinero.
//
// El V15 le dio al teléfono una tarjeta propia —`TarjetaRecepcionMovil`, con
// contador, botón y chips adentro— porque eso no se podía meter en una fila
// compartida sin mover escritorio. Con eso, nadie pedía ya `conImporte`: la prop
// quedó en código muerto y estos doce candados pasaron a defender una rama que
// no se renderizaba en ninguna pantalla. Verdes, y afirmando nada.
//
// Así que la prop se sacó y los candados se mudaron al sujeto nuevo. Lo que
// afirman NO se aflojó: sigue siendo que hay UN solo costo por tarjeta, que la
// presentación sale de la fuente canónica, que el importe no se recalcula en el
// navegador, y que escritorio no muestra dinero. Cambió dónde vive eso.
//
// ── QUÉ AFIRMA, Y POR QUÉ MONTANDO ───────────────────────────────────────
//
// Se MONTA con `react-dom/server` y se lee el texto que queda en pantalla. No se
// recalcula ningún importe ni se vuelve a resolver ninguna presentación: los
// candados que comparan una función contra una copia de sí misma pasan siempre,
// incluso estando las dos mal.
//
// ── LO QUE ESTO NO PUEDE CONTESTAR ───────────────────────────────────────
//
// No mide píxeles: un render a string no tiene layout. Lo que sí se defiende son
// las clases que impiden que la fila se parta en dos renglones —F11—, que es la
// causa observable de que dos tarjetas midan distinto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FilaProducto } from "./WorkspaceRecepcion.jsx";
import TarjetaRecepcionMovil from "./TarjetaRecepcionMovil.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** El texto que se lee, sin etiquetas: el número y su unidad viven en nodos distintos. */
const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

const linea = (extra = {}) => ({
  id: 1,
  nombre: "AMARGO OBRERO 950ML",
  cantidadEnviada: 2,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "BULTO",
  factorPack: 6,
  presentacionEnvio: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: null,
  precioCosto: 11400,
  subtotal: 22800,
  ...extra,
});

/**
 * LA MISMA LÍNEA, PERO CORREGIDA. Es la combinación que faltaba.
 *
 * ── POR QUÉ ESTE FIXTURE EXISTE, Y ES LA CUARTA VEZ ─────────────────────
 *
 * Todas las afirmaciones de plata de este archivo sobre líneas del remito
 * —F1, F2, F3 y F8— corrían sobre una línea SIN CONTAR o con recibido igual a
 * enviado. En esos dos casos `subtotal` y `subtotalRecibido` valen lo MISMO, así
 * que la afirmación no puede distinguir cuál de los dos leyó la tarjeta.
 *
 * Por eso el defecto de la #191 vivió: Papas Congeladas, enviado 4 por $38.000,
 * corregido a 10, y la tarjeta siguió mostrando $38.000 cuando el total global
 * —que suma el otro campo— ya decía $95.000. El número correcto existía y estaba
 * llegando a la pantalla; nadie lo dibujaba.
 *
 * Es el mismo patrón que CLAUDE.md tiene anotado tres veces: el fixture nunca
 * tiene la combinación que expondría el defecto. La diferencia con las otras
 * tres es que acá el dato SÍ llega del endpoint — lo que faltaba era una línea
 * donde los dos campos difieran.
 *
 * `subtotalRecibido` sale de `valorizarDetalle` y es el mismo número que el
 * servidor suma para `resumen.importeCorregido`. No se inventa acá: 10 × $9.500.
 */
const lineaCorregida = (extra = {}) =>
  linea({
    nombre: "Papas Congeladas",
    unidadEnviada: "UNIDAD",
    factorPack: 1,
    cantidadEnviada: 4,
    cantidadRecibida: 10,
    precioCosto: 9500,
    subtotal: 38000,
    subtotalRecibido: 95000,
    ...extra,
  });

/** La tarjeta del teléfono, montada como la monta `RecepcionMovil`. */
const pintarMovil = (d, props = {}) =>
  texto(
    renderToStaticMarkup(
      React.createElement(TarjetaRecepcionMovil, {
        d,
        puedeRecibir: true,
        onRevisar: () => ({ ok: true }),
        onAbrirFicha: () => {},
        ...props,
      })
    )
  );

/** La fila de escritorio, montada como la monta la lista de abajo. */
const pintarEscritorio = (d) =>
  texto(
    renderToStaticMarkup(
      React.createElement(FilaProducto, { d, activa: false, onElegir: () => {} })
    )
  );

// ── LOS TRES MODOS DEL DISEÑO APROBADO ────────────────────────────────────
//
// El formato es el de `lib/moneda.js` — `$11.400,00`, con el símbolo PEGADO—,
// que es el que el diseño pide para esta pantalla. El `$ 11.400,00` con espacio
// es el del helper viejo del detalle, que sigue sirviendo a la tabla de
// escritorio y no se tocó.

test("F1. UNIDAD: un solo costo, el de la unidad, y su total", () => {
  const t = pintarMovil(
    linea({
      nombre: "ALA POLVO MATIC 800GR",
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      cantidadEnviada: 6,
      precioCosto: 3100,
      subtotal: 18600,
    })
  );
  // ── EL V26 LE SACÓ EL COSTO UNITARIO A ESTE RENGLÓN ────────────────────
  //
  // Decía "Enviado 6 UNIDAD · $3.100,00". El importe de la línea ya está abajo
  // a la derecha y en grande: eran dos datos distintos peleando por el mismo
  // renglón. Queda el enviado, y el dinero en un solo lugar.
  //
  // Lo que este candado defiende no cambió —que la tarjeta muestre el importe
  // correcto y en la escala correcta—, cambió dónde se lo lee.
  assert.match(t, /Enviado/);
  assert.match(t, /6 UNIDAD/);
  assert.doesNotMatch(t, /6 UNIDAD · \$/, "volvió el costo unitario al renglón del enviado");
  assert.match(t, /\$18\.600,00/);

  // Y LA MISMA LÍNEA CORREGIDA: 6 enviadas, 10 recibidas. El importe que la
  // tarjeta muestra tiene que ser el de las 10.
  const c = pintarMovil(
    linea({
      nombre: "ALA POLVO MATIC 800GR",
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      cantidadEnviada: 6,
      cantidadRecibida: 10,
      precioCosto: 3100,
      subtotal: 18600,
      subtotalRecibido: 31000,
    })
  );
  assert.match(c, /\$31\.000,00/, "la tarjeta no muestra el importe de lo RECIBIDO");
});

test("F2. PACK con factor 6: el costo es el DEL PACK, con su factor", () => {
  const t = pintarMovil(linea());
  assert.match(t, /Enviado/);
  assert.match(t, /2 PACK x6/);
  assert.doesNotMatch(t, /2 PACK x6 · \$/, "volvió el costo del pack al renglón del enviado");
  assert.match(t, /\$22\.800,00/);
  // ── Y LA PRESENTACIÓN APARECE UNA SOLA VEZ ────────────────────────────
  //
  // Es el otro defecto del V26: "PACK x6" salía DOS veces y las dos en gris
  // chico —en el enviado y en la fila 2, que decía "PACK x6 · 12 unidades
  // físicas"—. La fila 2 se fue; acá se afirma que no vuelva.
  assert.equal(
    (t.match(/PACK x6/g) || []).length,
    1,
    `la presentación aparece más de una vez en la tarjeta: ${t}`
  );

  // CORREGIDA: 2 packs enviados, 5 recibidos. 5 × $11.400 = $57.000.
  const c = pintarMovil(linea({ cantidadRecibida: 5, subtotalRecibido: 57000 }));
  assert.match(c, /\$57\.000,00/, "la tarjeta no muestra el importe de lo RECIBIDO");
});

test("F3. CAJÓN con factor 8: el vocabulario es el del dominio, no 'Bulto'", () => {
  const t = pintarMovil(
    linea({
      nombre: "COCA COLA 2L",
      unidadMedida: "cajon",
      factorPack: 8,
      cantidadEnviada: 5,
      precioCosto: 15200,
      subtotal: 76000,
    })
  );
  assert.match(t, /CAJÓN x8/);
  assert.match(t, /\$76\.000,00/);

  // CORREGIDA: 5 cajones enviados, 7 recibidos. 7 × $15.200 = $106.400.
  const c = pintarMovil(
    linea({
      nombre: "COCA COLA 2L",
      unidadMedida: "cajon",
      factorPack: 8,
      cantidadEnviada: 5,
      cantidadRecibida: 7,
      precioCosto: 15200,
      subtotal: 76000,
      subtotalRecibido: 106400,
    })
  );
  assert.match(c, /\$106\.400,00/, "la tarjeta no muestra el importe de lo RECIBIDO");
  // "Bulto" es la etiqueta del helper DUPLICADO del detalle de escritorio. Si
  // apareciera acá, esta tarjeta estaría resolviendo por su cuenta.
  assert.doesNotMatch(t, /Bulto/i, "la tarjeta usó el vocabulario del helper duplicado");
});

// ── UNA SOLA ESCALA DE COSTO POR TARJETA ──────────────────────────────────

test("F4. NUNCA HAY DOS COSTOS EN LA MISMA TARJETA", () => {
  // Es la prohibición central del pedido: una línea que salió en pack NO puede
  // mostrar además el costo de la unidad suelta.
  //
  // ── EL V26 LO VOLVIÓ MÁS FUERTE, NO MÁS DÉBIL ─────────────────────────
  //
  // Antes se contaban las apariciones de "Enviado … · $" y se exigía UNA. Con el
  // costo unitario fuera del renglón del enviado, ese patrón no puede aparecer
  // nunca, así que contar uno sería contar nada — verde sobre algo que no
  // existe, que es el patrón del `conImporte`.
  //
  // Ahora se cuentan los IMPORTES de la tarjeta, que es lo que el pedido decía:
  // un solo número de plata por tarjeta pendiente.
  for (const caso of [
    linea(),
    linea({ unidadEnviada: "UNIDAD", factorPack: 1 }),
    linea({ unidadMedida: "cajon", factorPack: 8 }),
    linea({ unidadMedida: "kg", unidadEnviada: "UNIDAD", factorPack: 1 }),
  ]) {
    const t = pintarMovil(caso);
    assert.equal(
      (t.match(/\$[\d.]+,\d\d/g) || []).length,
      1,
      `la tarjeta muestra más de un importe: ${t}`
    );
  }
});

// ── LA PRESENTACIÓN SALE DE LA FUENTE CANÓNICA ────────────────────────────

test("F5. LA TARJETA NO RESUELVE LA PRESENTACIÓN POR SU CUENTA", () => {
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  // `nombreDePresentacion(envio)` se fue con la fila 2. El rótulo lo arma ahora
  // `rotuloConSueltas`, que es del MISMO módulo canónico y además no pierde las
  // sueltas — que es la razón por la que ese helper existe.
  assert.match(fuente, /rotuloConSueltas\(envio\)/);
  assert.match(fuente, /from "@\/lib\/transferencias\/presentacionEnvio"/);
  assert.doesNotMatch(
    fuente,
    /unidadEnviada\s*===\s*["']BULTO["']/,
    "el componente volvió a decidir la presentación por su cuenta"
  );
  assert.doesNotMatch(fuente, /"PACK x"|'PACK x'|`PACK x/, "el rótulo se está armando a mano");
});

test("F6. Y EL IMPORTE NO SE RECALCULA: sale tal cual del endpoint", () => {
  // Un total calculado en el front puede divergir del que valorizó el servidor,
  // que es el que cuadra con la lista y con los dos PDF.
  //
  // ── EL CAMPO DEJÓ DE SER UNO SOLO, Y ESO ES EL ARREGLO ──────────────────
  //
  // Este candado exigía la cadena literal `formatearMoneda(d.subtotal)`. El V16
  // tuvo que romperla: `subtotal` es el importe del REMITO y para una línea
  // agregada vale cero —correcto por definición, de un no declarado no salió
  // nada—, así que la tarjeta mostraba $0,00 sobre mercadería que sí llegó. Se
  // vio en la #195.
  //
  // Y LA #191 lo volvió a romper, por el otro lado: el ternario leía
  // `subtotalRecibido` SOLO para las agregadas, así que una línea del remito
  // corregida de 4 a 10 se quedaba en el importe del documento. Ahora los dos
  // campos se leen siempre, cada uno a una variable con nombre.
  //
  // Lo que el candado defiende no cambió en ninguna de las dos vueltas: los
  // números salen del endpoint y la pantalla no multiplica. Lo que cambia es
  // cuál se dibuja, y eso se exige por separado —F13, F14 y F15— sobre el
  // render, que es donde se ve.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  // ── Y EL V26 SACÓ EL COSTO UNITARIO, QUE ERA EL TERCER NÚMERO ──────────
  //
  // Exigía `formatearMoneda(d.precioCosto)` en el renglón del enviado. Ese
  // renglón ya no lleva plata: el importe de la línea está abajo y en grande, y
  // dos cifras en la misma tarjeta se leen como si una explicara a la otra.
  //
  // La afirmación se da vuelta y con eso dice MÁS: que el costo unitario no
  // vuelva. Lo que el candado defiende —que los números salen del endpoint y la
  // pantalla no multiplica— sigue abajo, intacto.
  assert.doesNotMatch(
    fuente,
    /formatearMoneda\(d\.precioCosto\)/,
    "volvió el costo unitario a la tarjeta"
  );
  assert.match(fuente, /d\.subtotalRecibido/, "la tarjeta dejó de leer el importe recibido");
  assert.match(fuente, /d\.subtotal\b/, "la tarjeta dejó de leer el importe del remito");
  assert.doesNotMatch(
    fuente,
    /d\.precioCosto\s*\*|\*\s*d\.precioCosto|d\.subtotal\s*\*|d\.subtotalRecibido\s*\*/,
    "la pantalla está multiplicando para llegar al total"
  );
  // Y no vuelve a colgar el importe de si la línea es agregada: esa condición
  // es la que dejó fuera a las corregidas.
  assert.doesNotMatch(
    fuente,
    /formatearMoneda\(\s*esAgregada\s*\?/,
    "el importe volvió a decidirse por `esAgregada` en vez de por si difieren"
  );
});

test("F6b. UN SOLO FORMATEADOR EN LA TARJETA, y es el del ERP", () => {
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.match(fuente, /from "@\/lib\/moneda"/);
  assert.ok(!fuente.includes("fmtMoneda"), "volvieron dos formateadores a la misma tarjeta");
  assert.ok(
    !/toLocaleString\([^)]*minimumFractionDigits/.test(fuente),
    "la tarjeta se escribió su propio formateador de plata"
  );
});

// ── LO QUE YA EXISTÍA NO SE MOVIÓ ─────────────────────────────────────────

test("F7. NO DECLARADO muestra el importe de lo que LLEGÓ, no el del remito", () => {
  // ── ESTE CANDADO ESTABA VERDE SOBRE UN DATO QUE NO EXISTE ───────────────
  //
  // Pasaba `subtotal: 32500` sobre una línea con `agregadoEnRecepcion: true`.
  // El endpoint NUNCA manda eso: `subtotal` sale de `valorizarLineaDelRemito`,
  // que para una agregada opera sobre `cantidadPresentada: 0` y devuelve CERO.
  // O sea que el candado afirmaba sobre una forma de dato imposible y por eso
  // no vio el defecto de la #195 —$0,00 en la tarjeta— durante toda una tanda.
  //
  // Es la regla de CLAUDE.md: la forma del dato de prueba tiene que ser la
  // forma del dato real. Ahora el fixture es el real: `subtotal: 0` y el valor
  // en `subtotalRecibido`, que es lo que el endpoint manda de verdad y lo mismo
  // que alimenta `importeCorregido` del resumen.
  const t = pintarMovil(
    linea({
      nombre: "9 de Oro",
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 13,
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      precioCosto: 2500,
      subtotal: 0,
      subtotalRecibido: 32500,
    })
  );
  // Una línea agregada no tiene remito, así que no puede decir "Enviado".
  assert.doesNotMatch(t, /Enviado/, "un no declarado no tiene remito contra el cual contrastar");
  assert.match(t, /Cargá la cantidad que llegó/);
  assert.match(t, /No declarado/);
  assert.match(t, /\$32\.500,00/, "volvió a mostrar el importe del remito, que para una agregada es 0");
  assert.doesNotMatch(t, /\$0,00/, "sigue dibujando el cero del remito");
});

test("F7b. Y NO OFRECE 'Coincide': no hay contra qué comparar", () => {
  // El botón prometía comparar contra un envío que no existe. En su lugar, el
  // pie dice cuánto entró — que es todo lo que se puede afirmar de esa línea.
  const t = pintarMovil(
    linea({
      nombre: "9 de Oro",
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 13,
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      subtotal: 0,
      subtotalRecibido: 32500,
    })
  );
  assert.doesNotMatch(t, /Coincide/, "un no declarado no puede ofrecer coincidir con el remito");
  // El V21 mudó este dato del pie al aviso —el pie ahora es "Corregir" y el
  // importe— y le puso la unidad en vez del "un" fijo, que era falso en KG. Lo
  // que se afirma no cambió: la tarjeta dice cuánto entró.
  assert.match(t, /No declarado · ingreso físico 13 unidades/);
});

test("F8. REVISADO se colapsa a una línea y conserva su importe", () => {
  // Hay 77 líneas: una tarjeta revisada que siga ocupando seis renglones empuja
  // el trabajo que falta abajo de todo.
  const t = pintarMovil(linea({ revisadoEnRecepcion: true, cantidadRecibida: 2 }));
  assert.match(t, /AMARGO OBRERO 950ML/);
  assert.match(t, /\$22\.800,00/);

  // CORREGIDA Y COLAPSADA.
  //
  // Acá iba UN solo número mientras el botón "Corregir" ocupaba el renglón: con
  // el nombre, la cantidad y el botón a 390 px no entraban los dos. El V23 sacó
  // ese botón —la línea entera pasa a ser tocable— y el importe del remito
  // vuelve, tachado, arriba del corregido. Lo que se sigue exigiendo es que el
  // que manda sea el de lo RECIBIDO.
  const c = pintarMovil(
    linea({ revisadoEnRecepcion: true, cantidadRecibida: 5, subtotalRecibido: 57000 })
  );
  assert.match(c, /\$57\.000,00/, "la línea colapsada no muestra el importe de lo RECIBIDO");
  assert.match(c, /\$22\.800,00/, "se perdió el importe del remito de la línea corregida");
  // Colapsada: ya no dibuja el contador ni el botón de cierre.
  assert.doesNotMatch(t, /Coincide/, "la tarjeta revisada sigue mostrando el botón de cierre");
  assert.doesNotMatch(t, /Motivo obligatorio/);
});

// ── ESCRITORIO NO CAMBIA ──────────────────────────────────────────────────

// ── EL CONTRATO NUEVO DEL IMPORTE, QUE ES LO QUE LA #191 PIDIÓ ────────────
//
// Dos números cuando difieren, uno solo cuando no. La flecha es la marca de que
// hubo corrección, así que no puede aparecer sobre una línea que coincide: ahí
// diría que pasó algo que no pasó.

test("F13. CON DIFERENCIA, LA TARJETA ABIERTA MUESTRA LOS DOS: remito → recibido", () => {
  const t = pintarMovil(lineaCorregida());
  assert.match(t, /\$38\.000,00/, "se perdió el importe del REMITO");
  assert.match(t, /\$95\.000,00/, "no está el importe de lo RECIBIDO");
  assert.match(t, /→/, "no está la flecha que marca la corrección");
  // Y en ese orden: el documento primero, la corrección después.
  assert.ok(
    t.indexOf("$38.000,00") < t.indexOf("$95.000,00"),
    "el orden está invertido: primero va el remito y después lo recibido"
  );
});

test("F14. SIN DIFERENCIA, UN SOLO NÚMERO Y NINGUNA FLECHA", () => {
  // Recibido igual a enviado: los dos campos traen lo mismo y mostrar
  // "22.800 → 22.800" sería ruido que además sugiere una corrección inexistente.
  const t = pintarMovil(linea({ cantidadRecibida: 2, subtotalRecibido: 22800 }));
  assert.match(t, /\$22\.800,00/);
  assert.doesNotMatch(t, /→/, "apareció la flecha sobre una línea que coincide");

  // Y tampoco sobre una línea que nadie contó todavía.
  const sinContar = pintarMovil(linea());
  assert.doesNotMatch(sinContar, /→/, "apareció la flecha sobre una línea sin contar");
});

test("F15. UN NO DECLARADO NO LLEVA FLECHA: no tiene remito contra el cual comparar", () => {
  const t = pintarMovil(
    linea({
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 13,
      subtotal: 0,
      subtotalRecibido: 32500,
    })
  );
  assert.match(t, /\$32\.500,00/);
  assert.doesNotMatch(t, /→/, "una agregada no puede mostrar un 'antes' que no existe");
  assert.doesNotMatch(t, /\$0,00/, "volvió a dibujar el cero del remito");
});

test("F9. LA FILA DE ESCRITORIO NO MUESTRA DINERO, y ya no puede hacerlo", () => {
  // Antes esto se garantizaba con un default en `false`. Ahora es más fuerte: la
  // rama del dinero no existe en esa fila, así que no hay prop que la encienda.
  const t = pintarEscritorio(linea());
  assert.doesNotMatch(t, /\$/, "la fila de dinero se coló en escritorio");
  // Y lo que escritorio ya mostraba sigue estando.
  assert.match(t, /AMARGO OBRERO 950ML/);
  assert.match(t, /Enviado 2 PACK x6/);
});

test("F10. NADIE PUEDE VOLVER A ENCENDER EL DINERO EN ESCRITORIO", () => {
  const fuente = codigoDe("components/transferencias/WorkspaceRecepcion.jsx");
  assert.ok(
    !fuente.includes("conImporte"),
    "volvió la prop que encendía la fila de dinero en la fila compartida"
  );
  // La fila compartida no formatea plata. Si lo hiciera, escritorio estaría a
  // una prop de mostrar un importe que no le corresponde.
  assert.ok(
    !/fmtMoneda\(d\.(precioCosto|subtotal)\)/.test(fuente),
    "la fila compartida volvió a formatear importes"
  );
});

// ── LA GEOMETRÍA: LO QUE IMPIDE QUE LA TARJETA SE PARTA ───────────────────

test("F11. LA FILA DEL IMPORTE NO SE PARTE EN DOS RENGLONES", () => {
  // La izquierda RECORTA y la derecha nunca: el total es el número que se va a
  // leer. Sin esto, la tarjeta de un cajón con un importe largo queda más alta
  // que la de una unidad, que es lo que el diseño pide evitar.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.match(fuente, /min-w-0 truncate/);
  assert.match(fuente, /shrink-0 whitespace-nowrap/);
});

test("F12. NI LA TARJETA NI LA FILA TIENEN UN COLOR ESCRITO A MANO", () => {
  for (const rel of [
    "components/transferencias/TarjetaRecepcionMovil.jsx",
    "components/transferencias/WorkspaceRecepcion.jsx",
  ]) {
    const fuente = codigoDe(rel);
    assert.doesNotMatch(fuente, /#[0-9a-fA-F]{3,8}\b/, `${rel} tiene un hex escrito a mano`);
    assert.doesNotMatch(fuente, /\brgba?\(/, `${rel} tiene un rgb escrito a mano`);
  }
});
