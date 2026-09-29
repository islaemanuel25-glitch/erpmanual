// app/modulos/finanzas/gastos/[gastoId]/page.jsx
//
// UN GASTO ABIERTO.
//
// El título es el CONCEPTO del gasto, que lo trae el dato. "Volver" lleva a la
// lista en la pestaña, el período y la categoría de los que se vino, que viajan
// en la URL (`parseContextoGastos`). El mismo armado que una cuenta por pagar.
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import DetalleGasto from "@/components/finanzas/gastos/DetalleGasto";
import { parseContextoGastos, urlDeGastos } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export default function GastoPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Gasto />
    </Suspense>
  );
}

function Gasto() {
  const { gastoId } = useParams();
  const params = useSearchParams();
  // La pestaña, el período y la categoría de la lista: "Volver" cae en el mismo lugar.
  const vuelta = urlDeGastos(parseContextoGastos(params));
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/gastos/${gastoId}`, { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo abrir el gasto.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [gastoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useTituloDePagina(datos?.gasto?.concepto || "Gasto");
  const volver = useAccionDePagina(() => <SunmiBackButton href={vuelta} />, [vuelta]);

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes(PERMISO_VER_FINANZAS)) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>

      {cargando && !datos && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <SunmiAviso tono="danger" titulo="No se pudo abrir">
          {error}
        </SunmiAviso>
      )}

      {datos?.gasto && <DetalleGasto datos={datos} onCambio={cargar} />}
    </div>
  );
}
