"use client";

import { memo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ── Stepper de cantidad (− input +) ── */
const btnStepClass =
  "flex items-center justify-center w-7 h-7 rounded pos-control text-sm font-bold transition-colors select-none shrink-0";

function CantidadStepper({ item, idx, onCantidadChange, compact }) {
  const esKg = item.unidadMedida === "kg";
  const minVal = esKg ? 0.001 : 1;
  const step = esKg ? 0.001 : 1;

  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw === "") {
      onCantidadChange(idx, "");
      return;
    }
    if (esKg) {
      const normalized = raw.replace(",", ".");
      const val = parseFloat(normalized);
      onCantidadChange(idx, isNaN(val) ? "" : val);
    } else {
      const val = parseInt(raw, 10);
      onCantidadChange(idx, isNaN(val) ? "" : val);
    }
  };

  const handleBlur = () => {
    const cur = item.cantidad;
    if (cur === "" || cur === null || cur === undefined || isNaN(Number(cur))) {
      onCantidadChange(idx, minVal);
      return;
    }
    const num = Number(cur);
    if (num < minVal) {
      onCantidadChange(idx, minVal);
    } else if (!esKg) {
      onCantidadChange(idx, Math.round(num));
    }
  };

  const handleStep = (dir) => {
    let cur = Number(item.cantidad);
    if (isNaN(cur) || item.cantidad === "") cur = 0;
    let next = cur + dir * step;
    if (esKg) next = Math.round(next * 1000) / 1000;
    next = Math.max(minVal, next);
    next = Math.min(item.stockMax || 9999, next);
    onCantidadChange(idx, next);
  };

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btnStepClass} onClick={() => handleStep(-1)}>
        −
      </button>
      <SunmiInput
        type={esKg ? "text" : "number"}
        inputMode={esKg ? "decimal" : "numeric"}
        {...(!esKg && { min: minVal, step, max: item.stockMax || 9999 })}
        value={item.cantidad}
        onChange={handleChange}
        onBlur={handleBlur}
        className={compact ? "w-14 !text-center !py-1 text-sm" : "w-16 !text-center !py-1"}
      />
      <button type="button" className={btnStepClass} onClick={() => handleStep(1)}>
        +
      </button>
    </div>
  );
}

function CarritoVenta({
  items,
  onCantidadChange,
  onEliminar,
  onLimpiar,
  subtotal,
  descuento = 0,
  descuentoInfo = null,
  onAbrirDescuento,
  clienteSeleccionado = null,
  onAbrirCliente,
}) {
  if (items.length === 0) {
    return (
      <SunmiCard className="p-2 lg:p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold pos-text-muted-strong">
            Carrito vacio
          </span>
          {onAbrirCliente && (
            <button
              onClick={onAbrirCliente}
              className={`text-xs pos-text-link ${
                clienteSeleccionado ? "font-medium" : ""
              }`}
            >
              {clienteSeleccionado ? clienteSeleccionado.nombre : "Cliente"}
            </button>
          )}
        </div>
        <div className="text-sm pos-text-muted text-center py-4">
          No hay productos en el carrito.
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-2 lg:p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold pos-text-muted-strong">
          Carrito ({items.length})
        </span>
        <div className="flex items-center gap-3">
          {onAbrirCliente && (
            <button
              onClick={onAbrirCliente}
              className={`text-xs pos-text-link ${
                clienteSeleccionado ? "font-medium" : ""
              }`}
            >
              {clienteSeleccionado ? clienteSeleccionado.nombre : "Cliente"}
            </button>
          )}
          {onAbrirDescuento && (
            <button
              onClick={onAbrirDescuento}
              className={`text-xs ${
                descuento > 0
                  ? "pos-text-success font-medium"
                  : "pos-text-accent"
              }`}
            >
              {descuento > 0 ? `Desc. -$${formatPrecio(descuento)}` : "Descuento"}
            </button>
          )}
          <button
            onClick={onLimpiar}
            className="text-xs pos-text-danger"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* MOBILE: lista compacta */}
      <div className="block lg:hidden space-y-1">
        {items.map((item, idx) => (
          <div
            key={`${item.productoBaseId}-${idx}`}
            className="p-2 rounded-lg pos-bg-surface animate-fade-in"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{item.nombre}</div>
                <div className="text-xs pos-text-muted mt-1 flex items-center gap-2">
                  <span>${formatPrecio(item.precio)}</span>
                  <span>x</span>
                  <CantidadStepper
                    item={item}
                    idx={idx}
                    onCantidadChange={onCantidadChange}
                    compact
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold pos-text-accent">
                  ${formatPrecio(item.precio * (Number(item.cantidad) || 0))}
                </div>
                <button
                  onClick={() => onEliminar(idx)}
                  className="text-xs pos-text-danger mt-1"
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
              key={`${item.productoBaseId}-${idx}`}
              className="pos-bg-row pos-bg-row-hover animate-fade-in"
            >
              <td className="px-2 py-1.5 truncate max-w-[160px] text-sm">
                {item.nombre}
              </td>
              <td className="px-2 py-1.5">
                <CantidadStepper
                  item={item}
                  idx={idx}
                  onCantidadChange={onCantidadChange}
                />
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm">
                $ {formatPrecio(item.precio)}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm font-medium">
                $ {formatPrecio(item.precio * (Number(item.cantidad) || 0))}
              </td>
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onEliminar(idx)}
                  className="pos-text-danger text-lg leading-none"
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
          <span className="text-xs pos-text-muted mr-2">SUBTOTAL</span>
          <span className="text-lg font-bold">$ {formatPrecio(subtotal)}</span>
        </div>
      </div>
    </SunmiCard>
  );
}

export default memo(CarritoVenta);
