"use client";

import { useState, useCallback, useEffect } from "react";

export function useOperadorActivo() {
  const [operador, setOperador] = useState(null);
  // Voucher firmado del operador activo. Se adjunta a las ventas encoladas
  // offline para conservar la atribución al sincronizar (ver pos-ventas/crear).
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/operador/me", { credentials: "include" });
      const data = await res.json();
      setOperador(data.ok ? data.operador : null);
      setVoucher(data.ok ? (data.voucher ?? null) : null);
    } catch {
      setOperador(null);
      setVoucher(null);
    } finally {
      setLoading(false);
    }
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
    setOperador(null);
    setVoucher(null);
  }, []);

  return { operador, voucher, loading, login, logout, refrescar };
}
