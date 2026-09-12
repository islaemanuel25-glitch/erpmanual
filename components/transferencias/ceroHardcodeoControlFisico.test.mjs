// CERO HARDCODEO VISUAL EN LAS PIEZAS DEL CONTROL FÍSICO.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/ceroHardcodeoControlFisico.test.mjs
//
// ── POR QUÉ HACE FALTA ESTE Y NO ALCANZA EL TRINQUETE ─────────────────────
//
// El trinquete quedó VERDE con estos tres adentro:
//
//     lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]
//     z={9999}
//     maxWidth="sm:max-w-lg"
//
// No es que esté roto: cuenta deuda AGREGADA contra una línea de base de 1912
// medidas mágicas, y su trabajo es que el total no suba. Tres valores en
// archivos nuevos entran dentro de un umbral global que además venía BAJANDO por
// deuda pagada en otras tandas, así que ni siquiera hay un +3 que mirar.
//
// El requisito de esta feature es más fuerte que "no empeorar": es CERO. Y cero
// no se puede afirmar con un contador global, se afirma sobre una lista de
// archivos. Esta.
//
// ── EL ALCANCE, Y POR QUÉ NO ES TODO EL REPO ──────────────────────────────
//
// Las piezas nuevas del control físico, más `AgregarProductoRecibido`, que es de
// la tanda anterior de este mismo flujo y comparte el modal con el escáner. Nada
// más. Correrlo sobre el repo entero sería empezar a arreglar deuda histórica de
// 62 pantallas en una tanda de limpieza, y esa lista se paga midiendo y con
// capturas, no con un candado que se pone rojo de entrada.
//
// La lista es explícita a propósito: un glob sobre `components/transferencias/`
// se llevaría puesta la tabla histórica, que no es de esta feature.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Las piezas que esta feature trajo o adoptó. Explícita, no un glob. */
const PIEZAS = [
  "components/sunmi/SunmiChipsFiltro.jsx",
  "components/sunmi/SunmiEscanerCodigoBarra.jsx",
  // Las dos que trajo la V2 móvil del 2026-09-09. Se suman acá el mismo día que
  // nacen: el encabezado de este archivo advierte que la lista es explícita, y
  // una pieza nueva que no se agrega queda sin cubrir sin que nada avise.
  "components/sunmi/SunmiFiltroEstado.jsx",
  "components/transferencias/RecepcionMovil.jsx",
  "components/transferencias/WorkspaceRecepcion.jsx",
  "components/transferencias/ResumenControlFisico.jsx",
  "components/transferencias/FichaProductoRecepcion.jsx",
  "components/transferencias/AgregarProductoRecibido.jsx",
  // La tarjeta que el V15 le dio al teléfono el 2026-09-11. Se suma el mismo día
  // que nace, como pide el encabezado: la lista es explícita, y una pieza nueva
  // que no se agrega queda sin cubrir sin que nada avise.
  "components/transferencias/TarjetaRecepcionMovil.jsx",
];

/**
 * EL CÓDIGO SIN LOS COMENTARIOS.
 *
 * No es una prolijidad: es la tercera vez que este repo se come el mismo
 * problema. Un candado que busca texto encuentra la PROSA, y las dos formas
 * duelen — un falso positivo frena de gusto, y un falso VERDE deja el candado
 * escrito afirmando nada. Acá los comentarios NOMBRAN los valores prohibidos,
 * porque explican por qué se fueron: sin este filtro, este archivo se pondría
 * rojo por sus propias explicaciones.
 */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── LO QUE NO PUEDE APARECER, Y QUÉ SIGNIFICA CADA UNO ────────────────────
const PROHIBIDO = [
  {
    nombre: "clase Tailwind de valor arbitrario",
    // `algo-[loquesea]`. Es la sintaxis de Tailwind para un valor que no está en
    // la escala: `grid-cols-[…]`, `max-h-[92vh]`, `w-[220px]`, `text-[13px]`.
    // Si una pieza lo necesita, el valor pertenece al kit o a la escala.
    patron: /[a-z0-9]-\[[^\]]+\]/g,
    porque: "un valor fuera de la escala; si hace falta, pertenece al kit",
  },
  {
    nombre: "color literal de Tailwind",
    // El kit lee `--pos-*`, `--card-*` y `--app-*`: un `bg-red-600` no cambia con
    // el tema y en catorce temas queda mal en varios.
    patron: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|accent|decoration|placeholder|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    porque: "no sigue el tema; el color sale de las variables del kit",
  },
  {
    nombre: "z-index numérico",
    // Ni `z={9999}` ni `z-[9999]`. El número del apilado vive UNA vez, en el
    // dueño de la capa, y las pantallas declaran la intención.
    patron: /\bz=\{\s*\d+\s*\}|\bz-\[\d+\]|\bzIndex\s*:\s*\d+/g,
    porque: "el número del apilado vive en el kit; acá va la intención",
  },
  {
    nombre: "medida responsive declarada por la pantalla",
    // `maxWidth="sm:max-w-lg"`, `sm:w-96`, `lg:h-64`. Cuánto mide un modal o un
    // panel en cada corte es una decisión del kit, no de quien lo usa.
    patron: /\b(?:sm|md|lg|xl|2xl):(?:max-)?[wh]-[a-z0-9]/g,
    porque: "cuánto mide en cada corte lo decide el kit",
  },
];

