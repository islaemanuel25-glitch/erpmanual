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

        const permisos = Array.isArray(p.permisos) ? p.permisos : [];

        setPerfil({
          id: p.id,
          nombre: p.nombre,
          email: p.email,
          rolId: p.rolId,
          rolNombre: p.rolNombre ?? "",
          permisos,
          esAdmin: permisos.includes("*"),
          esDuenoLocal: p.esDuenoLocal === true,
          localId: p.localId ?? null,
          esDeposito: p.esDeposito ?? false,
          // Operario obligatorio efectivo del local (null/ausente = true).
          exigirOperador: p.exigirOperador !== false,

          // ── LAS PREFERENCIAS DE LA TARJETA, YA RESUELTAS ────────────────
          //
          // `=== true` y no `!== false`: acá el default es APAGADO, al revés
          // que el del operario. Un local que nunca las tocó manda `null`, y un
          // JWT o un servidor viejo no las manda en absoluto — los dos casos
          // tienen que dar `false`, que es lo que se ve hoy. Escrito con
          // `!== false` darían `true` y le cambiarían el catálogo a todos los
          // que nunca pidieron nada.
          tarjetaPrecioUnitario: p.tarjetaPrecioUnitario === true,
          tarjetaOcultarEquivalencia: p.tarjetaOcultarEquivalencia === true,
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
    await fetch("/api/logout", {
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
