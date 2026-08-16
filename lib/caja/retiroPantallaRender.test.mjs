// RENDER REAL de la pantalla de retiro de recaudación.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/retiroPantallaRender.test.mjs
//
// POR QUÉ EXISTE
//
// Ya pasó una vez: un identificador usado sin importar compiló, pasó el lint,
// pasaron más de mil pruebas y reventó en producción, porque ninguna prueba
// EJECUTABA ese JSX. Leer el archivo como texto y buscar la palabra no sirve.
//
// Los tres bloques viven en components/caja/PanelesRetiro para poder
// renderizarlos acá con datos armados a mano, sin DOM, sin fetch y sin
// dependencias nuevas: el JSX lo transforma el SWC que Next ya trae.
//
// Además fijan el contrato del flujo corregido: NO hay pasos, NO se pregunta
// cuánto retirar, y el conteo y el cambio se ven juntos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import {
  PanelConteo,
  PanelCambio,
  PanelResumen,
  ResumenCabecera,
  PanelMovimientos,
} from "@/components/caja/PanelesRetiro";
import GrillaCambio from "@/components/caja/GrillaCambio";
import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import {
  GRID_CONTEO,
  GRID_CAMBIO,
  BOTON_PASO,
  HUECO_BOTON,
  CABECERA_BLOQUE,
  BLOQUE_ALINEADO,
  importeGrilla,
} from "@/components/caja/geometriaGrilla";
import { CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));

/** El caso del pedido: 150.450 contado, 30.450 de cambio, 120.000 de retiro. */
const CONTADO = { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 };
const CAMBIO = { 20000: 1, 10000: 1, [CLAVE_MONEDAS]: 450 };

const propsConteo = (extra = {}) => ({
  desglose: CONTADO,
  onDesglose() {},
  ...extra,
});

const propsCambio = (extra = {}) => ({
  desgloseContado: CONTADO,
  desgloseCambio: CAMBIO,
  totalCambio: 30450,
  onDesgloseCambio() {},
  ...extra,
});

const propsResumen = (extra = {}) => ({
  esperado: 158450,
  totalContado: 150450,
  hayContado: true,
  totalCambio: 30450,
  totalRetiro: 120000,
  diferencia: -8000,
  observacion: "",
  puedeConfirmar: true,
  onObservacion() {},
  onConfirmar() {},
  onGuardar() {},
  onVolver() {},
  ...extra,
});

const TODO = () =>
  [
    render(PanelConteo, propsConteo()),
    render(PanelCambio, propsCambio()),
    render(PanelResumen, propsResumen()),
    render(ResumenCabecera, {
      esperado: 158450,
      totalContado: 150450,
      hayContado: true,
      diferencia: -8000,
      totalCambio: 30450,
      totalRetiro: 120000,
    }),
  ].join("");

// ── 20. El JSX se ejecuta de verdad ────────────────────────────────────────

test("20. los tres bloques renderizan sin ReferenceError, en los dos modos", () => {
  assert.doesNotThrow(() => TODO());
});

test("20b. renderizar con props vacías tampoco rompe", () => {
  // El primer render ocurre antes de que responda el servidor: todo undefined.
  assert.doesNotThrow(() => {
    render(PanelConteo, { onDesglose() {} });
    render(PanelCambio, { onDesgloseCambio() {} });
    render(PanelResumen, { onConfirmar() {}, onGuardar() {}, onVolver() {} });
    render(ResumenCabecera, {});
    render(GrillaCambio, { onCambiar() {} });
  });
});

// ── 1. No hay pasos ────────────────────────────────────────────────────────

test("1. no existen pasos, ni Anterior ni Siguiente", () => {
  const html = TODO();
  assert.doesNotMatch(html, />\s*Anterior\s*</, "quedó el botón Anterior");
  assert.doesNotMatch(html, />\s*Siguiente\s*</, "quedó el botón Siguiente");
  assert.doesNotMatch(html, /1\.\s*Contar efectivo/, "quedó el indicador de paso 1");
  assert.doesNotMatch(html, /2\.\s*Definir retiro/, "quedó el indicador de paso 2");
  assert.doesNotMatch(html, /3\.\s*Confirmar/, "quedó el indicador de paso 3");
  assert.doesNotMatch(html, /aria-current="step"/, "quedó marcado un paso activo");
});

