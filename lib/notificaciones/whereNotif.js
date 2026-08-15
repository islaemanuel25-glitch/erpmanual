// Filtro Prisma PURO (sin imports de servidor, testeable) que aísla las
// notificaciones por UBICACIÓN ACTIVA además del grupo. Lo reexporta scope.js.
//
// Combina PERMISO + GRUPO + UBICACIÓN ACTIVA + RELACIÓN CON EL RECURSO:
//   - USUARIO:        solo si usuarioId == userId.
//   - GRUPO:          todo el grupo (anuncios; incluye legacy con alcance default).
//   - LOCAL/DEPOSITO: solo si localId == ubicación activa del lector.
//   - PARTICIPANTES:  solo si la ubicación activa es origen o destino.
//   - permisoRequerido: la notif no lo exige, o el lector lo tiene (o es "*").
//
// Fail-closed: sin grupoId (sin contexto) → no matchea nada. Sin localId activo,
// solo se ven USUARIO y GRUPO (nunca notificaciones atadas a una ubicación).
/**
 * DÍAS DE LA VENTANA. El listado es de alto volumen y siempre acota; el contador
 * tiene que contar EXACTAMENTE lo mismo o promete algo que no se puede abrir.
 */
export const VENTANA_NOTIF_DIAS = 7;

/**
 * El `createdAt` de una consulta de notificaciones, a partir de los parámetros.
 *
 * ── POR QUÉ VIVE ACÁ Y NO EN CADA RUTA ───────────────────────────────────────
 *
 * Porque estaba en cada ruta y NO decían lo mismo. `listar` forzaba siete días;
 * `contar` solo acotaba si le pasaban `desde`. Resultado medido en `erpazul_dev`:
 * la campanita mostraba **16** y la lista, con los mismos permisos y el mismo
 * usuario, **cero** — porque esas 16 son de junio. El número prometía algo que no
 * se podía abrir.
 *
 * Es la forma exacta del corolario de CLAUDE.md sobre los defaults: un valor que
 * se define en dos lugares se separa el día que alguien toca uno.
 *
 * @param {URLSearchParams} params
 * @returns {{gte: Date, lte?: Date}} el filtro de fecha, siempre acotado por abajo
 */
export function ventanaNotif(params) {
  let desde = null;
  const desdeParam = params?.get?.("desde");
  if (desdeParam) {
    const d = new Date(desdeParam);
    if (!isNaN(d.getTime())) desde = d;
  }
  if (!desde) {
    desde = new Date();
    desde.setDate(desde.getDate() - VENTANA_NOTIF_DIAS);
  }

  const rango = { gte: desde };

  const hastaParam = params?.get?.("hasta");
  if (hastaParam) {
    const h = new Date(hastaParam);
    if (!isNaN(h.getTime())) rango.lte = h;
  }

  return rango;
}

export function whereNotifUsuario(scope) {
  // Compatibilidad: acepta (grupoId, userId) legacy o el objeto scope nuevo.
  const s =
    typeof scope === "object" && scope !== null
      ? scope
      : { grupoId: scope, userId: arguments[1] };

  const grupoId = s.grupoId || null;
  const localId = s.localId || null;
  const userId = s.userId ?? null;
  const permisos = Array.isArray(s.permisos) ? s.permisos : [];

  // Sin contexto de grupo → fail-closed (no matchea ninguna fila).
  if (!grupoId) return { id: -1 };

  const tieneComodin = permisos.includes("*");

  // Alcance según ubicación activa.
  const alcanceOr = [{ alcance: "GRUPO" }];
  if (userId != null) alcanceOr.push({ alcance: "USUARIO", usuarioId: userId });
  if (localId) {
    alcanceOr.push({ alcance: "LOCAL", localId });
    alcanceOr.push({ alcance: "DEPOSITO", localId });
    alcanceOr.push({
      alcance: "PARTICIPANTES",
      OR: [{ origenLocalId: localId }, { destinoLocalId: localId }],
    });
  }

  const and = [{ OR: alcanceOr }];

  // FILTRO DE PERMISO. Sin comodín, la notificación tiene que pedir un permiso
  // QUE ESTA SESIÓN TENGA. Una fila con `permisoRequerido` en NULL ya no pasa:
  // el `in` de Prisma no matchea NULL, así que esas quedan solo para el admin.
  //
  // ── POR QUÉ CAMBIÓ, Y POR QUÉ ACÁ Y NO CON UNA MIGRACIÓN ────────────────────
  //
  // Antes decía `OR: [{ permisoRequerido: null }, ...]`, o sea que una fila SIN
  // permiso la veía cualquiera con el alcance correcto. Medido el 2026-08-15:
  // **122 filas en producción** —del 9 de junio al 24 de julio— tienen NULL,
  // porque la línea que lo escribe entró el 26 de julio. Son notificaciones de
  // pedidos a proveedor, con nombre de proveedor y número de pedido.
  //
  // Se cierra ACÁ y no con una migración de datos por tres motivos, y el tercero
  // es el que decide: tapa las 122 que ya existen, tapa también CUALQUIER FILA
  // FUTURA que nazca sin permiso —una migración solo arregla el pasado—, y se
  // revierte volviendo la imagen atrás, sin tocar un solo dato de producción.
  //
  // ── LO QUE ESTA REGLA ESCONDERÍA, si algún día existe ───────────────────────
  //
  // Una notificación PERSONAL sin permiso —`alcance: "USUARIO"` y
  // `permisoRequerido: null`— quedaría invisible para su propio destinatario. Hoy
  // no puede pasar: en todo el repo hay UN SOLO lugar que crea notificaciones
  // —`compras-proveedor/marcar-enviado`— y siempre pone `compras.ver`. Si mañana
  // se agrega una personal, tiene que nacer con un permiso, o esta rama necesita
  // su excepción escrita.
  if (!tieneComodin) {
    and.push({ permisoRequerido: { in: permisos } });
  }

  return { grupoId, AND: and };
}
