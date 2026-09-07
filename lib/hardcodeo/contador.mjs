// lib/hardcodeo/contador.mjs
//
// LA EXTENSIÓN ES `.mjs` A PROPÓSITO: este archivo es ESM y el `package.json` de
// la raíz no declara `"type": "module"`, así que con `.js` Node lo trataba como
// CommonJS y el import del trinquete explotaba con `Named export 'ETIQUETAS' not
// found`. Node 22 adivina el formato y lo tapaba; Node 18 no. Lo cuida
// `scripts/hardcodeoArranca.test.mjs`.
//
// EL CONTADOR DE HARDCODEO. Uno solo, compartido por la ficha y por el
// trinquete.
//
// ── POR QUÉ UNO SOLO ────────────────────────────────────────────────────────
//
// La ficha dice "esta pantalla tiene 12 medidas mágicas" y el trinquete dice
// "no subas de 340 en todo el repo". Si cada uno contara por su lado, el día que
// uno cambie de criterio empiezan a decir números distintos sobre lo mismo, y
// nadie se entera hasta que alguien los compara a mano. Acá el criterio se
// escribe una vez y los dos leen de él.
//
// ── QUÉ ES "HARDCODEO" ACÁ ──────────────────────────────────────────────────
//
// No es "código feo". Es un valor escrito a mano donde el proyecto ya tiene una
// pieza que lo resuelve: un color donde hay token de tema, una medida donde hay
// token de tipografía, un `<button>` donde hay `SunmiButton`. La marca no dice
// "esto está mal", dice "esto no usa lo que ya existe".
//
// Por eso cada hallazgo trae, cuando existe, el REEMPLAZO concreto. Un contador
// que dice "37 medidas mágicas" no sirve para nada; uno que dice "text-[11px] en
// tal línea, hay text-sm2 que vale lo mismo" se puede accionar.
//
// ── LO QUE NO SE CUENTA, Y POR QUÉ ──────────────────────────────────────────
//
// Está al final del archivo, en FUERA_DE_ALCANCE. Una categoría que no se puede
// contar de forma confiable no se cuenta: un número que a veces miente es peor
// que no tener número, porque igual se usa para decidir.
//
// Módulo puro: sin fs, sin red. Recibe el texto de un archivo y devuelve
// hallazgos. Por eso se puede ejercer con candados sobre un archivo de prueba.

// ── Tokens de tipografía que existen (tailwind.config.js, theme.extend.fontSize)
//
// Son literales en px, así que la equivalencia es exacta. OJO: la raíz de este
// proyecto es de 14px, no 16, así que las clases en rem NO valen lo que dice la
// documentación de Tailwind —`text-sm` son 12,25px acá— y por eso no se ofrecen
// como equivalencia: solo se ofrecen las que están definidas en px.
export const TOKENS_TIPOGRAFIA = {
  10: "text-xs2",
  11: "text-sm2",
  14: "text-base",
};

// Escala de espaciado: 1 unidad = 0.25rem = 3,5px con raíz de 14px. Solo se
// ofrece equivalencia si el número cae exacto en un escalón que existe.
const ESCALONES_SPACING = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];
const PX_POR_UNIDAD = 3.5;

/**
 * LAS FAMILIAS DE MEDIDA QUE SE CUENTAN, Y DE DÓNDE SALIÓ LA LISTA.
 *
 * ── EL HUECO QUE ESTO TAPA, medido el 2026-08-15 ───────────────────────────
 *
 * El detector miraba `w h p* m* gap` y SOLO en píxeles. Todo lo demás pasaba:
 * `max-h-[90vh]`, `rounded-[22px]`, `leading-[16px]`, `border-l-[4px]`,
 * `top-[1px]`, `translate-y-[3px]`, `w-[12.5rem]`.
 *
 * ── Y HAY QUE DECIR QUE `w-[137px]` NUNCA FUE EL PROBLEMA ──────────────────
 *
 * Estaba anotado que el contador no lo veía. Ejercido: **sí lo ve**, y lo vio
 * siempre — el regex no se tocó desde que se escribió el contador. El agujero
 * era otro y más grande: no las anchuras en píxeles, sino las OTRAS FAMILIAS y
 * las OTRAS UNIDADES.
 *
 * ── LA LISTA SALE DE ENUMERAR EL REPO, no de imaginar ──────────────────────
 *
 * Se listaron los 2.166 valores arbitrarios de `app/` y `components/` agrupados
 * por familia y por unidad. Entran las que son UNA LONGITUD y por lo tanto
 * podrían tener un token. Quedan afuera a propósito, y no por olvido:
 *
 *   `z-[60]`             — orden de apilado, no una longitud.
 *   `grid-cols-[1fr_auto]` — una expresión de layout; no hay token que ofrecer.
 *   `flex-[3]`           — una proporción.
 *   `shadow-[...]`       — una sombra entera, con color adentro.
 *   `animate-[...]`      — una animación.
 *   `bg-[var(--x)]` y `border-[var(--x)]` — ésos SON tokens usados bien; el
 *                          contador de color ya los mira y marcarlos acá sería
 *                          marcar la solución.
 */
