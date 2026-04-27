"use client";

import { useState, useCallback, useEffect } from "react";

export function useOperadorActivo() {
  const [operador, setOperador] = useState(null);
  const [loading, setLoading] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/operador/me", { credentials: "include" });
      const data = await res.json();
      setOperador(data.ok ? data.operador : null);
    } catch {
      setOperador(null);
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
  }, []);

  return { operador, loading, login, logout, refrescar };
}
