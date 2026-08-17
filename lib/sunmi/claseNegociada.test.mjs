// EL DEFAULT DE LA PIEZA CEDE ANTE LO QUE PIDE LA PANTALLA.
//
// Las cadenas de acá no están inventadas: son las siete que hoy existen en el
// repo, cuatro en `TablaCatalogo` y tres en `ListaConciliacion`. Si la pieza no
// sirve para las siete tal como están, la pieza está mal.

import test from "node:test";
import assert from "node:assert/strict";

import {
  declaraBorde,
  declaraCursor,
  declaraDifuminado,
  declaraHover,
  declaraSombra,
  tarjetaQueSobrevive,
  declaraSuperficie,
  declaraTamanoDeLetra,
  declaraColorDeTexto,
  componerClaseTexto,
  claseDeFila,
  declaraPaddingX,
  declaraPaddingY,
  declaraMargenVertical,
  paddingQueSobrevive,
  declaraAlineacion,
  // RUTA RELATIVA Y NO EL ALIAS `@/lib`, y no es cosmético: con el alias este
  // archivo NO CORRÍA. `node --test` no resuelve los alias de Next, así que
  // fallaba al importar y sus candados —los del cursor, el hover, el fondo y el
  // tamaño de la fila— nunca se ejecutaron. Un candado que no corre se ve igual
  // que uno que pasa: no aparece en rojo, simplemente no está.
  //
  // Es el mismo módulo, así que no se afloja nada; lo único que cambia es que
  // ahora se ejerce. Quedan otros 43 archivos en la misma condición, anotados
  // como tanda propia.
} from "./claseNegociada.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// SunmiTableRow — LA CADENA QUE SALE, con las declaraciones REALES
// ═══════════════════════════════════════════════════════════════════════════
//
// Las cinco de sus consumidores, leídas del primer nivel de la etiqueta. Tres
// PIDEN LO MISMO QUE LA PIEZA con el mismo valor y una pide un eje que la pieza
// no toca, así que hoy no se ve ninguna diferencia — y por eso el resultado
// esperado de la migración era cero en todas, y dio cero en seis de seis.
//
// Lo que el candado defiende no es que se vea igual hoy: es que NUNCA HAYA DOS
// CLASES DE LA MISMA FAMILIA en la cadena. Ese es el defecto, y no se nota hasta
// el día que los dos valores difieren.
const FILA = [
  "cursor-pointer hover:bg-[var(--table-row-hover)]",
  "cursor-pointer",
  "transition-colors",
  "border-l-2 border-l-[var(--pos-accent)]", // el que devuelve getRowClassName
  "",
];

const TAMANO_FILA = "text-[12px]";
const HOVER_KIT = "hover:bg-[var(--table-row-hover)]";
const FONDO_KIT = "bg-[var(--table-row-hover)]";

// ── ACÁ HABÍA UNA COPIA A MANO, Y ERA UN CANDADO QUE NO AFIRMABA NADA ──────
//
// Decía, textual, "La MISMA expresión que `SunmiTableRow.jsx`" — y era una copia.
// O sea que estos candados probaban el duplicado: el día que la pieza cambiara,
// seguirían todos en verde sin haberla tocado. Es la regla 1 adentro de un
// candado, y no se distingue leyéndolo, porque un duplicado correcto se ve igual
// que una llamada a lo real.
//
// La expresión se mudó a `claseDeFila`, en el módulo, y `SunmiTableRow.jsx` la
// invoca. Estos candados ahora ejercen LA MISMA FUNCIÓN QUE CORRE LA PIEZA.
//
// Comprobado que la mudanza no movió nada antes de tocar los candados: las dos
// versiones dan la misma cadena en las 880 combinaciones de className real ×
// tono × intensidad × selected × onClick, con su control de mutación.
//
// El envoltorio queda sólo para conservar el default `onClick: true` que estos
// casos venían usando, y para no reescribir doce llamadas.
const componerFila = (pedido, { onClick = true, ...resto } = {}) =>
  claseDeFila({ pedido, onClick: !!onClick, ...resto });

test("SunmiTableRow: NUNCA DOS CURSORES", () => {
  for (const pedido of FILA) {
    for (const onClick of [true, false]) {
      const salida = componerFila(pedido, { onClick }).split(/\s+/).filter(Boolean);
      assert.ok(salida.filter((t) => declaraCursor(t)).length <= 1, `${pedido} onClick=${onClick}`);
    }
  }
});

