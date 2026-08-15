"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import useContextoActivo from "@/hooks/useContextoActivo";

// ============================================================
// Helpers
// ============================================================
const formatMoney = (n) => {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const tipoLabel = (tipo) => {
  if (tipo === "PRECIO_VENTA") return "Precio de venta";
  if (tipo === "COSTO") return "Costo";
  if (tipo === "MANUAL_AUTORIZADO") return "Manual";
  return tipo || "—";
};

// ============================================================
// Modal Preview Precio
// ============================================================
export default function ModalPreviewPrecio({ open, lista, onClose }) {
  const router = useRouter();
  const { loading: cargandoContexto, contexto } = useContextoActivo();
  const localActivo = contexto?.localId ? contexto : null;

  // Búsqueda
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  // Resultado de preview
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Reset estado al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setBusqueda("");
      setResultados([]);
      setPreview(null);
      setPreviewLoading(false);
    }
  }, [open]);

  // Búsqueda de productos con debounce 400ms
  useEffect(() => {
    if (!open || !localActivo) {
      setResultados([]);
      return;
    }

    const q = busqueda.trim();
    if (!q) {
      setResultados([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const url = `/api/productos/listar?localId=${localActivo.localId}&q=${encodeURIComponent(q)}&pageSize=10&estado=todos`;
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const data = await res.json();
        if (data?.ok) {
          setResultados(data.items || []);
        } else {
          setResultados([]);
        }
      } catch (e) {
        console.error("Error buscando productos:", e);
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [busqueda, open, localActivo, router]);

  // Click en producto → fetch preview-precio
  const seleccionarProducto = async (producto) => {
    if (!lista?.id) return;
    try {
      setPreviewLoading(true);
      setPreview(null);

      const res = await fetch("/api/listas-precios/preview-precio", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoBaseId: producto.baseId ?? producto.id,
          listaPrecioId: lista.id,
          localId: localActivo.localId,
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        alert(data?.error || "Error al obtener el preview");
        return;
      }

      setPreview(data.preview);
    } catch (e) {
      console.error("Error obteniendo preview:", e);
      alert("Error al obtener el preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <SunmiModalLayout
      open={open}
      title={`Preview de "${lista?.nombre || ""}"`}
      onClose={onClose}
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
      // NO lleva `destructivo`: es un preview de solo lectura. Lo único que se
      // escribe acá es el buscador, y perder un término de búsqueda no es
      // perder nada — se vuelve a escribir. El criterio es qué se pierde.
      // El ancho de esta pantalla es `max-w-2xl`, no el `max-w-xl` del kit.
      maxWidth="max-w-2xl"
      // El cuerpo trae su propio padding y su propia separación de bloques.
      // Medido antes de migrar: el paso de bloque a `flex flex-col` no mueve
      // nada acá, cero píxeles a 1366 y a 360.
      espacioCuerpo="p-4 space-y-4"
    >
        <>
          {/* Resumen de la lista */}
          <div className="flex flex-wrap items-center gap-2">
            <SunmiPill color="amber">{tipoLabel(lista?.tipoBase)}</SunmiPill>
            {lista?.tipoBase === "COSTO" &&
              lista?.margenPorcentaje !== null &&
              lista?.margenPorcentaje !== undefined && (
                <SunmiPill color="cyan">
                  Margen {Number(lista.margenPorcentaje)}%
                </SunmiPill>
              )}
            {lista?.redondeo_100 && (
              <SunmiPill color="slate">Redondeo a 100</SunmiPill>
            )}
          </div>

          <SunmiSeparator />

          {/* Sin local activo */}
          {cargandoContexto ? (
            <div className="py-4">
              <SunmiLoader />
            </div>
          ) : !localActivo ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm sunmi-text-muted">
                Para previsualizar precios, activá un local desde la pantalla de Inicio.
              </p>
              {/* Acá había otro "Cerrar", por el mismo motivo que el de abajo:
                  el kit ya pone uno arriba. Esta rama es la de "sin local
                  activo" y NO se pudo fotografiar sin sacarle el contexto al
                  navegador, así que va por simetría con la otra y está dicho. */}
            </div>
          ) : (
            <>
              {/* Búsqueda */}
              <div>
                <label className="text-[11px] sunmi-label mb-1 block">
                  Buscar producto
                </label>
                <SunmiInput
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre, código o SKU..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              {/* Resultados */}
              {buscando ? (
                <SunmiLoader />
              ) : resultados.length > 0 ? (
                <div className="max-h-48 overflow-y-auto sunmi-divide divide-y rounded-md border sunmi-divider">
                  {resultados.map((p) => {
                    const id = p.baseId ?? p.id;
                    return (
                      <div
                        key={id}
                        onClick={() => seleccionarProducto(p)}
                        className="px-3 py-2 cursor-pointer hover:bg-[var(--table-row-hover)] flex items-center justify-between text-[12px]"
                      >
                        <span className="truncate">{p.nombre}</span>
                        <span className="sunmi-text-muted text-[11px]">
                          ${formatMoney(p.precio_venta ?? p.precioVenta)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : busqueda.trim() ? (
                <p className="text-[12px] sunmi-text-muted italic text-center py-2">
                  Sin resultados
                </p>
              ) : null}

              {/* Preview del producto seleccionado */}
              {previewLoading ? (
                <SunmiLoader />
              ) : preview ? (
                <>
                  <SunmiSeparator label="Resultado" />

                  <div className="space-y-2">
                    <div className="text-[13px] font-semibold">{preview.nombre}</div>

                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div>
                        <span className="sunmi-text-muted">Precio venta original: </span>
                        <span>${formatMoney(preview.precioVenta)}</span>
                      </div>
                      <div>
                        <span className="sunmi-text-muted">Costo: </span>
                        <span>${formatMoney(preview.costo)}</span>
                      </div>
                    </div>

                    {preview.requiereManual ? (
                      <div className="mt-2 p-3 rounded-md sunmi-badge-muted text-[12px]">
                        Esta lista requiere que el operador autorice el precio manualmente
                        en la venta. No hay precio precalculado.
                      </div>
                    ) : (
                      <div className="mt-2 p-3 rounded-md sunmi-badge-accent flex items-center justify-between">
                        <div>
                          <div className="text-[11px] sunmi-text-muted">
                            Precio aplicado
                          </div>
                          <div className="text-[20px] font-bold sunmi-text-accent">
                            ${formatMoney(preview.precioFinal)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <SunmiPill color="amber">
                            {tipoLabel(preview.tipoPrecioAplicado)}
                          </SunmiPill>
                          {preview.margenAplicado !== null &&
                            preview.margenAplicado !== undefined && (
                              <SunmiPill color="cyan">
                                Margen {Number(preview.margenAplicado)}%
                              </SunmiPill>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              {/* El "Cerrar" de abajo se sacó al migrar: el kit ya pone uno
                  arriba y quedaban DOS botones con el mismo texto en la misma
                  ventana, que es lo que esta fase viene a limpiar. En el
                  teléfono no se pierde alcance — este modal es informativo y
                  también cierra tocando el velo, así que el pulgar tiene salida
                  sin llegar hasta arriba.

                  Ojo: no es el caso de `ModalListaPrecio` ni de
                  `ModalCategoria`, donde abajo dice "Cancelar". Cerrar y
                  descartar son cosas distintas y ahí no hay duplicación. */}
            </>
          )}
        </>
    </SunmiModalLayout>
  );
}