test("1b. el código de la pantalla no conserva estado de paso", () => {
  const fuentes = [
    "app/modulos/pos-ventas/retiros/nuevo/page.jsx",
    "components/caja/PanelesRetiro.jsx",
  ].map((f) => readFileSync(f, "utf8"));
  for (const s of fuentes) {
    const sinComentarios = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(sinComentarios, /\bpasoActual\b/, "quedó pasoActual");
    assert.doesNotMatch(sinComentarios, /setPaso\b/, "quedó setPaso");
  }
});

// ── 2. Conteo y cambio juntos ──────────────────────────────────────────────

test("2. el conteo y el cambio aparecen juntos, cada uno con su título", () => {
  const conteo = render(PanelConteo, propsConteo());
  const cambio = render(PanelCambio, propsCambio());
  assert.match(conteo, /Contar todo el efectivo del cajón/);
  assert.match(cambio, /Billetes que quedan como cambio/);
  // El título exacto pedido, y sin la palabra "fondo" en el bloque del cambio.
  assert.doesNotMatch(cambio, /[Ff]ondo/, "el bloque del cambio no debe hablar de fondo");
});

test("2d. en toda la pantalla se dice 'cambio', nunca 'fondo'", () => {
  // "Fondo" es el vocabulario del flujo anterior, donde el retiro se calculaba
  // contra un objetivo. Acá lo que queda es el CAMBIO para dar vuelto.
  const fuentes = [
    "app/modulos/pos-ventas/retiros/nuevo/page.jsx",
    "components/caja/PanelesRetiro.jsx",
    "components/caja/GrillaCambio.jsx",
  ].map((f) => readFileSync(f, "utf8"));

  for (const s of fuentes) {
    // Solo el texto visible: los comentarios explican por qué cambió el nombre.
    const visible = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(visible, /Fondo de referencia/, "quedó 'Fondo de referencia' visible");
    assert.doesNotMatch(visible, /Cambio que quedará/, "el rótulo tiene que ser 'Cambio que queda'");
  }

  // Y el rótulo unificado sí está.
  const cabecera = render(ResumenCabecera, { totalCambio: 30450 });
  assert.match(cabecera, /Cambio que queda/);
  assert.doesNotMatch(cabecera, /Cambio que quedará/);
});

test("2b. la grilla del cambio muestra contadas junto a las que quedan", () => {
  const html = render(GrillaCambio, {
    desgloseContado: CONTADO,
    desgloseCambio: CAMBIO,
    onCambiar() {},
  });
  assert.match(html, /Contadas/);
  assert.match(html, /Quedan/);
  assert.match(html, /\$20\.000/);
  assert.match(html, /Monedas \/ otros/);
  // La ayuda que explica la operación.
  const panel = render(PanelCambio, propsCambio());
  assert.match(panel, /Elegí los billetes y monedas que quedan en el cajón\. Todo lo demás se retira\./);
});

test("2c. el botón + se apaga cuando ya se dejan todas las contadas", () => {
  // Contó 1 de $10.000 y deja 1: no puede dejar otra.
  const html = render(GrillaCambio, {
    desgloseContado: { 10000: 1 },
    desgloseCambio: { 10000: 1 },
    onCambiar() {},
  });
  const fila = html.match(/aria-label="Dejar un billete más de \$10\.000"[^>]*/)[0];
  assert.match(fila, /disabled/, "el + debería estar deshabilitado en el tope");
});

// ── 3, 4 y 5. El retiro se calcula, no se elige ────────────────────────────

