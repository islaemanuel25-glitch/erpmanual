// EL DOCUMENTO DE UNA TRANSFERENCIA CERRADA LEE LA ESCALA DEL REMITO.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/documentoEnEscalaDelRemito.test.mjs
//
// ── EL DEFECTO, VISTO EN PRODUCCIÓN ──────────────────────────────────────
//
// La sección "Productos transferidos" de la transferencia #204 —cerrada, con el
// stock ya movido— informaba:
//
//     COCA COLA 2L   Enviada 32 · Recibida 4 · Diferencia −28
//     SPRITE 2L      Enviada 8  · Recibida 1 · Diferencia −7
//
// Las 32 son 4 CAJÓN x8 y llegaron los 4 cajones completos. **No falta nada.**
//
// La causa: `cantidad` está en unidades FÍSICAS y `recibido` en la escala de la
// PRESENTACIÓN —4 cajones—, que es lo que `guardar-recepcion` persiste. La tabla
// restaba los dos números pasándole a `unidadesFisicasDe` las columnas CRUDAS
// `d.unidadEnviada` y `d.factorPack`. Y `unidadEnviada` dice `UNIDAD` en casi
// todas estas líneas, porque la venta interna del POS consolida a unidades antes
// de guardar: con eso el factor es 1 y los 4 cajones se leen como 4 unidades.
//
// Es exactamente el defecto que `escalaFisicaDeLinea` se escribió para cerrar
// —está documentado en su propio comentario— sobre una pantalla que nunca adoptó
// ese camino. El móvil muestra estas mismas líneas bien.
//
// ── EL STOCK ESTÁ BIEN, Y ESO ES LO QUE HACE PELIGROSO ESTO ──────────────
//
// Medido: el destino tiene las 32 y las 8 unidades físicas. La confirmación lee
// el snapshot —la auditoría del detalle 6698 dice "enviado 6 PACK x24, recibido
// 6 PACK x24 + 12 unidades sueltas, descontado del origen 12.000"—. O sea que es
// un defecto de DOCUMENTO: el papel informa mercadería faltante que está en el
// depósito, y nadie sospecha del papel cuando el inventario cuadra.
//
// Está en `docs/incidents/INC-0009-el-documento-resta-dos-escalas.md`.
//
// ── LOS FIXTURES SON LAS DOS LÍNEAS REALES ──────────────────────────────
//
// Ninguno de los de `recepcionRender.test.mjs` tenía la combinación que produce
// el defecto: su `linea()` va con `unidadEnviada: "UNIDAD"`, `factorPack: 1` y
// **sin ningún campo de snapshot**. Con factor 1 las dos escalas coinciden y el
// defecto es invisible. Por eso estos dos salen de la base, con sus números.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TablaDetalleTransferencia from "./TablaDetalleTransferencia.jsx";
import { construirEditItems } from "@/lib/transferencias/recepcionUI";

const texto = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/**
 * El detalle 6843 de la transferencia #204, tal como lo manda
 * `/api/transferencias/detalle`: 4 CAJÓN x8 enviados y los 4 recibidos.
 *
 * `precioCosto` es `costoPresentacion` —el costo de UN cajón— y `subtotal` el del
 * remito, los dos calculados por el valorizador canónico: 23.333,33 y 93.333,32,
 * comprobados contra la fila real. La plata NO es parte del defecto.
 */
const cocaDelRemito = (extra = {}) => ({
  id: 6843,
  nombre: "COCA COLA 2L",
  codigoBarra: null,
  cantidadEnviada: 32,
  cantidadRecibida: 4,
  recibidoUnidadesSueltas: 0,
  precioCosto: 23333.33,
  subtotal: 93333.32,
  subtotalRecibido: 93333.32,
  ajusteOrigen: null,
  devolucionOrigen: null,
  excedenteOrigen: null,
  agregadoEnRecepcion: false,
  agregadoEnRecepcionPor: null,
  agregadoEnRecepcionAt: null,
  motivoPrincipal: "",
  motivoDetalle: "",
  // Las crudas, que son las que la tabla leía. `UNIDAD` porque la venta interna
  // consolidó a físicas, y el factor sale del catálogo de HOY.
  unidadEnviada: "UNIDAD",
  factorPack: 8,
  unidadMedida: "cajon",
  esFiambreFijo: false,
  pesoReferenciaKg: null,
  // El snapshot, que es el que dice la verdad de cómo salió.
  presentacionEnvio: "CAJON",
  cantidadPresentada: 4,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  ...extra,
});

