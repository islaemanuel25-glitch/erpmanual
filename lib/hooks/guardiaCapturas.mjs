// lib/hooks/guardiaCapturas.mjs
//
// LA DECISIÓN DE LA GUARDIA DE CAPTURAS: ¿esta llamada abre un navegador o saca
// una captura? Pura: recibe el evento del hook y lo que dicen los archivos que
// el comando nombra, y devuelve qué hacer. El hook está en
// scripts/hook-guardia-capturas.mjs.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Emanuel prohibió las capturas y la revisión visual con navegador: cuestan
// tokens y no las mira nadie, porque él prueba en su celular lo desplegado.
// Estaba escrito en CLAUDE.md (regla 8.bis) y aun así, el 2026-10-12, una orden
// pidió "revisión visual" y la sesión abrió Chromium. Una regla escrita depende
// de que se la recuerde; un hook no.
//
// ── QUÉ FRENA ──────────────────────────────────────────────────────────────
//
//   · una herramienta MCP de navegador o captura, por su nombre;
//   · la skill `capturas`;
//   · un Bash que INVOCA un navegador: el comando de playwright o puppeteer, un
//     módulo de ellos importado en línea, un Chromium o Chrome headless, una
//     llamada a `screenshot(`, o un script del repo que maneja un navegador
//     —el arnés de capturas, las sondas, las mediciones—. Eso último no se
//     decide por una lista de nombres: se mira el ARCHIVO que el comando corre y
//     lo que importa, así un script nuevo del arnés queda frenado el día que se
//     escribe.
//
// Lo que NO frena: nombrar la palabra. `git grep chromium`, leer un archivo que
// la menciona o correr la suite no abren nada.
//
// ── LA ÚNICA PUERTA ────────────────────────────────────────────────────────
//
// `CAPTURAS_AUTORIZADAS=1`, adelante del comando o en el ambiente de la sesión,
// y solo para tandas de MEDICIÓN donde el número medido es el entregable
// (CLAUDE.md, regla 8.bis). Deja pasar, avisa en pantalla y deja una línea en
// `.claude/capturas-autorizadas.log`.

/** El texto de la denegación, tal como lo pidió Emanuel. */
export const MENSAJE_PROHIBIDO =
  "Prohibido: navegador y capturas. Lo visual lo prueba Emanuel desplegado en su celular. Seguí con candados y suite.";

export const AVISO_AUTORIZADA =
  "CAPTURAS AUTORIZADAS con CAPTURAS_AUTORIZADAS=1: solo vale para una tanda de MEDICIÓN cuyo entregable es el número medido. Queda en .claude/capturas-autorizadas.log.";

