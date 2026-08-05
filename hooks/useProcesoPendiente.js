"use client";

// El aviso de proceso de caja pendiente, con su estado y sus acciones.
//
// Vive en un hook porque las dos pantallas de inicio —retiro y cierre— hacen
// exactamente lo mismo con él: lo detectan al entrar, lo reciben en el 409 del
// POST, y ofrecen continuar o cancelar. Duplicarlo garantizaba que una de las
// dos se quedara atrás.
//
// NO DECIDE NADA MONETARIO. Solo transporta lo que el servidor ya resolvió:
// qué proceso hay, si se puede cancelar y a dónde se va para continuarlo.

import { useCallback, useState } from "react";

import {
  EXITO_CANCELAR,
  MOTIVO_CANCELADO_DESDE_AVISO,
  rutaCancelar,
  rutaProceso,
  TIPO_PROCESO,
} from "@/lib/caja/procesoPendiente";
import { descartarBorrador } from "@/lib/caja/borradorRetiro";
import { descartarBorradorCierre } from "@/lib/caja/borradorCierre";

export default function useProcesoPendiente({ enPestanaNueva = false, alCancelar } = {}) {
  const [proceso, setProceso] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  /** Toma el proceso que venga en cualquier respuesta del servidor. Devuelve
   *  `true` si había uno, para que quien llama corte ahí su propio flujo. */
  const tomarDeRespuesta = useCallback((json) => {
    const p = json?.procesoPendiente;
    if (!p?.token) return false;
    setProceso(p);
    setError("");
    return true;
  }, []);

  const limpiar = useCallback(() => {
    setProceso(null);
    setError("");
  }, []);

  /** A dónde lleva "Continuar". Nunca inicia otro proceso: navega por el token
   *  que ya existe, y la pantalla de destino recupera sola su borrador. */
  const rutaContinuar = useCallback(
    () => (proceso ? rutaProceso(proceso.tipo, proceso.token, enPestanaNueva) : null),
    [proceso, enPestanaNueva]
  );

  /**
   * Deshace el proceso con el endpoint que ya existe. No toca la base por su
   * cuenta, no crea arqueos ni movimientos: eso lo garantiza el endpoint, que es
   * el mismo que usa la pantalla del conteo.
   */
  const cancelar = useCallback(async () => {
    if (!proceso?.token || cancelando) return;
    setCancelando(true);
    setError("");
    try {
      const res = await fetch(rutaCancelar(proceso.tipo, proceso.token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ motivo: MOTIVO_CANCELADO_DESDE_AVISO }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo cancelar el proceso.");
        return;
      }

      // El conteo a medias del proceso deshecho se borra: dejarlo invitaría a
      // retomarlo sobre un corte que ya no existe.
      const storage = typeof window !== "undefined" ? window.localStorage : null;
      if (storage) {
        if (proceso.tipo === TIPO_PROCESO.RETIRO) descartarBorrador(storage, proceso.token);
        else descartarBorradorCierre(storage, proceso.token);
      }

      setExito(EXITO_CANCELAR[proceso.tipo] || "Proceso cancelado.");
      setProceso(null);
      // Quien llama vuelve a leer el estado de la caja: después de cancelar, la
      // pantalla tiene que quedar lista para empezar de nuevo.
      await alCancelar?.();
    } catch {
      setError("Error de conexión.");
    } finally {
      setCancelando(false);
    }
  }, [proceso, cancelando, alCancelar]);

  return {
    proceso,
    setProceso,
    cancelando,
    error,
    exito,
    setExito,
    tomarDeRespuesta,
    limpiar,
    rutaContinuar,
    cancelar,
  };
}
