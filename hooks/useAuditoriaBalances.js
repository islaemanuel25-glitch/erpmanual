"use client";

import { useState, useCallback } from "react";

function buildQuery(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}

/**
 * Hook desacoplado para el submódulo Balances.
 * Carga: resumen + medios + balances (con comparación opcional).
 */
export function useAuditoriaBalances() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState(null);
  const [medios, setMedios] = useState(null);
  const [estadoMedios, setEstadoMedios] = useState(null);
  const [comparacion, setComparacion] = useState(null);

  const cargar = useCallback(async (fechaDesde, fechaHasta, fechaDesde2 = null, fechaHasta2 = null) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Indicá fecha desde y hasta.");
      return;
    }
    setError("");
    setLoading(true);
    setResumen(null);
    setMedios(null);
    setComparacion(null);

    const qBase = buildQuery({ fechaDesde, fechaHasta });
    const qBalances = buildQuery({ fechaDesde, fechaHasta, fechaDesde2, fechaHasta2 });

    try {
      const fetches = [
        fetch(`/api/auditoria-pos-ventas/resumen?${qBase}`, { credentials: "include" }),
        fetch(`/api/auditoria-pos-ventas/medios?${qBase}`, { credentials: "include" }),
      ];

      if (fechaDesde2 && fechaHasta2) {
        fetches.push(fetch(`/api/auditoria-pos-ventas/balances?${qBalances}`, { credentials: "include" }));
      }

      const responses = await Promise.all(fetches);
      const [dRes, dMedios] = await Promise.all([responses[0].json(), responses[1].json()]);

      if (!dRes.ok) { setError(dRes.error || "Error en resumen"); return; }
      if (!dMedios.ok) { setError(dMedios.error || "Error en medios"); return; }

      setResumen(dRes.resumen);
      setMedios(dMedios.items);
      // El estado de exactitud viaja al lado de los items: la tabla de medios lo
      // necesita para rotular sus columnas de comisión, neto y ganancia.
      setEstadoMedios(dMedios.estadoFinanciero ?? null);

      if (responses[2]) {
        const dBal = await responses[2].json();
        if (dBal.ok) {
          setComparacion({ rangoA: dBal.rangoA, rangoB: dBal.rangoB, variacion: dBal.variacion });
        }
      }
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    resumen,
    medios,
    estadoMedios,
    comparacion,
    cargar,
  };
}
