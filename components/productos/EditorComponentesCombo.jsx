"use client";

import { useState } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPill from "@/components/sunmi/SunmiPill";
import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";

// ============================================================
// Editor de componentes de un COMBO. La BÚSQUEDA reutiliza el buscador REAL del
// POS (components/pos-ventas/BuscadorProductos) vía props: mismo diseño, themes,
// voz/Neon, escáner, teclado y estados. Solo cambia la acción al elegir: agregar
// como COMPONENTE (no vender). El endpoint /api/combos/buscar-componentes ya filtra
// (local activo, activos, es_combo=false, visibles). Este componente aporta la
// tabla de composición (cantidad editable, quitar) y la protección de duplicados.
// `componentes`: [{ componenteProductoLocalId, productoBaseId, nombre, codigoBarra,
//   cantidad, costoUnitario, stock, tieneStockLocal, activo? }]
// ============================================================
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EditorComponentesCombo({ localId, esDeposito = false, componentes = [], onChange, disabled = false }) {
  const [aviso, setAviso] = useState(null);

  // Acción al ELEGIR un producto en el buscador → agregar como componente.
  const agregarComponente = (producto) => {
    const plId = producto?.productoLocalId;
    if (!plId) return;
    if (componentes.some((c) => c.componenteProductoLocalId === plId)) {
      setAviso(`"${producto.nombre}" ya está en el combo.`);
      return;
    }
    setAviso(null);
    onChange([
      ...componentes,
      {
        componenteProductoLocalId: plId,
        productoBaseId: producto.productoBaseId,
        nombre: producto.nombre,
        codigoBarra: producto.codigoBarra,
        cantidad: 1, // cantidad inicial
        costoUnitario: Number(producto.costoUnitario) || 0,
        stock: producto.stock,
        tieneStockLocal: producto.tieneStockLocal !== false,
        activo: true,
      },
    ]);
  };

  const setCantidad = (plId, valor) => {
    onChange(componentes.map((c) => (c.componenteProductoLocalId === plId ? { ...c, cantidad: valor } : c)));
  };

  const quitar = (plId) => {
    onChange(componentes.filter((c) => c.componenteProductoLocalId !== plId));
  };

  return (
    <div className="space-y-2">
      {/* Buscador REUTILIZADO del POS (mismo diseño/voz/escáner/teclado) */}
      <BuscadorProductos
        localId={localId}
        esDeposito={esDeposito}
        apiPath="/api/combos/buscar-componentes"
        onAgregar={agregarComponente}
        wrapCard={false}
      />
      {aviso && <p className="text-[11px] sunmi-text-warning">{aviso}</p>}

      {/* Tabla de composición */}
      {componentes.length === 0 ? (
        <div className="rounded-lg border sunmi-divider p-3 text-center text-[12px] sunmi-text-muted">
          El combo todavía no tiene componentes. Buscá y agregá productos del local.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border sunmi-divider">
          <table className="w-full text-[12px] table-auto">
            <thead className="bg-[var(--table-header-bg)] text-[var(--table-header-fg)] text-[11px]">
              <tr>
                <th className="text-left font-semibold px-2 py-1.5">Producto</th>
                <th className="text-right font-semibold px-2 py-1.5 w-24">Cantidad</th>
                <th className="text-right font-semibold px-2 py-1.5">Costo unit.</th>
                <th className="text-right font-semibold px-2 py-1.5">Subtotal</th>
                <th className="text-right font-semibold px-2 py-1.5">Stock</th>
                <th className="text-left font-semibold px-2 py-1.5">Estado</th>
                <th className="px-2 py-1.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y sunmi-divider">
              {componentes.map((c) => {
                const cant = Number(c.cantidad) || 0;
                const inactivo = c.activo === false;
                const sinStock = c.tieneStockLocal === false;
                const cantInvalida = !(cant > 0);
                return (
                  <tr key={c.componenteProductoLocalId} className="hover:bg-[var(--table-row-hover)] transition">
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{c.nombre}</div>
                      {c.codigoBarra ? <div className="text-[10px] sunmi-text-muted">{c.codigoBarra}</div> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <SunmiInput
                        type="number"
                        min="0"
                        step="any"
                        className={`w-20 text-right ${cantInvalida ? "!border-[var(--pos-danger)]" : ""}`}
                        value={c.cantidad}
                        disabled={disabled}
                        onChange={(e) => setCantidad(c.componenteProductoLocalId, e.target.value)}
                        onWheel={(e) => e.target.blur()}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{money(c.costoUnitario)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {money((Number(c.costoUnitario) || 0) * cant)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.stock ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {inactivo ? (
                        <SunmiPill color="amber">Desactivado</SunmiPill>
                      ) : sinStock ? (
                        <SunmiPill color="amber">Sin stock</SunmiPill>
                      ) : cantInvalida ? (
                        <SunmiPill color="amber">Cant. inválida</SunmiPill>
                      ) : (
                        <SunmiPill color="slate">OK</SunmiPill>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => quitar(c.componenteProductoLocalId)}
                        disabled={disabled}
                        className="text-[11px] sunmi-text-danger hover:underline"
                        title="Quitar"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
