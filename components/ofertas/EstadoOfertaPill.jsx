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
const COLOR_POR_ESTADO = {
  [ESTADO_OFERTA.BORRADOR]: "slate",
  [ESTADO_OFERTA.PROGRAMADA]: "cyan",
  [ESTADO_OFERTA.ACTIVA]: "cyan",
  [ESTADO_OFERTA.REVISAR]: "amber",
  [ESTADO_OFERTA.VENCIDA]: "amber",
  [ESTADO_OFERTA.FINALIZADA]: "slate",
};

export default function EstadoOfertaPill({ estado }) {
  if (!estado) return null;
  return <SunmiPill color={COLOR_POR_ESTADO[estado] || "slate"}>{estado}</SunmiPill>;
}
