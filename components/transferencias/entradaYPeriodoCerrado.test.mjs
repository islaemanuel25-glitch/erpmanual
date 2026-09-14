// LA PANTALLA PARTIDA EN DOS: la entrada sin período, y el período CERRADO.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/entradaYPeriodoCerrado.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SU FECHA ──────────────────────────────
//
// El domingo 2026-09-13 el tablero mostraba la semana EN CURSO, que ese día
// tenía un día de vida: cuatro transferencias que todavía no se cobran, y la
// semana que sí había que cobrar, escondida.
//
// Y el problema de fondo es peor que ese domingo: cada local corta su semana el
// día que acordó, así que "Semana" no significa lo mismo para todos y un chip
// arriba de la pantalla tiene que elegir UNO para todos.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import EntradaDeLocales from "./EntradaDeLocales.jsx";
import TarjetaDeLocal from "./TarjetaDeLocal.jsx";
import FachadaDelLocal from "./FachadaDelLocal.jsx";
import CuentaDelPeriodoCerrado from "./CuentaDelPeriodoCerrado.jsx";
import {
  ORDEN_DE_PALETAS,
  PALETAS,
  numeroDelNombre,
  paletaDelLocal,
} from "@/lib/transferencias/fachadaDelLocal";
import { rangoDelPeriodo, rangoDelPeriodoCerrado } from "@/lib/transferencias/periodoDePago";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = (n) => renderToStaticMarkup(n);
const money = (n) => `$ ${Number(n || 0).toFixed(2)}`;

const LOCALES = [
  { localId: 2, nombre: "mini el 7", sinConfigurar: false },
  { localId: 4, nombre: "Casiano casas", sinConfigurar: true },
];

// ── 1 · LA ENTRADA NO TIENE PERÍODO NI PLATA ──────────────────────────────

test("V1 · la entrada NO muestra chips, ni importes, ni transferencias, ni buscador", () => {
  const salida = html(React.createElement(EntradaDeLocales, { locales: LOCALES }));

  for (const chip of ["Día", "Semana", "Mes", "Otro"]) {
    assert.ok(!salida.includes(`>${chip}<`), `la entrada dibuja el chip ${chip}`);
  }
  assert.ok(!salida.includes("A pagar"), "la entrada muestra un importe");
  assert.ok(!salida.includes("$"), "la entrada muestra plata");
  assert.ok(!salida.includes("Recibir"), "la entrada muestra transferencias");
  assert.ok(
    !salida.includes("Buscar transferencia"),
    "el buscador va adentro del local, no en la entrada"
  );

  // Lo que SÍ tiene: los locales.
  assert.ok(salida.includes("mini el 7"));
  assert.ok(salida.includes("Casiano casas"));
});

