// lib/proveedores/listas/panelDecision.js
//
// QUÉ FORMA TIENE EL PANEL de una fila de conciliación.
//
// El panel siempre tiene las mismas dos partes —arriba la comparación por
// origen, abajo las tarjetas elegibles— y lo único que cambia es QUÉ SE ELIGE.
// Este módulo decide eso y nada más.
//
// ── SON DOS PREGUNTAS, NO OCHO ESTADOS ──────────────────────────────────────
//
//   INTERPRETACION — "cómo se interpreta el precio". Las tarjetas son las
//                    hipótesis de `analizarFila`: el mismo precio leído como
//                    unidad, como pack de 5, como display.
//
//   PRODUCTO       — "a qué producto corresponde". Las tarjetas son productos,
//                    cada uno con el costo que daría.
//
// Y un tercer caso sin pregunta, donde se muestra la comparación y una sola
// tarjeta que explica por qué no hay nada que decidir.
//
// ── POR QUÉ NO SE MIRA `estado` PARA ELEGIR LA FORMA ────────────────────────
//
// `clasificarLinea` devuelve UN estado por prioridad y ERROR está primero. En
// una fila con error el estado ya no dice si el problema es de producto o de
// interpretación, y el panel necesita saberlo igual: debajo del cartel rojo van
// las opciones que correspondan.
//
// Además `estado` y `resultado` son ejes independientes. Una fila puede ser
// LISTO_PARA_ACTUALIZAR —el costo cambia— y a la vez AMBIGUA —hay dos lecturas
// creíbles—. Mapear por estado la aplicaría sola sin preguntar nada, que es
// justo el error que esta pantalla existe para evitar.
//
// Por eso la forma sale de los HECHOS de la fila, igual que hace estados.js, y
// el estado queda para el tono y para el cartel.
//
// ── LA COLA MUESTRA EXCEPCIONES ─────────────────────────────────────────────
//
// La tabla se llama "Pendientes de decisión" y las filas sanas no están ahí:
// se cuentan aparte y se aplican en lote. Se pueden abrir igual si alguien
// filtra por "Listos", y ahí ven la cuenta y pueden cambiar la interpretación.
// Abrir es para revisar; el camino normal es el botón de la cabecera.

import { ESTADO_LINEA } from "./estados.js";
import { confirmacionDeInterpretacionVigente } from "./vigenciaConfirmacion.js";

export const PREGUNTA = {
  /** Tarjetas = hipótesis de interpretación del precio. */
  INTERPRETACION: "INTERPRETACION",
  /** Tarjetas = productos candidatos. */
  PRODUCTO: "PRODUCTO",
};

/**
 * Los estados en los que hay comparación para mirar pero nada que elegir.
 *
 * EXCLUIDO NO ESTÁ ACÁ, y no es un olvido. La exclusión no es un estado: vive en
 * `ImportacionListaFila.excluidaManual`, una columna aparte, y nada escribe
 * nunca `estado = EXCLUIDO`. Estaba en esta lista y la rama no se activaba jamás:
 * una fila excluida a mano conservaba su estado original y el panel le seguía
 * preguntando como si nadie la hubiera excluido.
 *
 * Por eso `excluida` entra como HECHO PROPIO en formaDelPanel. Mismo principio
 * que en estados.js: se reciben los hechos, no se deducen unos de otros.
 */
const SIN_PREGUNTA = new Set([
  ESTADO_LINEA.SIN_CAMBIOS,
  ESTADO_LINEA.BLOQUEADO,
]);

/** Los dos en los que no se sabe a qué producto se le está por escribir. */
const SIN_PRODUCTO = new Set([
  ESTADO_LINEA.NO_MACHEADO,
  ESTADO_LINEA.CODIGO_DUPLICADO,
]);

