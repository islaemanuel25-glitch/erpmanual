"use client";

import { useState, useCallback } from "react";

function buildQuery(fechaDesde, fechaHasta, extra = {}) {
  const p = new URLSearchParams({ fechaDesde, fechaHasta });
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}

/**
 * Hook desacoplado para el submódulo Productos.
 * Carga: productos (rentabilidad) + tickets conflictivos.
 */
export function useAuditoriaProductos() {
  const [loading, setLoading] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [error, setError] = useState("");
  const [productos, setProductos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [productosNota, setProductosNota] = useState("");
  const [tickets, setTickets] = useState(null);
  const [ticketsPagination, setTicketsPagination] = useState(null);
  const [ticketsCriterio, setTicketsCriterio] = useState("");

  const cargar = useCallback(async (fechaDesde, fechaHasta, ticketsPage = 1, ticketsPageSize = 25) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setProductos(null);
    setCategorias([]);
    setProductosNota("");
    setTickets(null);
    setTicketsPagination(null);
    setTicketsCriterio("");

    const qBase = buildQuery(fechaDesde, fechaHasta);
    const qTickets = buildQuery(fechaDesde, fechaHasta, {
      page: ticketsPage,
      pageSize: ticketsPageSize,
    });

    try {
      const [rProd, rTickets] = await Promise.all([
        fetch(`/api/auditoria-pos-ventas/productos?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/tickets?${qTickets}`, { credentials: "include" }),
      ]);

      const [dProd, dTickets] = await Promise.all([
        rProd.json(),
        rTickets.json(),
      ]);

      if (!dProd.ok) { setError(dProd.error || "Error en productos"); return; }
      if (!dTickets.ok) { setError(dTickets.error || "Error en tickets"); return; }

      setProductos(dProd.items);
      setCategorias(dProd.categorias || []);
      setProductosNota(dProd.nota || "");
      setTickets(dTickets.items);
      setTicketsPagination(dTickets.pagination);
      setTicketsCriterio(dTickets.criterio || "");
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarTicketsPage = useCallback(
    async (fechaDesde, fechaHasta, page, pageSize = 25) => {
      if (!fechaDesde || !fechaHasta) return;
      setLoadingTickets(true);
      setError("");
      const q = buildQuery(fechaDesde, fechaHasta, { page, pageSize });
      try {
        const res = await fetch(`/api/auditoria-pos-ventas/tickets?${q}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) { setError(data.error || "Error en tickets"); return; }
        setTickets(data.items);
        setTicketsPagination(data.pagination);
        setTicketsCriterio(data.criterio || "");
      } catch (e) {
        console.error(e);
        setError("Error de conexión (tickets)");
      } finally {
        setLoadingTickets(false);
      }
    },
    []
  );

  return {
    loading,
    loadingTickets,
    error,
    productos,
    categorias,
    productosNota,
    tickets,
    ticketsPagination,
    ticketsCriterio,
    cargar,
    cargarTicketsPage,
  };
}