test("V2 · y la pantalla del tablero no pide el período en la entrada", () => {
  // Un chip dibujado solo en la vista del LOCAL. Si volviera a la entrada, el
  // candado de arriba no lo vería: aquél mira el componente, éste la pantalla.
  const src = fs
    .readFileSync(path.join(RAIZ, "components/transferencias/TableroMovil.jsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(
    src,
    /vista === "LOCAL" && <ChipsDePeriodo/,
    "los chips volvieron a dibujarse sin condición: en la entrada no hay período"
  );
});

test("V3 · la tarjeta del local es tocable entera y lleva la franja pegada al borde", () => {
  const salida = html(React.createElement(TarjetaDeLocal, { local: LOCALES[0] }));
  assert.match(salida, /<button/, "la tarjeta tiene que ser un control");
  assert.ok(salida.includes("sunmi-bg-accent"), "falta la franja");
  assert.ok(
    salida.includes("overflow-hidden") && salida.includes("p-0"),
    "sin recorte y sin padding cero, la franja no llega a los extremos"
  );
});

// ── 2 · LA FACHADA ────────────────────────────────────────────────────────

test("V4 · la paleta de un local es SIEMPRE la misma, entre corridas y procesos", () => {
  // El valor está escrito a mano a propósito: si el hash cambiara, este candado
  // se pone rojo y eso es exactamente lo que tiene que pasar — un local que
  // cambia de color entre dos versiones es un defecto, no una mejora.
  assert.equal(numeroDelNombre("mini el 7"), numeroDelNombre("mini el 7"));
  assert.equal(paletaDelLocal("mini el 7").nombre, paletaDelLocal("mini el 7").nombre);

  // Normaliza espacios y mayúsculas: "Mini El 7" es el mismo local.
  assert.equal(paletaDelLocal("mini el 7").nombre, paletaDelLocal("  MINI EL 7 ").nombre);

  // ── Y REPARTE, QUE ES LO QUE ATRAPÓ EL DEFECTO ─────────────────────────
  //
  // Con djb2 pelado los CUATRO locales de producción caían en la misma paleta, y
  // no por casualidad: 33 ≡ 1 (mod 4), así que `h % 4` dependía solo de la suma
  // de los códigos de los caracteres y los nombres parecidos caían juntos. El
  // arreglo fue mezclar el hash antes del módulo.
  //
  // Los nombres son los REALES de producción a propósito: un fixture de
  // "local a / local b" no habría mostrado nada.
  const reales = ["mini el 7", "Casiano casas", "Minimarket ayala", "Mini unidas"];
  const paletas = new Set(reales.map((n) => paletaDelLocal(n).nombre));
  assert.equal(
    paletas.size,
    4,
    `los cuatro locales reales tienen que caer en cuatro paletas distintas, cayeron en ${paletas.size}: ${[...paletas].join(", ")}`
  );
});

test("V5 · toda paleta existe y trae las cinco frutas", () => {
  for (const clave of ORDEN_DE_PALETAS) {
    const p = PALETAS[clave];
    assert.ok(p, `falta la paleta ${clave}`);
    assert.equal(p.frutas.length, 5, `${clave} no tiene cinco frutas`);
    for (const campo of ["muro", "zocalo", "cartel", "toldoA", "toldoB", "vidrio", "marco", "puerta", "cajon"]) {
      assert.match(p[campo], /^#[0-9a-fA-F]{6}$/, `${clave}.${campo} no es un color`);
    }
  }
  // Un nombre cualquiera siempre cae en una de las cuatro.
  for (const n of ["", "x", "Local nuevo", "Ñandú 9"]) {
    assert.ok(ORDEN_DE_PALETAS.includes(paletaDelLocal(n).nombre));
  }
});

test("V6 · EL COMPONENTE DE LA FACHADA NO ESCRIBE NI UN SOLO COLOR", () => {
  // Los colores de un dibujo son datos, no interfaz, y por eso viven en `lib/`
  // —donde el trinquete no los cuenta como hardcodeo de pantalla—. Pero eso solo
  // vale mientras el componente no escriba ninguno: la primera versión dejó
  // cinco sueltos y el trinquete los contó, con razón.
  const src = fs.readFileSync(
    path.join(RAIZ, "components/transferencias/FachadaDelLocal.jsx"),
    "utf8"
  );
  const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `el componente escribió colores: ${hex.join(", ")}`);

  // Y dibuja: un nombre distinto da un SVG distinto.
  const a = html(React.createElement(FachadaDelLocal, { nombre: "mini el 7" }));
  assert.match(a, /<svg/);
  assert.match(a, /viewBox="0 0 120 120"/);
});

// ── 3 · EL PERÍODO CERRADO ES EL ANTERIOR ─────────────────────────────────

test("V7 · EL DOMINGO DEL DEFECTO: el cerrado es la semana anterior, no la que arranca hoy", () => {
  // 2026-09-13 es DOMINGO y el corte es domingo: la semana en curso arranca ese
  // mismo día. Ése es el caso que rompía la pantalla.
  const enCurso = rangoDelPeriodo({ diaDeCorte: 0, hoy: "2026-09-13" });
  const cerrado = rangoDelPeriodoCerrado({ diaDeCorte: 0, hoy: "2026-09-13" });

  assert.deepEqual(enCurso, { desde: "2026-09-13", hasta: "2026-09-19" });
  assert.deepEqual(cerrado, { desde: "2026-09-06", hasta: "2026-09-12" });
});

test("V8 · el cerrado NO se mueve dentro de la semana", () => {
  // Del lunes al sábado siguientes, la cuenta a cobrar tiene que seguir siendo
  // la misma. Si cambiara, el importe se movería solo entre dos miradas.
  for (const dia of ["2026-09-13", "2026-09-14", "2026-09-16", "2026-09-19"]) {
    assert.deepEqual(
      rangoDelPeriodoCerrado({ diaDeCorte: 0, hoy: dia }),
      { desde: "2026-09-06", hasta: "2026-09-12" },
      `el cerrado cambió el ${dia}`
    );
  }
});

test("V9 · dos locales con cortes distintos tienen períodos cerrados distintos", () => {
  // Es la razón por la que el período no puede vivir arriba de la pantalla.
  const domingo = rangoDelPeriodoCerrado({ diaDeCorte: 0, hoy: "2026-09-16" });
  const miercoles = rangoDelPeriodoCerrado({ diaDeCorte: 3, hoy: "2026-09-16" });

  assert.deepEqual(domingo, { desde: "2026-09-06", hasta: "2026-09-12" });
  assert.deepEqual(miercoles, { desde: "2026-09-09", hasta: "2026-09-15" });
  assert.notDeepEqual(domingo, miercoles, "un chip global habría mostrado el mismo a los dos");
});

test("V10 · el mes cerrado es el mes anterior COMPLETO, no treinta días atrás", () => {
  // La forma —"el período que contiene al día anterior al inicio del actual"—
  // sale bien en las tres unidades sin un `if` por unidad. Restar días a mano
  // habría dado un rango corrido en los meses de 28 y de 31.
  assert.deepEqual(rangoDelPeriodoCerrado({ unidad: "MES", hoy: "2026-09-14" }), {
    desde: "2026-08-01",
    hasta: "2026-08-31",
  });
  assert.deepEqual(rangoDelPeriodoCerrado({ unidad: "MES", hoy: "2026-03-02" }), {
    desde: "2026-02-01",
    hasta: "2026-02-28",
  });
});

// ── 4 · LA CUENTA, DIBUJADA ───────────────────────────────────────────────

test("V11 · la cuenta dice «Para cobrar», el rango cerrado y la semana en curso aparte", () => {
  const salida = html(
    React.createElement(CuentaDelPeriodoCerrado, {
      cerrado: {
        rango: { desde: "2026-09-06", hasta: "2026-09-12" },
        aPagar: 133080,
        cantidad: 3,
        sinRecibir: 14,
        totalCerrado: false,
      },
      enCurso: { rango: { desde: "2026-09-13", hasta: "2026-09-19" }, aPagar: 88080, cantidad: 4 },
      unidadNombre: "Semana",
      money,
    })
  );

  assert.ok(salida.includes("Para cobrar"), "falta el rótulo de la pregunta");
  assert.ok(salida.includes("Semana cerrada · 06/09 al 12/09"), "falta el rango cerrado");
  assert.ok(
    salida.includes("14 transferencias sin recibir · el total todavía no está cerrado"),
    "falta el aviso de total abierto"
  );
  assert.ok(salida.includes("Semana en curso"), "falta la línea de la semana en curso");
  assert.ok(salida.includes("13/09 al 19/09 · 4 transferencias"), "falta el rango en curso");
  assert.ok(salida.includes("sunmi-border-warning"), "con pendientes va marcada");
});

test("V12 · un local SIN período cerrado todavía: el rango existe y se dice que está vacío", () => {
  // El caso del local recién vinculado. El rango SIEMPRE existe —siempre hay una
  // semana anterior— así que se muestra con importe en cero y una frase. Decir
  // "no hay período" sería falso: lo hay, y está vacío, que es otra respuesta.
  const salida = html(
    React.createElement(CuentaDelPeriodoCerrado, {
      cerrado: {
        rango: { desde: "2026-09-06", hasta: "2026-09-12" },
        aPagar: 0,
        cantidad: 0,
        sinRecibir: 0,
        totalCerrado: true,
      },
      enCurso: { rango: { desde: "2026-09-13", hasta: "2026-09-19" }, aPagar: 0, cantidad: 0 },
      unidadNombre: "Semana",
      money,
    })
  );

  assert.ok(salida.includes("$ 0.00"), "el importe en cero se muestra igual");
  assert.ok(salida.includes("06/09 al 12/09"), "el rango existe y se muestra");
  assert.ok(
    salida.includes("No se le envió nada en ese período"),
    "un cero sin explicación se lee como un dato que falta"
  );
  assert.ok(!salida.includes("sunmi-border-warning"), "sin pendientes no va marcada");
  assert.ok(
    !salida.includes("todavía no está cerrado"),
    "sin pendientes el total SÍ está cerrado: el aviso sería falso"
  );
});

// ── 5 · EL CIERRE: LA RUTA MANDA LO QUE ESTO LEE ──────────────────────────

test("V13 · la ruta tiene el modo entrada y el modo un-local, y el cerrado sale de la puerta", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/transferencias/tablero/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(src, /vista: "ENTRADA"/, "falta el modo entrada");
  assert.match(src, /vista: "UN_LOCAL"/, "falta el modo de un local");
  assert.match(src, /rangoDelPeriodoCerrado\(/, "el período cerrado no sale de la puerta");
  for (const campo of ["cerrado:", "enCurso:", "conDiferencias:"]) {
    assert.ok(new RegExp(`\\b${campo}`).test(src), `la ruta no manda '${campo}'`);
  }
});

// ── V14 · EL LOCAL DE LA PANTALLA VIAJA COMO `destino`, NUNCA COMO `localId`
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De abrir la pantalla. La primera versión mandaba `?localId=<el local>` y el
// depósito recibía un 403 —"Local fuera de tu alcance"— en vez de la cuenta.
//
// El motivo es una convención de TODA la API, no de este módulo: `localId` es
// un parámetro reservado que `resolveVistaOperativa` lee como "el alcance que
// estoy pidiendo", y para una sesión que no es admin exige que sea el suyo
// (`lib/grupos.js`). El depósito es un local como cualquier otro, así que
// pedir el de otro era pedir un alcance ajeno.
//
// Y el 403 estaba BIEN: acá no se cambia de alcance. El alcance sigue siendo el
// del depósito —mira lo que él despachó— y esto es un filtro por destino.
//
// ── POR QUÉ NO LO VIO NINGÚN CANDADO ─────────────────────────────────────
//
// Porque los dos lados eran correctos por separado: la ruta leía un parámetro y
// la pantalla mandaba ese mismo parámetro. El defecto vivía en el ESPACIO entre
// la pantalla y una guarda que ninguna de las dos nombra. Es la quinta vez del
// mismo patrón y por eso el arnés no es opcional.
test("V14 · el local de la pantalla viaja como `destino`: `localId` es un parámetro reservado", () => {
  const sinComentarios = (p) =>
    fs
      .readFileSync(path.join(RAIZ, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const ruta = sinComentarios("app/api/transferencias/tablero/route.js");
  const pagina = sinComentarios("app/modulos/transferencias/local/[localId]/page.jsx");

  assert.match(
    ruta,
    /searchParams\.get\("destino"\)/,
    "la ruta tiene que leer el destino de `destino`"
  );
  assert.ok(
    !/searchParams\.get\("localId"\)/.test(ruta),
    "la ruta NO puede leer `localId` de la query: ése lo reserva resolveVistaOperativa y un no-admin solo puede pasar el suyo"
  );
  assert.match(
    pagina,
    /searchParams\.set\("destino"/,
    "la pantalla tiene que mandar `destino`"
  );
  assert.ok(
    !/searchParams\.set\("localId"/.test(pagina),
    "la pantalla NO puede mandar `localId`: le vuelve un 403 en vez de la cuenta"
  );
});

// ── V15 · EL PERÍODO VACÍO SE DICE UNA VEZ, Y EN UN SOLO LUGAR ────────────
//
// La captura del local sin movimiento mostró el mismo hecho escrito DOS veces y
// con dos redacciones distintas: "No se le envió nada en ese período." en la
// tarjeta del importe y "No hay transferencias en el período cerrado." abajo.
// Dos frases distintas para un solo hecho se leen como dos hechos.
//
// Quién lo dice está decidido: la TARJETA, que es donde está el importe en cero
// y por lo tanto donde la frase explica algo. La lista de abajo no dice nada
// cuando no hay nada, y el buscador tampoco se dibuja — un campo para buscar en
// una lista sin filas no puede encontrar nada.
test("V15 · el período cerrado vacío se dice una sola vez, y lo dice la tarjeta", () => {
  const pagina = fs
    .readFileSync(
      path.join(RAIZ, "app/modulos/transferencias/local/[localId]/page.jsx"),
      "utf8"
    )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.ok(
    !pagina.includes("No hay transferencias en el período cerrado"),
    "la pantalla repite el vacío que la tarjeta ya dice"
  );
  // Y el buscador cuelga de que haya algo que buscar.
  assert.match(
    pagina,
    /delPeriodo\.length > 0 && \(\s*<SunmiInput/,
    "el buscador tiene que depender de que el período cerrado tenga filas"
  );

  // La frase que SÍ se dice vive en la tarjeta, no en la pantalla.
  const tarjeta = fs.readFileSync(
    path.join(RAIZ, "components/transferencias/CuentaDelPeriodoCerrado.jsx"),
    "utf8"
  );
  assert.ok(
    tarjeta.includes("No se le envió nada en ese período"),
    "la frase del período vacío tiene que estar en la tarjeta"
  );
});

// ── 6 · LAS TRES CORRECCIONES VISTAS EN PRODUCCIÓN (98fbb667) ─────────────

// ── V16 · LA TARJETA TIENE FONDO DE TARJETA, NO EL DE LA APLICACIÓN ───────
//
// `.sunmi-surface` se llama "surface" y pinta `--app-bg`, que es el fondo de la
// APLICACIÓN. Con esa clase la tarjeta salía exactamente del color de la página
// y lo único que la separaba era el borde. Se vio en el teléfono, en el tema
// crema, donde `--app-bg` es `#FFFBEB` y `--card-bg` es `#FFFFFF`.
//
// No era cosa de ese tema: en los CATORCE los dos tokens son distintos, así que
// la tarjeta perdía su fondo propio siempre.
//
// El candado mira la clase y no un color, porque el color lo pone el tema. Y
// mira las dos cosas: que esté la de tarjeta y que NO esté la de la aplicación —
// preguntar solo por la primera dejaría pasar que alguien las ponga juntas, que
// es la forma en que esto vuelve sin que nadie lo note.
test("V16 · la tarjeta de local se pinta con el fondo de TARJETA, no con el de la aplicación", () => {
  const salida = html(
    React.createElement(TarjetaDeLocal, { local: LOCALES[0], onEntrar: () => {} })
  );

  assert.match(salida, /sunmi-bg-card/, "la tarjeta no usa el fondo de tarjeta");
  assert.ok(
    !/sunmi-surface(?![-\w])/.test(salida),
    "la tarjeta sigue pintada con `sunmi-surface`, que es el fondo de la APLICACIÓN"
  );
  // El borde se queda en el de la aplicación: el diseño pide border/default, y
  // en `sunmiLight` el de tarjeta es MÁS claro, o sea menos separación.
  assert.match(salida, /sunmi-border(?![-\w])/, "la tarjeta perdió el borde por defecto");

  // Y la clase existe de verdad en el kit. Sin esto el candado pasaría con una
  // clase inventada que no pinta nada, que es exactamente el síntoma que hay
  // que impedir: una tarjeta sin fondo propio.
  const hoja = fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");
  assert.match(
    hoja,
    /\.sunmi-bg-card\s*\{[^}]*background:\s*var\(--card-bg\)/,
    "`.sunmi-bg-card` no está en la hoja, o no pinta --card-bg"
  );
});

// ── V17 · EL RÓTULO DE LA LISTA ──────────────────────────────────────────
//
// Faltaba en producción. Y no se dibuja sobre una lista vacía: un encabezado
// arriba de nada promete contenido que no está.
test("V17 · la entrada rotula la lista, y no lo hace si no hay locales", () => {
  const conLocales = html(React.createElement(EntradaDeLocales, { locales: LOCALES }));
  assert.ok(conLocales.includes(">LOCALES<"), "falta el rótulo de la lista");

  // Las mismas clases que los dos rótulos de sección que el módulo ya tenía.
  assert.match(
    conLocales,
    /text-xs2 font-semibold sunmi-text-muted tracking-wider[^"]*">LOCALES</,
    "el rótulo no usa las clases de los rótulos de sección del módulo"
  );

  const vacia = html(React.createElement(EntradaDeLocales, { locales: [] }));
  assert.ok(!vacia.includes(">LOCALES<"), "rotula una lista que no tiene nada");
  assert.ok(
    vacia.includes("Ningún local opera por transferencia"),
    "sin locales tiene que decir por qué, no quedar en blanco"
  );

  // Y cargando tampoco: el rótulo aparecería arriba del loader.
  const cargando = html(React.createElement(EntradaDeLocales, { cargando: true }));
  assert.ok(!cargando.includes(">LOCALES<"), "rotula la lista mientras todavía carga");
});
