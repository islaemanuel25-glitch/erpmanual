"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const Ctx = createContext(null);

export function UserProvider({ children }) {
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch("/api/me", {
        method: "GET",
        credentials: "include", // lee cookie de sesión
        cache: "no-store",
      });

      const data = await r.json();

      if (data?.ok && data?.user) {
        const p = data.user;

        const permisos = Array.isArray(p.permisos) ? p.permisos : ["*"];

        setPerfil({
          id: p.id,
          nombre: p.nombre,
          email: p.email,
          rolId: p.rolId,
          rolNombre: p.rolNombre ?? "",
          permisos,
          esAdmin: permisos.includes("*"), 
          localId: p.localId ?? null,
        });
      } else {
        setPerfil(null);
      }
    } catch (err) {
      console.error("Error refrescar sesión:", err);
      setPerfil(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    setPerfil(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  };

  return (
    <Ctx.Provider value={{ perfil, cargando, refrescar, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  return useContext(Ctx);
}
