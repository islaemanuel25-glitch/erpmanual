// CANDADO: LA EXTRACCIÓN NO MOVIÓ TRANSFERENCIAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/periodo/diaConBanda.test.mjs
//
// ── QUÉ SE EXTRAJO Y POR QUÉ HAY QUE VIGILARLO ───────────────────────────
//
// Para que Finanzas pudiera agrupar por día sin escribir una lista parecida al
// lado, cuatro piezas de Transferencias cambiaron, y las cuatro de la forma más
// barata posible:
//
//   · `DiaDeTransferencias` — su marco y su banda se mudaron a `DiaConBanda`;
//   · `ChipsDePeriodo`      — prop `deshabilitadas`, vacía por defecto;
//   · `EntradaDeLocales`    — props `rotulo`, `textoVacio` e `insigniaDe`, con
//                             los textos de siempre como default;
//   · `TarjetaDeLocal`      — prop `insignia`, `null` por defecto.
//
// La prueba de que salió bien NO es que compile: **la pantalla de donde se sacó
// tiene que quedar idéntica**. Acá eso se afirma sobre el marcado renderizado y
// no a ojo.
//
// ── CÓMO SE VERIFICÓ, Y POR QUÉ LOS TEXTOS ESTÁN ESCRITOS A MANO ─────────
//
// Al hacer el cambio se renderizaron las cuatro piezas de la versión ANTERIOR
// —sacadas con `git show HEAD:…`— contra las nuevas, y las comparaciones dieron
// idénticas: `DiaDeTransferencias` con una fila adentro, `ChipsDePeriodo` en los
// cuatro valores y con `className`, `TarjetaDeLocal`, y `EntradaDeLocales` en
// sus cinco estados. Esa comparación no se puede dejar corriendo: una vez
// commiteado, `HEAD` ES la versión nueva y el candado se compararía consigo
// mismo — verde para siempre sin mirar nada, que es el defecto que este repo
// tiene anotado como el que más se repite.
//
// Por eso lo que queda es el marcado ESCRITO A MANO. Si alguien lo cambia, este
// candado se pone rojo y eso es exactamente lo que tiene que pasar: mover un
// píxel de una pantalla que funciona tiene que ser una decisión, no un efecto
// lateral de una extracción.
//
// Y el corolario que no se deduce leyendo: **juntar dos hijos de JSX en una sola
// cadena mueve píxeles**, porque el navegador moldea cada nodo de texto por
// separado. En esta extracción los nodos se movieron enteros y ninguna pareja se
// pegó; por eso el marcado salió idéntico y no "parecido".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DiaConBanda from "./DiaConBanda.jsx";
import DiaDeTransferencias from "@/components/transferencias/DiaDeTransferencias.jsx";
import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo.jsx";
import EntradaDeLocales from "@/components/transferencias/EntradaDeLocales.jsx";
import TarjetaDeLocal from "@/components/transferencias/TarjetaDeLocal.jsx";

const h = (C, p) => renderToStaticMarkup(React.createElement(C, p));

const money = (n) => `$ ${Number(n || 0).toFixed(2)}`;

// La forma que produce `/api/transferencias/tablero`: `importe`, `recibida` y el
// conteo de diferencias ya resueltos por el servidor. Un fixture escrito a ojo
// con otros campos probaría otra cosa.
const TRANSFERENCIA = {
  id: 211,
  estado: "Recibida",
  recibida: true,
  fechaEnvio: "2026-09-12T14:30:00.000Z",
  createdAt: "2026-09-12T14:00:00.000Z",
  cantidadItems: 12,
  itemsRevisables: 12,
  itemsRevisados: 12,
  lineasConDiferencia: 1,
  importe: 44086.4,
};

const DIA = {
  clave: "2026-09-12",
  titulo: "Sábado 12",
  cantidad: 3,
  sinRecibir: 1,
  conDiferencias: 1,
  importe: 144086.4,
  transferencias: [TRANSFERENCIA],
};

// ══════════════════════════════════════════════════════════════════════════
// LA BANDA DEL DÍA ES UNA SOLA, Y ES LA DE RECIBIR MERCADERÍA
// ══════════════════════════════════════════════════════════════════════════
//
// El contrato cambió a propósito el 2026-09-24. Antes este candado exigía que
// la banda siguiera siendo la de Transferencias —`sunmi-surface-soft`, dos
// renglones, 15 px—, y esa banda no se veía: en doce de los catorce temas
// `--app-input-bg` vale lo mismo que `--card-bg`. La referencia pasó a ser la
// de Recibir mercadería (`DiaDePedidos`), la única que se veía, y las cuatro
// pantallas que agrupan por día la usan desde `DiaConBanda`.
//
// El marcado de abajo está ESCRITO A MANO, por lo mismo que el de antes: si
// alguien lo cambia, esto se pone rojo, y mover una banda que usan cuatro
// pantallas tiene que ser una decisión.
//
// Lo que el marcado no puede probar —que no desborda a 360 px— se midió en un
// navegador con los textos más largos de cada pantalla, y está en el commit.
// Acá queda el contrato que lo hace posible (D1d).

