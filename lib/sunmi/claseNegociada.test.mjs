// EL DEFAULT DE LA PIEZA CEDE ANTE LO QUE PIDE LA PANTALLA.
//
// Las cadenas de acá no están inventadas: son las siete que hoy existen en el
// repo, cuatro en `TablaCatalogo` y tres en `ListaConciliacion`. Si la pieza no
// sirve para las siete tal como están, la pieza está mal.

import test from "node:test";
import assert from "node:assert/strict";

import {
  tarjetaQueSobrevive,
  declaraSuperficie,
  declaraTamanoDeLetra,
  declaraColorDeTexto,
  componerClaseTexto,
  declaraPaddingX,
  declaraPaddingY,
  paddingQueSobrevive,
  declaraAlineacion,
} from "@/lib/sunmi/claseNegociada";

// Las siete, copiadas de donde están escritas hoy.
const CATALOGO = [
  "text-[9.5px] sunmi-text-muted truncate max-w-[9rem] md:max-w-[22rem]",
  "text-[9.5px] sunmi-text-muted",
  "text-[9.5px] sunmi-text-muted",
  "text-[9.5px] sunmi-text-muted",
];
const COMPROBANTES = [
  "text-xs2 truncate sunmi-text-accent",
  "text-xs2 sunmi-text-warning",
  "text-xs2 sunmi-text-muted",
];

// ── QUÉ CUENTA COMO TAMAÑO ─────────────────────────────────────────────────

test("un tamaño arbitrario y un token del kit cuentan los dos", () => {
  assert.equal(declaraTamanoDeLetra("text-[9.5px]"), true);
  assert.equal(declaraTamanoDeLetra("text-xs2"), true);
  assert.equal(declaraTamanoDeLetra("!text-sm2"), true, "el ! no cambia la familia");
});

test("LA ALINEACIÓN NO ES UN TAMAÑO", () => {
  // Son propiedades CSS distintas: no hay pelea que ganar, y si contara, una
  // celda alineada a la derecha se quedaría sin el tamaño de la pieza.
  for (const t of ["text-right", "text-left", "text-center", "text-justify"]) {
    assert.equal(declaraTamanoDeLetra(t), false, t);
  }
});

test("un color del tema no cuenta como tamaño, ni al revés", () => {
  assert.equal(declaraTamanoDeLetra("sunmi-text-muted"), false);
  assert.equal(declaraColorDeTexto("text-xs2"), false);
  assert.equal(declaraColorDeTexto("sunmi-text-warning"), true);
});

test("sin className no se declara nada", () => {
  for (const v of ["", null, undefined, 7]) {
    assert.equal(declaraTamanoDeLetra(v), false);
    assert.equal(declaraColorDeTexto(v), false);
  }
});

// ── LO QUE SE PUEDE MIRAR: LA CADENA QUE SALE ──────────────────────────────

test("sin nada pedido, la pieza pone su tamaño y su color", () => {
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "" });
  assert.equal(c, "text-xs2 sunmi-text-muted");
});

test("EL CATÁLOGO CONSERVA SUS 9.5px: la pieza no pone el suyo", () => {
  // Es la prueba de que la pantalla de origen queda idéntica. Si apareciera
  // `text-xs2` al lado, ganaría cualquiera de las dos según la hoja de estilos.
  for (const pedido of CATALOGO) {
    const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido });
    assert.equal(c.includes("text-xs2"), false, c);
    assert.equal(c.includes("text-[9.5px]"), true, c);
  }
});

test("NUNCA DOS DE LA MISMA FAMILIA en la cadena que sale", () => {
  // El defecto original: `w-full` y `w-[46px]` juntos, y decidía Tailwind.
  for (const pedido of [...CATALOGO, ...COMPROBANTES]) {
    const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido });
    const tam = c.split(" ").filter((t) => declaraTamanoDeLetra(t));
    const col = c.split(" ").filter((t) => declaraColorDeTexto(t));
    assert.equal(tam.length, 1, `tamaños en "${c}"`);
    assert.equal(col.length, 1, `colores en "${c}"`);
  }
});

test("un color propio pisa al del kit y el tamaño sigue viniendo de la pieza", () => {
  // Es el caso de comprobantes cuando el precio difiere: ámbar, tamaño del kit.
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "sunmi-text-warning" });
  assert.equal(c, "text-xs2 sunmi-text-warning");
});

