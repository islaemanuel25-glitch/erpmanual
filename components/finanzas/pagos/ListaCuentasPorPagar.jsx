"use client";

// components/finanzas/pagos/ListaCuentasPorPagar.jsx
//
// PAGOS A PROVEEDORES: las cuentas por pagar, con el patrón de Transferencias.
//
// ── EL MISMO ORDEN QUE LA CUENTA DE UN LOCAL ─────────────────────────────
//
// `components/transferencias/CuentaDeUnLocal.jsx`, de arriba hacia abajo: el
// selector que reparte el ancho, el bloque grande con el importe, el buscador
// —solo si hay filas— y los grupos con banda. Allá los grupos son días; acá son
// proveedores, porque la pregunta de esta pantalla es a quién se le debe.
//
// ── EL FILTRO VIVE EN LA URL ─────────────────────────────────────────────
//
// Desde acá se entra a una cuenta y se vuelve. Con el filtro en `useState`,
// volver de una cuenta de "Pagados" caería siempre en "Pendientes". Es la misma
// regla que el período del tablero (`lib/finanzas/contextoFinanzas.js`).
//
// ── LA PANTALLA NO DECIDE QUÉ ES PENDIENTE ───────────────────────────────
//
// Manda el filtro y recibe las cuentas ya filtradas por el servidor con
// `cuentaPasaFiltro`. Si filtrara acá, habría dos definiciones de "pendiente".
// Lo único que filtra en el navegador es el buscador, sobre lo que ya llegó.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import { formatearMoneda } from "@/lib/moneda";
import {
  FILTRO_CUENTAS,
  cuentaCoincideConBusqueda,
  cuentasPorProveedor,
  filtroDeCuentas,
  resumenDeCuentas,
} from "@/lib/finanzas/pagosProveedores";
import { urlDeCuentaPorPagar, urlDePagosProveedores } from "@/lib/finanzas/contextoFinanzas";

import FilaCuentaPorPagar from "./FilaCuentaPorPagar";
import ResumenDeCuentasPorPagar from "./ResumenDeCuentasPorPagar";

export const OPCIONES_FILTRO_CUENTAS = Object.freeze([
  { clave: FILTRO_CUENTAS.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO_CUENTAS.PAGADAS, texto: "Pagados" },
  { clave: FILTRO_CUENTAS.TODAS, texto: "Todos" },
]);

const TEXTO_VACIO = Object.freeze({
  [FILTRO_CUENTAS.PENDIENTES]: "No hay cuentas con saldo pendiente.",
  [FILTRO_CUENTAS.PAGADAS]: "Todavía no hay cuentas pagadas.",
  [FILTRO_CUENTAS.TODAS]: "Todavía no hay cuentas por pagar.",
});

/** "1 cuenta", "3 cuentas": el subtítulo de la banda del proveedor. */
function rotuloDeCuentas(n) {
  return `${n} ${n === 1 ? "cuenta" : "cuentas"}`;
}

export default function ListaCuentasPorPagar() {
  const router = useRouter();
  const params = useSearchParams();
  const filtro = filtroDeCuentas(params.get("estado"));

  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

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

  // Sin `useMemo`, por lo mismo que el buscador de transferencias: es un filtro
  // sobre decenas de filas que ya están en memoria.
  const visibles = cuentas.filter((c) => cuentaCoincideConBusqueda(c, busqueda));
  const buscando = busqueda.trim() !== "";
  // En "Pagados" el saldo de cada grupo es cero: ahí la banda dice lo pagado,
  // igual que el bloque de arriba.
  const importeDelGrupo = (g) => formatearMoneda(filtro === FILTRO_CUENTAS.PAGADAS ? g.pagado : g.saldo);

  return (
    <>
      <SunmiSelectorDeOpciones
        opciones={OPCIONES_FILTRO_CUENTAS}
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

      {!cargando && !error && (
        <>
          <ResumenDeCuentasPorPagar
            filtro={filtro}
            resumen={resumenDeCuentas(cuentas)}
            textoVacio={TEXTO_VACIO[filtro]}
          />

          {/* El buscador no se dibuja si no hay filas: un campo para buscar en
              una lista vacía no puede encontrar nada, y el vacío ya lo dice el
              bloque de arriba. Es la regla de transferencias. */}
          {cuentas.length > 0 && (
            <SunmiInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor, compra o factura"
              aria-label="Buscar proveedor, compra o factura"
              className="w-full rounded-xl text-sm3"
            />
          )}

          {visibles.length === 0
            ? buscando && (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  Ninguna cuenta coincide con la búsqueda.
                </div>
              )
            : cuentasPorProveedor(visibles).map((g) => (
                <DiaConBanda
                  key={g.clave}
                  titulo={g.proveedor?.nombre || "Sin proveedor"}
                  subtitulo={rotuloDeCuentas(g.cuentas.length)}
                  importe={importeDelGrupo(g)}
                >
                  {g.cuentas.map((c) => (
                    <FilaCuentaPorPagar
                      key={c.id}
                      cuenta={c}
                      onAbrir={() => router.push(urlDeCuentaPorPagar(c.id, filtro))}
                    />
                  ))}
                </DiaConBanda>
              ))}
        </>
      )}
    </>
  );
}