test("SunmiTableRow: NUNCA DOS HOVER NI DOS FONDOS", () => {
  for (const pedido of FILA) {
    const sinTono = componerFila(pedido).split(/\s+/).filter(Boolean);
    assert.ok(sinTono.filter((t) => declaraHover(t)).length <= 1, `hover: ${pedido}`);

    // SE CUENTAN FUENTES DE FONDO, NO TOKENS. `sunmi-fila`, `sunmi-fila-alerta` y
    // `sunmi-fila-ambiente` son UN fondo escrito en tres clases que cooperan —la
    // pieza separa a propósito qué color y cuánto se nota—, así que contarlas por
    // separado daba tres y hacía fallar al candado sobre algo que está bien.
    // La primera versión de esta afirmación era la equivocada, no el componente.
    const familia = (t) => (t.startsWith("sunmi-fila") ? "sunmi-fila" : t);
    for (const caso of [{ selected: true }, { tono: "alerta" }, { tono: "ok", selected: true }]) {
      const salida = componerFila(pedido, caso).split(/\s+/).filter(Boolean);
      const fondos = new Set(
        salida.filter((t) => declaraSuperficie(t) && !t.startsWith("hover:")).map(familia)
      );
      assert.ok(fondos.size <= 1, `${pedido} ${JSON.stringify(caso)} -> ${salida.join(" ")}`);
    }
  }
});

test("SunmiTableRow: NUNCA DOS TAMAÑOS DE LETRA", () => {
  for (const pedido of [...FILA, "text-xs2", "text-[9.5px]"]) {
    const salida = componerFila(pedido).split(/\s+/).filter(Boolean);
    assert.equal(salida.filter((t) => declaraTamanoDeLetra(t)).length, 1, pedido);
  }
});

test("SunmiTableRow: sin className la pieza pone lo suyo, igual que antes", () => {
  assert.equal(componerFila("", { onClick: false }), "text-[12px] hover:bg-[var(--table-row-hover)]");
  assert.equal(componerFila(""), "text-[12px] cursor-pointer hover:bg-[var(--table-row-hover)]");
  assert.equal(componerFila("", { selected: true, onClick: false }), "text-[12px] bg-[var(--table-row-hover)]");
});

test("SunmiTableRow: la pantalla que declara hover se queda con el suyo, y sin duplicado", () => {
  const salida = componerFila("cursor-pointer hover:bg-[var(--table-row-hover)]");
  assert.equal(salida, "text-[12px] cursor-pointer hover:bg-[var(--table-row-hover)]");
});

// EL BORDE DEL PREDICADO, y se dice que NO es una declaración real.
//
// Las cinco de los consumidores no alcanzan para afirmar esto: ninguna trae un
// `hover:` que no sea de fondo, así que ensanchar `declaraHover` para que cuente
// cualquier `hover:*` no rompía nada y la contraprueba quedaba verde sobre un
// agujero.
//
// Esto no es probar la pieza contra una pantalla imaginaria: es fijar dónde
// termina el predicado. Un `hover:text-white` cambia el color del texto, no el
// fondo, así que la fila TIENE que conservar su hover del kit.
test("SunmiTableRow: un hover que NO es de fondo no se lleva el hover del kit", () => {
  const salida = componerFila("hover:text-white");
  assert.ok(salida.includes(HOVER_KIT), salida);
});

test("SunmiTableRow: el tono NO cede ante un hover declarado", () => {
  // Son ejes distintos: quien declara hover no está pidiendo el fondo de estado.
  const salida = componerFila("hover:bg-[var(--table-row-hover)]", { tono: "alerta" });
  assert.ok(salida.includes("sunmi-fila-alerta"), salida);
});

// ═══════════════════════════════════════════════════════════════════════════
// SunmiSeparator — EL MARGEN VERTICAL, con las QUINCE declaraciones reales
// ═══════════════════════════════════════════════════════════════════════════
//
// Las quince que existen en el repo, resueltas y con su cuenta. Pelean todas en
// el mismo eje y en ninguno más: no hay un solo token de otra familia.
//
// Y acá el `!important` NO es decorativo, al revés que en `SunmiButton`. El
// orden de las utilidades de margen en la hoja de Tailwind es NUMÉRICO, así que
// contra el `my-2` de la pieza un valor más grande gana solo y uno más chico
// pierde. Medido con la clase sola como control:
//
//   · `my-4` = 14 px  →  gana por el orden. 4 declaraciones.
//   · `my-1` = 3,5 px →  PIERDE. Los tres llevan `!` y por eso funcionan.
//   · `my-0` = 0 px   →  perdería igual. Los siete llevan `!`.
//   · `my-2`          →  pide lo mismo que la pieza. Uno, redundante.
// Y desde que la pieza cede el eje, los diez `!` se sacaron: la lista dice lo
// que el repo tiene HOY, no lo que tenía cuando se midió. El candado de abajo
// cuenta y se puso rojo al sacarlos, que es justamente para lo que está.
const SEPARADOR = [
  ["components/productos/actualizacion-precios/ActualizacionPreciosPage", "my-0", 7],
  ["app/modulos/proveedores + reportes-stock + compras", "my-4", 4],
  ["app/modulos/productos", "my-1", 3],
  ["app/modulos/productos", "my-2", 1],
];

