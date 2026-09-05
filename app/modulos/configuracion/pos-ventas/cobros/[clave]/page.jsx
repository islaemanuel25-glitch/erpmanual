"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import FormularioMedio from "@/components/configuracion-pos/FormularioMedio";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import useMediosCobro from "@/hooks/useMediosCobro";
import { puedeVerSeccion } from "@/lib/config/acceso";

// EDITAR UN MEDIO DE COBRO.
//
// ── LA CLAVE DE LA URL ES OPACA ────────────────────────────────────────────
//
// Llega del GET, se compara contra la que trae cada medio, y se devuelve al
// backend igual. Esta pantalla no sabe si detrás hay una fila o un default, no
// parsea la clave y no arma ninguna: si algún día el backend cambia cómo se
// direcciona un medio que todavía no existe, acá no hay que tocar nada.
//
// ── EL FORMULARIO SE MONTA RECIÉN CON LOS DATOS ────────────────────────────
//
// No antes. `FormularioMedio` toma su estado inicial de lo que recibe, y
// `SunmiToggle` guarda el suyo al montarse: dibujarlo mientras carga mostraría
// el interruptor apagado y después no se corregiría solo.

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

export default function EditarMedioPage({ params }) {
  const { clave } = use(params);
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { contexto } = useContextoActivo();
  const { cargando, error, medios, tiposContables, procesadores, recargosPorTipo } = useMediosCobro();

  if (cargandoUser) return null;
  if (!puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" })) return <SinPermisos />;

  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>;

  const medio = medios.find((m) => m.claveEdicion === clave);

  if (!medio) {
    return (
      <SunmiCard className="p-3 text-xs sunmi-text-muted">
        Ese medio de cobro ya no está en la lista de este local. Puede haberlo cambiado alguien más:
        volvé a Cobros y entrá de nuevo.
      </SunmiCard>
    );
  }

  return (
    <FormularioMedio
      modo="editar"
      medio={medio}
      tiposContables={tiposContables}
      procesadores={procesadores}
      recargosPorTipo={recargosPorTipo}
      subtitulo={`Cobros${contexto?.nombre ? ` · Local: ${contexto.nombre}` : ""}`}
      alVolver={() => router.push(RUTA_COBROS)}
    />
  );
}
