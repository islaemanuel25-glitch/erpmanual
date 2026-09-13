// lib/transferencias/destinosDeTransferencia.js
//
// A QUIÉN SE LE PUEDE TRANSFERIR. Una sola respuesta, en un solo lugar.
//
// ── EL DEFECTO QUE ESTO CIERRA ────────────────────────────────────────────
//
// La pantalla de crear transferencia ofrecía los destinos con
// `getLocalesDeGrupo`, que devuelve TODAS las filas de `GrupoLocal` y no filtra
// nada. El comentario que tiene al lado dice "EXCLUYE depósitos", y eso no es un
// filtro: es una creencia que se cumple de rebote, porque los depósitos viven en
// `GrupoDeposito` y no en `GrupoLocal`. El día que un depósito quede vinculado
// por las dos tablas, se ofrecería a sí mismo como destino.
//
// Y no miraba `activo`, así que un local DADO DE BAJA se ofrecía como destino de
// una transferencia nueva — empezar una operación contra algo que ya no opera.
//
// ── POR QUÉ ESTE MÓDULO NO TOCA PRISMA ────────────────────────────────────
//
// Para que el criterio se pueda ejercer sin base. `relacionesDelDeposito` hace
// la consulta y usa esto para decidir; las dos pantallas usan aquélla. Así el
// criterio tiene candados propios y la consulta no hace falta repetirla.
//
// ── Y POR QUÉ `getLocalesDeGrupo` NO SE UNIFICÓ CON ESTO ──────────────────
//
// Porque contesta OTRA PREGUNTA, y confundirlas sería un defecto y no una
// limpieza. Sus tres consumidores —crear producto, importar productos y
// promover a depósito— la usan para saber **en qué locales del grupo tiene que
// existir este producto**, o sea para replicar el catálogo.
//
// Filtrar ahí por `activo` rompería algo que hoy funciona: un local dado de baja
// y reactivado después quedaría sin los productos creados durante su baja, con
// un agujero en el catálogo que nadie vería hasta buscar un producto que
// "debería estar". Son dos preguntas legítimamente distintas sobre el mismo
// conjunto, y por eso son dos funciones y no una con un parámetro.

/**
 * ¿Este local puede RECIBIR una transferencia de este depósito?
 *
 * @param {{id:number, activo?:boolean, es_deposito?:boolean, tieneClienteVinculado?:boolean}} local
 * @param {{depositoLocalId?:number|null}} [contexto]
 */
export function puedeRecibirTransferencias(local, { depositoLocalId = null } = {}) {
  if (!local || local.id == null) return false;

  // El depósito no se transfiere a sí mismo. Se pregunta por los DOS caminos
  // —el par del grupo y la columna— porque en producción no coinciden: el
  // depósito del grupo ni siquiera está en `GrupoLocal`. Quedarse con uno solo
  // dejaría pasar a un segundo depósito el día que exista.
  if (local.es_deposito === true) return false;
  if (depositoLocalId != null && Number(local.id) === Number(depositoLocalId)) return false;

  // ── SE EXIGE EL DATO, NO SE ASUME ────────────────────────────────────────
  //
  // `activo === true` y no `activo !== false`: si quien consulta se olvida de
  // pedir la columna, TODOS los locales dejan de ser destinos válidos y la lista
  // sale vacía. Eso se ve en el acto. Con la forma permisiva, un `select` a
  // medias haría que un local dado de baja volviera a ofrecerse sin que nada
  // avise — que es exactamente la familia de defecto de la #97, donde un campo
  // que no se pidió llegó `undefined` y el predicado contestó que no.
  if (local.activo !== true) return false;

  // ── EL CRITERIO QUE DEFINE LA PANTALLA ───────────────────────────────────
  //
  // Un local opera con el depósito por TRANSFERENCIA solo si tiene un cliente
  // con `localVinculadoId` apuntándolo. Sin ese vínculo **se le vende y nada
  // más**, y eso no es un defecto: es el comportamiento correcto para un local
  // que no lleva su stock en este sistema — no hay a dónde sumarle la
  // mercadería, así que no hay transferencia que hacer.
  //
  // Es además el dato que ENCIENDE el remito: `/api/pos-ventas/crear` consulta
  // ese mismo vínculo para decidir si una venta del depósito genera su
  // transferencia. Medido sobre producción: desde que un local tiene cliente
  // vinculado, el 100 % de sus ventas generó remito —140 de 140 en uno, 66 de
  // 66 en el otro—, y los dos que no lo tenían acumulaban cero transferencias
  // en toda su historia. O sea que este filtro no inventa una regla: nombra la
  // que el sistema ya venía aplicando.
  //
  // Se buscó como un campo del modelo `Local` —en `tipo`, en `activo`— y no está
  // ahí. Vive en `Cliente.localVinculadoId`, y por eso `relacionesDelDeposito`
  // lo resuelve y lo pega a cada local.
  //
  // Mismo criterio estricto que `activo`: `=== true`. Si quien consulta no
  // resuelve el vínculo, la lista sale vacía y se ve en el acto, en vez de
  // ofrecer como destino a un local al que solo se le vende.
  return local.tieneClienteVinculado === true;
}

/** Los destinos válidos de una lista de locales del grupo. */
export function destinosDeTransferencia(locales, contexto) {
  return (locales || []).filter((l) => puedeRecibirTransferencias(l, contexto));
}
