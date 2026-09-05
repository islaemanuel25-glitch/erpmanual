"use client";

import { useCallback, useEffect, useState } from "react";

// LOS MEDIOS DE COBRO DEL LOCAL, UNA SOLA VEZ.
//
// Las tres pantallas de Cobros —la lista, editar y agregar— necesitan lo mismo:
// los medios, las opciones válidas y los recargos por tipo. Cada una haciendo su
// propio `fetch` sería la forma más rápida de que una empiece a leer un campo
// distinto de la otra.
//
// ── LO QUE NO HACE, A PROPÓSITO ────────────────────────────────────────────
//
// No arma la lista, no completa nada que la API no haya mandado y no inventa
// medios cuando la respuesta viene vacía. Si el local no configuró nada, los
// cuatro medios que llegan son los que el SERVIDOR resuelve como defaults, con
// `usandoDefaults: true`, y eso se muestra tal cual. Una lista armada acá se
// separaría de la que el POS cobra.

export default function useMediosCobro() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/medios-cobro", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      // El error del backend se muestra tal cual: es el que explica qué pasó.
      if (!data.ok) setError(data.error || "No se pudieron leer los medios de cobro.");
      else setDatos(data);
    } catch {
      setError("No se pudo conectar para leer los medios de cobro.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    cargando,
    error,
    recargar: cargar,
    medios: datos?.medios ?? [],
    usandoDefaults: datos?.usandoDefaults === true,
    tiposContables: datos?.tiposContables ?? [],
    procesadores: datos?.procesadores ?? [],
    recargosPorTipo: datos?.recargosPorTipo ?? {},
  };
}
