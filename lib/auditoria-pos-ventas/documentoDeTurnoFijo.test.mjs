// EL DETALLE DE TURNO ES UN DOCUMENTO PARA PAPEL: SUS COLORES NO SIGUEN AL TEMA.
//
// Archivo vigilado: app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx
//
// ── EL MOTIVO, QUE ES LO QUE HAY QUE ENTENDER ANTES DE TOCARLO ──────────────
//
// Esa pantalla no es una pantalla común: es una hoja imprimible. La tarjeta
// nace en `bg-white text-gray-900` y todo lo que vive adentro hereda ese negro
// sobre ese blanco, en los catorce temas. Es a propósito — lo que se imprime
// tiene que salir igual desde cualquier tema.
//
// El recuadro de MONTO INICIAL / ESPERADO / REAL era el ÚNICO elemento de la
// tarjeta que leía un token (`bg-[var(--card-bg)]`). El fondo cambiaba con el
// tema, el texto no cambiaba nunca, y en los temas oscuros quedaban uno encima
// del otro. Medido sobre la pantalla real, el contraste del valor daba:
//
//   sunmiGraphite 1,03 · operixNight 1,03 · sunmiBlueClassic 1,23
//   sunmiDarkCompact 1,31 · sunmiDark 3,27
//
// Cinco de catorce abajo de 4,5:1. Los números no se leían.
//
// Un token metido de nuevo ahí adentro reabre exactamente eso, y NO lo agarra
// ningún otro candado: el contador de colores fijos persigue lo contrario
// —colores escritos a mano— así que un `var(--loquesea)` le resulta invisible,
// y de hecho lo premia.
//
// ── POR QUÉ SE SACAN LOS COMENTARIOS ANTES DE MIRAR ─────────────────────────
//
// Porque el archivo vigilado EXPLICA el defecto arriba de la línea arreglada, y
// esa explicación nombra `--card-bg`. Un candado que busca texto encuentra los
// comentarios: en este repo ya pasó tres veces, y la peor fue un VERDE falso.
// Sin este `replace` el candado estaría en rojo por su propia documentación.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ARCHIVO = path.join(
  process.cwd(),
  "app", "modulos", "auditoria-pos-ventas", "turnos", "[id]", "page.jsx"
);

/** Comentarios de línea y de bloque afuera. El JSX usa `{/* … *\/}`, que es de bloque. */
export function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * El `className` del recuadro de caja.
 *
 * Se ancla en la condición que lo monta —los dos montos— y no en el `className`
 * mismo: si el ancla se buscara por el color, cambiar el color escondería el
 * recuadro del candado y éste pasaría en verde sin mirar nada.
 *
 * Devuelve null si no lo encuentra, y el test lo trata como ROJO. Un recuadro
 * que no se puede localizar no es un recuadro que esté bien.
 */
export function claseDelRecuadroDeCaja(fuente) {
  const limpio = sinComentarios(fuente);
  const ancla = limpio.indexOf("turno.montoEsperadoEfectivo != null");
  if (ancla < 0) return null;
  const m = /className="([^"]*)"/.exec(limpio.slice(ancla));
  return m ? m[1] : null;
}

/** Los tokens del tema que aparecen en una cadena de clases. */
export function tokensDelTema(clases) {
  return [...String(clases).matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]);
}

const FUENTE = fs.readFileSync(ARCHIVO, "utf8");

test("el recuadro de caja se puede localizar en el archivo", () => {
  assert.notEqual(
    claseDelRecuadroDeCaja(FUENTE),
    null,
    "no se encontró el recuadro de caja en app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx.\n" +
      "      Falla CERRADO a propósito: si el ancla se movió, este candado dejó de mirar lo que dice mirar."
  );
});

test("EL RECUADRO DE CAJA NO LEE NINGÚN TOKEN DEL TEMA", () => {
  const clases = claseDelRecuadroDeCaja(FUENTE);
  const tokens = tokensDelTema(clases);
  assert.deepEqual(
    tokens,
    [],
    "app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx — el recuadro de caja volvió a leer " +
      `${tokens.join(", ")}.\n` +
      "      Esa tarjeta es un documento para papel: nace en bg-white text-gray-900 y sus\n" +
      "      colores son fijos a propósito. Un token ahí adentro cambia el fondo con el tema\n" +
      "      mientras el texto sigue siendo negro, y en los cinco temas oscuros el valor baja\n" +
      "      hasta 1,03:1. Clases medidas: " + clases
  );
});

test("y tampoco los lee el resto de la tarjeta imprimible", () => {
  // Hoy es cierto para el archivo entero, así que se afirma para el archivo
  // entero: es la regla de verdad —la tarjeta no sigue al tema— y no solo el
  // caso que se acaba de arreglar.
  const tokens = tokensDelTema(sinComentarios(FUENTE));
  assert.deepEqual(
    tokens,
    [],
    "app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx — apareció " +
      `${tokens.join(", ")} en la tarjeta imprimible, que tiene los colores fijos a propósito.`
  );
});

// ── LA CONTRAPRUEBA, QUE ES LO QUE DISTINGUE UN CANDADO DE UN ADORNO ────────
//
// Los tres de arriba pasan también si el detector no detecta nada. Estos dos
// rompen a propósito lo que el candado dice defender y exigen que lo señale.
//
// SE ROMPE SOBRE LA FUENTE YA SIN COMENTARIOS, y no es un detalle: el comentario
// del archivo vigilado nombra `border-gray-900` al explicar por qué el borde
// dejó de ser un token, así que un `replace` sobre el texto crudo cambiaba ESA
// LÍNEA —la primera aparición— en vez de la clase. La contraprueba pasaba a
// romper un comentario, el candado lo estripaba, y daba verde. Lo encontró ella
// misma en la primera corrida.
const LIMPIO = sinComentarios(FUENTE);

test("CONTRAPRUEBA · con el bg-[var(--card-bg)] puesto de vuelta, lo señala", () => {
  const roto = LIMPIO.replace("bg-gray-100", "bg-[var(--card-bg)]");
  assert.notEqual(roto, LIMPIO, "la sustitución no aplicó: la contraprueba no probó nada");
  assert.deepEqual(tokensDelTema(claseDelRecuadroDeCaja(roto)), ["--card-bg"]);
});

test("CONTRAPRUEBA · y con el border-[var(--border)], también", () => {
  const roto = LIMPIO.replace("border-gray-900", "border-[var(--border)]");
  assert.notEqual(roto, LIMPIO, "la sustitución no aplicó: la contraprueba no probó nada");
  assert.deepEqual(tokensDelTema(claseDelRecuadroDeCaja(roto)), ["--border"]);
});

test("CONTRAPRUEBA · el detector no se conforma con el comentario que nombra el token", () => {
  // El archivo vigilado nombra --card-bg en su comentario. Si el candado mirara
  // el texto crudo estaría en rojo por eso, y el arreglo se vería como el
  // defecto. Acá se comprueba que la explicación sigue ahí y que igual pasa.
  assert.ok(FUENTE.includes("--card-bg"), "el comentario que explica el porqué se perdió");
  assert.deepEqual(tokensDelTema(claseDelRecuadroDeCaja(FUENTE)), []);
});
