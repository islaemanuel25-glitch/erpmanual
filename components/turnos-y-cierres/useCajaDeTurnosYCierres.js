"use client";

// components/turnos-y-cierres/useCajaDeTurnosYCierres.js
//
// La lectura de UNA caja: su detalle y los datos de su Z. La comparten la
// pantalla del detalle y la del comprobante, que piden lo mismo.

import { useCallback, useEffect, useState } from "react";

import { URL_API_TURNOS_Y_CIERRES } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export function useCajaDeTurnosYCierres(id) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${URL_API_TURNOS_Y_CIERRES}/cajas/${encodeURIComponent(id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || `No se pudo cargar la caja (${res.status}).`);
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { datos, cargando, error, recargar: cargar };
}