// La MISMA expresión que `SunmiSeparator.jsx`. Si una cambia y la otra no, el
// candado deja de afirmar sobre lo que se dibuja.
const componerSeparador = (pedido) =>
  `flex items-center gap-2 text-[12px] text-slate-400 ${
    declaraMargenVertical(pedido) ? "" : "my-2"
  } ${pedido}`
    .replace(/\s+/g, " ")
    .trim();

test("SunmiSeparator: NUNCA DOS MÁRGENES en la cadena que sale", () => {
  for (const [donde, pedido] of SEPARADOR) {
    const salida = componerSeparador(pedido).split(/\s+/).filter(Boolean);
    const margenes = salida.filter((t) => /^!?m(y)?-\S/.test(t));
    assert.equal(margenes.length, 1, `${donde}: ${margenes.join(" ")}`);
  }
});

test("SunmiSeparator: sin className, la pieza pone su my-2", () => {
  assert.equal(
    componerSeparador(""),
    "flex items-center gap-2 text-[12px] text-slate-400 my-2"
  );
});

test("SunmiSeparator: los otros cinco ejes NO se negocian y siempre están", () => {
  // La pieza cede el margen y nada más. Si alguno de estos desapareciera, la
  // negociación se llevó puesto un eje que nadie pidió.
  for (const [donde, pedido] of SEPARADOR) {
    const salida = componerSeparador(pedido).split(/\s+/);
    for (const fijo of ["flex", "items-center", "gap-2", "text-[12px]", "text-slate-400"]) {
      assert.ok(salida.includes(fijo), `${donde}: se perdió ${fijo}`);
    }
  }
});

test("declaraMargenVertical: el eje entero, y NO los de un solo lado", () => {
  assert.equal(declaraMargenVertical("my-4"), true);
  assert.equal(declaraMargenVertical("!my-0"), true, "el `!` no cambia lo que se pide");
  assert.equal(declaraMargenVertical("m-2"), true, "`m-` también fija el vertical");
  assert.equal(declaraMargenVertical("lg:my-4"), true, "la variante no lo esconde");

  // Quien declara SOLO arriba o SOLO abajo no está reemplazando el eje: si la
  // pieza cediera ahí, la tarjeta perdería el margen del otro lado.
  assert.equal(declaraMargenVertical("mt-4"), false);
  assert.equal(declaraMargenVertical("mb-4"), false);
  assert.equal(declaraMargenVertical("mx-4"), false, "el horizontal es otro eje");
  assert.equal(declaraMargenVertical(""), false);
  assert.equal(declaraMargenVertical("max-w-md"), false, "no confundir con otra familia");
});

// LA LISTA NO PUEDE QUEDARSE VIEJA EN SILENCIO, Y SE CUENTA — NO SE PREGUNTA
// SI QUEDA ALGUNA.
//
// La primera versión preguntaba "¿existe todavía?" y quedó VERDE en la
// contraprueba al sacarle el `my-4` a una de las tres pantallas que lo declaran:
// quedaban dos, así que el grep encontraba algo y el candado no se enteraba. Un
// candado de frescura que solo detecta la desaparición TOTAL de una forma no
// sirve para una lista con cuentas.
test("SunmiSeparator: las quince declaraciones siguen ahí, contadas una por una", async () => {
  const { execSync } = await import("node:child_process");
  const total = SEPARADOR.reduce((a, [, , n]) => a + n, 0);
  assert.equal(total, 15, "la lista dejó de sumar las quince declaraciones del censo");

  for (const [, pedido, veces] of SEPARADOR) {
    const salida = execSync(
      `git grep -o -F -- ${JSON.stringify('className="' + pedido + '"')} -- app components || true`,
      { encoding: "utf8" }
    );
    const cuantas = salida.split("\n").filter(Boolean).length;
    assert.equal(
      cuantas,
      veces,
      `${pedido}: el repo tiene ${cuantas} y la lista dice ${veces}. Si el censo cambió, ` +
        `hay que volver a medir antes de tocar la lista.`
    );
  }
});

