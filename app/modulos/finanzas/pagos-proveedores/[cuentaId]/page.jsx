// app/modulos/finanzas/pagos-proveedores/[cuentaId]/page.jsx
//
// UNA CUENTA POR PAGAR ABIERTA.
//
// El título es el NOMBRE DEL PROVEEDOR, que no está en la ruta: lo trae el dato.
// "Volver" lleva a la lista en la solapa de la que se vino, que viaja en
// `?estado=`.
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
import DetalleCuentaPorPagar from "@/components/finanzas/pagos/DetalleCuentaPorPagar";
import { urlDePagosProveedores } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_VER_FINANZAS, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";

export default function CuentaPorPagarPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <CuentaPorPagar />
    </Suspense>
  );
}

function CuentaPorPagar() {
  const { cuentaId } = useParams();
  const params = useSearchParams();
  const filtro = filtroDeCuentas(params.get("estado"));
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
      const res = await fetch(`/api/finanzas/pagos-proveedores/${cuentaId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo abrir la cuenta.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [cuentaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useTituloDePagina(datos?.cuenta?.proveedor?.nombre || "Cuenta por pagar");
  const volver = useAccionDePagina(
    () => <SunmiBackButton href={urlDePagosProveedores(filtro)} />,
    [filtro]
  );

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

      {datos?.cuenta && <DetalleCuentaPorPagar datos={datos} onCambio={cargar} />}
    </div>
  );
}