/** La caja y la banda, abiertas. Falta cerrar la banda y la caja. */
const ABRE_BANDA =
  '<div class="rounded-xl border sunmi-divider sunmi-bg-card overflow-hidden">' +
  '<div class="sunmi-control px-4 py-renglon flex flex-wrap items-baseline gap-x-renglon gap-y-dato">';

/** La banda completa de Recibir con un solo pedido: día y cantidad, sin importe. */
const BANDA_UN_PEDIDO =
  ABRE_BANDA +
  '<div class="grow text-sm3 font-bold sunmi-text-strong">Miércoles 23</div>' +
  '<div class="ml-auto flex flex-wrap items-baseline justify-end gap-x-renglon gap-y-dato">' +
  '<div class="text-sm3 sunmi-text-muted">1 pedido</div>' +
  "</div></div>";

const BANDA_TRANSFERENCIAS =
  ABRE_BANDA +
  '<div class="grow text-sm3 font-bold sunmi-text-strong">Sábado 12</div>' +
  '<div class="ml-auto flex flex-wrap items-baseline justify-end gap-x-renglon gap-y-dato">' +
  '<div class="text-sm3 sunmi-text-muted">3 transferencias · 1 sin recibir</div>' +
  '<div class="text-sm3 font-bold sunmi-text-strong tabular-nums">$ 144086.40</div>' +
  "</div></div>";

// La forma que manda la ruta de pedidos, agrupada por la función real.
const PEDIDO = (id, iso, extra = {}) => ({
  id,
  proveedorNombre: "Als",
  fechaEnviado: iso,
  createdAt: iso,
  cantItems: 12,
  totalEstimado: 45300.5,
  totalFacturado: null,
  estado: "ENVIADO",
  ...extra,
});

test("D1 · `DiaConBanda` dibuja la banda de Recibir: `sunmi-control`, una línea, día · dato · importe", () => {
  const salida = h(DiaConBanda, {
    titulo: "Sábado 12",
    dato: "3 transferencias · 1 sin recibir",
    importe: "$ 144086.40",
  });
  assert.equal(salida, `${BANDA_TRANSFERENCIAS}</div>`);
});

test("D1b · sin importe no se dibuja el nodo del importe", () => {
  for (const importe of [null, undefined, false, ""]) {
    const salida = h(DiaConBanda, { titulo: "Miércoles 23", dato: "1 pedido", importe });
    assert.equal(salida, `${BANDA_UN_PEDIDO}</div>`, `con importe ${JSON.stringify(importe)}`);
  }
});

test("D1c · Recibir mercadería abre con esa misma banda, y sus renglones siguen siendo los suyos", async () => {
  const { default: DiaDePedidos } = await import("@/components/compras-proveedor/DiaDePedidos.jsx");
  const { agruparPedidosPorDia } = await import("@/lib/compras-proveedor/diasDePedidos");
  const [uno] = agruparPedidosPorDia([PEDIDO(1, "2026-09-23T10:00:00-03:00")]);
  const salida = h(DiaDePedidos, { dia: uno, onRecibir: () => {} });
  assert.ok(salida.startsWith(BANDA_UN_PEDIDO), `la banda de Recibir cambió:\n${salida.slice(0, 600)}`);
  // El renglón de siempre, con su botón y sin línea arriba del primero.
  assert.match(salida, /min-h-filaPedido px-4 py-filtro flex items-center justify-between gap-renglon "/);
  assert.match(salida, />Recibir</);

  // Con dos pedidos, el subtotal aparece: la regla de Recibir sigue en Recibir.
  const [dos] = agruparPedidosPorDia([
    PEDIDO(1, "2026-09-22T10:00:00-03:00"),
    PEDIDO(2, "2026-09-22T11:00:00-03:00", { totalEstimado: 45300.5 }),
  ]);
  const conDos = h(DiaDePedidos, { dia: dos, onRecibir: () => {} });
  assert.match(conDos, /<div class="text-sm3 sunmi-text-muted">2 pedidos<\/div><div class="text-sm3 font-bold sunmi-text-strong tabular-nums">\$90\.601,00<\/div>/);
  // Y con uno no: la banda de arriba ya se comparó entera y no tiene nodo de importe.
});

test("D1d · el contrato que evita el desborde: salta por espacio, el día no se corta", () => {
  const salida = h(DiaConBanda, { titulo: "Sin fecha de vencimiento", dato: "12 cuentas", importe: "$1" });
  const banda = salida.match(/<div class="sunmi-control[^"]*"/)[0];
  assert.match(banda, /\bflex-wrap\b/, "sin flex-wrap la banda desborda a 360 px");
  const dia = salida.match(/<div class="([^"]*)">Sin fecha de vencimiento</)[1];
  // Ni recorte ni renglón forzado: el día se ve entero y, si no entra con el
  // resto, lo que baja es el dato.
  assert.doesNotMatch(dia, /truncate|whitespace-nowrap|overflow-hidden|min-w-0/, `el día se puede cortar: ${dia}`);
  const grupo = salida.match(/<div class="(ml-auto[^"]*)">/)[1];
  assert.match(grupo, /\bflex-wrap\b/, "si dato e importe no entran juntos, el importe tiene que poder bajar");
  assert.match(grupo, /\bjustify-end\b/, "lo que baja va alineado a la derecha");
  assert.doesNotMatch(salida, /shrink-0/, "un bloque que no se encoge ni baja es el que se sale de la tarjeta");
});

