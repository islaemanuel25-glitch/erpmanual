// lib/finanzas/alcanceFinanciero.js
//
// QUÉ LOCALES VE FINANZAS, Y CUÁL PUEDE ABRIR QUIEN PREGUNTA. Puro.
//
// ── POR QUÉ NO SE USA `destinosDeTransferencia` ──────────────────────────
//
// Porque contesta otra pregunta: a quién se le puede MANDAR mercadería. Y por
// eso saca al depósito —no se transfiere a sí mismo—, saca a los locales dados
// de baja —no se empieza una operación contra algo que ya no opera— y saca a los
// que no tienen cliente vinculado.
//
// Finanzas mira plata, no mercadería, y las tres exclusiones están mal acá:
//
//   · EL DEPÓSITO VENDE. Tiene su POS, sus turnos y su caja. Si no aparece en la
//     lista, su venta no existe para Finanzas y nadie se entera, porque no falla
//     nada: sale una lista más corta.
//   · UN LOCAL DADO DE BAJA TUVO HISTORIA. Cerrar un local no borra lo que
//     vendió, y mirar el mes en que cerró es justamente lo que se va a querer
//     hacer. Acá no se puede empezar ninguna operación —es una pantalla de
//     lectura— así que el motivo por el que Transferencias lo saca no aplica.
//     Aparece, y aparece MARCADO.
//   · EL CLIENTE VINCULADO es un requisito del circuito de transferencia, no de
//     tener caja.
//
// Reusar aquella puerta habría sido "reutilizar" en la letra y un defecto en los
// hechos. Las dos listas son legítimamente distintas y por eso son dos.

/**
 * Los locales que Finanzas muestra, a partir del depósito del grupo y de sus
 * vínculos.
 *
 * @param {object} args
 * @param {{id:number, nombre:string, activo?:boolean}|null} args.deposito
 * @param {Array<{id:number, nombre:string, activo?:boolean, es_deposito?:boolean}>} args.locales
 * @returns {Array<{localId:number, nombre:string, esDeposito:boolean, inactivo:boolean}>}
 */
export function localesFinancieros({ deposito = null, locales = [] } = {}) {
  const porId = new Map();

  const meter = (local, esDeposito) => {
    if (!local || local.id == null) return;
    const id = Number(local.id);
    if (!Number.isInteger(id) || id <= 0) return;
    // El depósito puede llegar por los dos caminos —`GrupoDeposito` y
    // `GrupoLocal`— y en producción no coinciden. Si ya está, se conserva la
    // marca de depósito: perderla lo mandaría al fondo de la lista como si fuera
    // un local más.
    const previo = porId.get(id);
    porId.set(id, {
      localId: id,
      nombre: local.nombre || previo?.nombre || "—",
      esDeposito: Boolean(esDeposito || previo?.esDeposito || local.es_deposito === true),
      // `activo !== true` y no `activo === false`: si quien consulta se olvida de
      // pedir la columna, TODOS salen marcados inactivos y eso se ve en el acto.
      // Con la forma permisiva, un `select` a medias haría que un local dado de
      // baja se viera normal sin que nada avise.
      inactivo: local.activo !== true,
    });
  };

  meter(deposito, true);
  for (const l of locales || []) meter(l, l?.es_deposito === true);

  // El depósito primero —es de donde sale la mercadería de todos— y el resto por
  // nombre, que es como se los busca. `localeCompare` con `es-AR` para que los
  // acentos no manden un local al final.
  return [...porId.values()].sort((a, b) => {
    if (a.esDeposito !== b.esDeposito) return a.esDeposito ? -1 : 1;
    return String(a.nombre).localeCompare(String(b.nombre), "es-AR");
  });
}

/**
 * ¿QUIEN PREGUNTA ES EL DEPÓSITO —o mira el grupo entero—?
 *
 * Es el MISMO criterio que usa el tablero de Transferencias, y se escribe igual
 * a propósito: sale de `Local.es_deposito`, no del `modo` de la vista, porque
 * aquél dice el ALCANCE —un local o todo el grupo— y no quién sos. Un admin en
 * vista global ve la lista porque está mirando el grupo entero, que es la misma
 * pregunta.
 *
 * @param {object} args
 * @param {"GLOBAL"|"LOCAL"} args.modo
 * @param {{es_deposito?: boolean}|null} args.localPropio
 */