const ESPACIADO = new Set([
  "w", "h", "p", "pt", "pr", "pb", "pl", "px", "py",
  "m", "mt", "mr", "mb", "ml", "mx", "my", "gap", "gap-x", "gap-y",
]);

const OTRAS_LONGITUDES = [
  "min-w", "max-w", "min-h", "max-h", "size", "basis",
  "rounded", "rounded-t", "rounded-b", "rounded-l", "rounded-r",
  "leading", "top", "right", "bottom", "left", "inset", "inset-x", "inset-y",
  "translate-x", "translate-y",
  "border", "border-t", "border-r", "border-b", "border-l", "border-x", "border-y",
];

/** Unidades de longitud que aparecen en el repo. `fr`, `auto` y `%` no son medidas fijas. */
const UNIDADES = "px|rem|em|vh|dvh|vw|dvw|ch";

const FAMILIAS_DE_MEDIDA = new RegExp(
  "(?<![\\w-])(" +
    [...OTRAS_LONGITUDES, ...ESPACIADO].sort((a, b) => b.length - a.length).join("|") +
    ")-\\[(\\d+(?:\\.\\d+)?)(" + UNIDADES + ")\\]",
  "g"
);

/** Qué token de espaciado equivale a N píxeles, o null. */
export function tokenDeEspaciado(px, prefijo) {
  const unidades = px / PX_POR_UNIDAD;
  if (!ESCALONES_SPACING.includes(unidades)) return null;
  return `${prefijo}-${unidades}`;
}

// ── Componentes del kit que FIJAN una propiedad ────────────────────────────
//
// Cada uno concatena clases propias con las que recibe. Cuando las dos tocan la
// misma propiedad CSS empatan en especificidad, y no decide el orden del
// atributo sino el de la hoja de estilos: el resultado es impredecible desde el
// lugar donde se escribe. Es el mismo problema que tenía `SunmiInput` con
// `w-full` antes del 2026-08-10, medido entonces en 75 de 77 inputs.
//
// La tabla se hizo leyendo los componentes, no adivinando. `SunmiInput` NO está
// porque ya cede: usa `componerClaseInput`, que pone `w-full` solo si nadie
// declaró ancho.
// `SunmiSelectAdv` SALIÓ DE ESTA LISTA el 2026-08-15, y no por conveniencia: ya
// no pisa. Desde la fase 4 negocia el ancho con `componerClaseInput` —la misma
// pieza que usa `SunmiInput`—, así que si la pantalla declara un ancho, el
// componente NO pone el suyo. La entrada describía un defecto que dejó de existir.
//
// Con ella se va también el comentario sobre `!w-44` que vivía más abajo: esas
// tres declaraciones perdieron el `!` en el mismo commit, porque el parche dejó
// de hacer falta. Y ahí está el motivo de sacar la entrada además del parche —
// medido, no supuesto: al quitar los `!` el conteo de `kit-pisado` saltó de 3 a
// 6, porque el contador seguía creyendo que la pieza pisaba. La entrada vieja
// convertía el arreglo en un empeoramiento aparente.
export const KIT_QUE_PISA = {
  SunmiSection: { fija: "disposición", prefijos: ["flex-", "gap-"], nota: "aplica `flex flex-col gap-3`" },
  SunmiListCard: { fija: "disposición", prefijos: ["flex-"], nota: "aplica `flex flex-col`" },
  SunmiPageSizer: { fija: "disposición", prefijos: ["flex-", "gap-"], nota: "aplica `flex items-center gap-1.5`" },
};

// ── Elementos crudos que tienen reemplazo en el kit ────────────────────────
export const CRUDOS = {
  button: "SunmiButton",
  input: "SunmiInput",
  select: "SunmiSelectAdv",
};

/**
 * La línea sin el comentario que va al final.
 *
 * Saca el de JSX —`{/* … *\/}`— y el de barra doble. No pretende entender el
 * lenguaje: una barra doble adentro de una cadena, o de una URL, se llevaría por
 * delante el resto de la línea. Por eso lo usa SOLO la cuenta de celdas, donde
 * el falso positivo era real y este recorte no puede inventar uno nuevo: si
 * corta de más, cuenta de MENOS, que es el lado seguro para un trinquete.
 *
 * Las otras categorías siguen mirando la línea entera, que es como venían. Que
 * un color escrito en un comentario al final de una línea de código cuente sigue
 * siendo cierto y queda anotado, pero cambiarlo movería números de todo el repo
 * y es otra tanda.
 */
export function sinComentarioAlFinal(linea) {
  return String(linea)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/, " ");
}

const CATEGORIAS = [
  "color",
  "medida",
  "modal",
  "crudo",
  "celda",
  "kit-pisado",
  "tema-paralelo",
];

