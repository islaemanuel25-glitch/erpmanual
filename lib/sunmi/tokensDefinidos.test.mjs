// TODO TOKEN QUE EL KIT USA TIENE QUE ESTAR DEFINIDO EN ALGÚN LADO.
//
// ── POR QUÉ ESTE CANDADO Y NO EL ARREGLO DE UN TOKEN ──────────────────────
//
// `--pos-warning` apareció de casualidad, revisando otra cosa: `styles/sunmi.css`
// lo usa en `.sunmi-text-warning` y **ningún tema lo define**, así que lo que se
// ve en los catorce es el respaldo `#f59e0b` escrito en la misma línea.
//
// Lo importante no fue ese token: fue que al comparar lo que el kit USA contra lo
// que los temas DEFINEN aparecieron **siete**, no uno. Un token huérfano no rompe
// nada visible —cae al respaldo si lo tiene, o la propiedad queda inválida y el
// elemento hereda— así que no hay pantalla en blanco ni error en consola que
// avise. Se descubre comparando, y hasta hoy no lo comparaba nadie.
//
// ── LO QUE MIRA ──────────────────────────────────────────────────────────
//
// USADOS: `var(--algo)` en los dos `.css` del repo y en el JSX.
// DEFINIDOS: `--algo: valor` en cualquier `.css`, sea en un bloque de tema, en
// `:root` o adentro de una clase suelta.
//
// Los dos lados sacan comentarios antes de mirar. En el primer barrido, hecho a
// mano, `--x` entró como huérfano y estaba adentro de un comentario de
// `lib/hardcodeo/contador.mjs` que lo usaba de ejemplo. Es la cuarta vez en este
// repo que un reconocedor de texto toma la prosa por código.
//
//   npm test
//
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ═══════════════════════════════════════════════════════════════════════════
// LOS HUÉRFANOS CONOCIDOS, UNO POR UNO Y CON SU MOTIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// No se perdonan en bloque. Cada uno dice qué pasa hoy por no estar definido, que
// es lo que permite decidir cuál se arregla primero. Se van sacando de acá a
// medida que se definan; si uno deja de ser huérfano, el candado de más abajo
// salta avisando que la excepción quedó vieja.
//
// Medidos el 2026-08-17.
const HUERFANOS_DECLARADOS = {
  // `--pos-warning` SALIÓ de esta lista el 2026-08-17: ya lo definen los catorce
  // temas. Era el que destapó todo esto. Lo sacó este mismo candado, que se puso
  // rojo al definirlo diciendo que la excepción había quedado vieja — que es
  // exactamente para lo que está esa mitad.
  "--pos-accent-fg":
    "usado en styles/sunmi.css:37 con respaldo `var(--app-bg)`, que sí está definido " +
    "en los catorce. O sea que hay valor y el respaldo es deliberado; es el menos urgente.",
  // ── LOS TRES SIN RESPALDO, YA MEDIDOS EN EL NAVEGADOR ──────────────────
  //
  // Medidos el 2026-08-17 sobre las pantallas reales, con control: un gemelo que
  // usa `--pos-accent` —que sí existe— para comprobar que la medición distingue
  // "se aplicó" de "heredó". El primer intento usó `--app-fg` de gemelo y NO
  // distinguía, porque ese token vale lo mismo que el color heredado.
  "--accent":
    "app/modulos/auditoria-pos-ventas/balances/page.jsx:220, `bg-[var(--accent)]`. " +
    "MEDIDO: da `rgba(0,0,0,0)`, idéntico a no declarar nada. ES UN NO-OP y además " +
    "es el ÚNICO con daño visible: marca el estado seleccionado, así que ese botón " +
    "queda con `text-white` sobre el fondo heredado y sin su resalte.",
  "--border":
    "app/modulos/auditoria-pos-ventas/cajas/page.jsx:95, `border-[var(--border)]`. " +
    "MEDIDO: NO es un no-op — da `rgb(226,232,240)` contra `rgb(229,231,235)` sin " +
    "declarar. Al ser inválida, la propiedad cae a `currentColor`, o sea el color del " +
    "texto. El borde se ve, pero del color de la letra y no del borde del tema.",
  "--foreground":
    "app/modulos/auditoria-pos-ventas/turnos/page.jsx:372, color de texto. " +
    "MEDIDO: da `rgb(226,232,240)`, idéntico a no declarar. ES UN NO-OP, y hoy sin " +
    "daño: hereda el mismo color que el token pretendía. Eso depende del tema, " +
    "así que es suerte, no diseño.",
  // ── Y LOS DOS QUE SÍ TIENEN RESPALDO ───────────────────────────────────
  //
  // La primera versión de esta lista decía que los cinco iban sin respaldo. Era
  // falso: se leyó el `var(` sin mirar lo que venía después de la coma.
  "--pos-bg-soft":
    "components/auditoria/BitacoraAuditoria.jsx:216. TIENE respaldo " +
    "`rgba(127,127,127,0.12)` y MEDIDO da exactamente eso. Funciona como está escrito; " +
    "lo único que falta es que algún tema lo pueda cambiar.",
  "--sunmi-warning":
    "components/pos-ventas/ModalAperturaTurno.jsx:133, adentro de un `color-mix`. " +
    "TIENE respaldo `#f59e0b` y MEDIDO resuelve al ámbar al 12 %. Ídem: anda, pero " +
    "ningún tema lo puede cambiar.",
};

