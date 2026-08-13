"use client";

import { useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import useAccionesEnvioPedido from "@/hooks/useAccionesEnvioPedido";

/**
 * Modal de envío de un pedido a proveedor.
 * - Compartir pedido (Descargar PDF / Copiar): NO cambian estado (el pedido sigue PENDIENTE).
 * - "Marcar como enviado y pasar a recepción": confirmar -> marcar-enviado (2 llamadas).
 *   CONFIRMADO es transitorio: solo se setea al enviar, evitando pedidos huérfanos.
 *
 * Props: pedido (objeto completo de /obtener), onClose, onEnviado.
 */
export default function ModalEnviarPedido({ pedido, onClose, onEnviado }) {
  const { descargarPDF, copiarPedido } = useAccionesEnvioPedido(pedido);
  const [enviando, setEnviando] = useState(false);

  const marcarEnviado = async () => {
    if (!pedido?.id || enviando) return;
    if (!window.confirm("¿Confirmás que este pedido ya fue enviado al proveedor?")) return;
    setEnviando(true);
    try {
      // 1) confirmar (BORRADOR -> CONFIRMADO). Si ya viene CONFIRMADO (datos viejos), se omite.
      if (pedido.estado === "BORRADOR") {
        const rc = await fetch(`/api/compras-proveedor/confirmar/${pedido.id}`, {
          method: "POST",
          credentials: "include",
        });
        const dc = await rc.json();
        if (!dc.ok) {
          alert(dc.error || "No se pudo confirmar el pedido");
          setEnviando(false);
          return;
        }
      }
      // 2) marcar-enviado (CONFIRMADO -> ENVIADO)
      const re = await fetch(`/api/compras-proveedor/marcar-enviado/${pedido.id}`, {
        method: "POST",
        credentials: "include",
      });
      const de = await re.json();
      if (!de.ok) {
        alert(de.error || "No se pudo marcar como enviado");
        setEnviando(false);
        return;
      }
      onEnviado?.();
    } catch {
      alert("Error de conexión al enviar el pedido");
      setEnviando(false);
    }
  };

  return (
    <SunmiModalLayout
      open
      title={`Enviar pedido #${pedido?.id}`}
      // Conserva su cinta de título: el kit por defecto dibuja texto normal.
      encabezado="cinta"
      onClose={onClose}
      maxWidth="max-w-md"
      // El cuerpo de este modal es contenido suelto con sus propios márgenes: no
      // tiene scroll propio ni separación entre bloques que el kit deba poner.
      espacioCuerpo=""
      espacioPie=""
    >
      <>
        <p className="text-xs sunmi-text-muted mb-4">
          Compartí el pedido con el proveedor. Cuando lo hayas enviado, marcalo como
          enviado para pasarlo a Recibir mercadería.
        </p>

        {/* Compartir pedido (no cambian estado) */}
        <div className="mb-3">
          <span className="text-[11px] font-semibold sunmi-text-strong">Compartir pedido</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <SunmiButton color="slate" type="button" onClick={descargarPDF}>
              Descargar PDF
            </SunmiButton>
            <SunmiButton color="slate" type="button" onClick={copiarPedido}>
              Copiar pedido
            </SunmiButton>
          </div>
        </div>

        <div className="border-t sunmi-divider my-3" />

        <SunmiButton
          color="amber"
          type="button"
          className="w-full"
          disabled={enviando}
          onClick={marcarEnviado}
        >
          {enviando ? "Enviando..." : "Marcar como enviado al proveedor"}
        </SunmiButton>
        <p className="text-[11px] sunmi-text-muted mt-2 text-center">
          Usá esta opción después de haber enviado el PDF o texto al proveedor.
        </p>
      </>
    </SunmiModalLayout>
  );
}
