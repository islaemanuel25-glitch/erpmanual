"use client";

import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import FormularioMedio from "@/components/configuracion-pos/FormularioMedio";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import useMediosCobro from "@/hooks/useMediosCobro";
import { puedeVerSeccion } from "@/lib/config/acceso";

// AGREGAR UN MEDIO DE COBRO.
//
// Es el mismo formulario que editar, en modo alta. Las dos pantallas del diseño
// son la misma con otro título y otro botón.
//
// Los tipos y los procesadores que se ofrecen salen del GET, no de una lista
// escrita acá: así la pantalla no puede ofrecer un tipo que la base no acepta, y
// FIADO no aparece nunca, porque el servidor no lo manda.

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

export default function NuevoMedioPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { contexto } = useContextoActivo();
  const { cargando, error, medios, tiposContables, procesadores, recargosPorTipo } = useMediosCobro();

  if (cargandoUser) return null;
  if (!puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" })) return <SinPermisos />;

  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>;

  // Se sugiere el lugar siguiente al último. `orden` no es único, así que esto
  // no es una reserva: es no obligar a nadie a contar los botones que ya tiene.
  const ordenSugerido = medios.reduce((max, m) => Math.max(max, Number(m.orden) || 0), 0) + 1;

  return (
    <FormularioMedio
      modo="alta"
      tiposContables={tiposContables}
      procesadores={procesadores}
      recargosPorTipo={recargosPorTipo}
      ordenSugerido={ordenSugerido}
      subtitulo={`Cobros${contexto?.nombre ? ` · Local: ${contexto.nombre}` : ""}`}
      alVolver={() => router.push(RUTA_COBROS)}
    />
  );
}