test("lo que no es de ninguna familia se agrega sin sacar nada", () => {
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "truncate" });
  assert.equal(c, "text-xs2 sunmi-text-muted truncate");
});

test("la base va primero y no cede nunca", () => {
  const c = componerClaseTexto({ base: "block", tamano: "text-xs2", color: "sunmi-text-muted", pedido: "text-sm2" });
  assert.match(c, /^block /);
  assert.equal(c.includes("text-xs2"), false);
});

// ── EL PADDING DE LA CELDA: LA DENSIDAD CEDE POR EJE ───────────────────────
//
// Los pares de acá son los cuatro más usados del repo entre los que NINGUNA
// densidad cubre: px-3 py-1.5 en 67 celdas, px-3 py-2 en 63, px-2 py-2 en 52 y
// px-2.5 py-3 en 46. Si la densidad no cediera, migrar cualquiera de esas
// tablas a modo por columnas le cambiaría el padding.

const NORMAL = "px-2 py-1.5";

test("sin nada declarado, la densidad queda entera", () => {
  assert.equal(paddingQueSobrevive(NORMAL, ""), NORMAL);
  assert.equal(paddingQueSobrevive(NORMAL, "tabular-nums text-right"), NORMAL);
});

test("LOS CUATRO PARES QUE NINGUNA DENSIDAD CUBRE sacan a la densidad entera", () => {
  for (const par of ["px-3 py-1.5", "px-3 py-2", "px-2 py-2", "px-2.5 py-3"]) {
    assert.equal(paddingQueSobrevive(NORMAL, par), "", par);
  }
});

test("CEDE POR EJE: quien declara solo uno conserva el otro", () => {
  assert.equal(paddingQueSobrevive(NORMAL, "px-3"), "py-1.5");
  assert.equal(paddingQueSobrevive(NORMAL, "py-3"), "px-2");
});

test("`p-0` fija las cuatro, así que saca las dos de la densidad", () => {
  assert.equal(paddingQueSobrevive(NORMAL, "p-0"), "");
  assert.equal(declaraPaddingX("p-0"), true);
  assert.equal(declaraPaddingY("p-0"), true);
});

test("NUNCA QUEDAN LAS DOS DEL MISMO EJE", () => {
  // El defecto original: `px-2` y `px-3` juntos, y decide la hoja de estilos.
  // `px-3` le gana a `px-2` por el orden numérico, así que a veces sale bien —y
  // esa es la peor forma de salir bien, porque al revés sale mal en silencio.
  for (const par of ["px-3 py-1.5", "px-3", "py-2", "p-0", "px-2.5 py-3"]) {
    const final = `${paddingQueSobrevive(NORMAL, par)} ${par}`.trim().split(/\s+/);
    assert.equal(final.filter((t) => /^px-/.test(t)).length <= 1, true, final.join(" "));
    assert.equal(final.filter((t) => /^py-/.test(t)).length <= 1, true, final.join(" "));
  }
});

test("lo que no es padding no saca nada, ni se confunde con otra familia", () => {
  assert.equal(declaraPaddingX("pt-2"), false, "pt- es solo arriba, no el eje entero");
  assert.equal(declaraPaddingY("pb-2"), false);
  assert.equal(declaraPaddingX("truncate"), false);
  assert.equal(declaraPaddingX("text-xs2"), false);
  assert.equal(declaraTamanoDeLetra("px-3"), false, "px- no es un tamaño de letra");
});

test("las tres densidades que existen se declaran enteras y se sacan enteras", () => {
  for (const d of ["px-2 py-1", "px-2 py-1.5", "px-3 py-2.5"]) {
    assert.equal(paddingQueSobrevive(d, d), "", d);
  }
});

// ── LAS DOS TABLAS QUE YA USAN EL MODO NO SE MUEVEN ────────────────────────
//
// Ninguna de sus columnas declara padding, así que la densidad tiene que
// sobrevivir ENTERA y la clase que sale tiene que ser la misma de antes de que
// existiera la negociación. Se afirma sobre la cadena, que es determinista;
// la captura de la recepción a 360 no lo es —dos corridas de la misma versión
// difieren— así que ahí no prueba nada.
const COLUMNAS_HOY = [
  // TablaCatalogo
  "", "tabular-nums hidden md:table-cell", "tabular-nums", "tabular-nums", "hidden md:table-cell",
  // ListaConciliacion
  "w-full max-w-0", "tabular-nums whitespace-nowrap",
];

