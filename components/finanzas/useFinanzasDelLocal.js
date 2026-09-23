"use client";

// components/finanzas/useFinanzasDelLocal.js
//
// LA CONSULTA DEL TABLERO, COMPARTIDA POR LAS DOS ENTRADAS.
//
// El depósito entra por `/modulos/finanzas` y ve la lista; el local entra por la
// misma ruta y ve directo la suya. Los dos preguntan lo mismo y mueven los
// mismos dos controles —la unidad del chip y el desplazamiento de las flechas—.
// Lo único que cambia es si se manda `destino`.
//
// ── EL ESTADO VIVE EN LA URL, NO EN `useState` ──────────────────────────
//
// El estado de React queda como ESPEJO de lo que dice la barra, no como fuente,
// así que el back del navegador, el botón "Volver" y un enlace pegado hacen
// todos lo mismo. El porqué largo está en `lib/finanzas/contextoFinanzas.js`.
//
// ── LAS FLECHAS USAN `replace` ──────────────────────────────────────────
//
// Con `push`, diez flechas serían diez entradas en el historial y el back del
// navegador te haría recorrerlas una por una en vez de salir de la pantalla.
// `replace` deja UNA. El `push` se guarda para entrar a un turno, que sí es un
// lugar distinto.
//
// ── CAMBIAR DE UNIDAD VUELVE AL PERÍODO POR DEFECTO ─────────────────────
//
// Si no, alguien que está tres semanas atrás y toca "Mes" se va tres MESES atrás
// sin haberlo pedido, porque el número se quedó. Es la misma decisión que tomó
// el tablero de transferencias y por el mismo motivo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  parseContextoFinanzas,
  serializarContextoFinanzas,
} from "@/lib/finanzas/contextoFinanzas";
import { DESPLAZAMIENTO_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";

export function useFinanzasDelLocal({ destino = null } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // `useMemo` sobre el objeto que devuelve `useSearchParams` cambia de identidad
  // en cada render; por eso la dependencia es él y el parseo es barato.
  const ctx = useMemo(() => parseContextoFinanzas(params), [params]);
  const { unidad, desp: desplazamiento } = ctx;

  const escribirUrl = useCallback(
    (siguiente) => {
      const qs = serializarContextoFinanzas({ ...ctx, ...siguiente });
      // `scroll: false` para que cambiar de período no salte al principio de la
      // lista: lo que cambió es el rango, no el lugar donde se estaba mirando.
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
      const url = new URL("/api/finanzas/tablero", window.location.origin);
      // `destino` y no `localId`: `localId` es un parámetro RESERVADO en esta
      // API —`resolveVistaOperativa` lo lee como "el alcance que pido" y a una
      // sesión que no es admin le exige que sea el suyo—, así que mandarlo desde
      // el depósito daría 403. El motivo largo está en la ruta.
      if (destino) {
        url.searchParams.set("destino", String(destino));
      } else {
        // Sin destino, quien pregunta puede ser el depósito —y entonces
        // corresponde la LISTA— o un local mirando la suya. Lo decide el
        // servidor con `Local.es_deposito`: una sola llamada para las dos
        // vistas, sin que la pantalla tenga que adivinar quién es.
        url.searchParams.set("entrada", "1");
      }
      url.searchParams.set("unidad", unidad);
      url.searchParams.set("desplazamiento", String(desplazamiento));
      const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar Finanzas.");
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

  // Los topes los decide el SERVIDOR —`puedeAvanzar` y `puedeRetroceder`— y acá
  // solo se respeta lo que contestó. Que la pantalla calcule el suyo sería tener
  // dos reglas para lo mismo, y la de la pantalla no conoce los datos.
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
