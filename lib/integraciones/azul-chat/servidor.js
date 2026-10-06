// lib/integraciones/azul-chat/servidor.js
//
// LA PUERTA DE AZUL CHAT CABLEADA CONTRA LA BASE DEL ERP.
//
// `atender.js` decide y no conoce Prisma; esto le pasa lo que necesita leer. Son
// TRES lecturas y ninguna escritura: el usuario con su rol, el grupo real de un
// local (`getGrupoIdDeLocal`, el mismo que usan las rutas del ERP) y lo que lea
// la capacidad. No hay una consulta genérica, ni un modelo elegible desde afuera.
//
// Los ejecutores se escriben UNO POR CAPACIDAD del catálogo. El candado
// `catalogo.test.mjs` compara las dos listas, así que una capacidad sin ejecutor
// o un ejecutor sin capacidad se ven en rojo.

import prisma from "@/lib/prisma";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { atenderSolicitud } from "./atender.js";
import { ventasResumen } from "./ventasResumen.js";

export const cargadorErp = Object.freeze({
  usuario: (id) =>
    prisma.usuario.findUnique({
      where: { id },
      select: { id: true, activo: true, localId: true, rol: { select: { permisos: true } } },
    }),
  grupoDeLocal: (localId) => getGrupoIdDeLocal(localId),
});

export const ejecutoresErp = Object.freeze({
  ventas_resumen: (autorizacion, parametros, { ahora }) =>
    ventasResumen(autorizacion, parametros, { db: prisma, ahora }),
});

/**
 * Atiende una solicitud de Azul Chat contra el ERP.
 *
 * @param {{headers: Headers|object, cuerpo: string}} solicitud
 * @param {{entorno?: object, ahora?: number}} [opciones]
 */
export function atenderSolicitudAzulChat(solicitud, opciones = {}) {
  return atenderSolicitud(solicitud, { cargador: cargadorErp, ejecutores: ejecutoresErp, ...opciones });
}
