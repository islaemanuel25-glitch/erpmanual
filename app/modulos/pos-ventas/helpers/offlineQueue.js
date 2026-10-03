// Helpers para cola offline de ventas pendientes
//
// LA COLA ES DINERO COBRADO. Cada ítem es una venta en efectivo que el cajero
// ya tiene en el cajón y que el servidor todavía no conoce. Tres reglas salen
// de eso, y cada función de abajo las respeta:
//
// 1. NADA SE DA POR ESCRITO SIN RELEERLO. `setItem` puede tirar —almacenamiento
//    lleno, bloqueado, ventana privada— o no tirar y no guardar. Toda escritura
//    se relee y se busca lo que se escribió.
//
// 2. UNA COLA QUE NO SE PUEDE LEER NO ES UNA COLA VACÍA. Antes, un JSON roto
//    devolvía `[]`, y el siguiente `enqueue` escribía encima: las ventas que
//    estaban ahí desaparecían sin rastro. Ahora el contenido ilegible se copia
//    tal cual a otra clave, se comprueba la copia, y recién entonces se libera
//    la clave principal. Si la copia no se puede hacer, no se escribe nada y la
//    cola queda informada como ilegible: no se encola ni se sincroniza encima.
//
// 3. SE MODIFICA CON CANDADO. Dos pestañas del POS comparten este
//    almacenamiento; un leer-modificar-escribir de una pisa el de la otra. Las
//    escrituras van bajo un Web Lock con nombre cuando el navegador lo tiene
//    (`conCandadoDeCola`). No es una garantía completa —el almacenamiento de
//    otra pestaña se propaga solo— y por eso cada escritura se relee igual.

const STORAGE_KEY = "posVentasOfflineQueue_v1";

/** Donde se aparta, sin tocarlo, el contenido de una cola que no se pudo leer. */
export const CLAVE_COLA_ILEGIBLE = "posVentasOfflineQueue_v1_ilegible";

/** El Web Lock que serializa las escrituras de la cola entre pestañas. */
export const NOMBRE_CANDADO_COLA = "erpazul-pos-cola-offline";

/** Por qué la cola no se pudo leer. */
export const COLA_NO_LEGIBLE = Object.freeze({
  /** No hay almacenamiento, o tira al leer. */
  SIN_ALMACENAMIENTO: "SIN_ALMACENAMIENTO",
  /** El contenido no es una lista y no se pudo apartar a salvo. */
  ILEGIBLE: "ILEGIBLE",
});

/**
 * Estructura de item en cola:
 * {
 *   clientVentaId: string (UUID),
 *   createdAt: number (timestamp),
 *   localId: number,
 *   grupoId: number,
 *   userId: number,
 *   formaPago: string,
 *   subtotal: number,
 *   descuento: number,
 *   descuentoPorPuntos: number,
 *   total: number,
 *   clienteId: number | null,
 *   // Operador identificado al cobrar (referencia/legibilidad) + voucher firmado
 *   // por el server. Al sincronizar el server atribuye la venta con el VOUCHER
 *   // (infalsificable), no con operadorId. Ítems legacy sin voucher → operador null.
 *   operadorId: number | null,
 *   operadorVoucher: string | null,
 *   // Solo para mostrar a quién hay que pedirle el PIN. No viaja al servidor.
 *   operadorNombre: string | null,
 *   // El turno donde se cobró (2026-10-02). La venta se sincroniza contra ESTE
 *   // turno y no contra el de quien sincroniza. null en ítems anteriores o si la
 *   // pantalla nunca supo su turno: ver lib/pos-ventas/replayOffline.js.
 *   turnoId: number | null,
 *   items: Array<{
 *     productoBaseId, nombre, precio, cantidad,
 *     // Modo de venta de la línea (depósito + pack). "NORMAL" | "UNIDAD_REMANENTE".
 *     // Opcional: ítems legacy sin este campo se procesan como "NORMAL".
 *     modoVentaLinea: 'NORMAL' | 'UNIDAD_REMANENTE',
 *     // Trazabilidad de lista de precios (Etapa 4 — opcional, tolerar legacy sin estos campos):
 *     listaPrecioId: number | null,
 *     tipoPrecioAplicado: 'PRECIO_VENTA' | 'COSTO_MAS_MARGEN' | 'COSTO_PURO' | 'MANUAL_AUTORIZADO' | 'OVERRIDE_PRODUCTO',
 *     margenAplicado: number | null,
 *   }>,
 *   // Lo que la sincronización sabe de esta venta. Lo escribe solo el motor
 *   // (lib/pos-ventas/sincronizacionOffline.js). El servidor lo descarta al
 *   // registrar —guarda por lista blanca—, así que no cambia el hash del cobro.
 *   sync?: { estado, codigo, mensaje, intentos, ultimoIntentoEn },
 * }
 * Nota: ítems legacy (anteriores a Etapa 4) sin trazabilidad siguen siendo procesables.
 * El server resuelve la lista al procesar items sin listaPrecioId.
 */

