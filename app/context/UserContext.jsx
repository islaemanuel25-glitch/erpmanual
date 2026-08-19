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

          // ── LA PREFERENCIA DE LA TARJETA, YA RESUELTA ───────────────────
          //
          // `=== true` y no `!== false`: acá el default es APAGADO, al revés
          // que el del operario. Un local que nunca la tocó manda `null`, y un
          // JWT o un servidor viejo no la manda en absoluto — los dos casos
          // tienen que dar `false`, que es lo que se ve hoy. Escrito con
          // `!== false` daría `true` y le cambiaría el catálogo a todos los
          // que nunca pidieron nada.
          //
          // ACÁ ERAN DOS. `tarjetaPrecioUnitario` se sacó el 2026-08-19: quedó
          // sin efecto cuando la tarjeta pasó a mostrar la escala en la que se
          // VENDE. `/api/me` la sigue mandando —viaja en el mismo `select`, sin
          // costo— y la columna sigue en la base; lo que no existe más es que
          // alguien la lea para decidir algo.
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
