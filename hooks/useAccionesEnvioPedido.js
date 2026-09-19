"use client";

import { useCallback } from "react";

import { compartirODescargar, RESULTADO_COMPARTIR } from "@/lib/compartir/compartirArchivo";
import {
  DOCUMENTO,
  nombreDeArchivo,
  tituloDelDocumento,
} from "@/lib/compras-proveedor/documentoDelPedido";
import { textoParaElProveedor, textoDeLaPrefactura } from "@/lib/compras-proveedor/textoPedido";

// LAS ACCIONES DE ENVÍO DE UN PEDIDO A PROVEEDOR.
//
// ── QUÉ CAMBIÓ Y POR QUÉ ──────────────────────────────────────────────────
//
// Antes eran dos: `descargarPDF` y `copiarPedido`, y las dos mandaban el
// documento CON los costos y el total. Ahora son cuatro y están partidas por
// DESTINATARIO, no por formato: tres son del proveedor —compartir, copiar el
// texto, bajar el PDF— y la cuarta es la prefactura, que es la de adentro.
//
// El nombre de cada una dice para quién es. `descargarPDF` no lo decía, y eso es
// lo que hizo que la misma acción sirviera para los dos usos hasta que alguien
// miró qué llevaba adentro.
//
// ── MARCAR COMO ENVIADO VIVE ACÁ Y HAY UNO SOLO ───────────────────────────
//
// Hay TRES caminos por los que un pedido queda enviado —se compartió, se bajó y
// la persona confirmó, o lo mandó por otro medio— y los tres tienen que escribir
// lo mismo: confirmar si está en borrador, y después marcar enviado. Escrito en
// cada camino, el día que aparezca un cuarto paso —una fecha, una bitácora— hay
// tres lugares donde ponerlo y se va a poner en dos.

/** Qué contesta `marcarEnviado`: salió bien, o falló con un motivo que mostrar. */
async function marcarPedidoComoEnviado(pedido) {
  if (!pedido?.id) return { ok: false, error: "El pedido no tiene número." };

  try {
    // CONFIRMADO es transitorio: se setea solo al enviar, para no dejar pedidos
    // huérfanos en ese estado. Si el pedido ya viene CONFIRMADO —datos viejos—
    // este paso se omite.
    if (pedido.estado === "BORRADOR") {
      const r = await fetch(`/api/compras-proveedor/confirmar/${pedido.id}`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!d.ok) return { ok: false, error: d.error || "No se pudo confirmar el pedido" };
    }

    const r = await fetch(`/api/compras-proveedor/marcar-enviado/${pedido.id}`, {
      method: "POST",
      credentials: "include",
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || "No se pudo marcar como enviado" };

    return { ok: true };
  } catch {
    return { ok: false, error: "Error de conexión al enviar el pedido" };
  }
}

/** Trae el PDF del pedido como blob, para poder compartirlo. */
async function traerPdf(pedidoId, documento) {
  const r = await fetch(
    `/api/compras-proveedor/exportar-pdf/${pedidoId}?documento=${documento}`,
    { credentials: "include" }
  );
  if (!r.ok) throw new Error("No se pudo generar el PDF del pedido.");
  return await r.blob();
}

export default function useAccionesEnvioPedido(pedido) {
  const id = pedido?.id;

  /**
   * MANDAR AL PROVEEDOR: abre el menú del sistema con el PDF sin precios.
   *
   * Devuelve uno de `RESULTADO_COMPARTIR` para que quien lo llame decida si
   * corresponde marcar el pedido como enviado. No marca nada por su cuenta: la
   * decisión depende de por cuál de los tres caminos salió, y ésa es del modal.
   */
  const mandarAlProveedor = useCallback(async () => {
    if (!id) throw new Error("El pedido no tiene número.");
    const blob = await traerPdf(id, DOCUMENTO.PROVEEDOR);
    return await compartirODescargar({
      blob,
      nombre: nombreDeArchivo(DOCUMENTO.PROVEEDOR, id),
      titulo: tituloDelDocumento(DOCUMENTO.PROVEEDOR, id),
    });
  }, [id]);

  /** El texto del pedido SIN precios, al portapapeles. */
  const copiarTextoDelProveedor = useCallback(async () => {
    if (!pedido) return false;
    try {
      await navigator.clipboard.writeText(textoParaElProveedor(pedido));
      return true;
    } catch {
      return false;
    }
  }, [pedido]);

  /** El PDF del proveedor, a la carpeta de descargas. Sin precios. */
  const descargarPdfDelProveedor = useCallback(() => {
    if (!id) return;
    // Misma origin → cookies viajan. Nueva pestaña dispara el "attachment".
    window.open(
      `/api/compras-proveedor/exportar-pdf/${id}?documento=${DOCUMENTO.PROVEEDOR}`,
      "_blank"
    );
  }, [id]);

  /** LA PREFACTURA: con costos y total. Es para adentro. */
  const descargarPrefactura = useCallback(() => {
    if (!id) return;
    window.open(
      `/api/compras-proveedor/exportar-pdf/${id}?documento=${DOCUMENTO.PREFACTURA}`,
      "_blank"
    );
  }, [id]);

  /** El texto de la prefactura al portapapeles. Con costos y total. */
  const copiarTextoDeLaPrefactura = useCallback(async () => {
    if (!pedido) return false;
    try {
      await navigator.clipboard.writeText(textoDeLaPrefactura(pedido));
      return true;
    } catch {
      return false;
    }
  }, [pedido]);

  const marcarEnviado = useCallback(() => marcarPedidoComoEnviado(pedido), [pedido]);

  return {
    mandarAlProveedor,
    copiarTextoDelProveedor,
    descargarPdfDelProveedor,
    descargarPrefactura,
    copiarTextoDeLaPrefactura,
    marcarEnviado,
  };
}
