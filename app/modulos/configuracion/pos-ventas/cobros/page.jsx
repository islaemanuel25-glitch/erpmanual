"use client";

import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import useMediosCobro from "@/hooks/useMediosCobro";
import { puedeVerSeccion } from "@/lib/config/acceso";
import {
  etiquetaVisibilidad,
  inicialesDeMedio,
  resumenClasificacion,
  resumenComercial,
} from "@/lib/pos-ventas/mediosCobroPantalla";

// COBROS — qué botones ve el cajero al cobrar.
//
// ── LA LISTA NO SE ARMA ACÁ ────────────────────────────────────────────────
//
// Se dibujan exactamente los medios que devuelve `/api/medios-cobro`, en el
// orden en que vienen. Un local que no configuró nada recibe los cuatro
// defaults resueltos por el SERVIDOR, no por esta pantalla: si la lista se armara
// acá, el día que cambien los defaults el POS cobraría una cosa y esta pantalla
// mostraría otra.
//
// ── `claveEdicion` ES OPACA ────────────────────────────────────────────────
//
// Se recibe y se pone en la URL sin mirarla. Esta pantalla no sabe —y no tiene
// por qué saber— que un medio sin fila se direcciona por su tipo. No la parsea,
// no la construye y no convierte ningún `id: null` en un número.

export default function CobrosPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const { contexto } = useContextoActivo();
  const { cargando, error, medios, usandoDefaults } = useMediosCobro();

  if (cargandoUser) return null;
  if (!puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" })) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Cobros"
        subtitle={`Configuración POS${contexto?.nombre ? ` · Local: ${contexto.nombre}` : ""}`}
      />

      <p className="text-xs sunmi-text-muted mb-4 px-1">
        Elegí qué botones aparecen al cobrar. Tocá un medio para editar todo lo que le corresponde.
      </p>

      {cargando ? (
        <SunmiLoader />
      ) : error ? (
        <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>
      ) : (
        <>
          <h2 className="text-[11px] sunmi-section-title mb-2 px-1">MEDIOS DE COBRO</h2>

          <div className="flex flex-col gap-3">
            {medios.map((m) => (
              <Link
                key={m.claveEdicion}
                href={`/modulos/configuracion/pos-ventas/cobros/${encodeURIComponent(m.claveEdicion)}`}
              >
                {/* Un medio oculto se dibuja apagado y NO se esconde: sigue
                    existiendo, sigue teniendo su configuración, y esconderlo
                    dejaría a alguien sin forma de volver a prenderlo. */}
                <SunmiCard className={`p-3 ${m.activo ? "" : "opacity-60"}`}>
                  <SunmiListItem
                    clickable
                    label={m.nombre}
                    description={
                      <>
                        <span className="block truncate">{resumenComercial(m)}</span>
                        <span className="block truncate">{resumenClasificacion(m)}</span>
                      </>
                    }
                    left={
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-semibold ${
                          m.activo ? "sunmi-badge-accent" : "sunmi-badge-muted"
                        }`}
                      >
                        {inicialesDeMedio(m.nombre)}
                      </span>
                    }
                    right={
                      <>
                        <span
                          className={`text-[11px] ${m.activo ? "sunmi-text-accent" : "sunmi-text-muted"}`}
                        >
                          {etiquetaVisibilidad(m)}
                        </span>
                        <span className="sunmi-text-muted">›</span>
                      </>
                    }
                  />
                </SunmiCard>
              </Link>
            ))}
          </div>

          <Link href="/modulos/configuracion/pos-ventas/cobros/nuevo">
            <SunmiCard className="p-3 mt-3 text-center text-sm font-semibold sunmi-text-accent">
              + Agregar medio de cobro
            </SunmiCard>
          </Link>

          {usandoDefaults && (
            <p className="text-xs sunmi-text-muted mt-3 px-1">
              Este local todavía no configuró sus medios: se están mostrando los que el sistema usa
              por defecto. Al guardar el primer cambio quedan fijados como configuración del local.
            </p>
          )}

          <p className="text-xs sunmi-text-muted mt-3 px-1">
            Un mismo procesador puede tener varios botones: “MP Débito” y “MP Crédito” pueden ser
            medios distintos y seguir cobrando por Mercado Pago.
          </p>
        </>
      )}
    </div>
  );
}
