"use client";

// components/turnos-y-cierres/useTurnosYCierres.js
//
// LA CONSULTA DE "TURNOS Y CIERRES". El período vive en la URL con los mismos
// nombres y la misma validación que Tesorería (`parseContextoTesoreria`,
// `serializarContextoTesoreria`, `consultaDeTesoreria`): Día, Semana, Mes y
// «Otro» con desde y hasta. La pestaña viaja aparte, en `pestana`, y no vuelve
// a pedir datos: es mirar la misma lectura.
//
// Mover el período es `replace`; entrar a una caja es `push`, así el "atrás"
// del teléfono vuelve a la lista con el período y la pestaña que tenía.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CLAVE_OTRO_FINANZAS, DESPLAZAMIENTO_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";
import {
  consultaDeTesoreria,
  parseContextoTesoreria,
  periodoDelContexto,
  serializarContextoTesoreria,
} from "@/lib/tesoreria/contextoTesoreria";
import { PESTANA_TODOS } from "@/lib/turnosYCierres/lecturaTurnosYCierres";
import { URL_API_TURNOS_Y_CIERRES, urlDeCaja } from "@/lib/turnosYCierres/pantallaTurnosYCierres";
import { showError } from "@/components/sunmi/SunmiToast";

/** El período y la pestaña como cadena de la URL. Los defaults no se escriben. */
export function serializarContexto(ctx, pestana) {
  const qs = new URLSearchParams(serializarContextoTesoreria(periodoDelContexto(ctx)));
  if (pestana && pestana !== PESTANA_TODOS) qs.set("pestana", pestana);
  return qs.toString();
}

export function useTurnosYCierres() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ctx = useMemo(() => parseContextoTesoreria(params), [params]);
  const pestana = params.get("pestana") || PESTANA_TODOS;
  const consulta = useMemo(() => consultaDeTesoreria(ctx), [ctx]);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    // «Otro» sin las dos fechas no pide nada: el selector muestra el calendario.
    if (!consulta) {
      setDatos(null);
      setError("");
      setCargando(false);
      return;
    }
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${URL_API_TURNOS_Y_CIERRES}?${consulta}`, { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || `No se pudo cargar Turnos y cierres (${res.status}).`);
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
    (periodo, nuevaPestana = pestana) => {
      const qs = serializarContexto({ ...ctx, ...periodo }, nuevaPestana);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [ctx, pestana, pathname, router]
  );

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
  const onAtras = useCallback(() => escribir({ desp: ctx.desp - 1 }), [escribir, ctx.desp]);
  const onAdelante = useCallback(() => escribir({ desp: Math.min(0, ctx.desp + 1) }), [escribir, ctx.desp]);
  const onCambiarPestana = useCallback((p) => escribir({}, p), [escribir]);
  const onVerCaja = useCallback(
    (id) => router.push(urlDeCaja(id, serializarContexto(ctx, pestana))),
    [router, ctx, pestana]
  );

  // Le asigna el tipo a un egreso sin clasificar y vuelve a leer: el resultado
  // del turno cambia. Devuelve false si el servidor no lo aceptó.
  const onClasificar = useCallback(
    async (movimientoId, tipo) => {
      try {
        const res = await fetch(`/api/turnos-y-cierres/movimientos/${movimientoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tipo }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || `No se pudo clasificar el pago (${res.status}).`);
        await cargar();
        return true;
      } catch (e) {
        showError(e.message);
        return false;
      }
    },
    [cargar]
  );

  return {
    datos,
    cargando,
    error,
    ctx,
    pestana,
    onClasificar,
    onCambiarUnidad,
    onElegirRango,
    onAtras,
    onAdelante,
    onCambiarPestana,
    onVerCaja,
    recargar: cargar,
  };
}