test("NINGUNA COLUMNA DE HOY DECLARA PADDING, así que la densidad queda entera", () => {
  for (const td of COLUMNAS_HOY) {
    assert.equal(declaraPaddingX(td), false, td);
    assert.equal(declaraPaddingY(td), false, td);
    assert.equal(paddingQueSobrevive("px-2 py-1", td), "px-2 py-1", td);
  }
});

test("la clase compuesta es LA MISMA que antes de la negociación", () => {
  // Antes: `${d.td} ${alineacion} ${tdClassName}`. Ahora la densidad pasa por
  // `paddingQueSobrevive`. Con estas columnas tiene que dar exactamente igual.
  const d = "px-2 py-1";
  for (const td of COLUMNAS_HOY) {
    const antes = `${d} text-right ${td}`.trim();
    const ahora = `${paddingQueSobrevive(d, td)} text-right ${td}`.trim();
    assert.equal(ahora, antes, td);
  }
});

// ── EL EDITOR DE CORRECCIÓN: LA PRIMERA PANTALLA QUE SÍ DECLARA ────────────
//
// Las nueve columnas de su tabla de detalle, copiadas de
// `EditorVentaCorreccion.jsx`. Es la primera migración con una tabla cuyo
// padding NINGUNA densidad cubre, así que es la primera prueba de verdad de que
// la densidad cede. Se afirma sobre la CADENA QUE SALE, no sobre lo escrito.
const EDITOR = [
  "px-3 py-1.5 text-sm",
  "px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums",
  "px-3 py-1.5",
  "px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums",
  "px-3 py-1.5",
  "px-3 py-1.5 text-right tabular-nums sunmi-text-muted",
  "px-3 py-1.5 text-right tabular-nums font-medium",
  "px-3 py-1.5 text-right tabular-nums font-medium",
  "px-3 py-1.5 text-center",
];

test("EL EDITOR SE QUEDA CON SU px-3 py-1.5: la densidad no pone nada", () => {
  // `normal` es px-2 py-1.5. Si sobreviviera el px-2, quedarían los dos y
  // ganaría px-3 solo por el orden de la hoja de estilos — bien de casualidad.
  for (const td of EDITOR) {
    assert.equal(paddingQueSobrevive("px-2 py-1.5", td), "", td);
  }
});

test("la clase que SALE es carácter por carácter la de antes", () => {
  // Antes de migrar, el `<td>` tenía exactamente su `tdClassName` y nada más.
  // Ahora la tabla compone; con el padding y la alineación cediendo, tiene que
  // dar lo mismo salvo el `text-left` que agrega donde la columna no alinea.
  const componer = (td) =>
    `${paddingQueSobrevive("px-2 py-1.5", td)} ${declaraAlineacion(td) ? "" : "text-left"} ${td}`
      .replace(/\s+/g, " ")
      .trim();
  for (const td of EDITOR) {
    const salida = componer(td);
    assert.equal(salida, declaraAlineacion(td) ? td : `text-left ${td}`, td);
  }
});

