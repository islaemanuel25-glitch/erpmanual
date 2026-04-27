"use client";

import { useState, useCallback } from "react";

function buildQuery(fechaDesde, fechaHasta) {
  return new URLSearchParams({ fechaDesde, fechaHasta }).toString();
}

/**
 * Hook desacoplado para el submódulo Operadores.
 * Carga: /api/auditoria-pos-ventas/operadores
 */
export function useAuditoriaOperadores() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [operadores, setOperadores] = useState(null);

  const cargar = useCallback(async (fechaDesde, fechaHasta) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setOperadores(null);

    const q = buildQuery(fechaDesde, fechaHasta);

    try {
      const res = await fetch(`/api/auditoria-pos-ventas/operadores?${q}`, { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error en operadores");
        return;
      }
      setOperadores(data.items);
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, operadores, cargar };
}