/**
 * `style` inline con pinta VISUAL.
 *
 * Aparte de la lista porque no es una clase: se busca la propiedad adentro del
 * objeto. Y no se prohíbe `style` a secas —el kit lo usa para cosas que Tailwind
 * no puede expresar, como el `color-mix` del velo— sino las propiedades que sí
 * tienen su lugar en la escala.
 */
const ESTILO_VISUAL =
  /style=\{\{[^}]*\b(?:color|background|backgroundColor|width|height|maxWidth|maxHeight|minWidth|minHeight|padding|margin|fontSize|borderRadius|zIndex)\b/g;

test("las piezas del control físico no tienen NINGÚN valor visual arbitrario", () => {
  const hallazgos = [];

  for (const rel of PIEZAS) {
    const codigo = codigoDe(rel);

    for (const { nombre, patron, porque } of PROHIBIDO) {
      for (const m of codigo.matchAll(patron)) {
        hallazgos.push(`${rel} → ${nombre}: «${m[0]}» — ${porque}`);
      }
    }
    for (const m of codigo.matchAll(ESTILO_VISUAL)) {
      hallazgos.push(`${rel} → style visual inline: «${m[0].slice(0, 60)}…»`);
    }
  }

  assert.deepEqual(hallazgos, [], `\n  ${hallazgos.join("\n  ")}\n`);
});

test("EL CANDADO ENUMERA DE VERDAD: los nueve archivos existen y se leen", () => {
  // Sin esto, un archivo renombrado dejaría el candado en verde sin mirar nada,
  // que es el patrón que este repo ya se comió tres veces.
  for (const rel of PIEZAS) {
    const abs = path.join(RAIZ, rel);
    assert.ok(fs.existsSync(abs), `${rel} no existe: el candado dejó de cubrirlo`);
    assert.ok(codigoDe(rel).length > 200, `${rel} quedó vacío o ilegible`);
  }
  // El número va escrito para que sumar una pieza sea un acto deliberado: si
  // fuera `PIEZAS.length` contra sí mismo, este candado no afirmaría nada.
  assert.equal(PIEZAS.length, 9);
});

test("y los patrones ENCUENTRAN de verdad lo que dicen encontrar", () => {
  // La otra mitad: un patrón mal escrito no encuentra nada y el candado pasa
  // siempre. Se lo ejerce contra las cadenas exactas que esta tanda sacó.
  const casos = [
    ['<div className="lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">', "clase Tailwind de valor arbitrario"],
    ['<div className="max-h-[92vh]">', "clase Tailwind de valor arbitrario"],
    ['<p className="text-red-400">', "color literal de Tailwind"],
    ["z={9999}", "z-index numérico"],
    ['<div className="z-[9999]">', "z-index numérico"],
    ['maxWidth="sm:max-w-lg"', "medida responsive declarada por la pantalla"],
    ['<div className="sm:w-96">', "medida responsive declarada por la pantalla"],
  ];

  for (const [texto, nombreEsperado] of casos) {
    const pega = PROHIBIDO.filter((p) => {
      p.patron.lastIndex = 0;
      return p.patron.test(texto);
    }).map((p) => p.nombre);
    assert.ok(
      pega.includes(nombreEsperado),
      `«${texto}» tendría que caer en «${nombreEsperado}» y cayó en [${pega.join(", ") || "nada"}]`
    );
  }

  ESTILO_VISUAL.lastIndex = 0;
  assert.ok(ESTILO_VISUAL.test('<div style={{ width: 220 }}>'), "el style visual no se detecta");
  ESTILO_VISUAL.lastIndex = 0;
  // Y lo que NO es visual no molesta: el velo del kit usa `background` con
  // `color-mix`, que Tailwind no puede expresar, pero eso vive en el kit y no
  // en esta lista. Acá se comprueba que un `style` sin propiedad visual pasa.
  assert.ok(!ESTILO_VISUAL.test('<video style={{ objectFit: "cover" }}>'));
});

test("y no prohíbe lo que SÍ es de la escala, que si no nadie podría escribir nada", () => {
  // Un candado que se pone rojo con `gap-3` o `lg:grid-cols-2` obliga a apagarlo.
  const sanas = [
    '<div className="lg:grid lg:grid-cols-2 gap-3 items-start">',
    '<div className="flex flex-col sm:flex-row gap-2 w-full">',
    '<span className="text-sm2 sunmi-text-muted shrink-0">',
    '<div className="sunmi-surface-soft sunmi-border rounded-lg overflow-hidden">',
    '<video className="w-full aspect-video object-cover">',
    "z={NIVEL_MODAL_GLOBAL}",
    'className="sm:flex-1"',
  ];

  for (const texto of sanas) {
    for (const { nombre, patron } of PROHIBIDO) {
      patron.lastIndex = 0;
      assert.ok(!patron.test(texto), `«${texto}» no puede caer en «${nombre}»`);
    }
  }
});
