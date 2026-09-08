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

// EDITAR UNA MODALIDAD.
//
// ── LA MODALIDAD SE BUSCA ADENTRO DEL MEDIO, NO POR SU ID SUELTO ───────────
//
// Es la misma composición que usa la API: primero el medio del local, después la
// modalidad DE ESE MEDIO. Así el aislamiento no depende de una comprobación
// escrita acá, y una modalidad de otro padre no aparece —igual que no existiría
// para el backend—.
//
// ── EL CASO DE LA OTRA SESIÓN ─────────────────────────────────────────────
//
// Si alguien la borró o la cambió de medio mientras esta pantalla estaba
// abierta, no aparece y se dice qué pasó. No se inventa un formulario vacío: eso
// terminaría creando una modalidad que nadie pidió.

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

export default function EditarModalidadPage({ params }) {
  const { clave: segmento, modalidadId } = use(params);
  const clave = decodificarSegmentoDeRuta(segmento);
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { cargando, error, medios, tiposContables } = useMediosCobro();

  const puedeVer = !cargandoUser && puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });
  const medio = medios.find((m) => m.claveEdicion === clave) || null;
  const modalidad =
    (medio?.modalidades ?? []).find((m) => String(m.id) === String(modalidadId)) || null;
  const rutaMedio = `${RUTA_COBROS}/${encodeURIComponent(clave)}`;

  useTituloDePagina(puedeVer ? modalidad?.nombre || "Editar modalidad" : null);
  const volver = useAccionDePagina(
    () => (puedeVer ? <SunmiBackButton href={rutaMedio} /> : null),
    [puedeVer, rutaMedio]
  );

  if (cargandoUser) return null;
  if (!puedeVer) return <SinPermisos />;
  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>;

  if (!medio || !modalidad) {
    return (
      <SunmiCard className="p-3 text-xs sunmi-text-muted">
        Esa modalidad ya no está en este medio de cobro. Puede haberla cambiado alguien más: volvé
        al medio y entrá de nuevo.
      </SunmiCard>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="hidden md:flex justify-end mb-2">{volver}</div>

      <FormularioModalidad
        modo="editar"
        medio={medio}
        modalidad={modalidad}
        tiposContables={tiposContables}
        alVolver={() => router.push(rutaMedio)}
      />
    </div>
  );
}
