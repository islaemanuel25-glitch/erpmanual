"use client";

import { forwardRef } from "react";

import { componerClaseInput } from "@/lib/sunmi/claseAncho";

// `w-full` deja de ir siempre: lo pone `componerClaseInput` solo cuando quien
// usa el componente no declaró un ancho propio. Antes iban los dos y ganaba
// `w-full` por orden de la hoja de estilos, así que el ancho pedido no se
// aplicaba nunca. El porqué completo está en el módulo.
const BASE = "sunmi-input disabled:opacity-60 disabled:cursor-not-allowed";

// ── `sufijo` SE AGREGÓ Y SE SACÓ, Y CONVIENE SABER POR QUÉ ───────────────
//
// El V22 le puso a este componente un prop `sufijo` que dibujaba la unidad
// —"PACK", "CAJÓN", "UN"— adentro de la caja, a la derecha, porque el panel de
// corrección tenía dos campos de cantidad lado a lado y el rótulo de arriba no
// alcanzaba para distinguirlos.
//
// El V23 le puso a esos campos un − y un + adentro del mismo marco, y con los
// dos botones la etiqueta ya no entra: la unidad se mudó al rótulo, que era
// donde podía vivir sin pelear por el espacio.
//
// Con eso `sufijo` se quedó SIN UN SOLO CONSUMIDOR. Se saca en vez de dejarlo:
// un prop del kit que nadie pasa es código muerto que se lee como capacidad
// disponible, y es la misma familia del `conImporte` que CLAUDE.md tiene
// anotado — doce candados montando una prop que ya nadie pasaba.
//
// Si mañana hace falta de nuevo, está en la historia de git con su envoltorio y
// su `pr-12`, que era la parte no obvia.
const SunmiInput = forwardRef(function SunmiInput({ className = "", ...props }, ref) {
  return <input ref={ref} {...props} className={componerClaseInput(className, BASE)} />;
});

export default SunmiInput;
