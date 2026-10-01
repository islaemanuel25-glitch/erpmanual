"use client";

// components/finanzas/pago-deposito/usePagoADeposito.js
//
// LA CONSULTA DE PAGO A DEPÓSITO, COMPARTIDA POR LAS DOS ENTRADAS.
//
// Es la hermana de `useFinanzasDelLocal`: el mismo contexto de período en la URL
// —unidad y desplazamiento de `contextoFinanzas`— y las mismas flechas con
// `replace`, pero contra `/api/finanzas/pago-a-deposito`, que es liviano. El
// depósito pregunta sin `destino` y ve la lista; un local, la suya; el depósito
// entrando a un local manda `destino`.
//
// El porqué de "el estado vive en la URL" y "las flechas usan replace" está en
// `lib/finanzas/contextoFinanzas.js` y en `useFinanzasDelLocal`: acá no se repite.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  parseContextoFinanzas,
  serializarContextoFinanzas,
} from "@/lib/finanzas/contextoFinanzas";
import { DESPLAZAMIENTO_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";

export function usePagoADeposito({ destino = null } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ctx = useMemo(() => parseContextoFinanzas(params), [params]);
  const { unidad, desp: desplazamiento } = ctx;

  const escribirUrl = useCallback(
    (siguiente) => {
      const qs = serializarContextoFinanzas({ ...ctx, ...siguiente });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [ctx, pathname, router]
  );

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const url = new URL("/api/finanzas/pago-a-deposito", window.location.origin);
      // `destino` y no `localId`: `localId` está reservado en esta API para el
      // alcance. Sin destino, el servidor decide lista o cuenta según quién es.
      if (destino) {
        url.searchParams.set("destino", String(destino));
      } else {
        url.searchParams.set("entrada", "1");
      }
      url.searchParams.set("unidad", unidad);
      url.searchParams.set("desplazamiento", String(desplazamiento));
      const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar Pago a depósito.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [destino, unidad, desplazamiento]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const onCambiarUnidad = useCallback(
    (u) => escribirUrl({ unidad: u, desp: DESPLAZAMIENTO_POR_DEFECTO }),
    [escribirUrl]
  );
  // Los topes los decide el servidor (`puedeAvanzar`/`puedeRetroceder`): acá solo
  // se respeta lo que contestó.
  const onAtras = useCallback(
    () => escribirUrl({ desp: desplazamiento - 1 }),
    [escribirUrl, desplazamiento]
  );
  const onAdelante = useCallback(
    () => escribirUrl({ desp: Math.min(0, desplazamiento + 1) }),
    [escribirUrl, desplazamiento]
  );

  return {
    datos,
    cargando,
    error,
    unidad,
    onCambiarUnidad,
    onAtras,
    onAdelante,
    recargar: cargar,
    contexto: { unidad, desp: desplazamiento },
  };
}