// LA PIEZA NEGOCIA DE VERDAD, NO SOLO EN LA COPIA DEL CANDADO.
//
// Todo lo de arriba afirma sobre `componerSeparador`, que es una copia. Si
// alguien vuelve a concatenar en el archivo de verdad, esos tests siguen verdes.
// Este lee el ARCHIVO, sin comentarios: un candado que busca texto encuentra la
// prosa, y ya dio verde tres veces sobre una defensa apagada.
test("SunmiSeparator: la pieza NEGOCIA de verdad, no solo en la copia", async () => {
  const fs = await import("node:fs");
  const fuente = fs
    .readFileSync("components/sunmi/SunmiSeparator.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(
    fuente,
    /declaraMargenVertical\s*\(\s*className\s*\)\s*\?\s*""\s*:\s*"my-2"/,
    "SunmiSeparator dejó de negociar el margen"
  );
  // Y el `my-2` no puede volver a la cadena fija.
  assert.ok(
    !/text-slate-400\s+my-2/.test(fuente),
    "el my-2 volvió a estar concatenado: las diez que hoy necesitan `!` lo seguirían necesitando"
  );
  // Los cinco ejes que NO se negocian siguen puestos sin condición.
  for (const fijo of ["flex", "items-center", "gap-2", "text-\\[12px\\]", "text-slate-400"]) {
    assert.match(fuente, new RegExp(fijo), `SunmiSeparator perdió ${fijo}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SunmiCard — LOS CUATRO EJES CHICOS, con las declaraciones REALES
// ═══════════════════════════════════════════════════════════════════════════
//
// Solo fondo, borde, sombra y difuminado. El PADDING no está negociado todavía
// —son 108 declaraciones en 114 archivos— y por eso el candado no lo afirma: un
// candado que afirmara "nunca dos paddings" estaría en ROJO desde el primer día
// o, peor, obligaría a migrar el padding de apuro para ponerlo en verde.
//
// LAS DECLARACIONES NO SE LEYERON DEL ATRIBUTO: SE RESOLVIERON.
//
// Y esto es el hallazgo de la tanda, no un detalle del método. El primer conteo
// leyó el `className` como texto y dijo SEIS declaraciones en TRES pantallas.
// Estaba mal: dos archivos del tablero escriben `className={cardClass}`, y
// `cardClass` vale `p-4 border border-current/[0.06] shadow-sm`. Como el token
// literal era la palabra `cardClass` —que no es de ninguna familia de Tailwind—
// el conteo los daba por inocentes. El verdadero son ONCE usos en OCHO archivos.
//
// No lo encontró releer el conteo: lo encontró que `/inicio`, que estaba puesta
// como CONTROL y tenía que dar cero píxeles, se moviera. Es el mismo agujero que
// ya había dado un número falso con `SunmiRow`.
const CARD = [
  // pantalla                                        declaración ya resuelta
  ["app/modulos/configuracion/mantenimiento", "border border-red-500/30"],
  ["app/modulos/reportes-ventas", "p-3 overflow-visible backdrop-blur-0"],
  ["app/modulos/transferencias", "p-3 overflow-visible backdrop-blur-0"],
  ["app/modulos/turnos", "p-3 overflow-visible backdrop-blur-0"],
  ["components/dashboard/ActividadReciente", "p-4 border border-current/[0.06] shadow-sm"],
  ["components/dashboard/ActividadReciente", "p-4 border border-current/[0.06] shadow-sm overflow-hidden"],
  ["components/dashboard/UltimasVentas", "flex flex-col border border-current/[0.06] shadow-sm p-5 overflow-hidden"],
  ["components/dashboard/ModalDetalleVenta", "p-4 border border-current/10 shadow-lg"],
  ["components/turnos/ResumenCierre", "sunmi-surface-soft"],
];

// La MISMA expresión que `SunmiCard.jsx`. Si una cambia y la otra no, el candado
// deja de afirmar sobre lo que se dibuja.
const componerCard = (card, pedido) =>
  `${tarjetaQueSobrevive(card, pedido)} rounded-xl ${
    declaraSombra(pedido) ? "" : "shadow-md"
  } ${paddingQueSobrevive("p-6", pedido)} ${
    declaraDifuminado(pedido) ? "" : "backdrop-blur-sm"
  } ${pedido}`
    .replace(/\s+/g, " ")
    .trim();

test("SunmiCard: NUNCA DOS FONDOS en la cadena que sale", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [donde, pedido] of CARD) {
      const salida = componerCard(card, pedido).split(/\s+/).filter(Boolean);
      assert.equal(salida.filter(declaraSuperficie).length, 1, `${donde}: ${salida.join(" ")}`);
    }
  }
});

test("SunmiCard: NUNCA DOS SOMBRAS en la cadena que sale", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [donde, pedido] of CARD) {
      const salida = componerCard(card, pedido).split(/\s+/).filter(Boolean);
      assert.equal(salida.filter(declaraSombra).length, 1, `${donde}: ${salida.join(" ")}`);
    }
  }
});

test("SunmiCard: NUNCA DOS DIFUMINADOS en la cadena que sale", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [donde, pedido] of CARD) {
      const salida = componerCard(card, pedido).split(/\s+/).filter(Boolean);
      assert.equal(salida.filter(declaraDifuminado).length, 1, `${donde}: ${salida.join(" ")}`);
    }
  }
});

// El borde se cuenta por FUENTE y no por token: `border border-red-500/30` son
// dos tokens de la misma declaración —el ancho y el color— y contarlos como dos
// bordes daría rojo sobre una pieza que está bien. Ya pasó con `sunmi-fila`.
test("SunmiCard: el borde sale de UNA sola fuente", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [donde, pedido] of CARD) {
      if (!declaraBorde(pedido)) continue;
      const salida = componerCard(card, pedido);
      assert.ok(
        !tarjetaQueSobrevive(card, pedido).split(/\s+/).some(declaraBorde),
        `${donde}: el borde del tema convive con el de la pantalla -> ${salida}`
      );
    }
  }
});

test("SunmiCard: el que declara SOLO fondo no pierde el borde del tema", () => {
  // `ResumenCierre` pide `sunmi-surface-soft` y nada más. El borde no lo pidió
  // nadie, así que tiene que seguir siendo el del tema.
  const salida = componerCard(CARD_CLARO, "sunmi-surface-soft");
  assert.ok(salida.includes("border-slate-200"), salida);
  assert.ok(!salida.includes("bg-white"), salida);
});

// ÉSTA ES LA PANTALLA DE CONTROL DE TODA LA TANDA DEL PADDING.
//
// De los 231 usos de `SunmiCard`, 84 no traen `className`. Si la cadena que sale
// para ese caso cambiara aunque fuera en el orden de un token, se moverían
// tarjetas que nadie pidió mover, y el cambio dejaría de ser "86 tarjetas de
// aire" para ser "todas". Se compara carácter por carácter contra la cadena
// literal de antes de la tanda, no contra otra expresión calculada: dos
// expresiones equivocadas del mismo modo dan igual entre sí.
test("SunmiCard: sin className, la pieza pone TODO lo suyo", () => {
  assert.equal(
    componerCard(CARD_CLARO, ""),
    "bg-white border border-slate-200 rounded-xl shadow-md p-6 backdrop-blur-sm"
  );
  assert.equal(
    componerCard(CARD_OSCURO, ""),
    "bg-slate-900 border border-slate-800 rounded-xl shadow-md p-6 backdrop-blur-sm"
  );
});

test("SunmiCard: el radio no se pierde nunca, y el padding sale de UNA sola fuente", () => {
  // El radio no se negocia en ningún caso. El padding sí, y desde que el aire se
  // migró la pieza cede ante cualquier pedido que cubra los dos ejes: la tarjeta
  // termina con exactamente un padding, el de la pantalla si lo declaró y el de
  // la pieza si no.
  for (const [donde, pedido] of CARD) {
    const salida = componerCard(CARD_CLARO, pedido).split(/\s+/);
    assert.ok(salida.includes("rounded-xl"), `${donde}: se perdió el radio`);
    const paddings = salida.filter((t) => /^!?p-\S/.test(t));
    assert.equal(paddings.length, 1, `${donde}: ${paddings.join(" ")}`);
    if (declaraPaddingX(pedido) && declaraPaddingY(pedido)) {
      assert.ok(!salida.includes("p-6") || pedido.includes("p-6"), `${donde}: la pieza no cedió`);
    }
  }
});

// LOS NUEVE QUE PIDEN `p-6` NO MUEVEN UN PÍXEL, Y NO ES CASUALIDAD.
//
// Antes ganaba el `p-6` de la pieza; ahora gana el `p-6` de la pantalla. Los dos
// son la misma clase, así que el navegador dibuja lo mismo. Lo que cambia es
// cuál de los dos sobra, y eso no se ve.
test("SunmiCard: el que declara p-6 dibuja lo mismo que antes", () => {
  const salida = componerCard(CARD_CLARO, "p-6 overflow-hidden").split(/\s+/);
  assert.equal(salida.filter((t) => /^!?p-\S/.test(t)).length, 1, salida.join(" "));
  assert.ok(salida.includes("p-6"), salida.join(" "));
});

// EL `!p-3` DEJA DE NECESITAR EL `!`.
//
// `TicketEditor` lo escribía con `!` porque era lo único que lo hacía ganar. Con
// el eje negociado gana sin él, y el `!` se sacó DESPUÉS de comprobar con una
// captura que la pantalla no se movía. Este candado afirma las dos mitades: que
// con `p-3` a secas la pieza cede, y que el `!` ya no está en el repo.
test("SunmiCard: el padding de la pantalla gana SIN necesitar `!`", () => {
  const salida = componerCard(CARD_CLARO, "p-3").split(/\s+/);
  assert.ok(!salida.includes("p-6"), salida.join(" "));
  assert.ok(salida.includes("p-3"), salida.join(" "));
});

// EL `!` YA NO HACE FALTA, Y SE COMPROBÓ ANTES DE SACARLO.
//
// Las tres pantallas del difuminado escribían `!backdrop-blur-0`. Con la
// negociación puesta y el `!` todavía ahí, las tres capturas dieron IDÉNTICAS a
// la línea de base; recién entonces se sacó el `!`, y volvieron a dar idénticas.
// Ese es el orden que hace que la prueba pruebe algo.
test("SunmiCard: el difuminado de la pantalla gana SIN necesitar `!`", () => {
  const salida = componerCard(CARD_CLARO, "p-3 overflow-visible backdrop-blur-0");
  assert.ok(!salida.includes("backdrop-blur-sm"), salida);
  assert.ok(salida.includes("backdrop-blur-0"), salida);
});

// EL CANDADO TIENE QUE PODER ROMPERSE ROMPIENDO LA PIEZA.
//
// Todo lo de arriba afirma sobre `componerCard`, que es una COPIA de la
// expresión de `SunmiCard.jsx` escrita acá. Eso alcanza para probar la
// negociación, pero NO para atarla al componente: si alguien vuelve a
// concatenar en el archivo de verdad, esos tests siguen todos en verde.
//
// Se vio en la contraprueba: romper la pieza a propósito de cuatro maneras
// distintas no puso rojo a ninguno. Un candado que no puede fallar cuando falla
// lo que dice defender es de los que acompañan.
//
// Este lee el ARCHIVO. Sin comentarios: un candado que busca texto encuentra la
// prosa, y ya dio verde tres veces sobre una defensa apagada.
test("SunmiCard: la pieza NEGOCIA de verdad, no solo en la copia del candado", async () => {
  const fs = await import("node:fs");
  const fuente = fs
    .readFileSync("components/sunmi/SunmiCard.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  for (const [eje, patron] of [
    ["fondo y borde", /tarjetaQueSobrevive\s*\(\s*theme\.card\s*,\s*className\s*\)/],
    ["sombra", /declaraSombra\s*\(\s*className\s*\)\s*\?\s*""\s*:\s*"shadow-md"/],
    ["difuminado", /declaraDifuminado\s*\(\s*className\s*\)\s*\?\s*""\s*:\s*"backdrop-blur-sm"/],
    ["padding", /paddingQueSobrevive\s*\(\s*"p-6"\s*,\s*className\s*\)/],
  ]) {
    assert.match(fuente, patron, `SunmiCard dejó de negociar ${eje}`);
  }

  // El radio es el único que sigue puesto sin condición.
  assert.match(fuente, /rounded-xl/, "SunmiCard perdió el radio");

  // Nada de los cinco ejes puede volver a la cadena fija.
  assert.ok(!/\}\s*rounded-xl\s+shadow-md/.test(fuente), "shadow-md volvió a estar concatenado");
  assert.ok(!/p-6\s+backdrop-blur-sm/.test(fuente), "backdrop-blur-sm volvió a estar concatenado");
  assert.ok(
    !/\}\s*p-6\s/.test(fuente),
    "el p-6 volvió a estar concatenado: las 86 del aire y las siete tablas pierden lo suyo"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SunmiCard — EL PADDING CERO, que son SIETE tablas y NO son ocho
// ═══════════════════════════════════════════════════════════════════════════
//
// De las 108 declaraciones de padding, ocho piden cero. Siete envuelven una
// TABLA, donde el cero es una intención estructural —el contenido va de borde a
// borde y el `overflow-hidden` recorta las esquinas—.
//
// La octava, `CardDefaultDeposito`, es un FORMULARIO: ahí el cero no dibuja una
// tabla, aprieta los campos contra el marco. Declara `p-6` y por eso este
// candado la lista APARTE: si alguien le vuelve a poner `p-0`, se entera.
//
// Desde que el aire se migró, el eje se negocia entero y estas siete ya no son
// un caso especial de la pieza. Siguen teniendo candado propio porque siguen
// siendo un caso especial del REPO: son las únicas donde el cero significa algo
// distinto de "menos aire", y son las que se romperían sin ruido si alguien
// volviera a concatenar.
const CARD_CERO = [
  ["app/modulos/auditoria-pos-ventas/balances", "p-0 overflow-hidden"],
  ["app/modulos/auditoria-pos-ventas/cajas", "p-0 overflow-hidden"],
  ["app/modulos/auditoria-pos-ventas/productos", "p-0 overflow-hidden"],
  ["app/modulos/configuracion/listas-precios", "p-0 overflow-hidden"],
  ["app/modulos/proveedores/listas", "hidden lg:block p-0 overflow-hidden"],
];

test("SunmiCard: el que pide CERO se queda sin el p-6 de la pieza", () => {
  for (const [donde, pedido] of CARD_CERO) {
    const salida = componerCard(CARD_CLARO, pedido).split(/\s+/);
    assert.ok(!salida.includes("p-6"), `${donde}: el p-6 de la pieza sigue ahí`);
    assert.ok(salida.includes("p-0"), `${donde}: se perdió el p-0 de la pantalla`);
  }
});

// NUNCA DOS PADDINGS — AHORA SÍ SOBRE LAS DOS LISTAS.
//
// Este candado nació acotado al cero, y no por gusto: escrito sobre las dos
// listas salía ROJO —`p-6 p-3` en reportes-ventas— porque las del aire salían
// con dos paddings a propósito, la pieza ganando por el orden de la hoja.
// Ponerlo en verde entonces habría significado migrar el aire de apuro, que era
// tomar por error una decisión ajena.
//
// El aire se decidió y se migró. Ahora la afirmación vale para las dos listas, y
// se abre — que es lo que aquel comentario dejó dicho que había que hacer.
test("SunmiCard: NUNCA DOS PADDINGS en la cadena que sale", () => {
  for (const card of [CARD_OSCURO, CARD_CLARO]) {
    for (const [donde, pedido] of [...CARD, ...CARD_CERO]) {
      const salida = componerCard(card, pedido).split(/\s+/).filter(Boolean);
      const paddings = salida.filter((t) => /^!?p-\S/.test(t));
      assert.equal(paddings.length, 1, `${donde}: ${paddings.join(" ")}`);
    }
  }
});

// LA QUE QUEDÓ AFUERA TIENE QUE SEGUIR AFUERA.
//
// Es la mitad que un candado de lista no cubre solo: los cinco de arriba
// afirman que las tablas ceden, y ninguno afirma que el formulario NO. Sin esto,
// volver a poner `p-0` en `CardDefaultDeposito` pasaría en verde y la tarjeta
// pasaría a dibujar sus campos pegados al marco sin que nadie lo mire.
test("SunmiCard: el FORMULARIO que quedó afuera no pide cero", async () => {
  const fs = await import("node:fs");
  const fuente = fs
    .readFileSync("components/listas-precios/CardDefaultDeposito.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // DOS COSAS QUE LA CONTRAPRUEBA ENCONTRÓ, Y NINGUNA SE VEÍA LEYENDO.
  //
  // La primera versión le pasaba la ETIQUETA ENTERA al predicado. Al partir por
  // espacios, `className="p-0` no parece un token de padding: el predicado no
  // veía el cero y el candado quedaba mudo, en verde.
  //
  // La segunda miraba SOLO LA PRIMERA etiqueta. Y este archivo tiene DOS
  // `SunmiCard` —la primera es la aclaración que ve un local normal, con `p-3`—,
  // así que el candado afirmaba sobre una tarjeta que no era la del caso. Verde
  // otra vez, y sobre el archivo correcto.
  //
  // Por eso se miran TODAS y se extrae el valor del `className` de cada una.
  const etiquetas = [...fuente.matchAll(/<SunmiCard\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(etiquetas.length > 0, "CardDefaultDeposito dejó de usar SunmiCard");

  // Y NO SE PREGUNTA "¿DICE p-0?", SE PREGUNTA QUÉ DIBUJA.
  //
  // Es la diferencia que importa desde que el eje se negocia entero: lo que hay
  // que defender no es un token del archivo, es que esta tarjeta siga teniendo
  // padding. Un `p-0`, un `px-0 py-0` o un `p-0` con variante darían todos la
  // misma tarjeta pegada al marco, y preguntar por el texto solo atrapa el
  // primero.
  for (const etiqueta of etiquetas) {
    const cn = etiqueta.match(/className\s*=\s*"([^"]*)"/);
    if (!cn) continue;
    const salida = componerCard(CARD_CLARO, cn[1]).split(/\s+/);
    const padding = salida.filter((t) => /^!?p(x|y)?-\S/.test(t));
    assert.ok(
      padding.length > 0 && !padding.some((t) => t.endsWith("-0")),
      `quedó sin padding: ${JSON.stringify(cn[1])}. Es un formulario, no una tabla.`
    );
  }

  // Y el positivo, sobre el mismo camino: si la tarjeta PIDIERA cero, este
  // candado tiene que verlo. Sin esto, cualquier cambio que rompa el recorte del
  // `className` lo deja en verde afirmando nada — que es exactamente lo que pasó
  // dos veces al escribirlo.
  const deMentira = '<SunmiCard className="p-0 overflow-hidden">';
  const cnMentira = deMentira.match(/className\s*=\s*"([^"]*)"/)[1];
  assert.ok(
    componerCard(CARD_CLARO, cnMentira).split(/\s+/).includes("p-0"),
    "el candado no ve un cero ni cuando está: el recorte del className se rompió"
  );
});

// LA PIEZA CEDE POR EJE, Y NO POR "DECLARÓ ALGO DE PADDING".
//
// Es la diferencia entre reusar `paddingQueSobrevive` —que ya sabía hacer esto
// para las celdas de la tabla— y escribir al lado un `declaraPadding` que cede
// entero. Con el segundo, una tarjeta que declarara solo `px-2` perdería también
// el padding vertical de la pieza: pediría una cosa y perdería dos.
//
// Hoy ninguna de las 108 declara un solo eje, así que esto no arregla nada que
// esté roto — afirma la regla antes de que aparezca el primer caso, que es
// cuando sale barato.
test("SunmiCard: el que declara UN SOLO eje conserva el otro", () => {
  const soloX = componerCard(CARD_CLARO, "px-2").split(/\s+/);
  assert.ok(soloX.includes("p-6"), `perdió el vertical: ${soloX.join(" ")}`);

  const losDos = componerCard(CARD_CLARO, "px-2 py-1").split(/\s+/);
  assert.ok(!losDos.includes("p-6"), `no cedió: ${losDos.join(" ")}`);

  // Y el `!` no cambia lo que se PIDE: `!p-3` y `p-3` piden el mismo padding.
  // Lo único que cambiaba era quién ganaba, y eso ya no depende del `!`.
  assert.equal(
    componerCard(CARD_CLARO, "!p-3").includes("p-6"),
    false,
    "un `!p-3` tendría que ganar igual que un `p-3`"
  );
});

// La lista no puede quedarse vieja en silencio: si alguien borra una pantalla o
// le saca la declaración, el candado tiene que avisar en vez de seguir en verde
// afirmando sobre casos que ya no existen.
test("SunmiCard: las declaraciones de la lista siguen existiendo en el repo", async () => {
  const { execSync } = await import("node:child_process");
  for (const [donde, pedido] of CARD) {
    const marca = pedido.split(/\s+/).find(
      (t) => declaraSuperficie(t) || declaraBorde(t) || declaraSombra(t) || declaraDifuminado(t)
    );
    const hay = execSync(
      `git grep -c -F -- ${JSON.stringify(marca)} -- ${JSON.stringify(donde + "*")} || true`,
      { encoding: "utf8" }
    ).trim();
    assert.ok(hay !== "", `${donde} ya no declara ${marca}: la lista quedó vieja`);
  }
});

// Y lo mismo para las cinco pantallas del cero, que no entran en el test de
// arriba porque `p-0` no es de ninguna de esas cuatro familias. Se cuenta contra
// el repo entero con `git grep`, no con `readdirSync`, que mira un nivel.
test("SunmiCard: las cinco pantallas del cero siguen pidiendo cero", async () => {
  const { execSync } = await import("node:child_process");
  for (const [donde, pedido] of CARD_CERO) {
    const hay = execSync(
      `git grep -c -F -- ${JSON.stringify(pedido)} -- ${JSON.stringify(donde + "*")} || true`,
      { encoding: "utf8" }
    ).trim();
    assert.ok(hay !== "", `${donde} ya no declara ${JSON.stringify(pedido)}: la lista quedó vieja`);
  }
});