/** Cuántos son. Aparte, para que sumar uno a la lista se note. Eran 7. */
const CUANTOS_DECLARADOS = 6;

/** El piso que hace que un verde signifique algo. Al escribirlo se usaban 74. */
const PISO_DE_TOKENS = 50;

// ═══════════════════════════════════════════════════════════════════════════

/** Sin comentarios de bloque ni de línea. Los dos lados los sacan. */
export function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const cssDelRepo = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.css"], {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Los tokens que se USAN: `var(--algo)` en css y en el código.
 *
 * ── LOS NOMBRES ARMADOS AL VUELO NO SON TOKENS ────────────────────────────
 *
 * `AccesosRapidos.jsx:105` escribe `rgb(var(--module-${item.color}))`. El nombre
 * se arma en tiempo de ejecución, así que lo que este regex captura es el PREFIJO
 * —`--module-`— y ése no lo define nadie, lógicamente. El primer barrido lo
 * informó como huérfano y era un falso positivo: los ocho de verdad
 * —`--module-amber`, `--module-blue` y los demás— están definidos.
 *
 * Se reconocen por el `${` que viene pegado y se separan. No se descartan: se
 * devuelven aparte, porque un prefijo que NO tenga ningún token definido detrás sí
 * sería un defecto —un nombre mal escrito que no matchea nada— y eso se afirma
 * abajo.
 */
