"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FormCombo from "@/components/productos/FormCombo";
import useContextoActivo from "@/hooks/useContextoActivo";
import {
  vinoDeUnaCardMovil,
  urlDeListadoSinMarca,
} from "@/lib/productos/estadoDeRetorno";

// Edición de COMBO — identificado por ProductoLocal.id (combo exacto del local).
export default function EditarComboPage({ params }) {
  const { productoLocalId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();
  const localId = contexto?.localId || 0;

  // ── A DÓNDE SE VUELVE: DEPENDE DE DÓNDE SE VINO ─────────────────────────
  //
  // DESDE UNA CARD DEL CELULAR. Las tres salidas vuelven al listado EXACTO —su
  // página, su búsqueda, sus filtros y su orden—, que es lo que permite
  // restaurar la posición y marcar la card. Antes no era así y era un defecto:
  // guardar mandaba a `?tipo=combos` y cancelar a `/modulos/productos` pelado,
  // así que editar un combo de la página 3 con filtros devolvía a otro lado.
  //
  // DESDE LA TABLA DE ESCRITORIO. Las tres salidas van exactamente a donde iban
  // antes de `81541c37`: guardar a `?tipo=combos`, cancelar y atrás a
  // `/modulos/productos`. Escritorio no tenía retorno de combo y no lo gana —
  // dárselo sería una función nueva, no una restauración—.
  //
  // ── CÓMO SE DISTINGUE, Y CÓMO NO ────────────────────────────────────────
  //
  // Por un marcador EXPLÍCITO que la card pone y la tabla no. No por "tiene
  // query": un listado móvil sin filtros tampoco la tiene y sí necesita
  // restauración, así que deducirlo mandaría el caso más común por el camino
  // equivocado. Tampoco por el ancho de la pantalla.
  //
  // Y el marcador NO vuelve al listado. Si volviera quedaría pegado en la barra
  // de direcciones y —peor— entraría en la comparación que decide si el estado
  // de retorno es de este listado: la URL guardada no lo tiene, así que nunca
  // coincidirían y la restauración no ocurriría nunca. Lo saca
  // `urlDeListadoSinMarca`, en un solo lugar.
  const qs = searchParams.toString();
  const desdeMovil = vinoDeUnaCardMovil(qs);

  const urlDeVuelta = desdeMovil ? urlDeListadoSinMarca(qs) : "/modulos/productos";
  // Guardar tenía su propio destino en escritorio y se conserva. En el celular
  // es el mismo que las otras dos: el listado exacto.
  const urlDespuesDeGuardar = desdeMovil ? urlDeVuelta : "/modulos/productos?tipo=combos";

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
    router.push(urlDespuesDeGuardar);
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