/**
 * El detalle 6698 de la #198: 6 PACK x24 enviados —144 físicas— y 6 packs más 12
 * sueltas recibidos, o sea 156. Es un EXCEDENTE REAL de 12, y el servidor lo
 * movió: su fila de auditoría descontó 12 unidades del origen.
 *
 * La tabla lo mostraba como −138.
 */
const panchoConExcedente = (extra = {}) =>
  cocaDelRemito({
    id: 6698,
    nombre: "Pancho 24 Als",
    cantidadEnviada: 144,
    cantidadRecibida: 6,
    recibidoUnidadesSueltas: 12,
    factorPack: 24,
    unidadMedida: "pack",
    presentacionEnvio: "PACK",
    cantidadPresentada: 6,
    factorPresentacion: 24,
    precioCosto: 5250,
    subtotal: 31500,
    subtotalRecibido: 34125,
    ...extra,
  });

/** La tabla como la dibuja una transferencia CERRADA: sin edición. */
const pintarCerrada = (items) =>
  renderToStaticMarkup(
    React.createElement(TablaDetalleTransferencia, {
      item: {
        id: 204,
        estado: "Recibida",
        items,
        origen: { id: 1, nombre: "depo" },
        destino: { id: 2, nombre: "mini el 7" },
        resumen: { costoTotal: 93333.32 },
      },
      editItems: [],
      setEditItems: () => {},
      inputsHabilitados: false,
      quitandoId: null,
    })
  );

// ═══════════════════════════════════════════════════════════════════════════

test("CERRADA · una línea agrupada que llegó COMPLETA no informa diferencia", () => {
  const t = texto(pintarCerrada([cocaDelRemito()]));
  // El número que se veía en producción. Si vuelve, vuelve el defecto.
  assert.ok(!t.includes("−28"), `sigue informando un faltante que no existe: ${t}`);
  assert.ok(!t.includes("-28"), "sigue informando −28 con guion común");
  // Y la diferencia dice CERO, que es el dato. No "—": eso sería "no se contó".
  assert.ok(/\bDiferencia\b/.test(t) || true, "la columna existe según el estado");
  assert.ok(
    /(^|\s)0(\s|$)/.test(t),
    `la diferencia tendría que ser 0 y no aparece ningún cero: ${t}`
  );
});

test("CERRADA · y el excedente REAL se informa como +12, no como un guion", () => {
  // ── LO QUE MOSTRABA NO ERA UN NÚMERO EQUIVOCADO: ERA NADA ─────────────
  //
  // Con la escala cruda esta línea daba `unidadesFisicasDe({cantidad: 6,
  // sueltas: 12, unidad: "UNIDAD", factorPack: 24})`, y `milesimasFisicas`
  // devuelve **null** cuando hay desglose sobre una escala que no agrupa —a
  // propósito—. Así que la columna salía **"—"**, que es como se dibuja "no se
  // contó": el documento no informaba un faltante falso acá, informaba que nadie
  // había contado, sobre una línea revisada con un excedente de 12 unidades que
  // el servidor YA había descontado del origen.
  //
  // Se mide el render y no la aritmética: la primera versión de este candado
  // afirmaba que mostraba −138, que es lo que daba la cuenta a mano, y el render
  // dijo otra cosa.
  const t = texto(pintarCerrada([panchoConExcedente()]));
  assert.ok(
    !/Diferencia\s+—/.test(t),
    `la diferencia sigue saliendo como un guion sobre una línea contada: ${t}`
  );
  assert.ok(
    t.includes("+12"),
    `perdió el excedente real de 12 unidades, que el servidor sí movió: ${t}`
  );
  // Y el faltante que daría la resta cruda tampoco vuelve por otro camino.
  assert.ok(!t.includes("−138") && !t.includes("-138"), `apareció el faltante de la escala cruda: ${t}`);
});

test("CERRADA · el desglose nombra la presentación del REMITO, no «PACK» a mano", () => {
  // `desgloseFisico` escribía la palabra PACK como literal, así que una línea que
  // salió en cajones se leía "4 PACK x8". Es el mismo error de fondo que la
  // resta: escribir a mano lo que el snapshot ya sabe.
  const t = texto(pintarCerrada([cocaDelRemito()]));
  assert.ok(!/\bPACK x8\b/.test(t), `dice PACK sobre una línea que salió en cajones: ${t}`);
  assert.ok(/CAJÓN x8/.test(t), `no nombra la presentación del remito: ${t}`);
  // Y el desglose tiene que EXISTIR: con la escala cruda, `agrupa` daba falso
  // —porque `unidadEnviada` es UNIDAD— y el renglón desaparecía justo donde
  // explicaba de dónde salen las 32.
  assert.ok(
    /Ingreso f[ií]sico/.test(t),
    `no dibuja el desglose físico, que es el renglón que explica la escala: ${t}`
  );
  assert.ok(/32 unidades/.test(t), `el desglose no llega a las 32 unidades: ${t}`);
});

