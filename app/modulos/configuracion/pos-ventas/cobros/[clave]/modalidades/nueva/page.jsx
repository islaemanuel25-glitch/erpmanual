"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import FormularioModalidad from "@/components/configuracion-pos/FormularioModalidad";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import { useUser } from "@/app/context/UserContext";
import useMediosCobro from "@/hooks/useMediosCobro";
import { puedeVerSeccion } from "@/lib/config/acceso";
import { decodificarSegmentoDeRuta } from "@/lib/rutas/segmentoDeRuta";

// AGREGAR UNA MODALIDAD A UN MEDIO.
//
// Mismo esqueleto que "Editar medio", y a propósito: la clave de la URL es
// opaca, se decodifica el transporte y se compara el texto; el título y el
// Volver van al shell; y el formulario se monta recién con los datos, porque
// `SunmiToggle` guarda su estado al montarse y dibujarlo antes mostraría el
// interruptor apagado sin corregirse solo.
//
// ── UN MEDIO POR DEFECTO TAMBIÉN PUEDE RECIBIR UNA MODALIDAD ──────────────
//
// No hace falta materializarlo antes desde la pantalla: el POST resuelve la
// clave y, si el local todavía no tenía configuración, escribe LOS CUATRO medios
// y cuelga la modalidad del que corresponde. Esa decisión es del servidor y acá
// no se repite.

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

export default function NuevaModalidadPage({ params }) {
  const { clave: segmento } = use(params);
  const clave = decodificarSegmentoDeRuta(segmento);
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { cargando, error, medios, tiposContables } = useMediosCobro();

  const puedeVer = !cargandoUser && puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });
  const medio = medios.find((m) => m.claveEdicion === clave) || null;
  const rutaMedio = `${RUTA_COBROS}/${encodeURIComponent(clave)}`;

  useTituloDePagina(puedeVer ? "Nueva modalidad" : null);
  const volver = useAccionDePagina(
    () => (puedeVer ? <SunmiBackButton href={rutaMedio} /> : null),
    [puedeVer, rutaMedio]
  );

  if (cargandoUser) return null;
  if (!puedeVer) return <SinPermisos />;
  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>;

  if (!medio) {
    return (
      <SunmiCard className="p-3 text-xs sunmi-text-muted">
        Ese medio de cobro ya no está en la lista de este local. Puede haberlo cambiado alguien más:
        volvé a Cobros y entrá de nuevo.
      </SunmiCard>
    );
  }

  // El orden sugerido sigue al que ya hay, para que la modalidad nueva quede
  // última en el selector y no se meta en el medio de las existentes.
  const ordenSugerido = (medio.modalidades ?? []).reduce((max, m) => Math.max(max, Number(m.orden) || 0), 0) + 1;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="hidden md:flex justify-end mb-2">{volver}</div>

      <FormularioModalidad
        modo="alta"
        medio={medio}
        tiposContables={tiposContables}
        ordenSugerido={ordenSugerido}
        alVolver={() => router.push(rutaMedio)}
      />
    </div>
  );
}
