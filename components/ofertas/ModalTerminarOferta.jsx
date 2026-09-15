"use client";

// TERMINAR UNA OFERTA AHORA: es irreversible y se toca sin querer.
//
// ── POR QUÉ HAY MODAL Y NO UN "DESHACER" ─────────────────────────────────
//
// Porque terminar una oferta CAMBIA LO QUE EL POS COBRA, en el mismo instante y
// sin avisarle a nadie. Un toque sin querer en la lista del celular sube el
// precio del producto a la caja que está vendiendo. `finalizar` escribe
// `finalizadaEn` con su autor y su motivo —no se borra nada— pero no hay ruta
// para desfinalizar: la vuelta es crear la oferta otra vez.
//
// ── EL MODAL DICE EL NÚMERO, NO "¿ESTÁS SEGURO?" ─────────────────────────
//
// Lo que hace falta saber antes de confirmar es QUÉ producto y A QUÉ PRECIO
// vuelve. Una pregunta genérica se contesta con el pulgar; un precio se lee.
//
// Es el mismo criterio que `ModalTerminar` de listas de proveedor, que pone el
// conteo de lo que se pierde adelante en vez de preguntar.

import { createPortal } from "react-dom";
import { Square } from "lucide-react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { money } from "@/lib/ofertas/crearOfertaMovil";

export default function ModalTerminarOferta({
  abierto,
  oferta = null,
  trabajando = false,
  error = null,
  onCerrar,
  onTerminar,
}) {
  if (!abierto || !oferta) return null;

  const nombre = oferta.producto || oferta.nombre;
  const hayPrecios = oferta.precioNormal != null && oferta.precioOferta != null;

  const contenido = (
    <SunmiModalLayout
      open={abierto}
      title="Terminar esta oferta ahora"
      subtitle="Desde que confirmes, el POS vuelve a cobrar el precio normal."
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-lg"
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      // `destructivo`: un clic afuera NO cierra. Lo que hay detrás del velo es la
      // lista, y tocar al lado del modal para "volver" no puede confirmarse ni
      // cancelarse por accidente.
      destructivo
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="slate" onClick={onCerrar} disabled={trabajando} className="py-2 text-xs">
            No, dejarla
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={onTerminar}
            disabled={trabajando}
            className="py-2 font-bold text-xs inline-flex items-center gap-1"
          >
            <Square size={14} aria-hidden="true" />
            {trabajando ? "Terminando…" : "Sí, terminar"}
          </SunmiButton>
        </div>
      }
    >
      <div className="rounded-lg border sunmi-border p-2.5">
        <div className="text-base2 font-semibold sunmi-text-strong leading-snug">{nombre}</div>
        {hayPrecios ? (
          <div className="text-sm3 sunmi-text-strong leading-snug mt-1 tabular-nums">
            Pasa de {money(oferta.precioOferta)} a {money(oferta.precioNormal)}
          </div>
        ) : (
          // Sin los dos precios no se dice ninguno. Inventar "vuelve a su precio
          // normal" sin el número es exactamente lo que este modal existe para
          // no hacer.
          <div className="text-sm3 sunmi-text-muted leading-snug mt-1">
            {oferta.cantidadProductos}{" "}
            {oferta.cantidadProductos === 1 ? "producto vuelve" : "productos vuelven"} a su precio
            normal.
          </div>
        )}
      </div>

      <p className="text-sm2 sunmi-text-muted leading-snug">
        No se borra nada: la oferta queda guardada con quién la terminó y cuándo, y se puede
        consultar en Terminadas. Lo que no hay es un botón para volver a prenderla — para eso hay
        que cargarla de nuevo.
      </p>

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
