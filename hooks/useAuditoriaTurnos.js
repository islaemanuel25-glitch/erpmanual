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
 * Hook desacoplado para el submódulo Turnos.
 * Carga: resumen + turnos + tickets + sin-turno.
 * Carga bajo demanda: personas por turno.
 */
export function useAuditoriaTurnos() {
  const [loading, setLoading] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState(null);
  const [turnos, setTurnos] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [ticketsPagination, setTicketsPagination] = useState(null);
  const [ticketsCriterio, setTicketsCriterio] = useState("");
  const [sinTurno, setSinTurno] = useState(null);
  const [personas, setPersonas] = useState(null);
  const [personasTurnoId, setPersonasTurnoId] = useState(null);

  const cargar = useCallback(async (fechaDesde, fechaHasta, ticketsPage = 1, ticketsPageSize = 25) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setResumen(null);
    setTurnos(null);
    setTickets(null);
    setTicketsPagination(null);
    setTicketsCriterio("");
    setSinTurno(null);
    setPersonas(null);
    setPersonasTurnoId(null);

    const qBase = buildQuery(fechaDesde, fechaHasta);
    const qTickets = buildQuery(fechaDesde, fechaHasta, {
      page: ticketsPage,
      pageSize: ticketsPageSize,
    });

    try {
      const [rRes, rTurnos, rTickets, rSinTurno] = await Promise.all([
        fetch(`/api/auditoria-pos-ventas/resumen?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/turnos?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/tickets?${qTickets}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/turnos/sin-turno?${qBase}`, { credentials: "include" }),
      ]);

      const [dRes, dTurnos, dTickets, dSinTurno] = await Promise.all([
        rRes.json(),
        rTurnos.json(),
        rTickets.json(),
        rSinTurno.json(),
      ]);

      if (!dRes.ok) { setError(dRes.error || "Error en resumen"); return; }
      if (!dTurnos.ok) { setError(dTurnos.error || "Error en turnos"); return; }
      if (!dTickets.ok) { setError(dTickets.error || "Error en tickets"); return; }

      setResumen(dRes.resumen);
      setTurnos(dTurnos.items);
      setTickets(dTickets.items);
      setTicketsPagination(dTickets.pagination);
      setTicketsCriterio(dTickets.criterio || "");
      setSinTurno(dSinTurno.ok ? { total: dSinTurno.total, items: dSinTurno.items } : null);
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
        const res = await fetch(`/api/auditoria-pos-ventas/tickets?${q}`, { credentials: "include" });
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

  const cargarPersonas = useCallback(
    async (fechaDesde, fechaHasta, turnoId) => {
      if (!fechaDesde || !fechaHasta || !turnoId) return;
      setLoadingPersonas(true);
      setPersonas(null);
      setPersonasTurnoId(turnoId);
      const q = buildQuery(fechaDesde, fechaHasta, { turnoId });
      try {
        const res = await fetch(`/api/auditoria-pos-ventas/turnos/personas?${q}`, { credentials: "include" });
        const data = await res.json();
        if (data.ok) {
          setPersonas(data.items);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingPersonas(false);
      }
    },
    []
  );

  return {
    loading,
    loadingTickets,
    loadingPersonas,
    error,
    resumen,
    turnos,
    tickets,
    ticketsPagination,
    ticketsCriterio,
    sinTurno,
    personas,
    personasTurnoId,
    cargar,
    cargarTicketsPage,
    cargarPersonas,
  };
}