test("NUNCA DOS PADDINGS NI DOS ALINEACIONES en la cadena del editor", () => {
  for (const td of EDITOR) {
    const salida = `${paddingQueSobrevive("px-2 py-1.5", td)} ${declaraAlineacion(td) ? "" : "text-left"} ${td}`
      .split(/\s+/)
      .filter(Boolean);
    assert.equal(salida.filter((t) => /^px-/.test(t)).length, 1, td);
    assert.equal(salida.filter((t) => /^py-/.test(t)).length, 1, td);
    assert.equal(salida.filter((t) => declaraAlineacion(t)).length, 1, td);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SunmiPanel — LA CADENA QUE SALE, con las 29 declaraciones REALES
// ═══════════════════════════════════════════════════════════════════════════
//
// El candado afirma sobre el RESULTADO OBSERVABLE y no sobre la forma del
// archivo: lo que rompe una pantalla es la cadena que termina en el `class`, no
// cómo se escribió.
//
// Las declaraciones están copiadas de los ocho archivos que usan la pieza, con
// `etiquetasDeApertura` y leyendo el `className` de PRIMER NIVEL. No se inventó
// ninguna: una pieza probada contra casos imaginarios sirve para casos
// imaginarios.

// Las 29, tal cual están escritas. La cuenta al lado es de cuántas veces
// aparece cada una, para que se vea que 28 declaran superficie y 4 padding.
const PANEL = [
  ["sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4", 12],
  ["sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm", 5],
  ["sunmi-surface", 5],
  ["sunmi-surface ring-1 sunmi-ring text-center py-3", 3],
  ["sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm flex flex-col gap-2", 1],
  ["sunmi-state-success ring-1 text-center py-3", 1],
];

// Lo que la pieza compone hoy. Es la MISMA expresión que `SunmiPanel.jsx`: si
// una cambia y la otra no, el candado deja de afirmar sobre lo que se dibuja.
const PADDING = "px-4 py-4";
const componerPanel = (card, pedido, noPadding = false) =>
  `${tarjetaQueSobrevive(card, pedido)} rounded-2xl ${noPadding ? "" : paddingQueSobrevive(PADDING, pedido)} ${pedido}`
    .replace(/\s+/g, " ")
    .trim();

// Dos temas: uno donde el fondo de la tarjeta COINCIDE con el de la aplicación y
// otro donde DIFIERE. El primero es `sunmiDark` y es el que engaña —ahí
// `bg-slate-900` y `--app-bg` valen los dos #0f172a—, así que un candado escrito
// solo con él no distinguiría nada.
const CARD_OSCURO = "bg-slate-900 border border-slate-800";
const CARD_CLARO = "bg-white border border-slate-200";

test("SunmiPanel: NUNCA DOS FONDOS en la cadena que sale", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [pedido] of PANEL) {
      const salida = componerPanel(card, pedido).split(/\s+/).filter(Boolean);
      const fondos = salida.filter((t) => declaraSuperficie(t));
      assert.equal(fondos.length, 1, `${pedido} -> ${salida.join(" ")}`);
    }
  }
});

test("SunmiPanel: NUNCA DOS PADDINGS del mismo eje", () => {
  for (const [pedido] of PANEL) {
    const salida = componerPanel(CARD_CLARO, pedido).split(/\s+/).filter(Boolean);
    assert.equal(salida.filter((t) => /^px-/.test(t)).length, 1, pedido);
    assert.equal(salida.filter((t) => /^py-/.test(t)).length, 1, pedido);
    // Y ninguna `p-` a secas: el default va partido justo para poder ceder medio.
    assert.equal(salida.filter((t) => /^p-\d/.test(t)).length, 0, pedido);
  }
});

test("SunmiPanel: el BORDE del tema sobrevive aunque la pantalla declare fondo", () => {
  // Las 28 declaran `sunmi-surface`, que pone fondo y NADA MÁS. Ceder la tarjeta
  // entera les sacaría el borde, que ninguna pidió.
  for (const [pedido] of PANEL.filter(([p]) => p.includes("sunmi-surface"))) {
    const salida = componerPanel(CARD_CLARO, pedido);
    assert.ok(salida.includes("border border-slate-200"), `${pedido} -> ${salida}`);
    assert.ok(!salida.includes("bg-white"), `${pedido} -> ${salida}`);
  }
});

test("SunmiPanel: sunmi-state-success se lleva el fondo Y el borde", () => {
  // Es la única que pone las dos cosas, así que las dos del tema tienen que
  // ceder. Es el panel "Ganancia total".
  const salida = componerPanel(CARD_CLARO, "sunmi-state-success ring-1 text-center py-3");
  assert.ok(!salida.includes("bg-white"), salida);
  assert.ok(!salida.includes("border-slate-200"), salida);
  assert.ok(salida.includes("sunmi-state-success"), salida);
});

test("SunmiPanel: sin className, la pieza pone TODO lo suyo", () => {
  const salida = componerPanel(CARD_CLARO, "");
  assert.equal(salida, "bg-white border border-slate-200 rounded-2xl px-4 py-4");
});

test("SunmiPanel: noPadding saca el padding y no toca el resto", () => {
  const salida = componerPanel(CARD_CLARO, "", true);
  assert.equal(salida, "bg-white border border-slate-200 rounded-2xl");
});

test("SunmiPanel: el radio nunca se pierde", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [pedido] of PANEL) {
      assert.ok(componerPanel(card, pedido).includes("rounded-2xl"), pedido);
    }
  }
});