/** La puerta, en la línea del comando. */
export const AUTORIZADO_EN_COMANDO = /(?:^|[\s;&|(])CAPTURAS_AUTORIZADAS\s*=\s*1(?=$|[\s;&|'")])/;

/** Nombres de herramienta que son navegador o captura. Se comparan en minúsculas. */
const NOMBRE_DE_NAVEGADOR = /browser|chrome|playwright|puppeteer|screenshot|computer/;

/** La skill del arnés de capturas, con o sin prefijo de plugin. */
const SKILL_CAPTURAS = /(?:^|:)\/?capturas$/i;

/**
 * Lo que en un comando de Bash INVOCA un navegador o una captura. Cada uno pide
 * la forma de una invocación —una palabra de comando, un módulo entre comillas,
 * una llamada— y no la mera mención de la palabra.
 */
// El comienzo de un comando: el de la línea, o el que sigue a `;`, `&&`, `||`,
// `|`, `(`, una comilla invertida o `$(`; con variables de ambiente adelante.
const INICIO = String.raw`(?:^|[;&|(\x60]|\$\()\s*(?:[A-Za-z_]\w*=\S*\s+)*`;

const INVOCACIONES = [
  // playwright / puppeteer como comando, directo o por un lanzador de paquetes.
  new RegExp(
    INICIO +
      String.raw`(?:(?:npx|pnpx|bunx|yarn|pnpm|npm\s+exec|pnpm\s+(?:exec|dlx))\s+(?:(?:-y|--yes)\s+)?)?@?(?:playwright|puppeteer)(?:-core)?(?:\/[\w-]+)?(?:@[\w.^~-]+)?(?=$|\s)`
  ),
  // el módulo, importado o requerido en un script en línea (también por createRequire).
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|\)\s*\(\s*)["'`](?:@playwright\/test|playwright(?:-core|-chromium)?|puppeteer(?:-core)?)(?:\/[\w./-]*)?["'`]/,
  // un Chromium o Chrome ejecutado como comando, con o sin su ruta.
  new RegExp(INICIO + String.raw`(?:\S*\/)?(?:chromium(?:-browser)?|google-chrome(?:-stable)?|chrome|headless_shell)(?=$|\s)`),
  /\/opt\/pw-browsers\//,
  /--headless(?:=|\s|$)/,
  /--remote-debugging-(?:port|pipe)\b/,
  // una captura, en cualquier API.
  /\.screenshot\s*\(/,
  /\bscreenshot\s*\(\s*\)/,
  /\bcaptureScreenshot\b/,
  // lanzar un navegador desde un script en línea.
  /\b(?:chromium|firefox|webkit)\s*\.\s*(?:launch|connect|connectOverCDP|launchPersistentContext)\s*\(/,
  // la skill del arnés, por su carpeta.
  /\.claude\/skills\/capturas\b/,
];

/**
 * Lo que dentro de un ARCHIVO dice que maneja un navegador. Se usa sobre los
 * scripts que el comando corre y sobre lo que ellos importan.
 */
const MARCAS_EN_ARCHIVO = [
  /from\s+["'](?:playwright|puppeteer|@playwright\/test)[^"']*["']/,
  // import(), require() y el de createRequire: todos terminan en `("playwright…")`.
  /\(\s*["'](?:playwright|puppeteer|@playwright\/test)[^"']*["']\s*\)/,
  /--remote-debugging-(?:port|pipe)/,
  /\bPage\.captureScreenshot\b/,
  /\bscreenshot\s*\(/,
  /\/opt\/pw-browsers\//,
  /\b(?:chromium|firefox|webkit)\s*\.\s*(?:launch|connect|connectOverCDP|launchPersistentContext)\s*\(/,
];

/** Lo que ejecuta un archivo: un intérprete, o el archivo mismo al comienzo. */
const INTERPRETE = /^(?:[A-Za-z_]\w*=\S*\s+)*(?:\S*\/)?(?:node|nodejs|bun|deno|tsx|ts-node|sh|bash|zsh|npx\s+(?:-y\s+)?(?:tsx|zx))(?=\s|$)/;
const RUTA_DEL_REPO = /(?:^|[\s"'=(])((?:\/[\w.-]+)*?\/?(?:\.\/)?(?:scripts|\.claude|tests)\/[\w./-]+\.(?:mjs|cjs|js|ts|sh))(?=$|[\s"');&|])/g;

/**
 * Las rutas de archivos del repo que un comando EJECUTA, para leerlos. Solo las
 * de un tramo que corre un intérprete (`node scripts/x.mjs`) o que empieza con
 * el archivo (`./scripts/x.sh`): un `git log -- scripts/x.mjs` lo nombra y no lo
 * corre.
 */
export function rutasDeScripts(comando) {
  const out = new Set();
  for (const tramo of String(comando ?? "").split(/&&|\|\||[;|\n&]/)) {
    const t = tramo.trim().replace(/^\(+/, "");
    const corre = INTERPRETE.test(t) || /^(?:\.\/|\/\S*\/)?(?:scripts|\.claude|tests)\//.test(t);
    if (!corre) continue;
    RUTA_DEL_REPO.lastIndex = 0;
    let m;
    while ((m = RUTA_DEL_REPO.exec(t)) !== null) {
      // Una ruta absoluta se toma desde la carpeta del repo que nombra.
      const relativa = m[1].replace(/^.*?(?=(?:scripts|\.claude|tests)\/)/, "");
      out.add(relativa);
    }
  }
  return [...out];
}

/** ¿El texto de un archivo maneja un navegador? */
export function archivoManejaNavegador(texto) {
  const t = String(texto ?? "");
  return MARCAS_EN_ARCHIVO.some((re) => re.test(t));
}

/** ¿El comando, por su texto, invoca un navegador o una captura? */
export function comandoInvocaNavegador(comando) {
  const c = String(comando ?? "");
  return INVOCACIONES.some((re) => re.test(c));
}

/**
 * LA DECISIÓN.
 *
 * @param {object} evento  lo que Claude Code manda al PreToolUse: `tool_name`, `tool_input`
 * @param {object} contexto
 * @param {(ruta:string) => string[]} [contexto.textosDe]  los textos de un script y lo que importa
 * @param {boolean} [contexto.autorizadaEnAmbiente]  `CAPTURAS_AUTORIZADAS=1` en el ambiente de la sesión
 * @returns {{accion:"deny"|"pass"|"authorized", razon:string}}
 */
export function decidir(evento, { textosDe = () => [], autorizadaEnAmbiente = false } = {}) {
  if (!evento || typeof evento !== "object" || typeof evento.tool_name !== "string") {
    // No se puede evaluar: se deniega. Falla cerrada.
    return { accion: "deny", razon: `${MENSAJE_PROHIBIDO} (La guardia no pudo leer la llamada.)` };
  }
  const herramienta = evento.tool_name;
  const entrada = evento.tool_input && typeof evento.tool_input === "object" ? evento.tool_input : {};
  const comando = herramienta === "Bash" ? String(entrada.command ?? "") : "";
  const autorizada = autorizadaEnAmbiente === true || (comando && AUTORIZADO_EN_COMANDO.test(comando));

  let motivo = null;
  if (herramienta.startsWith("mcp__") && NOMBRE_DE_NAVEGADOR.test(herramienta.toLowerCase())) {
    motivo = `la herramienta ${herramienta} es de navegador o captura`;
  } else if (herramienta === "Skill" && SKILL_CAPTURAS.test(String(entrada.skill ?? "").trim())) {
    motivo = "la skill capturas";
  } else if (herramienta === "Bash") {
    if (comandoInvocaNavegador(comando)) motivo = "el comando invoca un navegador o una captura";
    else {
      // Un candado (`*.test.mjs`) no se mira por contenido: los de este repo son
      // funciones puras, y algunos nombran al navegador para probar cómo se
      // ARMA su llamada sin abrirlo (`sondaNavegador.test.mjs`). Frenarlos
      // frenaría justo lo que hay que hacer en lugar de capturar.
      for (const ruta of rutasDeScripts(comando).filter((r) => !/\.test\.mjs$/.test(r))) {
        if (textosDe(ruta).some(archivoManejaNavegador)) {
          motivo = `${ruta} maneja un navegador`;
          break;
        }
      }
    }
  }

  if (!motivo) return { accion: "pass", razon: "" };
  if (autorizada) return { accion: "authorized", razon: `${AVISO_AUTORIZADA} (${motivo})` };
  return { accion: "deny", razon: `${MENSAJE_PROHIBIDO} (${motivo})` };
}
