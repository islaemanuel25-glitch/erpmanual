"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CarritoVenta({
  items,
  onCantidadChange,
  onEliminar,
  onLimpiar,
  subtotal,
}) {
  if (items.length === 0) {
    return (
      <SunmiCard className="p-2 lg:p-3">
        <div className="text-sm text-slate-500 text-center py-4">
          No hay productos en el carrito.
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-2 lg:p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-300">
          Carrito ({items.length})
        </span>
        <button
          onClick={onLimpiar}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Limpiar
        </button>
      </div>

      {/* MOBILE: lista compacta */}
      <div className="block lg:hidden space-y-1">
        {items.map((item, idx) => (
          <div
            key={item.productoBaseId}
            className="p-2 rounded-lg bg-slate-800/60 animate-fade-in"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{item.nombre}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span>${formatPrecio(item.precio)}</span>
                  <span>x</span>
                  <SunmiInput
                    type="number"
                    min={1}
                    max={item.stockMax || 9999}
                    value={item.cantidad}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      onCantidadChange(idx, Math.max(1, val));
                    }}
                    className="w-16 !text-center !py-1 text-sm"
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-amber-400">
                  ${formatPrecio(item.precio * item.cantidad)}
                </div>
                <button
                  onClick={() => onEliminar(idx)}
                  className="text-xs text-red-400 mt-1"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP: tabla normal */}
      <div className="hidden lg:block overflow-x-auto">
        <SunmiTable
          headers={["Producto", "Cant.", "P. Unit.", "Subtotal", ""]}
        >
          {items.map((item, idx) => (
            <tr
              key={item.productoBaseId}
              className="bg-slate-950 hover:bg-slate-900 animate-fade-in"
            >
              <td className="px-2 py-1.5 truncate max-w-[160px] text-sm">
                {item.nombre}
              </td>
              <td className="px-2 py-1.5 w-20">
                <SunmiInput
                  type="number"
                  min={1}
                  max={item.stockMax || 9999}
                  value={item.cantidad}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    onCantidadChange(idx, Math.max(1, val));
                  }}
                  className="!text-center !py-1"
                />
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm">
                $ {formatPrecio(item.precio)}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm font-medium">
                $ {formatPrecio(item.precio * item.cantidad)}
              </td>
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onEliminar(idx)}
                  className="text-red-400 hover:text-red-300 text-lg leading-none"
                  title="Eliminar"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </SunmiTable>
      </div>

      {/* Subtotal */}
      <div className="flex justify-end mt-2 px-1">
        <div className="text-right">
          <span className="text-xs text-slate-400 mr-2">SUBTOTAL</span>
          <span className="text-lg font-bold">$ {formatPrecio(subtotal)}</span>
        </div>
      </div>
    </SunmiCard>
  );
}
