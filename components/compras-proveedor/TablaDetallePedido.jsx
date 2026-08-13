"use client";

import { useMemo } from "react";

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
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { compararCostoLinea, textoAvisoCosto } from "@/lib/compras-proveedor/avisoCostoLinea";
import { permiteToggleUnidad, unidadDisplay } from "@/lib/compras-proveedor/calculoPedido";

export default function TablaDetallePedido({
  pedido,
  esBorrador,
  esRecepcion,
  // Lo que se está editando, con sus setters. Vive en la página: acá solo se
  // dibuja, igual que en la lista de conciliación.
  costos,
  setCostos,
  cantidadesEdit,
  setCantidadesEdit,
  unidadesEdit,
  setUnidadesEdit,
  // Acciones y cálculos que siguen viviendo en la página.
  calcLineaDetalle,
  editarItemAPI,
  eliminarDetalle,
  deleting,
  puedeEditarProductoP,
  irAEditarProducto,
  computedTotalFactura,
}) {
  // ── LAS COLUMNAS ──────────────────────────────────────────────────────────
  //
  // Migradas tal como estaban, celda por celda. Como en el editor de corrección:
  // ninguna declara `align` —los encabezados de esta tabla van a la izquierda y
  // los valores donde ya estaban, y `align` movería los dos— y todas declaran
  // `px-3 py-1.5`, que la densidad cede por eje.
  //
  // La de acciones sigue apareciendo solo en recepción o borrador, que es la
  // única condición de esta tabla que SÍ se puede alcanzar.
  const columnas = useMemo(
    () => [
      {
        clave: "producto",
        titulo: "Producto",
        tdClassName: "px-3 py-1.5 text-sm",
        render: (det) => {
          const base = det.producto?.base;
          const esFiambre = base?.modoCompraProveedor === "UNIDAD";
          return (
            <>
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
            </>
          );
        },
      },
      {
        clave: "sku",
        titulo: "SKU",
        tdClassName: "px-3 py-1.5 text-xs sunmi-text-muted",
        render: (det) => det.producto?.base?.sku || "-",
      },
      {
        clave: "cantidad",
        titulo: "Cant. pedida",
        tdClassName: "px-3 py-1.5 text-center",
        render: (det) =>
          esBorrador ? (
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
          ),
      },
      {
        clave: "unidad",
        titulo: "Unidad",
        tdClassName: "px-3 py-1.5 text-xs",
        render: (det) => {
          const base = det.producto?.base;
          const puedeToggle = esBorrador && permiteToggleUnidad(base);
          return puedeToggle ? (
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
          );
        },
      },
      {
        clave: "costo",
        titulo: "Costo",
        tdClassName: "px-3 py-1.5 text-xs",
        render: (det) => {
          const base = det.producto?.base;
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
            <>
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
              {/* El aviso va DENTRO de esta celda, debajo del número que
                  cuestiona. Antes decía además que una columna nueva obligaría a
                  recalcular todos los colSpan: eso dejó de ser cierto cuando el
                  pie pasó a calcular su span solo, y un comentario que describe
                  cómo era el código manda a hacer trabajo que ya no hace falta. */}
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
            </>
          );
        },
      },
      {
        clave: "subtotal",
        titulo: "Subtotal",
        tdClassName: "px-3 py-1.5 text-xs text-right font-medium",
        render: (det) => {
          const r = calcLineaDetalle(det);
          return r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : (
            <span className="sunmi-text-accent" title={r.advertencia || ""}>⚠ {r.advertencia}</span>
          );
        },
      },
      ...((esRecepcion || esBorrador)
        ? [{
            clave: "acciones",
            titulo: "",
            tdClassName: "px-3 py-1.5 text-center",
            render: (det) => (
              <SunmiButton color="red" type="button" disabled={deleting === det.id} onClick={() => eliminarDetalle(det.id)}>
                {deleting === det.id ? "..." : "Quitar"}
              </SunmiButton>
            ),
          }]
        : []),
    ],
    [
      esBorrador, esRecepcion, costos, setCostos, cantidadesEdit, setCantidadesEdit,
      unidadesEdit, setUnidadesEdit, calcLineaDetalle, editarItemAPI, eliminarDetalle,
      deleting, puedeEditarProductoP, irAEditarProducto,
    ]
  );

  return (
    <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
      <SunmiTable
        columnas={columnas}
        filas={pedido.detalles || []}
        claveFila={(det) => det.id}
        vacio="Sin items"
        // EL PIE LO ARMA LA TABLA. Antes era un colSpan de 5 calculado sumando
        // condiciones, y ese número tenía que seguir a las columnas sin que nada
        // avisara cuando dejaba de seguirlas.
        pie={
          (pedido.detalles || []).length > 0
            ? {
                etiqueta: "TOTAL ESTIMADO",
                className: "px-3 py-2 text-sm",
                valores: {
                  subtotal: (
                    <span className="font-bold sunmi-text-accent">
                      ${computedTotalFactura.toFixed(2)}
                    </span>
                  ),
                },
              }
            : undefined
        }
      />
    </div>
  );
}