export function esVistaDeDeposito({ modo, localPropio = null } = {}) {
  return modo === "GLOBAL" || localPropio?.es_deposito === true;
}

/** El motivo del rechazo, para que la ruta no tipee el texto dos veces. */
export const ERROR_FUERA_DE_ALCANCE = "Local fuera de tu alcance.";

/**
 * Y el de un `destino` que ni siquiera es un número de local.
 *
 * Se rechaza en vez de ignorarse, y es la misma regla que abajo: desviar en
 * silencio a otro local hace que la pantalla muestre números correctos del local
 * equivocado. `?destino=-3` es una URL rota; que conteste algo sería peor.
 */
export const ERROR_DESTINO_INVALIDO = "Local inválido.";

/** ¿Es un id de local? Entero y positivo. Ausente NO es inválido: es "no pidió". */
function destinoPedidoValido(v) {
  if (v === null || v === undefined || v === "") return { ausente: true };
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? { id: n } : { invalido: true };
}

/**
 * QUÉ LOCAL SE VA A CONSULTAR, o por qué no se puede.
 *
 * ── EL CANDADO QUE ESTO ES ────────────────────────────────────────────────
 *
 * `resolveVistaOperativa` ya rechaza un `?localId=` ajeno, pero este endpoint
 * pide el local con otro nombre —`destino`, por el mismo motivo que
 * Transferencias: `localId` está reservado y significa "el alcance que pido"—.
 * O sea que la protección de aquél NO cubre este parámetro, y sin esta función
 * un local podría mirar la caja de otro escribiendo la URL a mano.
 *
 * Las reglas, y son tres:
 *
 *   1. quien NO es depósito solo puede mirar SU local. Pedir otro es 403, no un
 *      silencioso "te doy el tuyo": un 403 se ve, y una consulta desviada en
 *      silencio se descubre cuando alguien saca conclusiones del local
 *      equivocado;
 *   2. quien NO es depósito y no pide nada, mira el suyo;
 *   3. el depósito puede pedir cualquiera DE SU GRUPO. Fuera del grupo es 403 —
 *      y el grupo se comprueba contra la lista que ya se leyó, no contra el
 *      número que vino en la URL.
 *
 * @returns {{localId:number|null, error?:string}} `localId` en null = mostrar la
 *          lista de locales (solo puede pasarle al depósito).
 */
export function resolverLocalPedido({
  esDeposito,
  localDeLaSesion = null,
  destinoPedido = null,
  localesDelGrupo = [],
} = {}) {
  const leido = destinoPedidoValido(destinoPedido);
  if (leido.invalido) return { localId: null, error: ERROR_DESTINO_INVALIDO };
  const pedido = leido.id || null;

  if (!esDeposito) {
    const propio = Number(localDeLaSesion) || null;
    if (!propio) return { localId: null, error: "Sin alcance autorizado." };
    if (pedido && pedido !== propio) return { localId: null, error: ERROR_FUERA_DE_ALCANCE };
    return { localId: propio };
  }

  if (!pedido) return { localId: null };

  const esDelGrupo = (localesDelGrupo || []).some((l) => Number(l.localId) === pedido);
  if (!esDelGrupo) return { localId: null, error: ERROR_FUERA_DE_ALCANCE };
  return { localId: pedido };
}

/**
 * TODAS LAS UBICACIONES QUE QUIEN PREGUNTA PUEDE MIRAR, de una vez.
 *
 * Es `resolverLocalPedido` para una lista en vez de un local: Pagos a
 * proveedores muestra las cuentas de todas las ubicaciones visibles juntas, así
 * que necesita el conjunto y no uno por uno. Las reglas son las MISMAS y se
 * escriben con las mismas palabras:
 *
 *   · quien NO es depósito ve solo su local, y sin local no ve nada;
 *   · el depósito —o un admin en vista global— ve todas las de su grupo, que
 *     salen de la lista que ya se leyó y no de un número que mandó el cliente.
 *
 * @returns {number[]}
 */
export function ubicacionesVisibles({ esDeposito, localDeLaSesion = null, localesDelGrupo = [] } = {}) {
  if (!esDeposito) {
    const propio = Number(localDeLaSesion);
    return Number.isInteger(propio) && propio > 0 ? [propio] : [];
  }
  return (localesDelGrupo || [])
    .map((l) => Number(l.localId))
    .filter((id) => Number.isInteger(id) && id > 0);
}
