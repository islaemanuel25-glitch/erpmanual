"use client";

import SunmiPill from "@/components/sunmi/SunmiPill";
import { ESTADO_OFERTA } from "@/lib/ofertas/estados";

// El sello de estado de una oferta.
//
// El mapa de colores vive ACÁ y en un solo lugar: si cada pantalla eligiera el
// suyo, la misma oferta se vería de un color en la lista y de otro adentro. Y
// usa los colores del kit (`SunmiPill`), no clases sueltas: no hay un solo color
// escrito a mano en este archivo.
//
// REVISAR y VENCIDA comparten el ámbar a propósito: las dos significan lo mismo
// para quien mira la pantalla —hay algo que decidir acá—, y distinguirlas por
// color obligaría a aprenderse una convención. Lo que las distingue es la
// palabra, que es lo que se lee.
//
// ── ACTIVA PASÓ DE CIAN A VERDE, Y PROGRAMADA A GRIS ────────────────────
//
// Compartían el cian, así que "está cobrando ahora" y "todavía no empezó" se
// veían igual, que es justo la distinción que se mira de un vistazo. El verde
// no es un color nuevo: `SunmiPill` lo expone desde `.sunmi-badge-success`, que
// ya estaba en el kit.
//
// El mapa sigue viviendo en UN solo lugar, que es el motivo por el que este
// archivo existe: la misma oferta no puede verse de un color en la lista y de
// otro adentro.
const COLOR_POR_ESTADO = {
  [ESTADO_OFERTA.BORRADOR]: "slate",
  [ESTADO_OFERTA.PROGRAMADA]: "slate",
  [ESTADO_OFERTA.ACTIVA]: "green",
  [ESTADO_OFERTA.REVISAR]: "amber",
  [ESTADO_OFERTA.VENCIDA]: "amber",
  [ESTADO_OFERTA.FINALIZADA]: "slate",
};

export default function EstadoOfertaPill({ estado }) {
  if (!estado) return null;
  return <SunmiPill color={COLOR_POR_ESTADO[estado] || "slate"}>{estado}</SunmiPill>;
}