test("D2 · y `DiaDeTransferencias` abre con esa misma banda", () => {
  // Con una fila adentro: sin ella no se probaría que las filas siguen colgando
  // del mismo contenedor.
  const salida = h(DiaDeTransferencias, { dia: DIA, money });
  assert.ok(
    salida.startsWith(BANDA_TRANSFERENCIAS),
    `la banda de transferencias cambió.\nEsperado al inicio:\n${BANDA_TRANSFERENCIAS}\nSalió:\n${salida.slice(0, BANDA_TRANSFERENCIAS.length)}`
  );
  // Y la fila sigue ahí, con su separador arriba.
  assert.match(salida, /border-t sunmi-divider/);
  assert.match(salida, />211</);
  assert.match(salida, /Ver ›/);
});

test("D3 · el total del día lo formatea el CONSUMIDOR, no la pieza", () => {
  // `DiaConBanda` recibe el importe ya escrito. Si formateara por su cuenta
  // sería el treintaiseisavo formateador del repo, y Finanzas y Transferencias
  // escribirían la plata distinto.
  const conOtroFormato = h(DiaConBanda, { titulo: "x", dato: "y", importe: "USD 10" });
  assert.match(conOtroFormato, />USD 10</);
});

test("D4 · un día SIN filas no deja una línea colgando", () => {
  // El separador va arriba de cada fila justamente para esto: sin filas, la
  // tarjeta termina en la banda.
  const salida = h(DiaDeTransferencias, { dia: { ...DIA, transferencias: [] }, money });
  assert.equal(salida, `${BANDA_TRANSFERENCIAS}</div>`);
});

