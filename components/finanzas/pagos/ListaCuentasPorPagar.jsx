"use client";

// components/finanzas/pagos/ListaCuentasPorPagar.jsx
//
// PAGOS A PROVEEDORES: las cuentas por pagar, EN EL CALENDARIO, como la cuenta
// de un local en Transferencias.
//
// ── LA MISMA ESTRUCTURA, PIEZA POR PIEZA ─────────────────────────────────
//
// De arriba hacia abajo, lo mismo que `CuentaDeUnLocal`:
//
//   1. Día / Semana / Mes / Otro       → `ChipsDePeriodo`, la de Transferencias.
//   2. el período, con sus flechas      → `NavegadorDePeriodo`, la de Transferencias.
//   3. Pendientes / Pagados / Todos     → `SunmiSelectorDeOpciones`.
//   4. el resumen                       → `ResumenConImporte`, sacado de Transferencias.
//   5. el buscador, si hay filas        → `SunmiInput`, igual que allá.
//   6. Vencidas, solo en Pendientes     → `DiaConBanda`.
//   7. los días del período             → `DiaConBanda`, con `FilaConImporte` adentro.
//   8. Sin fecha, solo en Pendientes    → `DiaConBanda`.
//
// El período y la pestaña son dos cosas distintas y se eligen por separado. Qué
// fecha ubica a cada cuenta según la pestaña, y por qué Vencidas y Sin fecha se
// ven en cualquier período, está en `lib/finanzas/calendarioDePagos.js`.
//
// ── "OTRO" ESTÁ APAGADO, COMO EN EL RESTO DE FINANZAS ────────────────────
//
// `CHIPS_APAGADOS` es el de la cuenta financiera de un local: el día que Otro
// se implemente se borra de UN lugar. Transferencias tampoco abre un calendario:
// elige el chip, esconde las flechas y consulta la semana. Copiar eso sería
// mostrar un chip elegido con otro período debajo.
//
// ── TODO VIVE EN LA URL ──────────────────────────────────────────────────
//
// Pestaña y período: desde acá se entra a una cuenta y se vuelve, y con
// `useState` se volvería siempre a Pendientes y a la semana en curso.
//
// ── LA PANTALLA NO DECIDE QUÉ ES PENDIENTE ───────────────────────────────
//
// Pide la pestaña y recibe las cuentas ya filtradas por el servidor con
// `cuentaPasaFiltro`. Lo que se hace acá es ubicarlas en el calendario, sobre lo
// que ya llegó: la ruta manda todas las de la pestaña, sin paginar.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import ChipsDePeriodo from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { CHIPS_APAGADOS } from "@/components/finanzas/CuentaFinancieraDeUnLocal";
import { formatearMoneda } from "@/lib/moneda";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { FILTRO_CUENTAS, cuentaCoincideConBusqueda } from "@/lib/finanzas/pagosProveedores";
import {
  calendarioDeCuentas,
  descripcionDePagos,
  puedeAvanzarPagos,
  puedeRetrocederPagos,
  rotuloDeCuentas,
} from "@/lib/finanzas/calendarioDePagos";
import {
  parseContextoPagos,
  urlDeCuentaPorPagar,
  urlDePagosProveedores,
} from "@/lib/finanzas/contextoFinanzas";

import FilaCuentaPorPagar from "./FilaCuentaPorPagar";
import ResumenDeCuentasPorPagar from "./ResumenDeCuentasPorPagar";

export const OPCIONES_FILTRO_CUENTAS = Object.freeze([
  { clave: FILTRO_CUENTAS.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO_CUENTAS.PAGADAS, texto: "Pagados" },
  { clave: FILTRO_CUENTAS.TODAS, texto: "Todos" },
]);

export default function ListaCuentasPorPagar() {
  const router = useRouter();
  const params = useSearchParams();
  const ctx = parseContextoPagos(params);
  const { estado: filtro, unidad, desp } = ctx;

  const [cuentas, setCuentas] = useState([]);
  const [variasUbicaciones, setVariasUbicaciones] = useState(false);
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
      setVariasUbicaciones(Boolean(j.variasUbicaciones));
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

  // `scroll: false`: lo que cambió es el período o la pestaña, no el lugar.
  const ir = (siguiente) => router.replace(urlDePagosProveedores({ ...ctx, ...siguiente }), { scroll: false });

  const hoy = hoyArgentinaISO();
  const descripcion = descripcionDePagos({ unidad, desplazamiento: desp, filtro, hoy });
  // El resumen mira TODO lo del período; el buscador solo achica lo que se lista.
  // Es la misma regla que Transferencias: el número de arriba no cambia al buscar.
  const calendario = calendarioDeCuentas({ cuentas, filtro, rango: descripcion.rango, hoy });
  const visibles = calendarioDeCuentas({
    cuentas: cuentas.filter((c) => cuentaCoincideConBusqueda(c, busqueda)),
    filtro,
    rango: descripcion.rango,
    hoy,
  });
  const grupos = [visibles.vencidas, ...visibles.dias, visibles.sinFecha].filter(Boolean);
  const hayFilas = Boolean(calendario.vencidas || calendario.dias.length || calendario.sinFecha);

  return (
    <>
      <ChipsDePeriodo
        valor={unidad}
        onCambiar={(u) => ir({ unidad: u, desp: 0 })}
        deshabilitadas={CHIPS_APAGADOS}
      />

      <NavegadorDePeriodo
        titulo={descripcion.titulo}
        subtitulo={descripcion.subtitulo}
        puedeAvanzar={puedeAvanzarPagos(desp, filtro)}
        puedeRetroceder={puedeRetrocederPagos(desp, filtro)}
        onAtras={() => ir({ desp: desp - 1 })}
        onAdelante={() => ir({ desp: desp + 1 })}
      />

      <SunmiSelectorDeOpciones
        opciones={OPCIONES_FILTRO_CUENTAS}
        valor={filtro}
        onCambiar={(v) => ir({ estado: v })}
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
          <ResumenDeCuentasPorPagar filtro={filtro} descripcion={descripcion} calendario={calendario} />

          {/* El buscador no se dibuja si no hay filas: un campo para buscar en
              una lista vacía no puede encontrar nada, y el vacío ya lo dice el
              bloque de arriba. Es la regla de Transferencias. */}
          {hayFilas && (
            <SunmiInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor, compra o factura"
              aria-label="Buscar proveedor, compra o factura"
              className="w-full rounded-xl text-sm3"
            />
          )}

          {grupos.length === 0
            ? busqueda.trim() && (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  Ninguna cuenta coincide con la búsqueda.
                </div>
              )
            : grupos.map((g) => (
                <DiaConBanda
                  key={g.clave}
                  titulo={g.titulo}
                  dato={rotuloDeCuentas(g.cantidad)}
                  importe={formatearMoneda(g.importe)}
                >
                  {g.cuentas.map((c) => (
                    <FilaCuentaPorPagar
                      key={c.id}
                      cuenta={c}
                      filtro={filtro}
                      hoy={hoy}
                      variasUbicaciones={variasUbicaciones}
                      onAbrir={() => router.push(urlDeCuentaPorPagar(c.id, ctx))}
                    />
                  ))}
                </DiaConBanda>
              ))}
        </>
      )}
    </>
  );
}