test("3. el total a retirar se muestra como resultado, no como campo", () => {
  const html = render(PanelResumen, propsResumen());
  assert.match(html, /Total a retirar/);
  assert.match(html, /120\.000,00/);
  // Ningún input lleva el retiro.
  const inputs = [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
  for (const i of inputs) {
    assert.doesNotMatch(i, /id="importe-retiro"/, "apareció el campo manual de retiro");
    assert.doesNotMatch(i, /id="retiro-/, "apareció un selector de billetes a retirar");
  }
});

test("4. no existe campo manual de importe a retirar", () => {
  const html = TODO();
  assert.doesNotMatch(html, /id="importe-retiro"/);
  assert.doesNotMatch(html, /Ingresar importe a retirar/);
  assert.doesNotMatch(html, /sugerido/i, "no se sugiere cuánto retirar");
});

test("5. no existe selector de billetes a retirar", () => {
  const html = TODO();
  assert.doesNotMatch(html, /Seleccionar billetes a retirar/);
  assert.doesNotMatch(html, /Billetes que salen del cajón/);
  assert.doesNotMatch(html, /id="retiro-\d+"/);
  // EL `.*` NO PUEDE CRUZAR DE UNA ETIQUETA A OTRA.
  //
  // Esto decía `/Dejar un billete.*retirar/`, y lo que buscaba es un rótulo que
  // diga las dos cosas juntas — "dejar un billete … a retirar" —, o sea un
  // selector de billetes de retiro. Pero `.*` no sabe de etiquetas: enganchaba
  // el "Dejar un billete menos de $20.000" de la grilla del CAMBIO, que es
  // legítimo, con cualquier "retirar" que apareciera miles de caracteres
  // después, en otro nodo.
  //
  // Pasaba en verde por un accidente de formato: el `class` de `SunmiCard` se
  // escribía con saltos de línea, y `.` no cruza un `\n`. Esos saltos partían el
  // HTML y le cortaban el paso al `.*`. Al negociar los ejes de la pieza el
  // atributo quedó en una línea, el `.*` pudo estirarse, y el candado se puso
  // rojo sin que nadie tocara esta pantalla.
  //
  // O sea que durante todo este tiempo NO afirmaba lo que dice: lo sostenía el
  // formato de un componente de otro módulo. Acotado a `[^<>"]*` vuelve a mirar
  // un rótulo solo, que es lo que siempre quiso mirar.
  assert.doesNotMatch(html, /Dejar un billete[^<>"]*retirar/);
});

test("5b. ningún texto sugiere elegir cuánto retirar", () => {
  const html = TODO();
  for (const prohibido of [/cuánto retirar/i, /Retiro parcial/, /Cierre final/, /Definir retiro/]) {
    assert.doesNotMatch(html, prohibido, `texto prohibido: ${prohibido}`);
  }
});

// ── 9. Retiro cero ─────────────────────────────────────────────────────────

test("9. contado igual al cambio: se avisa y no se puede confirmar", () => {
  const html = render(
    PanelResumen,
    propsResumen({
      totalContado: 30000,
      totalCambio: 30000,
      totalRetiro: 0,
      sinRecaudacion: true,
      puedeConfirmar: false,
    })
  );
  assert.match(html, /No hay recaudación para retirar/);
  const boton = html.match(/<button[^>]*>[^<]*Confirmar retiro/);
  assert.ok(boton, "falta el botón de confirmar");
  assert.match(boton[0], /disabled/, "el botón tiene que estar deshabilitado");
});

// ── 14. Revalidación ───────────────────────────────────────────────────────

test("14. el aviso de movimientos dice qué pasó y no toca lo contado", () => {
  const html = render(
    PanelResumen,
    propsResumen({
      cambios: {
        hayCambios: true,
        ventasNuevas: true,
        otroRetiro: false,
        ventasAgregadas: 3,
        esperadoAnterior: 158450,
        esperadoActual: 166450,
        diferenciaEsperado: 8000,
      },
    })
  );
  assert.match(html, /Hubo movimientos mientras preparabas el retiro/);
  assert.match(html, /158\.450,00/);
  assert.match(html, /166\.450,00/);
  assert.match(html, /Entraron 3 ventas nuevas/);
  assert.match(html, /No tocamos lo que contaste/);
  assert.match(html, /Confirmar con el valor nuevo/);
});

test("14b. un retiro concurrente se nombra distinto de una venta", () => {
  const html = render(
    PanelResumen,
    propsResumen({
      cambios: {
        hayCambios: true,
        ventasNuevas: false,
        otroRetiro: true,
        ventasAgregadas: 0,
        esperadoAnterior: 158450,
        esperadoActual: 38450,
        diferenciaEsperado: -120000,
      },
    })
  );
  assert.match(html, /Se registró otro retiro en esta caja/);
  assert.doesNotMatch(html, /Entraron 0 ventas/);
});

// ── Advertencia operativa y hora del conteo ────────────────────────────────

test("A1. la pantalla advierte el riesgo físico sin bloquear las ventas", () => {
  const html = render(PanelConteo, propsConteo());
  assert.match(html, /Mientras contás, no deben mezclarse nuevas ventas en el efectivo ya contado\./);
});

test("A2. se muestra la hora en que empezó el conteo", () => {
  const html = render(PanelConteo, propsConteo({ horaConteo: "14:32" }));
  assert.match(html, /Conteo iniciado a las 14:32/);
});

// ── Pestaña nueva ──────────────────────────────────────────────────────────

test("17b. en pestaña aparte, guardar y cerrar son acciones distintas", () => {
  // En una pestaña propia no hay adónde "volver": el POS nunca se fue. Ofrecer
  // "Guardar y volver al POS" ahí sugeriría que hay que abandonar esta pantalla
  // para seguir vendiendo, que es justo lo contrario de lo que pasa.
  const enPestana = render(PanelResumen, propsResumen({ enPestanaNueva: true }));
  assert.match(enPestana, /Guardar borrador/);
  assert.match(enPestana, /Cerrar esta pestaña/);
  assert.doesNotMatch(enPestana, /Guardar y volver al POS/);

  const enLaMisma = render(PanelResumen, propsResumen({ enPestanaNueva: false }));
  assert.match(enLaMisma, /Guardar y volver al POS/);
  assert.doesNotMatch(enLaMisma, /Cerrar esta pestaña/);
  assert.doesNotMatch(enLaMisma, /Guardar borrador/);
});

// ── Denominaciones y themes ────────────────────────────────────────────────

test("D1. las denominaciones desplegadas son las vigentes, sin $5.000", () => {
  const html = render(GrillaCambio, { desgloseContado: CONTADO, desgloseCambio: {}, onCambiar() {} });
  for (const d of ["$20.000", "$10.000", "$2.000", "$1.000", "$500", "$200", "$100"]) {
    assert.ok(html.includes(d), `falta ${d}`);
  }
  assert.equal(html.includes("$5.000"), false, "apareció un billete de $5.000");
});

test("D2. 'Monedas / otros' se carga como importe, con decimales", () => {
  const html = render(GrillaCambio, { desgloseContado: {}, desgloseCambio: {}, onCambiar() {} });
  const campo = html.match(/<input[^>]*id="cambio-monedas"[^>]*>/)[0];
  assert.match(campo, /step="0\.01"/, "debería aceptar centavos");
  assert.match(campo, /inputMode="decimal"/);
  // Y no tiene botones de ±1: no es una cantidad.
  assert.doesNotMatch(html, /aria-label="Dejar un billete más de Monedas/);
});

test("T1. el color sale de tokens semánticos, no de clases fijas", () => {
  const claseCard = renderToStaticMarkup(createElement(SunmiCard, {})).match(/class="([\s\S]*?)"/)[1];
  const prefijoCard = claseCard.slice(0, 45);
  const propias = [...TODO().matchAll(/class="([\s\S]*?)"/g)]
    .map((m) => m[1])
    .filter((c) => !c.startsWith(prefijoCard))
    .join(" ");

  const colorFijo = /\b(?:text|bg|border)-(?:red|green|blue|amber|yellow|emerald|slate|gray|zinc)-\d{2,3}\b/;
  const encontrado = propias.match(colorFijo);
  assert.equal(encontrado, null, `color hardcodeado: ${encontrado?.[0]}`);
  assert.match(propias, /sunmi-text-/);
});

test("T2. la pantalla nunca vuelve a hablar de arqueo", () => {
  assert.doesNotMatch(TODO(), /[Aa]rqueo/);
});

// ── Geometría de las grillas: ancho estable, columnas compartidas ───────────
//
// Medido en producción a 360 px: la última columna era `auto`, así que la del
// subtotal pasaba de 40,4 px a 74,1 px al cargar un billete y le sacaba esos
// 33,7 px al input, que encogía de 78,6 a 44,9. Cada fila terminaba con un ancho
// distinto según el número que mostraba.

test("G1. la última columna NO puede ser 'auto': el subtotal empujaría el input", () => {
  for (const plantilla of [GRID_CONTEO, GRID_CAMBIO]) {
    const cols = plantilla.match(/grid-cols-\[([^\]]+)\]/g) || [];
    assert.ok(cols.length >= 2, "faltan las plantillas de móvil y de sm");
    for (const c of cols) {
      const partes = c.replace(/.*\[|\]/g, "").split("_");
      assert.notEqual(partes[partes.length - 1], "auto", `la última columna es auto en ${c}`);
      assert.match(partes[partes.length - 1], /rem$/, "el subtotal necesita un ancho fijo");
    }
  }
});

test("G2. las dos grillas comparten primera y última columna", () => {
  const cols = (plantilla) =>
    (plantilla.match(/grid-cols-\[([^\]]+)\]/g) || []).map((c) => c.replace(/.*\[|\]/g, "").split("_"));
  const conteo = cols(GRID_CONTEO);
  const cambio = cols(GRID_CAMBIO);
  assert.equal(conteo.length, cambio.length, "distinta cantidad de breakpoints");
  for (let i = 0; i < conteo.length; i++) {
    assert.equal(conteo[i][0], cambio[i][0], "la columna de la denominación difiere");
    assert.equal(
      conteo[i][conteo[i].length - 1],
      cambio[i][cambio[i].length - 1],
      "la columna del subtotal difiere"
    );
  }
});

test("G3. una sola columna flexible por grilla: el resto son anchos fijos", () => {
  for (const plantilla of [GRID_CONTEO, GRID_CAMBIO]) {
    for (const c of plantilla.match(/grid-cols-\[([^\]]+)\]/g) || []) {
      const partes = c.replace(/.*\[|\]/g, "").split("_");
      const flexibles = partes.filter((p) => p.includes("fr"));
      assert.equal(flexibles.length, 1, `esperaba un solo 1fr en ${c}`);
      assert.equal(flexibles[0], "1fr");
    }
  }
});

test("G4. el hueco de la fila de monedas usa las MISMAS clases que un botón", () => {
  // Con un <span> del mismo ancho declarado quedaba 3,5 px más angosto de cada
  // lado y el input de monedas salía corrido. Mismo elemento, mismas clases.
  assert.ok(HUECO_BOTON.startsWith(BOTON_PASO), "el hueco no comparte las clases del botón");
  assert.match(HUECO_BOTON, /invisible/);
  assert.match(HUECO_BOTON, /pointer-events-none/);
});

test("G5. el importe de la grilla no lleva '\$': el ancho se reserva para el número", () => {
  assert.equal(importeGrilla(140000), "140.000,00");
  assert.equal(importeGrilla(0), "0,00");
  assert.equal(importeGrilla(null), "0,00");
  assert.doesNotMatch(importeGrilla(1234.5), /\$/);
});

test("G6. las dos grillas renderizan con la misma plantilla en cada fila", () => {
  const conteo = render(TablaDenominaciones, { desglose: { 20000: 3 }, onCambiar() {} });
  const cambio = render(GrillaCambio, {
    desgloseContado: { 20000: 3 },
    desgloseCambio: { 20000: 1 },
    onCambiar() {},
  });
  // Cada fila de billete, la de monedas y el encabezado usan la MISMA clase.
  const usos = (html, plantilla) => html.split(plantilla).length - 1;
  assert.equal(usos(conteo, GRID_CONTEO), 9, "7 billetes + monedas + encabezado");
  assert.equal(usos(cambio, GRID_CAMBIO), 9, "7 billetes + monedas + encabezado");
  // Y ninguna fila trae una plantilla propia. split/join y no RegExp: la clase
  // trae corchetes y puntos, que como patrón significarían otra cosa.
  assert.doesNotMatch(conteo.split(GRID_CONTEO).join(""), /grid-cols-\[/);
  assert.doesNotMatch(cambio.split(GRID_CAMBIO).join(""), /grid-cols-\[/);
});

test("G7. el subtotal se muestra siempre: no se oculta ni se recorta", () => {
  const html = render(TablaDenominaciones, { desglose: { 20000: 100 }, onCambiar() {} });
  assert.match(html, /2\.000\.000,00/, "un subtotal grande tiene que verse entero");
  assert.doesNotMatch(html, /overflow-x/, "no se resuelve con scroll horizontal");
  assert.doesNotMatch(html, /truncate[^"]*">\s*2\.000\.000/, "el subtotal no puede truncarse");
});

// ── Movimientos de caja ────────────────────────────────────────────────────

test("M1. muestra ingresos, retiros y neto de los movimientos manuales", () => {
  const html = render(PanelMovimientos, {
    movimientos: { ingresos: 700, retiros: 40000, neto: -39300, cantidad: 2 },
  });
  assert.match(html, /Movimientos de caja/);
  assert.match(html, /Ingresos manuales/);
  assert.match(html, /700,00/);
  assert.match(html, /Retiros manuales/);
  assert.match(html, /40\.000,00/);
  assert.match(html, /Neto movimientos/);
  assert.match(html, /39\.300,00/);
});

test("M2. sin movimientos, el estado vacío lo dice", () => {
  const html = render(PanelMovimientos, { movimientos: { ingresos: 0, retiros: 0, neto: 0, cantidad: 0 } });
  assert.match(html, /No hay ingresos ni retiros manuales en este turno\./);
  assert.doesNotMatch(html, /Neto movimientos/);

  // Y sin datos todavía tampoco inventa números.
  assert.doesNotThrow(() => render(PanelMovimientos, {}));
  assert.match(render(PanelMovimientos, {}), /No hay ingresos ni retiros manuales/);
});

test("M3. es informativo: no ofrece crear movimientos ni duplica Caja +/−", () => {
  const html = render(PanelMovimientos, {
    movimientos: { ingresos: 700, retiros: 40000, neto: -39300, cantidad: 2 },
  });
  assert.doesNotMatch(html, /<button/, "no puede tener botones de acción");
  assert.doesNotMatch(html, /Caja \+/, "no duplica el botón del POS");
  assert.doesNotMatch(html, /Nuevo movimiento|Agregar/i);
  // Y deja claro que los retiros de recaudación no están acá.
  assert.match(html, /No incluye los retiros de recaudación/);
});

// ── Texto: se dejó de hablar de "fondo" ────────────────────────────────────

test("X1. la ayuda del conteo explica que el total se calcula solo", () => {
  const html = render(PanelConteo, { desglose: {}, onDesglose() {} });
  assert.match(
    html,
    /Ingresá la cantidad de billetes de cada denominación\. El total se calcula automáticamente\./
  );
  assert.doesNotMatch(html, /Incluí el fondo/);
  assert.doesNotMatch(html, /[Ff]ondo/, "la palabra fondo no va más en esta pantalla");
});

// ── El conteo por monto total ya no existe ─────────────────────────────────

test("C1. no hay selector de modo ni campo para escribir el total", () => {
  const html = render(PanelConteo, propsConteo());
  assert.doesNotMatch(html, /Monto total/, "quedó el selector o el rótulo del modo manual");
  assert.doesNotMatch(html, /Contar billetes<\/button>/, "quedó el selector de modo");
  assert.doesNotMatch(html, /id="monto-total"/, "quedó el campo manual del total");
  assert.doesNotMatch(html, /aria-pressed/, "quedó el selector de modo");
});

test("C2. el total contado es solo lectura: ningún input lo recibe", () => {
  const html = render(PanelConteo, propsConteo());
  const inputs = [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
  // Los únicos campos son las cantidades por denominación y las monedas.
  for (const i of inputs) {
    assert.match(
      i,
      /id="conteo-(20000|10000|2000|1000|500|200|100|monedas)"/,
      `apareció un input que no es del desglose: ${i.slice(0, 80)}`
    );
  }
  assert.equal(inputs.length, 8, "7 denominaciones + monedas");
  // Y el total se muestra como texto.
  assert.match(html, /Total/);
  assert.match(html, /150\.450,00/);
});

test("C3. el total sale solo del desglose y se actualiza al cambiarlo", () => {
  const uno = render(PanelConteo, propsConteo({ desglose: { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 } }));
  assert.match(uno, /150\.450,00/, "7×20.000 + 1×10.000 + 450");

  const otro = render(PanelConteo, propsConteo({ desglose: { 20000: 8, 10000: 1, [CLAVE_MONEDAS]: 450 } }));
  assert.match(otro, /170\.450,00/, "un billete más cambia el total");
  assert.doesNotMatch(otro, /150\.450,00/);

  const vacio = render(PanelConteo, propsConteo({ desglose: {} }));
  assert.match(vacio, /\$ 0,00/);
});

test("C4. el código de la pantalla no conserva el modo ni el monto manual", () => {
  const fuentes = [
    "app/modulos/pos-ventas/retiros/nuevo/page.jsx",
    "components/caja/PanelesRetiro.jsx",
  ].map((f) => readFileSync(f, "utf8"));
  for (const s of fuentes) {
    const visible = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(visible, /\bmontoContado\b/, "quedó el estado del monto manual");
    assert.doesNotMatch(visible, /\bmodoConteo\b/, "quedó el estado del modo");
    assert.doesNotMatch(visible, /MODO_TOTAL|MODO_BILLETES/, "quedaron las constantes de modo");
  }
});

// ── Detalle de Movimientos de caja ─────────────────────────────────────────

const MOVS = [
  { id: 1, tipo: "INGRESO", monto: 700, motivo: "ajuste por sobrante", fecha: "2026-08-04T08:42:00Z" },
  { id: 2, tipo: "RETIRO", monto: 40000, motivo: "caja chica", fecha: "2026-08-04T11:09:00Z" },
  { id: 3, tipo: "RETIRO", monto: 1500, motivo: null, fecha: "2026-08-04T12:00:00Z" },
];
const conDetalle = (detalle) => ({
  ingresos: detalle.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + m.monto, 0),
  retiros: detalle.filter((m) => m.tipo === "RETIRO").reduce((s, m) => s + m.monto, 0),
  neto: 0,
  cantidad: detalle.length,
  detalle,
});

test("D1. cada movimiento muestra hora, tipo, motivo e importe", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  assert.match(html, /ajuste por sobrante/);
  assert.match(html, /caja chica/);
  assert.match(html, /Ingreso/);
  assert.match(html, /Retiro/);
  assert.match(html, /700,00/);
  assert.match(html, /40\.000,00/);
  // La hora sale del createdAt del movimiento.
  assert.match(html, /\d{2}:\d{2}/);
});

test("D2. un motivo vacío se dice, no se deja el renglón mudo", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  assert.match(html, /Sin motivo/);
});

test("D3. los ingresos y los retiros se distinguen por signo", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  assert.match(html, /\+ \$ 700,00/);
  assert.match(html, /− \$ 40\.000,00/);
});

test("D4. el orden es el que llega del servidor: cronológico", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  const pos = (t) => html.indexOf(t);
  assert.ok(pos("ajuste por sobrante") < pos("caja chica"), "no respetó el orden");
  assert.ok(pos("caja chica") < pos("Sin motivo"));
});

test("D5. con más de 3 movimientos se muestran 3 y se puede expandir", () => {
  const cinco = [
    ...MOVS,
    { id: 4, tipo: "INGRESO", monto: 100, motivo: "vuelto", fecha: "2026-08-04T13:00:00Z" },
    { id: 5, tipo: "RETIRO", monto: 200, motivo: "kiosco", fecha: "2026-08-04T14:00:00Z" },
  ];
  const html = render(PanelMovimientos, { movimientos: conDetalle(cinco) });
  assert.match(html, /Ver todos \(5\)/);
  // Los tres primeros se ven; los otros dos, no, hasta desplegar.
  assert.match(html, /ajuste por sobrante/);
  assert.doesNotMatch(html, /vuelto/, "el cuarto no debería verse todavía");
  assert.doesNotMatch(html, /kiosco/);
  // Y se despliega DENTRO del bloque: nada de modales.
  assert.doesNotMatch(html, /role="dialog"|fixed inset-0/);
});

test("D6. con 3 o menos no ofrece desplegar", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  assert.doesNotMatch(html, /Ver todos/);
});

