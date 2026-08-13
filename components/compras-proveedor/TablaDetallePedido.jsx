"use client";

// components/compras-proveedor/TablaDetallePedido.jsx
//
// LA TABLA DEL DETALLE DEL PEDIDO, tal cual estaba en la pantalla.
//
// ── ESTO ES UNA MUDANZA ────────────────────────────────────────────────────
//
// El JSX que hay acá es el mismo que estaba en `app/modulos/compras-proveedor/
// [id]/page.jsx`, movido sin tocar. Nada se renombró, nada se reformateó, nada
// se arregló de paso. Lo único que cambia es de dónde vienen los datos: lo que
// antes leía del cuerpo del componente ahora entra por props.
//
// ── POR QUÉ SE MUDA ────────────────────────────────────────────────────────
//
// Para poder montarla sola. Las otras dos tablas que se migraron a modo por
// columnas —el catálogo de listas y la conciliación de comprobantes— se
// probaron montando el componente con sus props y comparando la captura de
// antes contra la de después. Esta no se podía: es una PÁGINA que hace
// `use(params)` y depende del proveedor de usuario y del de contexto activo, y
// montarla desde un andamio tira una excepción de cliente.
//
// Sin captura de antes no hay prueba, y un cambio sin prueba en esta pantalla
// es un cambio en la que decide qué costos se escriben.

import { Pencil, TriangleAlert } from "lucide-react";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { compararCostoLinea, textoAvisoCosto } from "@/lib/compras-proveedor/avisoCostoLinea";
import { permiteToggleUnidad, unidadDisplay } from "@/lib/compras-proveedor/calculoPedido";