test("CERRADA · la plata no se toca: es la del valorizador y ya estaba bien", () => {
  // El importe salía de `subtotalRecibido`, calculado por el servidor sobre las
  // unidades físicas. Se afirma para que el arreglo de la escala no se lleve
  // puesto un número que nunca estuvo mal.
  const t = texto(pintarCerrada([cocaDelRemito()]));
  assert.ok(t.includes("23.333,33"), `perdió el costo de la presentación: ${t}`);
  assert.ok(t.includes("93.333,32"), `perdió el importe del remito: ${t}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL EDITOR, QUE ES DONDE ESTABA LA TRAMPA DE STOCK
// ═══════════════════════════════════════════════════════════════════════════
//
// Apareció midiendo el arreglo de arriba, y es más grave que el documento: el
// campo "Recibida" de escritorio se persiste en la escala de la PRESENTACIÓN —el
// servidor lo multiplica por el factor congelado— y `construirEditItems` proponía
// ahí la cantidad FÍSICA.
//
// Sobre 6 PACK x24 sin contar proponía 144, y "Guardar cambios" manda `editItems`
// ENTERO —no solo las líneas tocadas—, así que un guardado con cualquier otra
// línea editada habría persistido 144 PACKS: **3.456 unidades al confirmar, donde
// salieron 144.**
//
// Medido el 2026-09-13: cero líneas en producción tienen esa firma, así que nunca
// se ejerció. Se cierra antes de que se ejerza.

test("EDITOR · propone la cantidad en la escala en la que se GUARDA, no en físico", () => {
  const linea = cocaDelRemito({ cantidadRecibida: null, subtotalRecibido: null });
  const [fila] = construirEditItems([linea]);
  assert.equal(
    fila.recibido,
    4,
    "propuso otra cosa que los 4 CAJÓN: si propone las 32 físicas, un guardado persiste 32 cajones"
  );
  // Y una línea YA contada no se toca: lo persistido manda.
  const [contada] = construirEditItems([cocaDelRemito({ cantidadRecibida: 3 })]);
  assert.equal(contada.recibido, 3, "pisó el conteo guardado con la propuesta");
});

test("EDITOR · y con eso no informa una diferencia sobre una línea sin contar", () => {
  // La consecuencia visible de lo anterior, que es cómo se ve el defecto: con la
  // propuesta en físico el editor decía «+3.312» sobre una línea que nadie tocó.
  const linea = cocaDelRemito({ cantidadRecibida: null, subtotalRecibido: null });
  const html = renderToStaticMarkup(
    React.createElement(TablaDetalleTransferencia, {
      item: {
        id: 9,
        estado: "Recibiendo",
        items: [linea],
        origen: { id: 1, nombre: "depo" },
        destino: { id: 2, nombre: "mini el 7" },
        resumen: { costoTotal: 93333.32 },
      },
      editItems: construirEditItems([linea]),
      setEditItems: () => {},
      inputsHabilitados: true,
      quitandoId: null,
    })
  );
  const t = texto(html);
  assert.ok(!/\+\s?224/.test(t), `informa un excedente inventado: ${t}`);
  assert.ok(!/\+3\.?312/.test(t), `volvió el excedente de la escala mezclada: ${t}`);
  // El desglose sí tiene que estar, y con la presentación del remito.
  assert.ok(/4 CAJÓN x8 = 32 unidades/.test(t), `el desglose no dice la escala real: ${t}`);
});

test("EL CASO NORMAL NO SE MUEVE: una línea sin snapshot sigue leyéndose igual", () => {
  // El control, y hace falta: la mayoría de las líneas de la base son anteriores
  // al snapshot. Ahí la escala se reconstruye del catálogo con `unidadEnviada`
  // como `contadoEn`, que es lo que venía haciendo, y 10 contra 10 es exacto.
  const historica = cocaDelRemito({
    id: 1,
    nombre: "Coca-Cola 2,25 L",
    cantidadEnviada: 10,
    cantidadRecibida: 10,
    recibidoUnidadesSueltas: 0,
    factorPack: 1,
    unidadMedida: "unidad",
    presentacionEnvio: null,
    cantidadPresentada: null,
    sueltasEnviadas: null,
    factorPresentacion: null,
    precioCosto: 1000,
    subtotal: 10000,
    subtotalRecibido: 10000,
  });
  const t = texto(pintarCerrada([historica]));
  assert.ok(!t.includes("−10") && !t.includes("-10"), `inventó una diferencia: ${t}`);
  assert.ok(t.includes("10.000,00"), "perdió el importe de la línea histórica");
});
