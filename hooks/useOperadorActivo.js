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
