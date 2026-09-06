"use client";

import { useRouter } from "next/navigation";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import FormularioMedio from "@/components/configuracion-pos/FormularioMedio";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import { useUser } from "@/app/context/UserContext";
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

const TITULO = "Agregar medio";

export default function NuevoMedioPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { cargando, error, medios, tiposContables, procesadores, recargosPorTipo } = useMediosCobro();

  const puedeVer = !cargandoUser && puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });

  // Título y Volver van a la fila del shell, y se registran antes de los cortes
  // de abajo: los hooks se llaman siempre, así que la condición viaja adentro
  // del valor registrado. Acá el título es fijo —no depende de ningún dato— y
  // aun así no puede salir de la tabla de rutas: esa tabla resuelve "Cobros"
  // para toda la rama, que es de dónde se vino y no dónde se está.
  useTituloDePagina(puedeVer ? TITULO : null);
  const volver = useAccionDePagina(
    () => (puedeVer ? <SunmiBackButton href={RUTA_COBROS} /> : null),
    [puedeVer]
  );

  if (cargandoUser) return null;
  if (!puedeVer) return <SinPermisos />;

  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>;

  // Se sugiere el lugar siguiente al último. `orden` no es único, así que esto
  // no es una reserva: es no obligar a nadie a contar los botones que ya tiene.
  const ordenSugerido = medios.reduce((max, m) => Math.max(max, Number(m.orden) || 0), 0) + 1;

  return (
    <div className="max-w-2xl mx-auto">
      {/* El mismo nodo que registró el shell, para el escritorio, donde no hay
          fila de título. Oculto en mobile: nunca se ven dos Volver. */}
      <div className="hidden md:flex justify-end mb-2">{volver}</div>

      <FormularioMedio
        modo="alta"
        tiposContables={tiposContables}
        procesadores={procesadores}
        recargosPorTipo={recargosPorTipo}
        ordenSugerido={ordenSugerido}
        alVolver={() => router.push(RUTA_COBROS)}
      />
    </div>
  );
}