export function tokensUsados() {
  const usados = new Map(); // token -> dónde se vio primero
  const dinamicos = new Map(); // prefijo -> dónde
  const anotar = (texto, archivo) => {
    for (const m of sinComentarios(texto).matchAll(/var\(\s*(--[\w-]+)(\$\{)?/g)) {
      const destino = m[2] ? dinamicos : usados;
      if (!destino.has(m[1])) destino.set(m[1], archivo);
    }
  };
  tokensUsados.dinamicos = dinamicos;
  for (const rel of cssDelRepo()) anotar(fs.readFileSync(path.join(RAIZ, rel), "utf8"), rel);

  const codigo = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.jsx", "*.js"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const rel of codigo) {
    const p = path.join(RAIZ, rel);
    if (!fs.existsSync(p)) continue;
    anotar(fs.readFileSync(p, "utf8"), rel);
  }
  return usados;
}

/**
 * Los tokens que se DEFINEN, en cualquier `.css` y en cualquier bloque.
 *
 * NO se mira sólo `app/globals.css`: `styles/sunmi.css` define `--fila-color` y
 * `--fila-mezcla` adentro de sus propias clases, y el primer barrido —que sólo
 * miraba globals— los informó como huérfanos. Eran dos falsos positivos.
 */
export function tokensDefinidos() {
  const definidos = new Set();
  for (const rel of cssDelRepo()) {
    const texto = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
    for (const m of texto.matchAll(/(?:^|[;{]|\s)(--[\w-]+)\s*:/g)) definidos.add(m[1]);
  }
  return definidos;
}

test("ningún token que el kit usa queda sin definir", () => {
  const usados = tokensUsados();
  const definidos = tokensDefinidos();

  // ── EL CONTROL QUE HACE QUE EL VERDE VALGA ───────────────────────────────
  //
  // Si la enumeración devolviera pocos tokens —porque cambió la forma de
  // escribirlos, porque `git ls-files` falló, porque el regex se rompió— esto
  // daría verde sin haber mirado nada. La salida NO es bajar el piso.
  assert.ok(
    usados.size >= PISO_DE_TOKENS,
    `se encontraron ${usados.size} tokens en uso y el piso es ${PISO_DE_TOKENS}. La corrida NO vale.`
  );
  assert.ok(
    definidos.size >= PISO_DE_TOKENS,
    `se encontraron ${definidos.size} tokens definidos y el piso es ${PISO_DE_TOKENS}. La corrida NO vale.`
  );

  const huerfanos = [...usados.keys()].filter((t) => !definidos.has(t)).sort();
  const sinDeclarar = huerfanos.filter((t) => !HUERFANOS_DECLARADOS[t]);

  assert.deepEqual(
    sinDeclarar.map((t) => `${t}  (visto en ${usados.get(t)})`),
    [],
    "HAY UN TOKEN QUE SE USA Y NO LO DEFINE NADIE:\n  " +
      sinDeclarar.map((t) => `${t}  — visto en ${usados.get(t)}`).join("\n  ") +
      "\n\nNo rompe nada visible: si tiene respaldo se ve el respaldo, y si no, la propiedad\n" +
      "queda inválida y el elemento hereda. Por eso no hay error que avise.\n" +
      "Lo que corresponde es definirlo en los temas, NO agregarlo a la lista de declarados\n" +
      "para que esto pase."
  );
});

test("un nombre de token armado al vuelo tiene detrás tokens de verdad", () => {
  // `var(--module-${x})` no es un huérfano, pero el prefijo tiene que corresponder
  // a algo: si nadie define ningún `--module-…`, esa expresión no resuelve nunca y
  // el defecto es igual de silencioso.
  tokensUsados();
  const dinamicos = tokensUsados.dinamicos;
  const definidos = tokensDefinidos();
  assert.ok(dinamicos.size > 0, "no se encontró ningún nombre armado al vuelo: el chequeo de abajo no valdría");

  const sinNada = [];
  for (const [prefijo, archivo] of dinamicos) {
    const cuantos = [...definidos].filter((d) => d.startsWith(prefijo)).length;
    if (cuantos === 0) sinNada.push(`${prefijo}  — visto en ${archivo}`);
  }
  assert.deepEqual(
    sinNada,
    [],
    "Un `var(--prefijo${…})` sin NINGÚN token definido que empiece así no resuelve nunca:\n  " +
      sinNada.join("\n  ")
  );
});

test("una excepción que dejó de hacer falta salta sola", () => {
  // Si un declarado empieza a estar definido, la lista quedó vieja. Sin esto sólo
  // crece, que es como una excepción se estira sola.
  const definidos = tokensDefinidos();
  const yaNoSonHuerfanos = Object.keys(HUERFANOS_DECLARADOS).filter((t) => definidos.has(t));
  assert.deepEqual(
    yaNoSonHuerfanos,
    [],
    "Estos están declarados como huérfanos y YA ESTÁN DEFINIDOS. Sacarlos de la lista:\n  " +
      yaNoSonHuerfanos.join("\n  ")
  );

  assert.equal(
    Object.keys(HUERFANOS_DECLARADOS).length,
    CUANTOS_DECLARADOS,
    "cambió la cantidad de huérfanos declarados: si se agregó uno, que sea a propósito y con su motivo"
  );
});

test("el reconocedor no confunde un comentario ni un token local con un huérfano", () => {
  // La contraprueba del reconocedor, sobre texto escrito acá. Sin esto, "no hay
  // huérfanos" podría venir de un extractor que no ve nada.
  const conRuido = `
    /* var(--enComentarioDeBloque) */
    .clase { color: var(--usadoDeVerdad); }
    .otra { --definidoLocal: red; background: var(--definidoLocal); }
  `;
  const usa = [...sinComentarios(conRuido).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const define = [...sinComentarios(conRuido).matchAll(/(?:^|[;{]|\s)(--[\w-]+)\s*:/g)].map((m) => m[1]);

  assert.deepEqual(usa.sort(), ["--definidoLocal", "--usadoDeVerdad"], "el de adentro del comentario NO cuenta");
  assert.deepEqual(define, ["--definidoLocal"], "un token definido adentro de una clase suelta SÍ cuenta como definido");
  assert.deepEqual(
    usa.filter((t) => !define.includes(t)),
    ["--usadoDeVerdad"],
    "el huérfano de este fixture es uno solo: si diera otro número, el candado de arriba no valdría"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// LA FAMILIA DE TEXTO SEMÁNTICO ESTÁ COMPLETA Y NO TRAE COLORES PROPIOS
// ══════════════════════════════════════════════════════════════════════════
//
// `sunmi-text-success-soft` se agregó el 2026-09-07 para poder migrar la
// etiqueta de oferta del carrito sin cambiarle el color. No es un prefijo nuevo
// sobre una regla ajena: toda esta familia lee variables `--pos-*` desde
// siempre, y lo que faltaba era el miembro que lee `--pos-success-soft`.
//
// `sunmi-text-success` NO alcanzaba, y no es una opinión: usa `--pos-success`,
// que en los catorce temas vale otra cosa —#34d399 contra #6ee7b7 en los
// oscuros, #059669 contra #047857 en los claros—.

test("cada clase de texto semántico lee una variable, y ninguna trae un color literal", () => {
  const hoja = sinComentarios(fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8"));

  const reglas = [...hoja.matchAll(/^\.(sunmi-text-[a-z-]+)\s*\{([^}]*)\}/gm)];
  assert.ok(reglas.length >= 8, `se esperaban al menos 8 clases de la familia, hay ${reglas.length}`);

  for (const [, clase, cuerpo] of reglas) {
    assert.match(cuerpo, /var\(--[\w-]+/, `${clase} no lee ninguna variable de tema`);
    // El respaldo literal de algunas —`var(--pos-danger, #ef4444)`— ya estaba y
    // no se toca; lo que no puede haber es un color SIN variable delante.
    const sinVar = cuerpo.replace(/var\([^)]*\)/g, "");
    assert.doesNotMatch(sinVar, /#[0-9a-fA-F]{3,8}\b/, `${clase} trae un color literal fuera de var()`);
    assert.doesNotMatch(sinVar, /rgba?\(|hsla?\(/, `${clase} trae un color en rgb/hsl`);
  }
});

test("EL MIEMBRO QUE FALTABA: sunmi-text-success-soft lee su propia variable", () => {
  const hoja = sinComentarios(fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8"));

  const soft = hoja.match(/^\.sunmi-text-success-soft\s*\{([^}]*)\}/m);
  assert.ok(soft, "se fue la clase que sostiene la etiqueta de oferta del carrito");
  // El paréntesis de cierre va en el patrón a propósito. Sin él, `--pos-success-soft`
  // matchea también `--pos-success-soft-loquesea`, y la contraprueba del 2026-09-07
  // —apuntar la clase a un token inventado— dejaba este candado en VERDE mientras
  // el color se caía a nada.
  assert.match(soft[1], /var\(--pos-success-soft\)/, "dejó de leer --pos-success-soft");

  // Y la contraprueba de por qué existe: NO puede colapsar con `success`, que es
  // otra variable. Si algún día alguien las unifica, esto se pone rojo antes de
  // que el color cambie en la pantalla.
  const success = hoja.match(/^\.sunmi-text-success\s*\{([^}]*)\}/m);
  assert.ok(success);
  assert.notEqual(soft[1].trim(), success[1].trim(), "soft y success dejaron de distinguirse");
});
