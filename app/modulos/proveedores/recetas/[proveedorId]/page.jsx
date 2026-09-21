"use client";

// LA EXPLICACIÓN DEL PAPEL DE UN PROVEEDOR.
//
// Es una pantalla de celular: se entra desde la lista de recetas tocando un
// proveedor, se escribe cómo se lee su papel, se prueba con una foto de verdad
// y se guarda. El título y el Volver los pone el shell, como en el resto del
// módulo.
//
// ── SE ENTRA POR DOS LADOS ────────────────────────────────────────────────
//
// Por la lista de recetas, y desde la RECEPCIÓN: cuando llega una factura de un
// proveedor que todavía no tiene explicación, se viene acá antes de gastar una
// lectura. En ese caso llegan dos cosas en la dirección —con qué foto probar y
// a dónde volver— y al guardar se vuelve solo, que es lo único que evita que
// alguien quede varado en una pantalla que no pidió abrir.

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import ExplicacionDelPapel from "@/components/compras-proveedor/ExplicacionDelPapel";
import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import useContextoActivo from "@/hooks/useContextoActivo";

/** A dónde vuelve el Volver. Solo rutas de acá adentro: una dirección que
 *  llega por la barra no puede mandar a otro sitio. */
function destinoSeguro(valor) {
  const v = String(valor || "");
  return v.startsWith("/") && !v.startsWith("//") ? v : "/modulos/proveedores/recetas";
}

export default function ExplicacionDelPapelPage({ params }) {
  const { proveedorId } = use(params);
  const router = useRouter();
  const busqueda = useSearchParams();
  const { perfil } = useUser();
  const { loading, needsContexto } = useContextoActivo();

  const comprobante = Number(busqueda.get("comprobante"));
  const volverA = destinoSeguro(busqueda.get("volverA"));

  // El Volver va al slot del shell, como en las otras pantallas del módulo.
  useAccionDePagina(() => <SunmiBackButton href={volverA} />, [volverA]);

  if (!perfil || loading) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const autorizado =
    permisos.includes("*") || permisos.includes("compras.recibir") || permisos.includes("compras.ver");
  if (!autorizado) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
      <ExplicacionDelPapel
        proveedorId={Number(proveedorId)}
        comprobanteId={Number.isFinite(comprobante) && comprobante > 0 ? comprobante : null}
        // Se volvió desde la recepción: al guardar, se vuelve a la recepción.
        // Desde la lista de recetas no hay a dónde volver y se queda.
        onGuardado={busqueda.get("volverA") ? () => router.push(volverA) : null}
      />
    </div>
  );
}