test("D7. sin movimientos, el estado vacío y ningún detalle", () => {
  const html = render(PanelMovimientos, {
    movimientos: { ingresos: 0, retiros: 0, neto: 0, cantidad: 0, detalle: [] },
  });
  assert.match(html, /No hay ingresos ni retiros manuales en este turno\./);
  assert.doesNotMatch(html, /Sin motivo/);
  assert.doesNotMatch(html, /Ver todos/);
});

test("D8. sigue sin ofrecer crear movimientos desde esta pantalla", () => {
  const html = render(PanelMovimientos, { movimientos: conDetalle(MOVS) });
  assert.doesNotMatch(html, /Caja \+/, "no duplica el botón del POS");
  assert.doesNotMatch(html, /Nuevo movimiento|Agregar/i);
  assert.match(html, /No incluye los retiros de recaudación/);
});

// ── Alineación vertical de las dos grillas en escritorio ───────────────────
//
// Medido a 1280 y 1366: TODO el contenido del bloque de conteo caía 21 px por
// debajo del de cambio —encabezados, las siete denominaciones, la fila de
// monedas y el total, los nueve con el MISMO desfase—. Un corrimiento constante
// no viene de las filas, que miden igual, sino de una fila de más arriba: la
// grilla de conteo dibujaba su propio rótulo y la del cambio no.

