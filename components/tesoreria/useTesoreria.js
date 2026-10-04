"use client";

// components/tesoreria/useTesoreria.js
//
// LA CONSULTA DE TESORERÍA, compartida por las dos entradas (la puerta y el
// local elegido por el depósito). Es la hermana de `usePagoADeposito`: el
// contexto vive en la URL y la API es la única fuente de los números.
//
// Lo que cambia respecto de aquélla:
//   · «Otro» funciona: con las dos fechas se pide `unidad=OTRO&desde&hasta`;
//     sin ellas NO se pide nada y la pantalla pide el rango;
//   · la vista abierta (turno, caja, verificación) también viaja en la URL,
//     pero NO vuelve a pedir datos: cambiar de vista es mirar la misma lectura.
//     Entrar a un detalle es `push` —el "atrás" del teléfono sale de él—; mover
//     el período es `replace`, como en el resto de Finanzas.
//
// Después de verificar o anular, `recargar` vuelve a leer del servidor: la
// pantalla nunca actualiza un número por su cuenta.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CLAVE_OTRO_FINANZAS, DESPLAZAMIENTO_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";
import {
  VISTA_TESORERIA,
  consultaDeTesoreria,
  parseContextoTesoreria,
  serializarContextoTesoreria,
} from "@/lib/tesoreria/contextoTesoreria";

export const URL_TESORERIA = "/api/finanzas/tesoreria";

/** Cambiar el período vuelve al resumen: el detalle abierto era de otro período. */
const SIN_VISTA = Object.freeze({ vista: VISTA_TESORERIA.RESUMEN, grupo: null, caja: null, verificacion: null });

export function useTesoreria({ destino = null } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ctx = useMemo(() => parseContextoTesoreria(params), [params]);
  // Lo que se le pide a la API depende SOLO del período y del local: la vista no.
  const consulta = useMemo(() => consultaDeTesoreria(ctx, { destino }), [ctx, destino]);

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
      const res = await fetch(`${URL_TESORERIA}?${consulta}`, { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || `No se pudo cargar Tesorería (${res.status}).`);
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
      const qs = serializarContextoTesoreria({ ...ctx, ...siguiente });
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (navegar) router.push(url);
      else router.replace(url, { scroll: false });
    },
    [ctx, pathname, router]
  );

  // «Otro» conserva el rango que ya estuviera en la URL; las otras unidades lo
  // tiran y vuelven al período en curso.
  const onCambiarUnidad = useCallback(
    (u) =>
      u === CLAVE_OTRO_FINANZAS
        ? escribir({ ...SIN_VISTA, unidad: u, desp: DESPLAZAMIENTO_POR_DEFECTO })
        : escribir({ ...SIN_VISTA, unidad: u, desp: DESPLAZAMIENTO_POR_DEFECTO, desde: null, hasta: null }),
    [escribir]
  );
  const onElegirRango = useCallback(
    (desde, hasta) => escribir({ ...SIN_VISTA, unidad: CLAVE_OTRO_FINANZAS, desde, hasta }),
    [escribir]
  );
  // Los topes los decide el servidor (`puedeAvanzar`/`puedeRetroceder`).
  const onAtras = useCallback(() => escribir({ desp: ctx.desp - 1 }), [escribir, ctx.desp]);
  const onAdelante = useCallback(() => escribir({ desp: Math.min(0, ctx.desp + 1) }), [escribir, ctx.desp]);

  /** Abrir una vista: navegar, para que el "atrás" vuelva. */
  const onIr = useCallback(
    (v, { reemplazar = false } = {}) =>
      escribir(
        { vista: v.vista, grupo: v.grupo ?? null, caja: v.caja ?? null, verificacion: v.verificacion ?? null },
        { navegar: !reemplazar }
      ),
    [escribir]
  );
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
