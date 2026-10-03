"use client";

import { useState, useCallback, useEffect } from "react";
import { estadoTrasRevalidar, leerRespuestaOperador, SIN_RESPUESTA } from "@/lib/operador-revalidacion";

const SIN_OPERADOR = { operador: null, voucher: null, sinConexion: false };

export function useOperadorActivo() {
  // Operador activo, su voucher firmado —se adjunta a las ventas encoladas
  // offline; el servidor solo lo usa para negar, ver pos-ventas/crear— y si la
  // última revalidación no pudo preguntar. Un solo estado: los tres cambian
  // juntos y se calculan con lib/operador-revalidacion.js.
  const [estado, setEstado] = useState(SIN_OPERADOR);
  const [loading, setLoading] = useState(true);

  const refrescar = useCallback(async () => {
    let respuesta = SIN_RESPUESTA;
    try {
      const res = await fetch("/api/operador/me", { credentials: "include" });
      respuesta = await leerRespuestaOperador(res);
    } catch {
      // Sin red: no se pudo preguntar. NO es "no hay operador".
      respuesta = SIN_RESPUESTA;
    }
    setEstado((previo) => estadoTrasRevalidar(previo, respuesta));
    setLoading(false);
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // Revalidación: el token de operador dura 8h y antes nadie se enteraba de que
  // vencía hasta que fallaba una acción. Revalidamos cada 2 min (respaldo) y —lo
  // que más pega en uso real— al volver el foco/visibilidad a la pestaña.
  useEffect(() => {
    const REVALIDAR_MS = 2 * 60 * 1000;
    const id = setInterval(refrescar, REVALIDAR_MS);
    const onFocus = () => refrescar();
    const onVisible = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refrescar]);

  const login = useCallback(async (operadorId, pin) => {
    const res = await fetch("/api/operador/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ operadorId, pin }),
    });
    const data = await res.json();
    if (data.ok) {
      await refrescar();
    }
    return data;
  }, [refrescar]);

  const logout = useCallback(async () => {
    await fetch("/api/operador/logout", { method: "POST", credentials: "include" });
    setEstado(SIN_OPERADOR);
  }, []);

  return {
    operador: estado.operador,
    voucher: estado.voucher,
    sinConexion: estado.sinConexion,
    loading,
    login,
    logout,
    refrescar,
  };
}