function leerCrudo(clave) {
  return localStorage.getItem(clave);
}

/**
 * La cola, o por qué no se pudo leer.
 *
 * Si el contenido está roto, lo aparta (ver la regla 2 del encabezado) y
 * devuelve la cola vacía con `apartada: true`; si no lo pudo apartar, devuelve
 * `ok: false` y no escribió nada.
 *
 * @returns {{ ok: true, items: object[], apartada?: true } | { ok: false, motivo: string }}
 */
export function leerCola() {
  let crudo;
  try {
    crudo = leerCrudo(STORAGE_KEY);
  } catch (err) {
    console.error("No se pudo leer la cola offline:", err);
    return { ok: false, motivo: COLA_NO_LEGIBLE.SIN_ALMACENAMIENTO };
  }
  if (crudo === null || crudo === undefined || crudo === "") return { ok: true, items: [] };
  let parsed;
  try {
    parsed = JSON.parse(crudo);
  } catch {
    parsed = undefined;
  }
  if (Array.isArray(parsed)) return { ok: true, items: parsed };
  return apartarIlegible(crudo);
}

/** Lo apartado de colas que no se pudieron leer: [{ crudo, detectadoEn }]. */
export function leerColasIlegibles() {
  try {
    const crudo = leerCrudo(CLAVE_COLA_ILEGIBLE);
    if (!crudo) return [];
    const parsed = JSON.parse(crudo);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function apartarIlegible(crudo) {
  const noLegible = { ok: false, motivo: COLA_NO_LEGIBLE.ILEGIBLE };
  try {
    const previas = leerColasIlegibles();
    // Si lo ya apartado tampoco se puede leer, agregarle algo sería pisarlo.
    if (previas === null) return noLegible;
    const detectadoEn = Date.now();
    localStorage.setItem(CLAVE_COLA_ILEGIBLE, JSON.stringify([...previas, { crudo, detectadoEn }]));
    const copia = leerColasIlegibles();
    if (!copia?.some((a) => a?.crudo === crudo && a?.detectadoEn === detectadoEn)) return noLegible;
    // Se libera solo si sigue siendo lo que se copió: otra pestaña pudo haber
    // escrito una cola nueva en el medio.
    if (leerCrudo(STORAGE_KEY) !== crudo) return noLegible;
    localStorage.removeItem(STORAGE_KEY);
    console.error("La cola offline estaba ilegible: se apartó en", CLAVE_COLA_ILEGIBLE);
    return { ok: true, items: [], apartada: true };
  } catch (err) {
    console.error("No se pudo apartar la cola offline ilegible:", err);
    return noLegible;
  }
}

/**
 * Compatibilidad: la cola como lista. Una cola ilegible devuelve `null`, nunca
 * `[]`: quien la use tiene que distinguir "no hay nada" de "no se sabe".
 */
export function loadQueue() {
  const leida = leerCola();
  return leida.ok ? leida.items : null;
}

function escribir(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch (err) {
    console.error("Error guardando cola offline:", err);
    return false;
  }
}

const idDe = (item) => (item && typeof item === "object" ? item.clientVentaId : undefined);

/**
 * Corre `fn` con el candado de la cola tomado, entre pestañas del mismo
 * navegador. Sin Web Locks corre directo: la relectura de cada escritura sigue
 * siendo la defensa.
 */
export async function conCandadoDeCola(fn) {
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === "function") {
    return locks.request(NOMBRE_CANDADO_COLA, () => fn());
  }
  return fn();
}

/** Lo que ve el cajero cuando la venta offline NO quedó guardada. */
export const ERROR_VENTA_OFFLINE_NO_GUARDADA =
  "La venta NO se pudo guardar en este equipo y NO está registrada. El carrito sigue acá: reintentá el cobro. No la des por vendida hasta ver \"Venta guardada offline\".";

/**
 * La pantalla no sabe en qué local, grupo o cuenta está: pasa cuando se abrió
 * (o recargó) sin conexión. Vender sin conexión exige haberla tenido al entrar.
 */
export const MENSAJE_SIN_CONTEXTO_OFFLINE =
  "Sin conexión, esta pantalla no sabe en qué local está. Para guardar ventas sin conexión, el POS tiene que haberse abierto con internet. La venta NO se guardó.";

/** Sin la caja donde se cobra no hay a qué turno mandar la venta. */
export const MENSAJE_SIN_CAJA_OFFLINE =
  "Sin conexión y sin caja abierta en esta pantalla: la venta NO se guardó. Hace falta conexión para abrir la caja.";

/**
 * Encola una venta y CONFIRMA que quedó guardada.
 *
 * El cajero ya recibió el efectivo: la pantalla solo puede decir "guardada",
 * imprimir el ticket y vaciar el carrito si la venta está de verdad en la cola.
 * Por eso no alcanza con que `setItem` no tire: se relee la cola y se busca la
 * venta por su `clientVentaId`. Y si la cola no se puede leer, no se encola:
 * escribir encima borraría lo que hay.
 *
 * @returns {{ ok: true, length: number } | { ok: false }}
 */
export function enqueue(ventaData) {
  const leida = leerCola();
  if (!leida.ok) return { ok: false };
  if (!escribir([...leida.items, ventaData])) return { ok: false };
  const guardada = leerCola();
  const esta = guardada.ok && guardada.items.some((item) => idDe(item) === ventaData?.clientVentaId);
  return esta ? { ok: true, length: guardada.items.length } : { ok: false };
}

/** `enqueue` con el candado de la cola. Es el que usa la pantalla. */
export function encolar(ventaData) {
  return conCandadoDeCola(() => enqueue(ventaData));
}

/**
 * Le cambia a UNA venta su estado de sincronización (`sync`) y lo relee. No
 * toca nada más del ítem: el contenido del cobro es evidencia.
 *
 * @returns {{ ok: boolean }}
 */
export function marcarSincronizacion(clientVentaId, sync) {
  const leida = leerCola();
  if (!leida.ok) return { ok: false };
  if (!leida.items.some((item) => idDe(item) === clientVentaId)) return { ok: false };
  const nueva = leida.items.map((item) => (idDe(item) === clientVentaId ? { ...item, sync } : item));
  if (!escribir(nueva)) return { ok: false };
  const releida = leerCola();
  const escrita = releida.ok && releida.items.find((item) => idDe(item) === clientVentaId);
  return { ok: Boolean(escrita) && JSON.stringify(escrita.sync) === JSON.stringify(sync) };
}

/**
 * Saca UNA venta de la cola y comprueba que ya no está y que las demás siguen.
 * Solo la llama el motor de sincronización con la confirmación del servidor, y
 * la pantalla para una venta que el servidor ya tiene en revisión.
 *
 * @returns {{ ok: boolean, length?: number }}
 */
export function quitarDeCola(clientVentaId) {
  const leida = leerCola();
  if (!leida.ok) return { ok: false };
  const restantes = leida.items.filter((item) => idDe(item) !== clientVentaId);
  if (restantes.length === leida.items.length) return { ok: true, length: restantes.length };
  if (!escribir(restantes)) return { ok: false };
  const releida = leerCola();
  if (!releida.ok) return { ok: false };
  const sigue = releida.items.some((item) => idDe(item) === clientVentaId);
  const otras = new Set(releida.items.map(idDe));
  const perdidas = restantes.some((item) => !otras.has(idDe(item)));
  return sigue || perdidas ? { ok: false } : { ok: true, length: releida.items.length };
}

/** Cuántas ventas hay en la cola; `null` si no se puede leer. */
export function getQueueLength() {
  const leida = leerCola();
  return leida.ok ? leida.items.length : null;
}