test("V1. el rótulo de la grilla de conteo existe SOLO en móvil", () => {
  const html = render(TablaDenominaciones, {
    desglose: {},
    onCambiar() {},
    titulo: "Cantidad en el cajón",
  });
  // Sigue estando —móvil no cambia— pero oculto en escritorio, que es donde
  // corría las filas 21 px respecto de la grilla del cambio.
  assert.match(html, /Cantidad en el cajón/, "se perdió el rótulo de móvil");
  const fila = html.match(/<div[^>]*>Cantidad en el cajón<\/div>/)[0];
  assert.match(fila, /xl:hidden/, "el rótulo tiene que desaparecer en escritorio");

  // Y el encabezado de columnas, que sí es común, está en las dos.
  assert.match(html, /Billete/);
  assert.match(html, /Subtotal/);
});

test("V2. las dos grillas empiezan con la misma fila: el encabezado", () => {
  const conteo = render(TablaDenominaciones, { desglose: {}, onCambiar() {} });
  const cambio = render(GrillaCambio, { desgloseContado: {}, desgloseCambio: {}, onCambiar() {} });
  // Lo primero que hay dentro de cada grilla es su encabezado de columnas.
  const primeraClase = (html) => html.match(/class="([^"]*)"/)?.[1] ?? "";
  assert.match(primeraClase(conteo), /space-y-2/, "el contenedor externo no cambió");
  assert.ok(conteo.indexOf(GRID_CONTEO) < conteo.indexOf("Billete") + GRID_CONTEO.length + 200);
  assert.ok(cambio.indexOf(GRID_CAMBIO) < cambio.indexOf("Billete") + GRID_CAMBIO.length + 200);
  // Y las dos tienen la MISMA cantidad de filas: encabezado + 7 + monedas.
  assert.equal(conteo.split(GRID_CONTEO).length - 1, 9);
  assert.equal(cambio.split(GRID_CAMBIO).length - 1, 9);
});

