"use client";

// components/transferencias/useCuentaDeLocal.js
//
// LA CONSULTA DE LA CUENTA DE UN LOCAL, COMPARTIDA POR LAS DOS ENTRADAS.
//
// El depósito entra por `/modulos/transferencias/local/<id>` y el local por
// `/modulos/transferencias`. Las dos preguntan lo mismo, mueven los mismos dos
// controles —la unidad del chip y el desplazamiento de las flechas— y muestran
// la misma pantalla. Lo único que cambia es si se manda `destino` o no.
//
// ── POR QUÉ EL ESTADO VIVE ACÁ Y NO EN CADA PANTALLA ─────────────────────
//
// Porque son tres piezas que tienen que moverse juntas —unidad, desplazamiento y
// lo que se trajo— y separarlas es cómo se desincronizan. El caso concreto: al
// cambiar de unidad hay que VOLVER al período por defecto. Si no, alguien que
// está tres semanas atrás y toca "Mes" se va tres MESES atrás sin haberlo
// pedido, porque el número se quedó.
//
// ── EL PERÍODO POR DEFECTO ES EL QUE ACABA DE CERRAR ─────────────────────
//
// `-1`, no `0`. La pregunta de esta pantalla es cuánto hay que cobrar, y eso se
// contesta con el período TERMINADO. El en curso está a una flecha.

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { CLAVE_OTRO } from "./ChipsDePeriodo";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import {
  DESPLAZAMIENTO_POR_DEFECTO as DEFECTO,
  parseContextoDelTablero,
  serializarContextoDelTablero,
} from "@/lib/transferencias/contextoDelTablero";

/** El mismo formato de importe que el resto del módulo. */
export function money(n) {
  return `$ ${Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * El período que la pantalla abre: el que acaba de cerrar.
 *
 * Se re-exporta desde `contextoDelTablero`, que es donde vive ahora: lo necesita
 * también quien lee la URL, para saber si hay algo distinto del default que
 * valga la pena escribir. Dos constantes con el mismo número en dos archivos es
 * cómo se separan.
 */
export const DESPLAZAMIENTO_POR_DEFECTO = DEFECTO;

/**
 * ── EL PERÍODO VIVE EN LA URL, NO EN `useState` ─────────────────────────
 *
 * Vivía acá adentro, y por eso entrar a una transferencia y volver caía siempre
 * en el período de hoy: al desmontar la pantalla el estado se pierde POR
 * CONSTRUCCIÓN. Con 33 transferencias sin recibir de una semana pasada, eso era
 * renavegar 33 veces.
 *
 * Ahora la URL manda. El estado de React queda como ESPEJO de lo que dice la
 * barra —no como fuente— así que el back del navegador, el botón "Volver" y un
 * enlace pegado hacen todos lo mismo.
 *
 * ── LAS FLECHAS USAN `replace`, Y NO ES UN DETALLE ──────────────────────
 *
 * Con `push`, diez flechas serían diez entradas en el historial y el back del
 * navegador te haría recorrerlas una por una en vez de salir de la pantalla.
 * `replace` deja UNA. El `push` se guarda para entrar al detalle, que sí es un
 * lugar distinto.
 */
export function useCuentaDeLocal({ destino = null } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // La URL es la fuente. `useMemo` sobre la cadena y no sobre el objeto: el
  // objeto que devuelve `useSearchParams` cambia de identidad en cada render.
  const ctx = useMemo(() => parseContextoDelTablero(params), [params]);
  const unidad = ctx.unidad;
  const desplazamiento = ctx.desp;

  const escribirUrl = useCallback(
    (siguiente) => {
      const qs = serializarContextoDelTablero({ ...ctx, ...siguiente, local: null });
      // `scroll: false` para que cambiar de período no salte al principio de la
      // lista: lo que cambió es el rango, no el lugar donde estaba mirando.
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
      const url = new URL("/api/transferencias/tablero", window.location.origin);
      // `destino` y no `localId`: `localId` es un parámetro reservado de la API
      // —significa "el alcance que pido" y un no-admin solo puede pasar el
      // suyo—, así que mandarlo desde el depósito daba 403. El motivo largo está
      // en la ruta. El LOCAL no lo manda: su cuenta es la suya y la resuelve el
      // servidor, que es quien decide el alcance.
      if (destino) {
        url.searchParams.set("destino", String(destino));
      } else {
        // Sin destino, quien pregunta puede ser el depósito —y entonces lo que
        // corresponde es la LISTA de locales— o un local mirando la suya. El
        // servidor lo decide con `Local.es_deposito`: si es depósito contesta
        // `vista: "ENTRADA"` y si no, ignora este pedido y devuelve su cuenta.
        // Una sola llamada para las dos vistas, sin que la pantalla tenga que
        // adivinar quién es antes de preguntar.
        url.searchParams.set("entrada", "1");
      }
      url.searchParams.set("unidad", unidad === CLAVE_OTRO ? UNIDADES.SEMANA : unidad);
      url.searchParams.set("desplazamiento", String(desplazamiento));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar la cuenta del local.");
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

  /** Cambiar de unidad VUELVE al período por defecto. Ver el encabezado. */
  const onCambiarUnidad = useCallback(
    (u) => escribirUrl({ unidad: u, desp: DEFECTO }),
    [escribirUrl]
  );

  // Los topes los decide el SERVIDOR —`puedeAvanzar` y `puedeRetroceder`— y acá
  // solo se respeta lo que contestó. Dejar que la pantalla calcule el suyo sería
  // tener dos reglas para lo mismo, y la de la pantalla no conoce los datos.
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
    // El contexto, para que la pantalla pueda armar la URL del detalle con él.
    // Lleva el `destino` adentro: es el local cuya cuenta se está mirando, y es
    // lo que decide a dónde vuelve el botón.
    contexto: { unidad, desp: desplazamiento, local: destino ? Number(destino) : null },
  };
}
