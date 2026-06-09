"use client";

import { useCallback } from "react";
import { generarTextoPedido } from "@/lib/compras-proveedor/textoPedido";

// Acciones para compartir el pedido al proveedor (PDF / Copiar).
// No cambian estado ni stock — solo lectura/exportación.
// Reutilizable por el detalle [id] y el modal de envío de /nueva.
export default function useAccionesEnvioPedido(pedido) {
  const id = pedido?.id;

  const descargarPDF = useCallback(() => {
    if (!id) return;
    // Misma origin → cookies viajan. Nueva pestaña dispara el "attachment".
    window.open(`/api/compras-proveedor/exportar-pdf/${id}`, "_blank");
  }, [id]);

  const copiarPedido = useCallback(async () => {
    if (!pedido) return;
    try {
      await navigator.clipboard.writeText(generarTextoPedido(pedido));
      alert("Pedido copiado al portapapeles");
    } catch {
      alert("No se pudo copiar al portapapeles (¿permisos del navegador?)");
    }
  }, [pedido]);

  return { descargarPDF, copiarPedido };
}