/**
 * La forma del panel de una fila.
 *
 * No calcula ni consulta nada: recibe los hechos y devuelve el veredicto. Eso
 * la hace probable sin base de datos y sin React, y evita que la pantalla y la
 * clasificación se desincronicen.
 *
 * @param estado           uno de ESTADO_LINEA
 * @param tieneProducto    hay exactamente un producto vinculado
 * @param resultado        de `analizarFila`: RECOMENDADA | AMBIGUA | REVISAR
 * @param aplicada         la fila ya se aplicó y no se toca más
 * @param confirmada       una persona ya eligió la interpretación, y esa
 *                         elección SIGUE VIGENTE. Entra como hecho propio y no
 *                         se deduce de `resultado`: son dos cosas distintas —el
 *                         veredicto del motor y la decisión de una persona— y
 *                         mezclarlas perdería cuál de las dos sacó la fila de la
 *                         cola. La vigencia la decide `vigenciaConfirmacion.js`;
 *                         acá solo se recibe el sí o el no.
 * @param productoElegido  en la pregunta de producto, ya se eligió uno
 *
 * @returns {{
 *   pregunta: string|null,   qué se elige
 *   enCola: boolean,         aparece en "Pendientes de decisión"
 *   abrePorDefecto: boolean, la fila se abre sola al entrar
 *   error: boolean,          va el cartel rojo arriba de las tarjetas
 *   paso: {actual:number,total:number}|null
 * }}
 */
export function formaDelPanel({
  estado = null,
  tieneProducto = false,
  resultado = null,
  aplicada = false,
  excluida = false,
  confirmada = false,
  productoElegido = false,
} = {}) {
  const error = estado === ESTADO_LINEA.ERROR;

  // Una fila aplicada es historia: se puede mirar, no decidir.
  if (aplicada) {
    return { pregunta: null, enCola: false, abrePorDefecto: false, error: false, paso: null };
  }

  // Excluida a mano: alguien ya decidió que esta fila no va. Sigue en la lista
  // —la exclusión es reversible y hay que poder verla para deshacerla— pero no
  // pregunta nada. Va DESPUÉS de `aplicada` y ANTES de todo lo demás: es una
  // decisión humana y le gana a cualquier cosa que haya calculado el motor.
  if (excluida) {
    return { pregunta: null, enCola: true, abrePorDefecto: false, error, paso: null };
  }

  // ── Paso 1: ¿se sabe a qué producto corresponde? ────────────────────────
  //
  // Sin producto identificado no hay nada que interpretar todavía: interpretar
  // el precio de un producto que no se sabe cuál es no significa nada.
  //
  // ERROR no descarta esta rama. Una fila puede no machear Y además traer un
  // dato ilegible; primero hay que saber de qué producto se habla.
  if (SIN_PRODUCTO.has(estado) || (error && !tieneProducto)) {
    return {
      pregunta: PREGUNTA.PRODUCTO,
      enCola: true,
      abrePorDefecto: false,
      error,
      // Siempre dos pasos: elegir el producto nunca cierra la decisión, porque
      // después hay que saber cómo se lee el precio contra ESE producto. Cuando
      // la segunda queda resuelta sola, el paso 2 se muestra ya respondido con
      // la tarjeta sugerida marcada, y se confirma de una.
      paso: { actual: productoElegido ? 2 : 1, total: 2 },
    };
  }

  // ── Paso 2: con producto, ¿hay algo que elegir? ─────────────────────────
  if (SIN_PREGUNTA.has(estado)) {
    return { pregunta: null, enCola: true, abrePorDefecto: false, error, paso: null };
  }

  const hayQueElegir =
    // Una fila con error SIEMPRE se pregunta, aunque el motor no haya llegado a
    // producir un `resultado` y aunque alguien la haya confirmado antes. Sin esto
    // caía en la rama sana de acá abajo y desaparecía de la cola: quedaba un
    // error que nadie podía resolver porque nadie lo veía. Lo encontró el candado
    // "el error no bloquea la cola".
    error ||
    // Confirmar es responder JUSTO esta pregunta. Mientras la confirmación siga
    // vigente no se vuelve a preguntar, diga lo que diga el motor: para eso se
    // confirmó. Vencida, el hecho llega en false y la fila vuelve sola a la cola.
    (!confirmada &&
      (estado === ESTADO_LINEA.FACTOR_DUDOSO ||
        resultado === "AMBIGUA" ||
        resultado === "REVISAR"));

  if (hayQueElegir) {
    return { pregunta: PREGUNTA.INTERPRETACION, enCola: true, abrePorDefecto: false, error, paso: null };
  }

  // Fila sana: LISTO_PARA_ACTUALIZAR con una sola lectura creíble. Mismo panel
  // y misma tarjeta sugerida que cualquier otra interpretación —no es un caso
  // especial— pero FUERA de la cola: se aplica en lote desde la cabecera.
  return { pregunta: PREGUNTA.INTERPRETACION, enCola: false, abrePorDefecto: false, error, paso: null };
}

