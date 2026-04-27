"use client";

import { useState, useCallback } from "react";

function buildQuery(fechaDesde, fechaHasta) {
  return new URLSearchParams({ fechaDesde, fechaHasta }).toString();
}

/**
 * Hook desacoplado para el submódulo Cajas.
 * Carga: /api/auditoria-pos-ventas/cajas
 */
export function useAuditoriaCajas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cajas, setCajas] = useState(null);

  const cargar = useCallback(async (fechaDesde, fechaHasta) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setCajas(null);

    const q = buildQuery(fechaDesde, fechaHasta);

    try {
      const res = await fetch(`/api/auditoria-pos-ventas/cajas?${q}`, { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error en cajas");
        return;
      }
      setCajas(data.items);
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, cajas, cargar };
}