/** Un contador vacío, con todas las categorías en cero. */
export function contadorVacio() {
  const c = {};
  for (const k of CATEGORIAS) c[k] = 0;
  return c;
}

/**
 * ¿Esta línea es TODO comentario?
 *
 * Se exporta para que ningún relevamiento la reimplemente a ojo. Ya costó dos
 * números mal: las dos veces, un `fixed inset-0` escrito dentro de un comentario
 * —en un archivo que justamente dice que NO usa modal— se contó como una capa
 * de modal. El contador la saltea desde siempre; el que contaba a mano, no.
 *
 * Una regla que vive en un lado y se reescribe en el otro diverge siempre.
 */
export const esComentario = (linea) => {
  const t = linea.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

/**
 * EL MISMO TEXTO, CON LOS COMENTARIOS `{/* … *​/}` EN BLANCO.
 *
 * ── EL DEFECTO QUE ARREGLA ─────────────────────────────────────────────────
 *
 * `esComentario` mira cómo EMPIEZA una línea. Alcanza para `//` y para el `*`
 * de un bloque JSDoc, y no alcanza para el comentario de JSX, que es un bloque
 * y cuyas líneas del medio empiezan con cualquier cosa.
 *
 * Medido el 2026-09-07 en `ImportarPedidoDesdeArchivo.jsx`: dos `rgb(51,65,85)`
 * escritos en prosa, adentro de un `{/* … *​/}` que explica una medición, se
 * contaban como colores fijos. Y volvió a pasar el mismo día, al escribir un
 * comentario en Reglas que NOMBRABA las clases viejas: el contador las contó.
 *
 * Es la quinta vez del patrón que CLAUDE.md tiene anotado —un reconocedor de
 * texto toma la prosa por código—, y la primera en la que la prosa no está al
 * principio de la línea.
 *
 * ── POR QUÉ SE BLANQUEA Y NO SE BORRA ──────────────────────────────────────
 *
 * El interior se reemplaza por espacios, carácter por carácter, y los saltos de
 * línea se conservan. Así el texto resultante tiene EXACTAMENTE el mismo largo y
 * la misma cantidad de renglones que el original, y todo lo que ya calculaba
 * números de línea —el `nro` del bucle, y el `slice(0, m.index).split("\\n")` de
 * la regla del kit— sigue dando lo mismo. Borrar habría movido cada hallazgo
 * posterior a la línea equivocada.
 *
 * ── LO QUE MIRA PARA NO EQUIVOCARSE, Y LO QUE NO ───────────────────────────
 *
 * No es un parser de JSX ni hace falta que lo sea. Recorre una vez y lleva dos
 * estados: si está adentro de un comentario, y si está adentro de una comilla.
 *
 *   · Las COMILLAS importan: `<p>{"{/*"}</p>` escribe esos caracteres como
 *     texto, y tomarlos por una apertura haría desaparecer el código de abajo
 *     hasta encontrar un cierre que no existe. Eso sería peor que el defecto que
 *     esto arregla: en vez de contar de más, dejaría de contar.
 *   · Los `//` también: una línea que MENCIONA `{/*` en prosa no abre nada. Se
 *     salta hasta el fin de renglón sin tocar el texto, así que lo que las
 *     reglas ya hacían con esa línea no cambia.
 *
 * Lo que NO cubre, dicho para que no se descubra tarde: una comilla que abre en
 * un renglón y cierra en otro —un template literal de varias líneas— pierde el
 * estado, porque las comillas se reinician en cada salto. Si adentro de ese
 * literal hubiera un `{/*`, se tomaría por comentario. No hay ninguno en el
 * repo; si aparece, el síntoma sería una cuenta que BAJA sin motivo.
 *
 * @param {string} contenido
 * @returns {string} el mismo texto, con el interior de los comentarios JSX en blanco.
 */
export function sinComentariosJsx(contenido) {
  const src = String(contenido);
  let salida = "";
  let dentro = false;
  let comilla = null;
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") {
      salida += "\n";
      comilla = null;
      i += 1;
      continue;
    }

    if (dentro) {
      if (src.startsWith("*/}", i)) {
        salida += "   ";
        dentro = false;
        i += 3;
      } else {
        salida += " ";
        i += 1;
      }
      continue;
    }

    if (comilla) {
      salida += c;
      if (c === "\\" && src[i + 1] && src[i + 1] !== "\n") {
        salida += src[i + 1];
        i += 2;
        continue;
      }
      if (c === comilla) comilla = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      comilla = c;
      salida += c;
      i += 1;
      continue;
    }

    // Un `//` no abre nada: se copia tal cual hasta el fin de renglón.
    if (src.startsWith("//", i)) {
      const fin = src.indexOf("\n", i);
      const hasta = fin === -1 ? src.length : fin;
      salida += src.slice(i, hasta);
      i = hasta;
      continue;
    }

    if (src.startsWith("{/*", i)) {
      salida += "   ";
      dentro = true;
      i += 3;
      continue;
    }

    salida += c;
    i += 1;
  }

  return salida;
}

