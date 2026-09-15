"use client";

// EL SELLO "OFERTA" DE UN PRODUCTO DEL CATÁLOGO.
//
// ── EL DATO YA VIAJABA Y NADIE LO LEÍA ───────────────────────────────────
//
// `/api/productos/listar` arma `item.oferta` con `sellosDeOfertaVigente` desde
// que existe el módulo. Se calculaba en cada listado y se tiraba: el catálogo no
// decía que un producto estuviera en oferta, así que quien miraba el precio en
// la pantalla veía uno y el POS cobraba otro.
//
// ── LA CONDICIÓN ES LA DEL POS, Y NO ESTÁ ESCRITA DOS VECES ──────────────
//
// `sellosDeOfertaVigente` llama a `ofertasVigentesPorProductoLocal`, que es la
// MISMA función con la que `pos-ventas/crear` decide cobrar el precio de oferta
// y con la que el buscador del POS la informa. No hay una segunda versión de
// "vigente": si el POS no la aplica, acá no hay sello.
//
// Por eso este componente no pregunta nada: recibe el sello ya resuelto por el
// servidor y lo pinta. Cualquier `if` de vigencia acá sería la segunda versión.
//
// ── UNA COSA QUE EL SELLO NO PUEDE SABER ─────────────────────────────────
//
// Una oferta de SOLO EFECTIVO está vigente igual, y el POS la aplica o no según
// con qué se pague — algo que se decide después, en el cobro. El sello dice que
// hay una oferta vigente, que es verdad; no promete el precio final.
//
// ── EL COLOR ES EL MISMO QUE "ACTIVA" EN LA LISTA DE OFERTAS ─────────────
//
// Verde, de `SunmiPill`, que sale de `.sunmi-badge-success` y de `--pos-success`.
// La misma pieza y el mismo color para el mismo hecho en dos pantallas: una
// oferta que está cobrando.

import SunmiPill from "@/components/sunmi/SunmiPill";

/** El texto, en una constante: lo comparten la tarjeta, la tabla y los candados. */
export const TEXTO_SELLO_OFERTA = "OFERTA";

export default function SelloDeOferta({ oferta }) {
  if (!oferta) return null;
  return <SunmiPill color="green">{TEXTO_SELLO_OFERTA}</SunmiPill>;
}
