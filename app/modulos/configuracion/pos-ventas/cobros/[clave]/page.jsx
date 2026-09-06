"use client";

import { use } from "react";
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
import { decodificarSegmentoDeRuta } from "@/lib/rutas/segmentoDeRuta";

// EDITAR UN MEDIO DE COBRO.
//
// ── LA CLAVE DE LA URL ES OPACA ────────────────────────────────────────────
//
// Llega del GET, se compara contra la que trae cada medio, y se devuelve al
// backend igual. Esta pantalla no sabe si detrás hay una fila o un default, no
// parsea la clave y no arma ninguna: si algún día el backend cambia cómo se
// direcciona un medio que todavía no existe, acá no hay que tocar nada.
//
// ── PERO SÍ HAY QUE DESHACER EL TRANSPORTE ─────────────────────────────────
//
// La lista arma el enlace con `encodeURIComponent`, así que `defecto:EFECTIVO`
// viaja como `defecto%3AEFECTIVO`, y `use(params)` entrega el segmento TAL CUAL
// viaja. La comparación quedaba `"defecto:EFECTIVO" !== "defecto%3AEFECTIVO"` y
// los cuatro medios por defecto se veían como inexistentes: es el defecto que
// llegó a producción.
//
// Decodificar el segmento NO es interpretar la clave. Acá se deshace el
// transporte y se compara el texto; qué significa adentro lo sigue sabiendo solo
// el backend. Ver `lib/rutas/segmentoDeRuta.js`.
//
// ── EL FORMULARIO SE MONTA RECIÉN CON LOS DATOS ────────────────────────────
//
// No antes. `FormularioMedio` toma su estado inicial de lo que recibe, y
// `SunmiToggle` guarda el suyo al montarse: dibujarlo mientras carga mostraría
// el interruptor apagado y después no se corregiría solo.

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

// Mientras el medio no llegó todavía no hay nombre que poner. Se dice qué
// pantalla es, que es verdad y es más útil que "Cobros" —el título que la ruta
// resuelve sola, y que nombra la sección de la que se vino, no dónde se está.
const TITULO_MIENTRAS_CARGA = "Editar medio";

export default function EditarMedioPage({ params }) {
  const { clave: segmento } = use(params);
  const clave = decodificarSegmentoDeRuta(segmento);
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { cargando, error, medios, tiposContables, procesadores, recargosPorTipo } = useMediosCobro();

  const puedeVer = !cargandoUser && puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });
  const medio = medios.find((m) => m.claveEdicion === clave) || null;

  // ── EL TÍTULO Y EL VOLVER VAN AL SHELL, Y SE REGISTRAN ANTES DE LOS CORTES ─
  //
  // Los `return` de abajo son condicionales y los hooks no: tienen que llamarse
  // siempre y en el mismo orden. Por eso la condición viaja adentro del valor
  // registrado —`null` deja el slot vacío— en vez de saltear la llamada.
  //
  // El título es el NOMBRE del medio, que no sale de la ruta: es el dato que la
  // pantalla acaba de leer. Es el mismo mecanismo que ya usa Cobros para su
  // Volver, con el escalón de título que se agregó en esta tanda.
  useTituloDePagina(puedeVer ? medio?.nombre || TITULO_MIENTRAS_CARGA : null);
  const volver = useAccionDePagina(
    () => (puedeVer ? <SunmiBackButton href={RUTA_COBROS} /> : null),
    [puedeVer]
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

  return (
    <div className="max-w-2xl mx-auto">
      {/* En escritorio el shell no tiene fila de título propia —el `<h1>` vive
          en el Header—, así que el MISMO nodo registrado se dibuja acá. Nunca
          hay dos: en mobile lo pone la fila del shell y este div está oculto.
          Es el patrón que ya usa la lista de Cobros. */}
      <div className="hidden md:flex justify-end mb-2">{volver}</div>

      <FormularioMedio
        modo="editar"
        medio={medio}
        tiposContables={tiposContables}
        procesadores={procesadores}
        recargosPorTipo={recargosPorTipo}
        alVolver={() => router.push(RUTA_COBROS)}
      />
    </div>
  );
}
