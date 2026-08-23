// lib/productos/ordenDeCargaProductos.js
//
// ¿YA PUEDEN SALIR LOS CONTADORES DE "PARA REVISAR"?
//
// ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
//
// La pantalla de Productos hace dos pedidos y NO cuestan lo mismo:
//
//   · `/api/productos/listar` está paginado: trae 25, 50 o 100 filas;
//   · `/api/productos/controles` recorre el catálogo ENTERO de la ubicación
//     hasta `TECHO_CONTROL` para contar las cuatro cards de mantenimiento.
//
// Los dos efectos que los disparaban no se conocían entre sí, así que en el
// primer render salían **en el mismo tick**. Medido con Resource Timing en la
// pantalla real, antes de este arreglo: el listado arrancó a los 4623 ms y
// terminó a los 6096; los controles arrancaron a los 4624. **Se solaparon 1472
// ms**, compitiendo por servidor y por base, y las primeras filas recién se
// dibujaron a los 6580 ms.
//
// El listado tiene que ganar: es lo que la persona vino a ver. Los contadores
// pueden llegar después, y mientras tanto las cards ya muestran su esqueleto.
//
// ── POR QUÉ NO ES UN `setTimeout` ───────────────────────────────────────────
//
// Un retraso fijo no coordina nada: adivina. En una máquina lenta el listado
// tarda más que el retraso y vuelven a pisarse; en una rápida se regalan
// milisegundos de espera al pedido que ya podría haber salido. La puerta se abre
// cuando el primer listado **terminó de verdad**, no cuando pasó un rato.
//
// ── POR QUÉ FALLA ABIERTA, Y NO CERRADA ─────────────────────────────────────
//
// Esto es una PRIORIDAD, no un control de corrección. Si algo sale distinto de
// lo previsto —el listado falló, el servidor no dice para qué ubicación
// contestó— la respuesta correcta es dejar pasar los controles, no bloquearlos.
// Una puerta que falla cerrada dejaría las cards en su esqueleto para siempre y
// convertiría un error de red en una pantalla a medias permanente.
//
// Por eso el único caso que devuelve `false` es el que importa: **el primer
// listado todavía no terminó.**
//
// Módulo puro, sin React: por eso se puede ejercer en un candado en vez de
// mirarlo y suponer. Es el mismo criterio que `pedidoYaSalio.js`, que resuelve
// la pregunta hermana —si hace falta volver a pedir— y con el que se usa junto.

/**
 * @param {object|null} listado  lo que se sabe del primer listado de esta vista:
 *   null mientras no terminó ninguno, o
 *   { termino: true, ok: boolean, localIdRespondido: number|null }
 *   - `ok` en false = el pedido falló (red, o el servidor dijo que no).
 *   - `localIdRespondido` es para qué ubicación contestó el servidor; null si no
 *     lo dice —un servidor viejo— o si no llegó a contestar.
 * @param {number} localIdActual  0 mientras el contexto no llegó
 * @returns {boolean} true si los controles ya pueden salir
 */
export function controlesPuedenSalir(listado, localIdActual) {
  // Nada terminó todavía: los controles esperan. Es el único `false`, y es el
  // motivo por el que este módulo existe.
  if (!listado || !listado.termino) return false;

  // El listado falló. No se los deja de rehenes: las cards son independientes y
  // pueden andar aunque el listado no. Además, sin esto un error de red dejaría
  // los controles bloqueados hasta recargar la página entera.
  if (listado.ok === false) return true;

  // Terminó bien pero todavía no se sabe la ubicación —el contexto no llegó—.
  // Lo que contestó el servidor es lo único que hay y ya es de la ubicación
  // correcta, porque la resolvió de la MISMA cookie que va a leer el contexto.
  if (!localIdActual) return true;

  // Un servidor que no informa la ubicación no puede desmentir nada. Bloquear
  // acá sería castigar a los controles por una limitación del servidor.
  if (listado.localIdRespondido === null || listado.localIdRespondido === undefined) return true;

  // El caso normal: el listado que terminó tiene que ser el de ESTA ubicación.
  // Si no lo es —se cambió de local— la puerta se cierra sola y vuelve a
  // abrirse cuando termine el listado del local nuevo. Eso es lo que conserva
  // el orden "primero listado, después controles" también al cambiar de sitio.
  return listado.localIdRespondido === localIdActual;
}

/**
 * Lo que se anota cuando un listado termina, sea como sea que haya terminado.
 *
 * Se separa de la pantalla para que el candado pueda comprobar que un fallo
 * también anota: si el `catch` se olvidara de llamar a esto, los controles no
 * saldrían nunca y no habría forma de verlo leyendo el componente.
 *
 * @param {{ok?: boolean, localIdRespondido?: number|null}} resultado
 */
export function listadoTermino({ ok = true, localIdRespondido = null } = {}) {
  return { termino: true, ok: ok !== false, localIdRespondido: localIdRespondido ?? null };
}