/**
 * El tono de la fila en la tabla.
 *
 * Se separa de la forma del panel porque responde otra pregunta: la forma dice
 * qué se elige, el tono dice cuánto preocupa. Una fila EXCLUIDO no pide nada
 * pero tampoco alarma; una NO_MACHEADO sí.
 */
export function tonoDeFila({ estado = null, aplicada = false, excluida = false } = {}) {
  if (aplicada || excluida) return "apagado";
  switch (estado) {
    case ESTADO_LINEA.ERROR:
    case ESTADO_LINEA.CODIGO_DUPLICADO:
    case ESTADO_LINEA.NO_MACHEADO:
      return "alerta";
    case ESTADO_LINEA.BLOQUEADO:
    case ESTADO_LINEA.FACTOR_DUDOSO:
      return "atencion";
    case ESTADO_LINEA.EXCLUIDO:
    case ESTADO_LINEA.SIN_CAMBIOS:
      return "apagado";
    default:
      return null;
  }
}

/**
 * ¿Esta fila PERSISTIDA está en la cola de pendientes de decisión?
 *
 * Es el único punto donde el vocabulario de la tabla se traduce al de los hechos.
 * Antes se le pasaba la fila cruda a `formaDelPanel`, y como los nombres no
 * coinciden —`excluidaManual` no es `excluida`, `productoBaseId` no es
 * `tieneProducto`— esos hechos llegaban siempre en false: una fila excluida a
 * mano seguía contando como pendiente.
 *
 * Los DOS HECHOS de la interpretación se leen acá y juntos, que es lo que la
 * pregunta necesita:
 *
 *   · `resultadoInterpretacion` — el veredicto del MOTOR, calculado al conciliar
 *     y guardado en su propia columna.
 *   · `confirmadoEn` contra `vinculadoEn` — la decisión de una PERSONA, y si
 *     todavía vale para el producto que la fila tiene hoy.
 *
 * Ninguno de los dos alcanza solo. Sin el primero, una fila ambigua se aplicaría
 * en lote sin que nadie eligiera cómo leer el precio. Sin el segundo, una fila ya
 * confirmada seguiría preguntando para siempre —y una revinculada después de
 * confirmar no volvería a preguntar nunca, que es el caso caro—.
 */
export function esDeLaCola(fila) {
  return formaDelPanel({
    estado: fila?.estado ?? null,
    tieneProducto: fila?.productoBaseId !== null && fila?.productoBaseId !== undefined,
    resultado: fila?.resultadoInterpretacion ?? null,
    aplicada: fila?.aplicada === true,
    excluida: fila?.excluidaManual === true,
    confirmada: confirmacionDeInterpretacionVigente(fila),
  }).enCola;
}

