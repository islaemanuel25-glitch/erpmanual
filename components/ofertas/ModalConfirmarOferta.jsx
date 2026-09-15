"use client";

// EL CARTEL DE UNA ACCIÓN DE OFERTA QUE NO SE PUEDE DESHACER.
//
// ── QUÉ REEMPLAZA ────────────────────────────────────────────────────────
//
// Dos `confirm()` del navegador en el detalle de la oferta:
//
//   «¿Finalizar "X"? Deja de aplicarse y pasa al archivo.»
//   «¿Eliminar "X" definitivamente?»
//
// Los dos tienen el mismo problema, y no es que sean feos: **un `confirm()` se
// cierra con Enter**. En el celular aparece como un cartel del sistema, encima
// de todo, con dos botones idénticos — y el que dice "Aceptar" está donde el
// pulgar ya estaba. Ninguno de los dos decía a cuánto pasa a venderse el
// producto, que es lo único que hace falta saber antes de bajar una promoción.
//
// ── POR QUÉ `destructivo` ────────────────────────────────────────────────
//
// Con `destructivo`, el velo NO cierra al tocar afuera. Este modal se abre desde
// una pantalla que en el teléfono se recorre con el pulgar, así que un toque al
// costado es lo más fácil que hay — y cerrar sin querer no es grave acá, pero la
// prop hace además que `Escape` siga la misma regla, y eso mantiene el
// comportamiento parejo con los otros modales de acción del sistema.
//
// ── EL TEXTO NO VIVE ACÁ ─────────────────────────────────────────────────
//
// Lo arma `lib/ofertas/confirmaciones.js`, que sabe cuál de los dos precios
// normales es el que vale y qué decir cuando la oferta tiene varios productos.
// Acá solo se dibuja: este archivo no decide nada.

import { createPortal } from "react-dom";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalConfirmarOferta({
  abierto,
  cartel = null,
  // El color del botón que confirma. Finalizar baja una promoción —ámbar, como
  // el resto de las acciones de archivo— y eliminar borra una fila —rojo—.
  color = "amber",
  trabajando = false,
  error = null,
  onCerrar,
  onConfirmar,
}) {
  if (!abierto || !cartel) return null;

  const contenido = (
    <SunmiModalLayout
      open={abierto}
      title={cartel.titulo}
      subtitle={cartel.subtitulo}
      color={color}
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-lg"
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      destructivo
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            disabled={trabajando}
            className="py-2 text-xs"
          >
            {cartel.volver}
          </SunmiButton>
          <SunmiButton
            color={color}
            onClick={onConfirmar}
            disabled={trabajando}
            className="py-2 font-bold text-xs"
          >
            {trabajando ? "Un momento…" : cartel.confirmar}
          </SunmiButton>
        </div>
      }
    >
      <div className="rounded-lg border sunmi-border p-2.5">
        <div className="text-base2 font-semibold sunmi-text-strong leading-snug">
          {cartel.producto}
        </div>
        {/* SIN NÚMERO NO VA EL RENGLÓN. `cartel.cambio` viene en `null` cuando no
            se puede calcular, y escribir "vuelve a su precio normal" sin el
            importe es exactamente lo que este cartel existe para no hacer. */}
        {cartel.cambio && (
          <div className="text-sm3 sunmi-text-strong leading-snug mt-1 tabular-nums">
            {cartel.cambio}
          </div>
        )}
      </div>

      <p className="text-sm2 sunmi-text-muted leading-snug">{cartel.advertencia}</p>

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