/**
 * Las etiquetas de apertura de `<Componente …>` de un archivo, con o sin hijos.
 *
 * Recorta hasta el `>` que cierra la apertura, saltando los que estén dentro de
 * llaves, comillas o backticks —un `className={cond ? "a>b" : ""}` tiene un `>`
 * que no cierra nada—. Devuelve el texto y dónde empieza, para poder informar la
 * línea.
 */
export function etiquetasDeApertura(contenido, componente) {
  const salida = [];
  const src = String(contenido);
  let i = 0;
  while ((i = src.indexOf("<" + componente, i)) !== -1) {
    const siguiente = src[i + componente.length + 1];
    // `<SunmiSelect` no es `<SunmiSelectAdv`.
    if (siguiente && /[A-Za-z0-9_]/.test(siguiente)) { i += 1; continue; }
    let j = i, prof = 0, comilla = null, fin = -1;
    while (j < src.length) {
      const c = src[j];
      if (comilla) {
        if (c === "\\") { j += 2; continue; }
        if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'" || c === "`") comilla = c;
      else if (c === "{") prof++;
      else if (c === "}") prof--;
      else if (prof === 0 && c === ">") { fin = j; break; }
      j++;
    }
    if (fin === -1) break;
    salida.push({ texto: src.slice(i, fin + 1), inicio: i });
    i = fin + 1;
  }
  return salida;
}

/**
 * Cuenta el hardcodeo de UN archivo.
 *
 * @param {string} ruta       ruta relativa, para informar.
 * @param {string} contenido  el texto del archivo.
 * @param {object} opciones
 * @param {RegExp[]} opciones.patronesColor  los de check-theme-tokens.js.
 * @param {RegExp[]} opciones.excepcionesColor  su whitelist, en la forma vieja
 *   de regex peladas. Se sigue aceptando para no romper a quien ya la pasa.
 * @param {(linea: string, ruta: string) => boolean} [opciones.exentaColor]
 *   el `estaExento` de check-theme-tokens.js. Se RECIBE en vez de reimplementarse
 *   porque las excepciones ahora pueden estar scopeadas a un archivo, y una
 *   segunda copia de esa regla que no mire la ruta las aplicaría en todo el repo.
 *   Cuando no se pasa, se cae a probar `excepcionesColor` como regex peladas.
 * @returns {{hallazgos: Array, conteo: object}}
 */
export function contarArchivo(ruta, contenido, opciones = {}) {
  const patronesColor = opciones.patronesColor || [];
  const excepcionesColor = opciones.excepcionesColor || [];
  const exentaColor =
    opciones.exentaColor || ((linea) => excepcionesColor.some((w) => w.test(linea)));
  const hallazgos = [];
  // Se cuenta sobre el texto SIN los comentarios de JSX. Es una sola línea acá y
  // vale para todas las reglas de abajo: la prosa de un `{/* … */}` dejó de ser
  // código para todas por igual, en vez de que cada una aprenda a esquivarla.
  // El blanqueo conserva largo y renglones, así que los números de línea no se
  // mueven. Ver `sinComentariosJsx`.
  const codigo = sinComentariosJsx(contenido);
  const lineas = codigo.split("\n");

  // Un componente del kit tiene derecho a usar `<button>`: es lo que renderiza.
  const esDelKit = /^components\/sunmi\//.test(ruta);
  // El modal a mano se reconoce por contraste: si el archivo IMPORTA el layout
  // de modal del kit, lo que arma no es "a mano".
  //
  // ── SE MIRA UN IMPORT, NO UN MATCH DE TEXTO ────────────────────────────────
  //
  // Antes era `/SunmiModalLayout/.test(contenido)` sobre el archivo entero,
  // comentarios incluidos. El 2026-08-13 nombrar el componente en un comentario
  // hizo desaparecer las dos capas de `CarritoPedido` de la cuenta, y el
  // trinquete bajó de 42 a 40 SIN QUE SE MIGRARA NADA.
  //
  // Eso es lo peor que le puede pasar a este contador: el trinquete es lo único
  // que avisa si lo limpiado se vuelve a ensuciar, y uno que baja solo ya mintió
  // una vez. Esquivarlo reescribiendo el comentario es un hábito, y los hábitos
  // no sobreviven a la próxima sesión.
  //
  // Es además la misma familia que el comentario adentro del `className` de
  // `SunmiCard`: un comentario cambiando comportamiento.
  //
  // La pieza misma se saca por su ruta y no por su nombre: ella dibuja la capa
  // que todos los demás dejan de escribir, así que su `fixed inset-0` no es
  // deuda. Se nombra explícita para que agregar otro archivo a esta excepción
  // cueste una línea y se vea.
  //
  // ── Y LA UNIDAD ES LA CAPA, NO EL ARCHIVO ──────────────────────────────────
  //
  // Esto miraba además si el ARCHIVO importaba la pieza, y con eso un archivo con
  // VARIAS capas desaparecía entero de la cuenta apenas se migraba la primera.
  //
  // Medido el 2026-08-14: al migrar DOS de las TRES capas de
  // `app/modulos/clientes/page.jsx`, el trinquete pasó de 41 a 38. Bajó tres. La
  // tercera —`ModalCliente`— seguía armada a mano y dejó de contarse porque el
  // archivo ahora importaba la pieza. La cifra oficial quedaba corta y nada
  // avisaba, que es lo peor que le puede pasar a este contador: el trinquete es
  // lo único que dice si lo limpiado se vuelve a ensuciar.
  //
  // La pregunta correcta no era "¿este archivo usa la pieza?" sino "¿ESTA capa
  // está escrita a mano?", y esa se contesta sola: si una línea escribe
  // `fixed inset-0`, la capa la dibuja la pantalla y no el kit. Un archivo puede
  // usar la pieza para dos modales y escribir el tercero a mano — que es
  // exactamente el estado en que queda uno a medio migrar, y es justo cuando hace
  // falta que la cuenta sea fiel.
  //
  // La pieza misma se sigue sacando por su RUTA, que es lo que siempre la sacó.
  const esLaPiezaDeModal = /^components\/sunmi\/SunmiModalLayout\.jsx$/.test(ruta);

  const agregar = (linea, categoria, que, reemplazo, detalle) => {
    hallazgos.push({
      archivo: ruta,
      linea,
      categoria,
      que,
      reemplazo: reemplazo || null,
      detalle: detalle || null,
    });
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const nro = i + 1;
    if (esComentario(linea)) continue;

    // ── 1. COLOR ────────────────────────────────────────────────────────────
    // Los patrones vienen de check-theme-tokens.js para no tener dos listas de
    // colores prohibidos que se separen con el tiempo.
    if (!exentaColor(linea, ruta)) {
      for (const p of patronesColor) {
        if (p.test(linea)) {
          agregar(nro, "color", (linea.match(p) || [""])[0].trim(), "un token de tema (sunmi-* o var(--…))", "clase de color de Tailwind con número");
          break;
        }
      }
    }
    // Hex y rgb() escritos a mano. Se distingue el que va como respaldo de una
    // variable CSS: ahí el token SÍ se está usando y el hex es la red por si
    // falta, que es otra cosa y se informa aparte.
    for (const m of linea.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
      const enFallback = /var\(--[^)]*,\s*$/.test(linea.slice(0, m.index));
      agregar(
        nro,
        "color",
        m[0],
        enFallback ? null : "un token de tema",
        enFallback ? "respaldo de una variable CSS (menos grave)" : "color literal"
      );
    }

    // ── 2. MEDIDA ───────────────────────────────────────────────────────────
    for (const m of linea.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
      const px = Number(m[1]);
      const token = TOKENS_TIPOGRAFIA[px];
      agregar(nro, "medida", m[0], token ? `${token} vale lo mismo` : null,
        token ? null : "sin token equivalente: o se agrega uno o se deja");
    }
    for (const m of linea.matchAll(FAMILIAS_DE_MEDIDA)) {
      const familia = m[1];
      const valor = m[2];
      const unidad = m[3];

      // La equivalencia con un token solo existe para píxeles y para las
      // familias de la escala de espaciado. Una altura en `vh` o un radio en
      // `rem` es una medida mágica igual, pero no hay token que ofrecer.
      const enEscala = ESPACIADO.has(familia.replace(/^(min|max)-/, ""));
      const token = unidad === "px" && enEscala
        ? tokenDeEspaciado(Number(valor), familia)
        : null;

      agregar(nro, "medida", m[0], token ? `${token} vale lo mismo` : null,
        token ? null
          : unidad === "px"
            ? "no cae en la escala de espaciado"
            : `medida en ${unidad}: no hay token equivalente`);
    }

    // ── 3. MODAL A MANO ─────────────────────────────────────────────────────
    if (!esLaPiezaDeModal && /fixed\s+inset-0/.test(linea)) {
      agregar(nro, "modal", "fixed inset-0", "SunmiModalLayout", "capa de modal armada a mano");
    }

    // ── 4. ELEMENTO CRUDO ───────────────────────────────────────────────────
    if (!esDelKit) {
      for (const [tag, reemplazo] of Object.entries(CRUDOS)) {
        const re = new RegExp("<" + tag + "(\\s|>|$)", "g");
        for (const _ of linea.matchAll(re)) agregar(nro, "crudo", "<" + tag + ">", reemplazo, null);
      }
    }

    // ── 7. CELDA ESCRITA A MANO ─────────────────────────────────────────────
    //
    // Un `<td>` no entra en `CRUDOS` porque su reemplazo no es un componente:
    // es el MODO POR COLUMNAS de `SunmiTable`, que arma las celdas solo. Por eso
    // tiene categoría propia.
    //
    // ── SOLO CUENTA. NO DECIDE ──────────────────────────────────────────────
    //
    // No intenta averiguar si esa tabla podría ser por columnas: eso pide
    // entender la línea, marcaría de más, y es el mismo criterio por el que este
    // contador deja afuera los números de negocio. El relevamiento ya estableció
    // que 447 de las 494 pueden; acá lo único que hace falta es que el número no
    // pueda subir sin que nadie se entere.
    //
    // El `<td>` sin atributos y con la etiqueta cortada —`<td` y los atributos
    // en la línea siguiente— cuenta igual: son cinco en el repo y un patrón que
    // pida `<td ` o `<td>` los pierde.
    // Se mira la línea SIN su comentario del final. `esComentario` saltea la
    // línea que es toda comentario, pero no el comentario pegado a un código —y
    // acá eso importa, porque un `{/* … <td> … */}` explicando esto mismo se
    // contaría como una celda. Pasó al escribir el candado.
    if (!esDelKit) {
      for (const _ of sinComentarioAlFinal(linea).matchAll(/<td(?![A-Za-z])/g)) {
        agregar(nro, "celda", "<td>", "SunmiTable en modo por columnas", null);
      }
    }

    // ── 6. TEMA PARALELO ────────────────────────────────────────────────────
    // Las clases `pos-*` son el sistema de temas del punto de venta; `sunmi-*`
    // es el general. Una pantalla que mezcla los dos se ve distinta según por
    // dónde se entre.
    //
    // ── EL ANCLAJE NO ES DECORACIÓN: SIN ÉL SE CUENTAN 32 DE MÁS ───────────
    //
    // El patrón empezaba con `\b`, y `\b` matchea entre un guión y una letra.
    // O sea que `sunmi-pos-text-danger` —que es una clase LEGÍTIMA del sistema
    // general, definida en `styles/sunmi.css`— contenía `pos-text-danger` y se
    // contaba como tema paralelo. Medido el 2026-09-07: 32 ocurrencias, el 24 %
    // del total de la categoría, marcadas mal en la base y en el árbol de hoy.
    //
    // `(?<![\w-])` exige que antes no haya ni letra ni guión, así que la familia
    // tiene que EMPEZAR ahí. Es el mismo anclaje que `FAMILIAS_DE_MEDIDA` ya usa
    // desde siempre unas líneas más arriba, por esta misma razón — la regla
    // existía en el archivo y esta categoría no la había aplicado.
    for (const m of linea.matchAll(/(?<![\w-])pos-(text|surface|control|border|bg)-[a-z0-9-]+/g)) {
      agregar(nro, "tema-paralelo", m[0], "la clase `sunmi-*` equivalente", "usa el sistema de temas del POS");
    }
  }

  // ── 5. KIT PISADO ─────────────────────────────────────────────────────────
  // Se mira sobre el elemento entero y no línea por línea, porque el className
  // suele estar varias líneas abajo del nombre del componente.
  //
  // Se recorta la ETIQUETA DE APERTURA balanceando llaves y comillas, no con una
  // expresión regular que busque `/>`: la mitad de estos componentes llevan
  // hijos —`<SunmiSelectAdv …>` con sus opciones adentro— y una expresión que
  // exija autocierre no los ve. Costó encontrarlo: la ficha informaba 3 casos
  // cuando había 6, y los que faltaban eran justamente los de transferencias.
  for (const [comp, info] of Object.entries(KIT_QUE_PISA)) {
    // También sobre el texto sin comentarios de JSX: un `{/* … <SunmiInput
    // className="w-44" … */}` que EXPLICA el caso no es el caso.
    for (const apertura of etiquetasDeApertura(codigo, comp)) {
      const m = { 0: apertura.texto, index: apertura.inicio };
      const cn = (m[0].match(/className\s*=\s*(\{[\s\S]*?\}|"[^"]*")/) || [])[1] || "";
      // El `!` de Tailwind agrega `!important`, y con eso la clase que se pasa
      // SÍ le gana a la del componente. O sea que un `!w-44` no es el problema:
      // es la solución que alguien ya aplicó. Marcarlo sería marcar el parche
      // como si fuera la herida — y el que lea la ficha iría a "arreglar" algo
      // que está bien, rompiéndolo.
      //
      // El caso que lo motivó eran los tres `SunmiSelectAdv` de edición rápida
      // con `!w-44`. Ya no existe: la pieza negocia el ancho desde la fase 4 y
      // los tres perdieron el `!` porque dejó de hacer falta. La regla se queda
      // igual —vale para cualquier componente de la lista— pero conviene saber
      // que su ejemplo original está resuelto.
      const choca = info.prefijos.filter((p) =>
        new RegExp("(^|[\\s\"'`{])" + p.replace("-", "\\-")).test(cn)
      );
      if (!choca.length) continue;
      // `codigo` conserva el largo del original, así que este conteo de saltos
      // sigue dando la línea real del archivo.
      const nro = String(codigo.slice(0, m.index)).split("\n").length;
      agregar(nro, "kit-pisado", `${comp} recibe ${choca.join(", ")}`, null,
        `${comp} ${info.nota}: la clase que se le pasa puede no aplicarse`);
    }
  }

  const conteo = contadorVacio();
  for (const h of hallazgos) conteo[h.categoria] += 1;
  return { hallazgos, conteo };
}

/**
 * El veredicto del trinquete: comparar el conteo de hoy contra la línea de base.
 *
 * Vive acá, junto al contador, y no dentro del script: así se puede ejercer con
 * un candado sin tener que ensuciar el repo para que un número suba. Y así el
 * criterio de "empeoró" es uno solo, igual que el de contar.
 *
 * Devuelve `estado`:
 *   "subio"      → alguna categoría creció. El trinquete se pone rojo.
 *   "bajo"       → ninguna creció y alguna bajó. Verde, y conviene fijar la base.
 *   "sin-cambio" → todo igual. Verde.
 *
 * Una categoría que sube y otra que baja da "subio": no se compensan. Cambiar
 * diez colores fijos por diez medidas mágicas no es progreso, es mudanza.
 */
// ══════════════════════════════════════════════════════════════════════════
// EL INVENTARIO: QUÉ HAY, NO CUÁNTO HAY
// ══════════════════════════════════════════════════════════════════════════
//
// ── EL DEFECTO QUE ARREGLA, MEDIDO ─────────────────────────────────────────
//
// El trinquete comparaba TOTALES por categoría. Entre el 2026-08-22 y el
// 2026-09-06 entraron 17 medidas mágicas nuevas y salieron 15 viejas, y lo único
// que el guardia dijo fue "+2". Las 17 pasaron sin que nadie las viera, tapadas
// por deuda ajena que alguien había limpiado en otra pantalla.
//
// Eso es compensación cruzada, y no es un detalle: convierte el trinquete en un
// permiso. Basta con que otro equipo limpie para que uno pueda ensuciar.
//
// ── CÓMO SE IDENTIFICA UNA OCURRENCIA, Y POR QUÉ ASÍ ───────────────────────
//
// La clave es **archivo + categoría + texto**, con una CANTIDAD. No entra el
// número de línea, y es la decisión central:
//
//   · Con número de línea, mover un bloque veinte líneas abajo convertiría
//     cada ocurrencia vieja en una "nueva". Un refactor produciría cientos de
//     falsos positivos y el guardia se volvería inusable en una tarde.
//   · El `que` no es texto libre: es la salida normalizada de la regla
//     —`text-[11px]`, `pos-text-accent`, `fixed inset-0`—, así que dos escrituras
//     distintas del mismo defecto colapsan en la misma clave, y dos defectos
//     distintos no se mezclan.
//   · La CANTIDAD es lo que hace que duplicar una violación en el mismo archivo
//     se vea: 2 → 3 es un alta, aunque la clave ya existiera.
//   · El archivo entra en la clave a propósito: la misma violación copiada a
//     otra pantalla es deuda nueva, no la misma deuda mudada.
//
// Lo que este modelo NO distingue, dicho para que nadie lo descubra tarde:
// renombrar un archivo se ve como bajas en el nombre viejo y altas en el nuevo.
// Es el precio de no usar contenido, y se paga en la tanda que renombre.

/**
 * LA MARCA DE QUE HUBO VEREDICTO, EN UN SOLO LUGAR.
 *
 * El trinquete sale con código 1 cuando encuentra altas, y Node sale con 1
 * cuando el script se cae solo. El hook los separa buscando esta cadena: sin
 * ella no hubo veredicto, haya salido con el código que haya salido.
 *
 * Estaba escrita a mano en DOS archivos —el hook y su candado— y el productor la
 * imprimía por tercera vez. Al cambiar el texto del trinquete en esta tanda, esa
 * duplicación habría dejado al hook informando "no pudo correr" sobre un
 * contador que contestó perfecto: el defecto que el hook existe para evitar,
 * causado por el hook.
 */
export const MARCA_VEREDICTO = "TRINQUETE: entraron ocurrencias NUEVAS de hardcodeo.";

/**
 * El inventario de una lista de hallazgos: cuántas veces aparece cada
 * (archivo, categoría, texto).
 *
 * @param {Array<{archivo:string, categoria:string, que:string}>} hallazgos
 * @returns {Record<string, Record<string, Record<string, number>>>}
 */
export function inventarioDeHallazgos(hallazgos = []) {
  const inv = {};
  for (const h of hallazgos) {
    if (!h?.archivo || !h?.categoria) continue;
    const que = String(h.que ?? "");
    inv[h.archivo] ??= {};
    inv[h.archivo][h.categoria] ??= {};
    inv[h.archivo][h.categoria][que] = (inv[h.archivo][h.categoria][que] ?? 0) + 1;
  }
  return inv;
}

/**
 * Las ALTAS de `actual` contra `base`: toda clave cuya cantidad creció.
 *
 * Una clave que bajó o desapareció NO aparece acá, y es a propósito: el
 * trinquete nunca tuvo que castigar que se limpie. Lo que pasa a ser rojo es
 * que algo SUBA, sin importar qué haya pasado con el resto.
 *
 * @returns {Array<{archivo:string, categoria:string, que:string, antes:number, ahora:number, delta:number}>}
 */
export function altasContraBase(base = {}, actual = {}) {
  const altas = [];
  for (const [archivo, porCategoria] of Object.entries(actual)) {
    for (const [categoria, porQue] of Object.entries(porCategoria)) {
      for (const [que, ahora] of Object.entries(porQue)) {
        const antes = Number(base?.[archivo]?.[categoria]?.[que] ?? 0);
        if (ahora > antes) altas.push({ archivo, categoria, que, antes, ahora, delta: ahora - antes });
      }
    }
  }
  // Orden estable: por prioridad de categoría, después archivo, después texto.
  // Sin esto, dos corridas sobre el mismo árbol imprimen distinto y el informe
  // no se puede comparar consigo mismo.
  return altas.sort(
    (a, b) =>
      PRIORIDAD.indexOf(a.categoria) - PRIORIDAD.indexOf(b.categoria) ||
      a.archivo.localeCompare(b.archivo) ||
      a.que.localeCompare(b.que)
  );
}

/** Cuántas ocurrencias nuevas suman esas altas. */
export function totalDeAltas(altas = []) {
  return altas.reduce((s, a) => s + a.delta, 0);
}

export function compararConLineaBase(base, actual) {
  const subieron = [];
  const bajaron = [];
  for (const k of PRIORIDAD) {
    const antes = Number(base?.[k] ?? 0);
    const ahora = Number(actual?.[k] ?? 0);
    if (ahora > antes) subieron.push({ categoria: k, antes, ahora, delta: ahora - antes });
    else if (ahora < antes) bajaron.push({ categoria: k, antes, ahora, delta: ahora - antes });
  }
  const estado = subieron.length ? "subio" : bajaron.length ? "bajo" : "sin-cambio";
  return { estado, subieron, bajaron };
}

/** Suma conteos de varios archivos. */
export function sumar(conteos) {
  const total = contadorVacio();
  for (const c of conteos) for (const k of Object.keys(total)) total[k] += c[k] || 0;
  return total;
}

/**
 * Qué conviene arreglar primero. No es el volumen: es cuánto duele.
 *
 * El orden sale de qué tan visible es el problema para quien usa el sistema y
 * de qué tan mecánico es el arreglo. Un color fijo rompe un tema entero y se
 * arregla cambiando una clase; una medida mágica casi no se nota y a veces ni
 * siquiera tiene reemplazo.
 */
export const PRIORIDAD = ["color", "tema-paralelo", "modal", "kit-pisado", "crudo", "celda", "medida"];

export const ETIQUETAS = {
  color: "colores fijos",
  "tema-paralelo": "clases del tema paralelo del POS",
  modal: "modales armados a mano",
  "kit-pisado": "componentes del kit que pisan la clase recibida",
  crudo: "elementos crudos con reemplazo en el kit",
  celda: "celdas de tabla escritas a mano",
  medida: "medidas mágicas",
};

/**
 * LO QUE NO SE CUENTA, Y POR QUÉ.
 *
 * Está acá y no en un documento aparte para que se lea junto con lo que sí se
 * cuenta. Un contador que no dice qué deja afuera se lee como si contara todo.
 */
export const FUERA_DE_ALCANCE = [
  {
    que: "Textos de la interfaz escritos a mano en el JSX",
    porque:
      "No hay sistema de traducción ni catálogo de textos, así que no existe el " +
      "reemplazo que haría accionable el hallazgo. Contarlos daría un número " +
      "enorme y sin nada que hacer con él.",
  },
  {
    que: "Números de negocio en el código (umbrales, porcentajes, plazos)",
    porque:
      "Distinguir un umbral de negocio de un número de layout necesita entender " +
      "qué hace la línea, y eso no se puede hacer con texto. Marcaría de más y " +
      "el contador dejaría de creerse.",
  },
  {
    que: "Estilos en el atributo `style`",
    porque:
      "Muchos son legítimos: valores calculados en tiempo de ejecución, o " +
      "propiedades que Tailwind no cubre. Separar los legítimos de los demás " +
      "exige evaluar expresiones, no leerlas.",
  },
  {
    que: "Colores dentro de `components/sunmi/`",
    porque:
      "Es el kit: ahí es donde los colores TIENEN que estar escritos. Marcarlos " +
      "sería marcar la solución como si fuera el problema.",
  },
];
