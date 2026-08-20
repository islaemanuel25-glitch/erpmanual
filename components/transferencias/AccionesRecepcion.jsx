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

export default function AccionesRecepcion({
  id,
  item,
  me,
  puedeRecibir,
  guardando,
  confirmarRecepcion,
  confirmando,
  guardarCambios,
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
            <SunmiButton
              color="slate"
              disabled={guardando}
              onClick={guardarCambios}
              className="text-sm"
            >
              {guardando ? "Guardando..." : "Guardar cambios"}
            </SunmiButton>

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

      {panelCancelar}
    </SunmiCard>
  );
}
