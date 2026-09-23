"use client";

// components/finanzas/pagos/ListaCuentasPorPagar.jsx
//
// PAGOS A PROVEEDORES: las cuentas por pagar, en tres solapas.
//
// ── LA SOLAPA VIVE EN LA URL ─────────────────────────────────────────────
//
// Desde acá se entra a una cuenta y se vuelve. Con la solapa en `useState`,
// volver de una cuenta de "Pagados" caería siempre en "Pendientes". Es la misma
// regla que el período del tablero (`lib/finanzas/contextoFinanzas.js`).
//
// ── LA PANTALLA NO DECIDE QUÉ ES PENDIENTE ───────────────────────────────
//
// Manda la solapa y recibe las cuentas ya filtradas por el servidor con
// `cuentaPasaFiltro`. Si filtrara acá, habría dos definiciones de "pendiente".

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSolapas from "@/components/sunmi/SunmiSolapas";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { FILTRO_CUENTAS, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";
import { urlDeCuentaPorPagar, urlDePagosProveedores } from "@/lib/finanzas/contextoFinanzas";

import TarjetaCuentaPorPagar from "./TarjetaCuentaPorPagar";

export const SOLAPAS_CUENTAS = Object.freeze([
  { valor: FILTRO_CUENTAS.PENDIENTES, texto: "Pendientes" },
  { valor: FILTRO_CUENTAS.PAGADAS, texto: "Pagados" },
  { valor: FILTRO_CUENTAS.TODAS, texto: "Todos" },
]);

const TEXTO_VACIO = Object.freeze({
  [FILTRO_CUENTAS.PENDIENTES]: "No hay cuentas con saldo pendiente.",
  [FILTRO_CUENTAS.PAGADAS]: "Todavía no hay cuentas pagadas.",
  [FILTRO_CUENTAS.TODAS]: "Todavía no hay cuentas por pagar.",
});

export default function ListaCuentasPorPagar() {
  const router = useRouter();
  const params = useSearchParams();
  const filtro = filtroDeCuentas(params.get("estado"));

  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const url = new URL("/api/finanzas/pagos-proveedores", window.location.origin);
      url.searchParams.set("estado", filtro);
      const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      // El caso malo tiene rama propia: un 500 que se viera como una lista
      // vacía diría "no hay deudas" cuando lo que pasa es que no se pudo leer.
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer las cuentas por pagar.");
      setCuentas(j.cuentas || []);
    } catch (e) {
      setError(e.message);
      setCuentas([]);
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <SunmiSolapas
        opciones={SOLAPAS_CUENTAS}
        valor={filtro}
        onCambiar={(v) => router.replace(urlDePagosProveedores(v), { scroll: false })}
        etiqueta="Estado de las cuentas"
      />

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <SunmiAviso tono="danger" titulo="No se pudo cargar">
          {error}
        </SunmiAviso>
      )}

      {!cargando && !error && cuentas.length === 0 && (
        <div className="text-center py-12 sunmi-text-muted text-xs">{TEXTO_VACIO[filtro]}</div>
      )}

      {!cargando && !error && cuentas.length > 0 && (
        <div className="space-y-2.5">
          {cuentas.map((c) => (
            <TarjetaCuentaPorPagar
              key={c.id}
              cuenta={c}
              onAbrir={() => router.push(urlDeCuentaPorPagar(c.id, filtro))}
            />
          ))}
        </div>
      )}
    </>
  );
}