test("D4b · las cuatro pantallas que agrupan por día usan `DiaConBanda`, y ninguna dibuja la suya", () => {
  const sinComentarios = (ruta) =>
    fs
      .readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
  for (const ruta of [
    "components/compras-proveedor/DiaDePedidos.jsx",
    "components/transferencias/DiaDeTransferencias.jsx",
    "components/finanzas/pagos/ListaCuentasPorPagar.jsx",
    "components/finanzas/DiaDeActividad.jsx",
  ]) {
    const src = sinComentarios(ruta);
    assert.ok(src.includes("<DiaConBanda"), `${ruta} no usa DiaConBanda`);
    // Una banda paralela se reconoce por su fondo: nadie más que la pieza lo pone.
    assert.doesNotMatch(src, /sunmi-control|sunmi-surface-soft/, `${ruta} volvió a pintar su propia banda`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LAS TRES PROPS NUEVAS NO CAMBIAN NADA SI NO SE PASAN
// ══════════════════════════════════════════════════════════════════════════

test("D5 · los chips SIN `deshabilitadas` no emiten `disabled` ni `title`", () => {
  // Es lo que hace que las dos pantallas que ya los usaban —la cuenta de
  // transferencias y la recepción de mercadería— queden idénticas. Si el
  // atributo se emitiera siempre, aunque fuera `disabled="false"`, el marcado
  // sería otro.
  for (const valor of ["DIA", "SEMANA", "MES", CLAVE_OTRO]) {
    const salida = h(ChipsDePeriodo, { valor });
    assert.doesNotMatch(salida, /disabled/, `el chip ${valor} emitió disabled sin que se lo pidan`);
    assert.doesNotMatch(salida, /title=/, `el chip ${valor} emitió title sin que se lo pidan`);
    // Los cuatro siguen estando y repartiéndose el ancho.
    assert.equal((salida.match(/flex-1 basis-0/g) || []).length, 4);
  }
});

test("D6 · y CON `deshabilitadas` apaga solo el que se le pidió", () => {
  const salida = h(ChipsDePeriodo, { valor: "SEMANA", deshabilitadas: [CLAVE_OTRO] });
  assert.equal((salida.match(/disabled/g) || []).length, 1, "se apagó más de un chip");
  assert.match(salida, /title="Todavía no disponible"/);
  // El chip apagado sigue DIBUJADO: si desapareciera, los otros tres cambiarían
  // de ancho y la pantalla se vería distinta de la de transferencias.
  assert.match(salida, />Otro</);
  assert.equal((salida.match(/flex-1 basis-0/g) || []).length, 4);
});

test("D7 · la tarjeta SIN `insignia` no agrega ningún nodo", () => {
  const sinInsignia = h(TarjetaDeLocal, { local: { localId: 2, nombre: "mini el 7" } });
  const conInsignia = h(TarjetaDeLocal, {
    local: { localId: 2, nombre: "mini el 7" },
    insignia: "Depósito",
  });

  assert.doesNotMatch(sinInsignia, /text-xs2 font-medium sunmi-text-muted/);
  assert.match(conInsignia, /<span class="shrink-0 text-xs2 font-medium sunmi-text-muted">Depósito<\/span>/);
  // Y lo único que las separa es ese nodo.
  assert.equal(
    conInsignia.replace(
      '<span class="shrink-0 text-xs2 font-medium sunmi-text-muted">Depósito</span>',
      ""
    ),
    sinInsignia
  );
});

test("D8 · la entrada SIN los textos nuevos dice lo que decía", () => {
  // Los defaults son los textos de transferencias, así que la pantalla de
  // transferencias no cambió. El día que alguien los edite pensando que son
  // genéricos, este candado se pone rojo.
  const vacia = h(EntradaDeLocales, { locales: [] });
  assert.match(vacia, /Ningún local opera por transferencia con este depósito\./);

  const conLocales = h(EntradaDeLocales, {
    locales: [{ localId: 2, nombre: "mini el 7", sinConfigurar: false }],
  });
  assert.match(conLocales, /<h2 class="text-xs2 font-semibold sunmi-text-muted tracking-wider">LOCALES<\/h2>/);
  assert.match(conLocales, />mini el 7</);
});

test("D9 · y con los textos de Finanzas dice los de Finanzas", () => {
  const vacia = h(EntradaDeLocales, {
    locales: [],
    textoVacio: "Este grupo todavía no tiene locales cargados.",
  });
  assert.match(vacia, /Este grupo todavía no tiene locales cargados\./);
  assert.doesNotMatch(vacia, /transferencia/);
});

test("D10 · `insigniaDe` se aplica local por local, no a todos", () => {
  const salida = h(EntradaDeLocales, {
    locales: [
      { localId: 1, nombre: "Depósito Central" },
      { localId: 2, nombre: "mini el 7" },
    ],
    insigniaDe: (l) => (l.localId === 1 ? "Depósito" : null),
  });
  assert.equal((salida.match(/sunmi-text-muted">Depósito</g) || []).length, 1);
});

test("D11 · el aviso de corte NO se dibuja cuando nadie manda `sinConfigurar`", () => {
  // Es lo que permite que Finanzas use la misma pieza sin heredar un aviso que
  // allá no significa nada: su período no depende de ningún acuerdo.
  const salida = h(EntradaDeLocales, { locales: [{ localId: 2, nombre: "mini el 7" }] });
  assert.doesNotMatch(salida, /Corte de semana sin configurar/);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PIEZA COMPARTIDA NO TRAE COLORES NI MEDIDAS PROPIAS
// ══════════════════════════════════════════════════════════════════════════

test("D12 · `DiaConBanda` no escribe un solo color fijo ni una medida arbitraria", () => {
  const salida = h(DiaConBanda, { titulo: "x", dato: "y", importe: "z" });
  assert.doesNotMatch(salida, /#[0-9a-fA-F]{3,8}\b/, "un color literal en la pieza compartida");
  assert.doesNotMatch(salida, /\[[0-9.]+px\]/, "una medida arbitraria en la pieza compartida");
  assert.doesNotMatch(salida, /\b(bg|text|border)-(slate|gray|zinc|neutral|stone|amber|cyan|red|green|blue|white|black)\b/, "un color de Tailwind fijo");
  // Los colores salen del tema, que es lo que la hace verse bien en los catorce:
  // la caja con el de tarjeta y la banda con el de los botones secundarios.
  assert.match(salida, /sunmi-bg-card/);
  assert.match(salida, /class="sunmi-control /);
  // Y NO con el de los campos: en doce de los catorce temas vale lo mismo que la
  // tarjeta y la banda no se ve. Es el defecto que cerró esta pieza.
  assert.doesNotMatch(salida, /sunmi-surface-soft/);
});
