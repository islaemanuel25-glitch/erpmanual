"use client";

// components/finanzas/sueldos/useSueldos.js
//
// LA CONSULTA DE FINANZAS → SUELDOS. La hermana de `useTesoreria`: el contexto
// vive en la URL y la API es la única fuente de los números. Cambiar de vista
// no vuelve a pedir datos —es mirar la misma lectura—; entrar a una es `push`,
// así el "atrás" del teléfono vuelve al resumen, y mover el período es
// `replace`, como en el resto de Finanzas.
//
// Después de pagar o asignar, `recargar` vuelve a leer: la pantalla nunca
// suma un número por su cuenta.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CLAVE_OTRO_FINANZAS, DESPLAZAMIENTO_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";
import {
  VISTA_SUELDOS,
  consultaDeSueldos,
  parseContextoSueldos,
  serializarContextoSueldos,
} from "@/lib/finanzas/contextoSueldos";

export const URL_SUELDOS = "/api/finanzas/sueldos";

const SIN_VISTA = Object.freeze({ vista: VISTA_SUELDOS.RESUMEN, empleado: null });

export function useSueldos() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ctx = useMemo(() => parseContextoSueldos(params), [params]);
  // Lo que se pide depende SOLO del período: la vista no.
  const consulta = useMemo(() => consultaDeSueldos(ctx), [ctx]);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!consulta) {
      setDatos(null);
      setError("");
      setCargando(false);
      return;
    }
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${URL_SUELDOS}?${consulta}`, { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || `No se pudieron cargar los sueldos (${res.status}).`);
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [consulta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const escribir = useCallback(
    (siguiente, { navegar = false } = {}) => {
      const qs = serializarContextoSueldos({ ...ctx, ...siguiente });
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (navegar) router.push(url);
      else router.replace(url, { scroll: false });
    },
    [ctx, pathname, router]
  );

  // El período cambia sin salir de la vista: el historial de un empleado se
  // mira en otro mes sin volver al resumen.
  const onCambiarUnidad = useCallback(
    (u) =>
      u === CLAVE_OTRO_FINANZAS
        ? escribir({ unidad: u, desp: DESPLAZAMIENTO_POR_DEFECTO })
        : escribir({ unidad: u, desp: DESPLAZAMIENTO_POR_DEFECTO, desde: null, hasta: null }),
    [escribir]
  );
  const onElegirRango = useCallback(
    (desde, hasta) => escribir({ unidad: CLAVE_OTRO_FINANZAS, desde, hasta }),
    [escribir]
  );
  // Los topes los decide el servidor (`puedeAvanzar`/`puedeRetroceder`).
  const onAtras = useCallback(() => escribir({ desp: ctx.desp - 1 }), [escribir, ctx.desp]);
  const onAdelante = useCallback(() => escribir({ desp: Math.min(0, ctx.desp + 1) }), [escribir, ctx.desp]);

  /** Abrir una vista: navegar, para que el "atrás" vuelva. */
  const onIr = useCallback((v) => escribir({ ...SIN_VISTA, ...v }, { navegar: true }), [escribir]);
  const onVolver = useCallback(() => router.back(), [router]);

  return {
    datos,
    cargando,
    error,
    ctx,
    faltaRango: consulta === null,
    onCambiarUnidad,
    onElegirRango,
    onAtras,
    onAdelante,
    onIr,
    onVolver,
    recargar: cargar,
  };
}