export default function TablaDetallePedido({
  pedido,
  esBorrador,
  esRecepcion,
  tieneFiambre,
  // Lo que se está editando, con sus setters. Vive en la página: acá solo se
  // dibuja, igual que en la lista de conciliación.
  costos,
  setCostos,
  cantidadesEdit,
  setCantidadesEdit,
  unidadesEdit,
  setUnidadesEdit,
  recibidos,
  setRecibidos,
  kgRecibidos,
  setKgRecibidos,
  // Acciones y cálculos que siguen viviendo en la página.
  calcLineaDetalle,
  editarItemAPI,
  eliminarDetalle,
  deleting,
  puedeEditarProductoP,
  irAEditarProducto,
  computedTotalFactura,
}) {
  return (
    <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
      <SunmiTable
        headers={[
          "Producto",
          "SKU",
          "Cant. pedida",
          "Unidad",
          "Costo",
          ...(esRecepcion ? ["Cant. recibida"] : []),
          ...(esRecepcion && tieneFiambre ? ["Kg recibidos"] : []),
          ...(pedido.estado === "RECIBIDO" ? ["Recibido"] : []),
          ...(pedido.estado === "RECIBIDO" && tieneFiambre ? ["Kg reales"] : []),
          "Subtotal",
          ...((esRecepcion || esBorrador) ? [""] : []),
        ]}
      >
        {(pedido.detalles || []).length === 0 ? (
          <SunmiTableEmpty message="Sin items" />
        ) : (
          pedido.detalles.map((det) => {
            const base = det.producto?.base;
            const esFiambre = base?.modoCompraProveedor === "UNIDAD";
            const r = calcLineaDetalle(det);
            const puedeToggle = esBorrador && permiteToggleUnidad(base);
            // El MISMO módulo y el MISMO umbral que el carrito del pedido
            // nuevo. El precio que se compara es el que está editándose si
            // la pantalla lo deja editar, y el guardado si no.
            const cmpCosto = compararCostoLinea({
              precioLinea: (esRecepcion || esBorrador)
                ? (costos[det.id] ?? det.precioCosto)
                : det.precioCosto,
              unidad: unidadesEdit[det.id] || det.unidad,
              costoCatalogo: base?.precio_costo,
              base,
            });
            return (
              <SunmiTableRow key={det.id}>
                <td className="px-3 py-1.5 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    {/* Editar el PRODUCTO. Mismo criterio que en el pedido
                        nuevo: los datos del producto se cambian en editar
                        producto, y se vuelve acá. */}
                    {puedeEditarProductoP && base?.id ? (
                      <button
                        type="button"
                        onClick={() => irAEditarProducto(base)}
                        aria-label={`Editar ${base?.nombre || "producto"}`}
                        title="Editar el producto (precio, códigos, datos)"
                        className="w-[22px] h-[22px] inline-flex items-center justify-center rounded sunmi-control shrink-0"
                      >
                        <Pencil size={11} />
                      </button>
                    ) : null}
                    <span>{base?.nombre || "-"}</span>
                  </span>
                  {esFiambre && (
                    <span className="ml-2 text-[10px] sunmi-text-link font-medium">FIAMBRE</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs sunmi-text-muted">{base?.sku || "-"}</td>
                <td className="px-3 py-1.5 text-center">
                  {esBorrador ? (
                    <SunmiInput
                      type="text"
                      inputMode="numeric"
                      value={cantidadesEdit[det.id] ?? ""}
                      onChange={(e) =>
                        setCantidadesEdit((prev) => ({ ...prev, [det.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const v = parseInt(cantidadesEdit[det.id], 10);
                        const final = isNaN(v) || v < 1 ? 1 : v;
                        setCantidadesEdit((prev) => ({ ...prev, [det.id]: String(final) }));
                        if (final !== Number(det.cantidad)) editarItemAPI(det.id, { cantidad: final });
                      }}
                      className="w-[64px] text-center"
                    />
                  ) : (
                    Number(det.cantidad)
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {puedeToggle ? (
                    <div className="w-28">
                      <SunmiSelectAdv
                        value={unidadesEdit[det.id] || "BULTO"}
                        onChange={(v) => {
                          setUnidadesEdit((prev) => ({ ...prev, [det.id]: v }));
                          if (v !== det.unidad) editarItemAPI(det.id, { unidad: v });
                        }}
                      >
                        <SunmiSelectOption value="BULTO">BULTO</SunmiSelectOption>
                        <SunmiSelectOption value="UNIDAD">UNIDAD</SunmiSelectOption>
                      </SunmiSelectAdv>
                    </div>
                  ) : (
                    <span className="sunmi-text-muted">{unidadDisplay(base, det.unidad)}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {(esRecepcion || esBorrador) ? (
                    <div className="flex items-center gap-0.5">
                      <span className="sunmi-text-muted">$</span>
                      <SunmiInput
                        type="text"
                        inputMode="decimal"
                        value={costos[det.id] ?? ""}
                        onChange={(e) =>
                          setCostos((prev) => ({ ...prev, [det.id]: e.target.value.replace(",", ".") }))
                        }
                        onBlur={() => {
                          const v = Number(costos[det.id]);
                          const final = isNaN(v) || v < 0 ? 0 : v;
                          setCostos((prev) => ({ ...prev, [det.id]: String(final) }));
                          if (esBorrador) {
                            const prevCosto = Number(det.precioCosto);
                            if (final !== prevCosto) editarItemAPI(det.id, { precioCosto: final > 0 ? final : null });
                          }
                        }}
                        className="w-[80px] text-center"
                      />
                    </div>
                  ) : (
                    det.precioCosto ? `${Number(det.precioCosto).toFixed(2)}` : "-"
                  )}
                  {/* El aviso va DENTRO de esta celda, debajo del número
                      que cuestiona. No agrega columna: la grilla tiene
                      columnas variables según el estado y una nueva
                      obligaría a recalcular todos los colSpan. */}
                  {cmpCosto.hayDiferencia && (
                    <div
                      className="flex items-center gap-1 mt-0.5 text-[10px] sunmi-text-warning"
                      title={textoAvisoCosto(cmpCosto)}
                      data-aviso-costo={cmpCosto.sentido}
                    >
                      <TriangleAlert size={10} className="shrink-0" aria-hidden="true" />
                      <span>
                        {cmpCosto.sentido === "sube" ? "más caro" : "más barato"} · catálogo $
                        {Number(cmpCosto.costoCatalogo).toFixed(2)}
                      </span>
                    </div>
                  )}
                </td>

                {esRecepcion && (
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: Math.max(0, cur - 1) })); }}>−</SunmiButton>
                      <SunmiInput
                        type="text"
                        inputMode="numeric"
                        value={recibidos[det.id] ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setRecibidos((prev) => ({ ...prev, [det.id]: "" })); return; }
                          const val = parseInt(raw, 10);
                          setRecibidos((prev) => ({ ...prev, [det.id]: isNaN(val) ? "" : Math.max(0, val) }));
                        }}
                        onBlur={() => { const cur = Number(recibidos[det.id]); if (isNaN(cur) || cur < 0) setRecibidos((prev) => ({ ...prev, [det.id]: 0 })); }}
                        className="w-[56px] text-center"
                      />
                      <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: cur + 1 })); }}>+</SunmiButton>
                    </div>
                  </td>
                )}

                {esRecepcion && tieneFiambre && (
                  <td className="px-3 py-1.5 w-28">
                    {esFiambre ? (
                      <SunmiInput type="number" min="0" step="0.01" value={kgRecibidos[det.id] ?? ""}
                        onChange={(e) => setKgRecibidos((prev) => ({ ...prev, [det.id]: e.target.value }))}
                        className="w-24 text-center" placeholder="kg" />
                    ) : (<span className="sunmi-text-muted text-xs">-</span>)}
                  </td>
                )}

                {pedido.estado === "RECIBIDO" && (
                  <td className="px-3 py-1.5 text-center sunmi-text-success">
                    {det.cantidadRecibida != null ? Number(det.cantidadRecibida) : "-"}
                  </td>
                )}
                {pedido.estado === "RECIBIDO" && tieneFiambre && (
                  <td className="px-3 py-1.5 text-center sunmi-text-success">
                    {esFiambre && det.kgRecibidos != null ? `${Number(det.kgRecibidos).toFixed(2)} kg` : "-"}
                  </td>
                )}

                <td className="px-3 py-1.5 text-xs text-right font-medium">
                  {r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : (
                    <span className="sunmi-text-accent" title={r.advertencia || ""}>⚠ {r.advertencia}</span>
                  )}
                </td>

                {(esRecepcion || esBorrador) && (
                  <td className="px-3 py-1.5 text-center">
                    <SunmiButton color="red" type="button" disabled={deleting === det.id} onClick={() => eliminarDetalle(det.id)}>
                      {deleting === det.id ? "..." : "Quitar"}
                    </SunmiButton>
                  </td>
                )}
              </SunmiTableRow>
            );
          })
        )}
        {(pedido.detalles || []).length > 0 && (() => {
          const baseCols = 5;
          const extraCols =
            (esRecepcion ? 1 : 0) +
            (esRecepcion && tieneFiambre ? 1 : 0) +
            (pedido.estado === "RECIBIDO" ? 1 : 0) +
            (pedido.estado === "RECIBIDO" && tieneFiambre ? 1 : 0);
          const accionCol = (esRecepcion || esBorrador) ? 1 : 0;
          return (
            <tr className="border-t sunmi-divider">
              <td colSpan={baseCols + extraCols} className="px-3 py-2 text-sm font-semibold text-right sunmi-text-strong">
                TOTAL ESTIMADO
              </td>
              <td className="px-3 py-2 text-sm font-bold text-right sunmi-text-accent">
                ${computedTotalFactura.toFixed(2)}
              </td>
              {accionCol ? <td /> : null}
            </tr>
          );
        })()}
      </SunmiTable>
    </div>
  );
}
