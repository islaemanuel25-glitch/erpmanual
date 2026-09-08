"use client";

// Card de acciones del detalle de transferencia.
//
// Mismo lugar y misma composición que AccionesTicket en "Ver venta": una
// `SunmiCard className="p-3"` justo debajo del encabezado, con los botones en
// una sola fila `flex flex-wrap gap-2` y clase `text-sm`. Antes las acciones
// operativas vivían al final de la página, alineadas a la derecha, y los
// botones de PDF estaban mezclados dentro del bloque de datos generales.
//
// Los handlers, las condiciones de permiso y los estados de carga no se
// tocaron: este componente solo los recibe y los dibuja. Ya no devuelve null
// cuando no hay acciones operativas, porque PDF y ticket están siempre
// disponibles — igual que Reimprimir/PDF/Compartir en "Ver venta".

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

/** El aviso de que hay cambios sin guardar. Exportado para que lo mida un candado. */
export const AVISO_SIN_GUARDAR = "Guardá los cambios antes de confirmar.";

export default function AccionesRecepcion({
  id,
  item,
  me,
  puedeRecibir,
  guardando,
  confirmarRecepcion,
  confirmando,
  guardarCambios,
  /**
   * Hay cambios sin guardar.
   *
   * ── QUÉ CAMBIA Y QUÉ NO ────────────────────────────────────────────────
   *
   * NO cambia el comportamiento: confirmar con cambios pendientes sigue estando
   * bloqueado y sigue avisando. Lo que cambia es CUÁNDO se entera el operador.
   *
   * Hasta acá la regla existía solo adentro del handler, así que la única forma
   * de descubrirla era tocar "Confirmar recepción" y recibir un cartel. El
   * aviso la pone a la vista antes, al lado de los dos botones que la resuelven.
   *
   * Y no se agrega un auto-guardado como efecto lateral de confirmar: ese
   * contrato hoy no existe y escribir cantidades sin que nadie lo pidiera es
   * peor que un cartel.
   */
  dirty = false,
  puedeCancelar,
  // La cancelación dejó de ser un `confirm()` y pasó a ser un panel: pide el
  // preview al servidor, dice qué va a pasar con ESTE remito —que no es lo mismo
  // si vino de una venta— y exige motivo. Este componente solo lo abre y lo
  // dibuja debajo de los botones.
  panelCancelarAbierto = false,
  abrirPanelCancelar,
  panelCancelar = null,
}) {
  const handleImprimirTicket = async () => {
    const { default: imprimirTicketTransferencia } = await import(
      "@/lib/transferencias/imprimirTicketTransferencia"
    );
    imprimirTicketTransferencia(item, me);
  };

  return (
    <SunmiCard className="p-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/transferencias/pdf?id=${id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="text-sm">
            📄 PDF Envío
          </SunmiButton>
        </a>
        <a href={`/api/transferencias/pdf-recepcion?id=${id}`} target="_blank" rel="noreferrer">
          <SunmiButton color="slate" className="text-sm">
            📄 PDF Recepción
          </SunmiButton>
        </a>
        <SunmiButton color="slate" onClick={handleImprimirTicket} className="text-sm">
          🖨 Imprimir ticket POS
        </SunmiButton>

        {puedeRecibir && (
          <>
            {/* ── POR QUÉ "GUARDAR CAMBIOS" PUEDE NO ESTAR ──────────────────

                En el puesto de trabajo del control físico NO hay guardado por
                lotes: cada producto se persiste cuando se lo marca revisado, de
                a uno. Y dejar el botón ahí sería peligroso, no redundante — la
                pantalla PROPONE lo enviado en cada producto para el caso feliz
                de un toque, así que un "Guardar" mandaría esos 150 valores
                propuestos como cantidades reales de productos que nadie contó.

                Sin `guardarCambios`, el botón no se dibuja. La regla vive en un
                solo lugar: quien no entrega el handler no ofrece la acción. */}
            {guardarCambios && (
              <SunmiButton
                color="slate"
                disabled={guardando}
                onClick={guardarCambios}
                className="text-sm"
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </SunmiButton>
            )}

            <SunmiButton
              color="amber"
              disabled={confirmando}
              onClick={confirmarRecepcion}
              className="text-sm"
            >
              {confirmando ? "Confirmando..." : "✓ Confirmar recepción"}
            </SunmiButton>
          </>
        )}

        {puedeCancelar && (
          <SunmiButton
            color="red"
            onClick={abrirPanelCancelar}
            aria-expanded={panelCancelarAbierto}
            className="text-sm"
          >
            {panelCancelarAbierto ? "Volver" : "⛔ Cancelar transferencia"}
          </SunmiButton>
        )}
      </div>

      {/* El aviso solo tiene sentido si hay algo que guardar. Sin guardado por
          lotes no hay borrador pendiente: cada producto se persiste al marcarlo. */}
      {puedeRecibir && guardarCambios && dirty && (
        <div className="mt-2">
          <SunmiAviso tono="warning">{AVISO_SIN_GUARDAR}</SunmiAviso>
        </div>
      )}

      {panelCancelar}
    </SunmiCard>
  );
}
