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
 * Carga los 5 bloques de auditoría POS en paralelo (solo lectura).
 * No envía localId: el servidor usa contexto activo (resolveLocalAndGrupo).
 */
export function useAuditoriaPosVentas() {
  const [loading, setLoading] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState(null);
  const [turnos, setTurnos] = useState(null);
  const [medios, setMedios] = useState(null);
  const [productos, setProductos] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [ticketsPagination, setTicketsPagination] = useState(null);
  const [productosNota, setProductosNota] = useState("");
  const [ticketsCriterio, setTicketsCriterio] = useState("");

  const cargar = useCallback(async (fechaDesde, fechaHasta, ticketsPage = 1, ticketsPageSize = 25) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setResumen(null);
    setTurnos(null);
    setMedios(null);
    setProductos(null);
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
      const [rRes, rTurnos, rMedios, rProd, rTickets] = await Promise.all([
        fetch(`/api/auditoria-pos-ventas/resumen?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/turnos?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/medios?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/productos?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/tickets?${qTickets}`, { credentials: "include" }),
      ]);

      const [dRes, dTurnos, dMedios, dProd, dTickets] = await Promise.all([
        rRes.json(),
        rTurnos.json(),
        rMedios.json(),
        rProd.json(),
        rTickets.json(),
      ]);

      if (!dRes.ok) {
        setError(dRes.error || "Error en resumen");
        setResumen(null);
        setTurnos(null);
        setMedios(null);
        setProductos(null);
        setTickets(null);
        setTicketsPagination(null);
        return;
      }
      if (!dTurnos.ok) {
        setError(dTurnos.error || "Error en turnos");
        return;
      }
      if (!dMedios.ok) {
        setError(dMedios.error || "Error en medios");
        return;
      }
      if (!dProd.ok) {
        setError(dProd.error || "Error en productos");
        return;
      }
      if (!dTickets.ok) {
        setError(dTickets.error || "Error en tickets");
        return;
      }

      setResumen(dRes.resumen);
      setTurnos(dTurnos.items);
      setMedios(dMedios.items);
      setProductos(dProd.items);
      setProductosNota(dProd.nota || "");
      setTickets(dTickets.items);
      setTicketsPagination(dTickets.pagination);
      setTicketsCriterio(dTickets.criterio || "");
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
      setResumen(null);
      setTurnos(null);
      setMedios(null);
      setProductos(null);
      setTickets(null);
      setTicketsPagination(null);
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
        if (!data.ok) {
          setError(data.error || "Error en tickets");
          return;
        }
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
    resumen,
    turnos,
    medios,
    productos,
    productosNota,
    tickets,
    ticketsPagination,
    ticketsCriterio,
    cargar,
    cargarTicketsPage,
  };
}
