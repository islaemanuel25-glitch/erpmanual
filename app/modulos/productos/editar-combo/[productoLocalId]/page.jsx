"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FormCombo from "@/components/productos/FormCombo";
import useContextoActivo from "@/hooks/useContextoActivo";

// Edición de COMBO — identificado por ProductoLocal.id (combo exacto del local).
export default function EditarComboPage({ params }) {
  const { productoLocalId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();
  const localId = contexto?.localId || 0;

  // ── A DÓNDE SE VUELVE, Y POR QUÉ ESTABA MAL ─────────────────────────────
  //
  // Los tres caminos de salida estaban escritos a mano y ninguno conservaba
  // nada: guardar iba a `/modulos/productos?tipo=combos`, cancelar y el botón de
  // atrás a `/modulos/productos` pelado. Editar un combo de la página 3, con una
  // búsqueda y un orden puestos, devolvía a la página 1 del catálogo con otro
  // filtro. Es el mismo defecto que el editor de producto ya no tenía: aquél
  // arma su `returnUrl` desde la query, y éste no la recibía siquiera.
  //
  // Ahora la query llega desde el listado —`abrirEditarCombo` la manda— y de acá
  // salen las tres salidas. Es UNA sola constante para que no puedan volver a
  // separarse: la que se olvide de actualizar es la que rompe el retorno.
  const qs = searchParams.toString();
  const urlDeVuelta = qs ? `/modulos/productos?${qs}` : "/modulos/productos";

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!localId || !productoLocalId) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/combos/${productoLocalId}?localId=${localId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!vivo) return;
        if (!res.ok || !data?.ok) {
          setError(data?.error || "No se pudo cargar el combo.");
          return;
        }
        const c = data.combo;
        setInitial({
          nombre: c.nombre,
          codigo_barra: c.codigo_barra || "",
          codigo_barra_secundario: c.codigo_barra_secundario || "",
          precio_venta: c.precio_venta,
          margenConfigurado: c.margenConfigurado ?? null,
          redondeo_100: c.redondeo_100 === true,
          activo: c.activo,
          componentes: (c.componentes || []).map((x) => ({
            componenteProductoLocalId: x.componenteProductoLocalId,
            productoBaseId: x.componenteBaseId,
            nombre: x.nombre,
            cantidad: Number(x.cantidad),
            costoUnitario: Number(x.costoUnitario) || 0,
            stock: x.stock,
            tieneStockLocal: x.tieneStockLocal !== false,
            activo: x.activo !== false, // componentes desactivados se muestran marcados
          })),
        });
      } catch {
        if (vivo) setError("No se pudo cargar el combo.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [localId, productoLocalId, router]);

  const handleSubmit = async (payload) => {
    const res = await fetch(`/api/combos/${productoLocalId}?localId=${localId}`, {
      credentials: "include",
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo guardar el combo.");
    }
    router.push(urlDeVuelta);
  };

  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title="Editar combo" />
          <SunmiBackButton href={urlDeVuelta} />
        </div>
        <div className="p-1">
          {loading ? (
            <div className="flex justify-center p-6">
              <SunmiLoader />
            </div>
          ) : error ? (
            <p className="text-[12px] text-red-500 p-3">{error}</p>
          ) : initial ? (
            <FormCombo
              mode="editar"
              initial={initial}
              localId={localId}
              localNombre={contexto?.nombre}
              esDeposito={contexto?.esDeposito === true}
              onSubmit={handleSubmit}
              onCancel={() => router.push(urlDeVuelta)}
              submitLabel="Guardar combo"
            />
          ) : null}
        </div>
      </SunmiCard>
    </div>
  );
}
