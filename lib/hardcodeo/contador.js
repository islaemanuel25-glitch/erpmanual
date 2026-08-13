// lib/hardcodeo/contador.js
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
export const KIT_QUE_PISA = {
  SunmiSelectAdv: { fija: "ancho", prefijos: ["w-"], nota: "aplica `w-full` sin condición" },
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
 * @param {RegExp[]} opciones.excepcionesColor  su whitelist.
 * @returns {{hallazgos: Array, conteo: object}}
 */
export function contarArchivo(ruta, contenido, opciones = {}) {
  const patronesColor = opciones.patronesColor || [];
  const excepcionesColor = opciones.excepcionesColor || [];
  const hallazgos = [];
  const lineas = String(contenido).split("\n");

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
  const esLaPiezaDeModal = /^components\/sunmi\/SunmiModalLayout\.jsx$/.test(ruta);
  const importaModalDelKit =
    esLaPiezaDeModal ||
    /^\s*import\b[^\n]*\bSunmiModalLayout\b/m.test(contenido) ||
    /\bfrom\s+["'][^"']*\/SunmiModalLayout["']/.test(contenido);

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
    if (!excepcionesColor.some((w) => w.test(linea))) {
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
    for (const m of linea.matchAll(/\b([wh]|p[trblxy]?|m[trblxy]?|gap)-\[(\d+(?:\.\d+)?)px\]/g)) {
      const token = tokenDeEspaciado(Number(m[2]), m[1]);
      agregar(nro, "medida", m[0], token ? `${token} vale lo mismo` : null,
        token ? null : "no cae en la escala de espaciado");
    }

    // ── 3. MODAL A MANO ─────────────────────────────────────────────────────
    if (!importaModalDelKit && /fixed\s+inset-0/.test(linea)) {
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
    for (const m of linea.matchAll(/\bpos-(text|surface|control|border|bg)-[a-z0-9-]+/g)) {
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
    for (const apertura of etiquetasDeApertura(contenido, comp)) {
      const m = { 0: apertura.texto, index: apertura.inicio };
      const cn = (m[0].match(/className\s*=\s*(\{[\s\S]*?\}|"[^"]*")/) || [])[1] || "";
      // El `!` de Tailwind agrega `!important`, y con eso la clase que se pasa
      // SÍ le gana a la del componente. O sea que `!w-44` no es el problema: es
      // la solución que alguien ya aplicó. Marcarlo sería marcar el parche como
      // si fuera la herida — y el que lea la ficha iría a "arreglar" algo que
      // está bien, rompiéndolo.
      //
      // Lo detectó el auditor leyendo el código en la primera corrida de la
      // ficha: los tres SunmiSelectAdv de edición rápida usan `!w-44`.
      const choca = info.prefijos.filter((p) =>
        new RegExp("(^|[\\s\"'`{])" + p.replace("-", "\\-")).test(cn)
      );
      if (!choca.length) continue;
      const nro = String(contenido.slice(0, m.index)).split("\n").length;
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