/**
 * LA MISMA PREGUNTA, EN FORMA DE `where` DE PRISMA.
 *
 * La cola se filtra en el servidor y paginada: son 917 filas y pueden ser cinco
 * mil. Traerlas todas para preguntarle a `esDeLaCola` cuáles entran perdería la
 * paginación, que es exactamente para lo que se persistió
 * `resultadoInterpretacion`.
 *
 * ── ESTO ES UNA SEGUNDA IMPLEMENTACIÓN, Y SE SABE ──────────────────────────
 *
 * Una en JavaScript y otra en SQL de la MISMA regla. No hay forma de evitarlo:
 * Postgres no puede llamar a `formaDelPanel`. Lo que sí se puede es que no se
 * separen en silencio, y por eso vive pegada a la otra, cada rama nombrando la
 * rama de `formaDelPanel` que traduce, y el candado "el `where` de la cola dice
 * lo mismo que `esDeLaCola`" las compara sobre una matriz de filas. El día que
 * alguien toque una sola de las dos, ese candado se pone rojo.
 *
 * ── LA COMPARACIÓN DE DOS FECHAS ────────────────────────────────────────────
 *
 * La vigencia compara dos columnas de la misma fila, y eso en Prisma necesita una
 * referencia de campo. Se recibe por parámetro —`prisma.<modelo>.fields.<campo>`—
 * porque este módulo es puro y lo importa el navegador: no puede tocar Prisma.
 *
 * @param refVinculadoEn referencia de campo a `vinculadoEn`
 */
export function filtroDeLaCola(refVinculadoEn) {
  // El espejo exacto de `confirmacionDeInterpretacionVigente`, negado: sin
  // confirmación, o con una que no es estrictamente posterior a la vinculación.
  // El empate cae acá, del lado de volver a la cola, igual que allá.
  const confirmacionNoVigente = {
    OR: [
      { confirmadoEn: null },
      { AND: [{ vinculadoEn: { not: null } }, { confirmadoEn: { lte: refVinculadoEn } }] },
    ],
  };

  return {
    // `if (aplicada)` — una fila aplicada es historia y sale antes que todo.
    aplicada: false,
    OR: [
      // `if (excluida)` — sigue visible porque excluir es reversible.
      { excluidaManual: true },
      // Los que entran a la cola cualquiera sea el veredicto: la rama de
      // SIN_PRODUCTO, la de SIN_PREGUNTA y el error, que siempre pregunta.
      {
        estado: {
          in: [
            ESTADO_LINEA.NO_MACHEADO,
            ESTADO_LINEA.CODIGO_DUPLICADO,
            ESTADO_LINEA.ERROR,
            ESTADO_LINEA.SIN_CAMBIOS,
            ESTADO_LINEA.BLOQUEADO,
          ],
        },
      },
      // `hayQueElegir` sin el error, que ya está arriba: lo que todavía tiene una
      // pregunta de interpretación abierta y nadie contestó.
      {
        AND: [
          confirmacionNoVigente,
          {
            OR: [
              { estado: ESTADO_LINEA.FACTOR_DUDOSO },
              { resultadoInterpretacion: { in: ["AMBIGUA", "REVISAR"] } },
            ],
          },
        ],
      },
    ],
  };
}

// ── `seleccionada` NO ENTRA ACÁ, Y ES UNA DECISIÓN ──────────────────────────
//
// `ImportacionListaFila.seleccionada` es la tercera marca del modelo, junto con
// `aplicada` y `excluidaManual`. Las otras dos sí cambian la forma del panel;
// esta NO, a propósito.
//
// Seleccionar es para el LOTE: dice qué filas entran en el próximo "aplicar", no
// qué hay que decidir sobre ellas. Una fila con una interpretación ambigua sigue
// siendo ambigua esté tildada o no, y preguntarle distinto según el tilde sería
// confundir dos cosas que no tienen nada que ver.
//
// Queda escrito porque así apareció el bug de `excluida`: nadie decidió que se
// ignorara, simplemente nunca se la nombró, y la omisión pasó por decisión. El
// candado "seleccionada no cambia la forma del panel" fija esto.