test("V3. los dos bloques reservan la misma altura de cabecera y se estiran", () => {
  const conteo = render(PanelConteo, propsConteo());
  const cambio = render(PanelCambio, propsCambio());
  for (const html of [conteo, cambio]) {
    assert.ok(html.includes(CABECERA_BLOQUE), "falta la altura reservada de la cabecera");
    assert.ok(html.includes(BLOQUE_ALINEADO), "falta el estirado a la misma altura");
  }
  // Y el bloque de resumen NO se estira: es una columna independiente.
  const resumen = render(PanelResumen, propsResumen());
  assert.ok(!resumen.includes(BLOQUE_ALINEADO), "el resumen no debería estirarse");
  const movs = render(PanelMovimientos, { movimientos: null });
  assert.ok(!movs.includes(BLOQUE_ALINEADO), "movimientos no debería estirarse");
});

test("V4. la alineación es SOLO de escritorio: en móvil no aplica nada", () => {
  // Las dos clases están prefijadas con xl:, así que por debajo de 1280 el
  // layout queda exactamente como estaba.
  assert.match(CABECERA_BLOQUE, /^xl:/);
  assert.match(BLOQUE_ALINEADO, /^xl:/);
});

test("V5. no hay alturas mágicas por denominación ni spacers vacíos", () => {
  const fuentes = [
    "components/caja/TablaDenominaciones.jsx",
    "components/caja/GrillaCambio.jsx",
    "components/caja/geometriaGrilla.js",
  ].map((f) => readFileSync(f, "utf8"));

  for (const s of fuentes) {
    const visible = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Ninguna fila lleva su propio alto, ni margen suelto para acomodarla. El
    // `min-h` de la cabecera es lo único permitido y se cuenta abajo.
    assert.doesNotMatch(visible, /(?<!min-)\bh-\[\d/, "apareció una altura fija por fila");
    assert.doesNotMatch(visible, /\bmt-\[\d|\bmb-\[\d/, "apareció un margen mágico");
    assert.doesNotMatch(visible, /translate|absolute/, "se resolvió moviendo elementos");
  }
  // El único alto reservado está en un solo lugar y es el de la cabecera.
  const geo = readFileSync("components/caja/geometriaGrilla.js", "utf8");
  const altos = geo.match(/min-h-\[[^\]]+\]/g) || [];
  assert.equal(altos.length, 1, `esperaba una sola altura reservada, hay ${altos.length}`);
});

test("V6. la advertencia y la hora quedan FUERA de la grilla, después del total", () => {
  const html = render(PanelConteo, propsConteo({ horaConteo: "14:32" }));
  const finGrilla = html.lastIndexOf("Total");
  assert.ok(html.indexOf("Mientras contás") > finGrilla, "la advertencia quedó entre las filas");
  assert.ok(html.indexOf("Conteo iniciado a las") > finGrilla, "la hora quedó entre las filas");
  // Y no son filas de la grilla.
  const antes = html.slice(0, finGrilla);
  assert.doesNotMatch(antes, /Mientras contás/);
});
