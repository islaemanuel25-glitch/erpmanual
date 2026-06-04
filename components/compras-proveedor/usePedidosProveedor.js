"use client";

import { useState, useEffect, useCallback } from "react";

export const ESTADOS_ACTIVOS = ["BORRADOR", "CONFIRMADO", "ENVIADO"];
export const ESTADOS_HISTORIAL = ["RECIBIDO", "ANULADO"];

// Umbral operativo: lo normal son los últimos 7 días.
export const DIAS_OPERATIVO = 7;

// Días transcurridos desde una fecha (heurística de UI, hora local del navegador).
export function diasDesde(fecha) {
  if (!fecha) return 0;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.floor(ms / 86400000);
}

// YYYY-MM-DD de hace n días (para el default de Historial).
export function isoHaceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Hoy local en YYYY-MM-DD (zona del navegador, default AR).
export function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Rango operativo por estado y antigüedad (>7 días = atrasado/antiguo):
//  1) ENVIADO atrasado · 2) ENVIADO reciente · 3) CONFIRMADO reciente
//  4) BORRADOR reciente · 5) CONFIRMADO/BORRADOR antiguos (y cualquier otro)
function rangoOperativo(item) {
  const atrasado = diasDesde(item.createdAt) > DIAS_OPERATIVO;
  if (item.estado === "ENVIADO") return atrasado ? 1 : 2;
  if (!atrasado && item.estado === "CONFIRMADO") return 3;
  if (!atrasado && item.estado === "BORRADOR") return 4;
  return 5;
}

function ordenarPorPrioridad(list) {
  return [...list].sort((a, b) => {
    const ra = rangoOperativo(a);
    const rb = rangoOperativo(b);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    // En grupos atrasados (1 y 5) el más viejo primero; en recientes, el más nuevo primero.
    const viejoPrimero = ra === 1 || ra === 5;
    return viejoPrimero ? ta - tb : tb - ta;
  });
}

/**
 * Hook compartido de listado de pedidos a proveedor.
 * Encapsula el fetch a /api/compras-proveedor/listar (NO toca acciones).
 *
 * @param {Object} opts
 *  - estados: string[]  grupo de estados (in) cuando no hay estado puntual
 *  - estado:  string    estado puntual (tiene prioridad sobre estados)
 *  - proveedorId: string|number
 *  - fechaDesde, fechaHasta: string (YYYY-MM-DD); solo filtran si vienen ambos
 *  - pageSize: number
 *  - ordenar: boolean    aplica orden por prioridad (vistas operativas)
 */
export default function usePedidosProveedor({
  estados,
  estado = "",
  proveedorId = "",
  fechaDesde = "",
  fechaHasta = "",
  pageSize = 20,
  ordenar = false,
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Reset de página al cambiar filtros.
  useEffect(() => {
    setPage(1);
  }, [estado, proveedorId, fechaDesde, fechaHasta]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (proveedorId) qs.set("proveedorId", String(proveedorId));
      if (estado) {
        qs.set("estado", estado);
      } else if (estados && estados.length) {
        qs.set("estados", estados.join(","));
      }
      if (fechaDesde && fechaHasta) {
        qs.set("fechaDesde", fechaDesde);
        qs.set("fechaHasta", fechaHasta);
      }

      const res = await fetch(`/api/compras-proveedor/listar?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        const list = data.items || [];
        setItems(ordenar ? ordenarPorPrioridad(list) : list);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, proveedorId, estado, estados, fechaDesde, fechaHasta, ordenar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { loading, items, total, page, setPage, totalPages, recargar: cargar };
}
