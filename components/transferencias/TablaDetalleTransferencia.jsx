"use client";

// Detalle de líneas + carga de recepción.
//
// Desde 1024 px es una tabla; debajo son cards con los mismos campos y los
// mismos inputs (antes había una sola tabla de 8 columnas que en el celular
// quedaba ilegible). La lógica de edición es idéntica en las dos vistas: se
// calcula una sola vez por línea en `filasVisibles` y las dos vistas la pintan.
//
// La columna "Devuelto a origen" es INFORMATIVA y de solo lectura: refleja lo
// que la recepción registró (o registrará, con lo ya guardado) según
// `(enviada − recibida) × factor`, calculado por el servidor con el mismo helper
// que usa confirmar-recepcion. Esta pantalla no mueve stock.

import { useState } from "react";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function formatCantidad(n) {
  const v = Number(n);
  if (!isFinite(v)) return "0";
  if (Number.isInteger(v)) return v.toLocaleString("es-AR");
  return v.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

const MOTIVOS = [
  { value: "Faltante", label: "Faltante" },
  { value: "Producto dañado", label: "Producto dañado" },
  { value: "Otro", label: "Otro (especificar)" },
];

export default function TablaDetalleTransferencia({
  item,
  editItems,
  setEditItems,
  inputsHabilitados,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const v = Number(sessionStorage.getItem("trans-detalle-pageSize"));
      return [25, 50, 100].includes(v) ? v : 25;
    } catch { return 25; }
  });

  if (!item) return null;

  const allItems = item.items;
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const pagedItems = allItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  // Los índices de editItems siguen a allItems: se conserva el offset global.
  const offset = (safePage - 1) * pageSize;

  const filasVisibles = pagedItems.map((d, localIdx) => {
    const idx = offset + localIdx;
    const enviada = num(d.cantidadEnviada);
    const edit = editItems[idx];
    const recibido = num(edit?.recibido ?? enviada);
    const diff = recibido - enviada;
    let tono = "";
    if (diff === 0) tono = "sunmi-state-success";
    else if (diff < 0) tono = "sunmi-state-danger-soft";
    else tono = "sunmi-state-warning-soft";
    return { d, idx, edit, enviada, recibido, diff, tono };
  });

  const cambiar = (idx, campo, valor, extra) => {
    const copia = [...editItems];
    copia[idx] = { ...copia[idx], [campo]: valor, ...(extra || {}) };
    setEditItems(copia);
  };

  const onRecibidoChange = (idx, enviada, valor) => {
    // Igualar lo enviado limpia el motivo: deja de haber diferencia que explicar.
    const limpiar = num(valor) === enviada ? { motivoPrincipal: "", motivoDetalle: "" } : null;
    cambiar(idx, "recibido", valor, limpiar);
  };

  const onMotivoChange = (idx, valor) => {
    cambiar(idx, "motivoPrincipal", valor, valor !== "Otro" ? { motivoDetalle: "" } : null);
  };

  // Devolución al origen ya calculada por el servidor. `null` = sin recepción
  // registrada todavía.
  const devolucionTexto = (d) =>
    d.devolucionOrigen == null ? "—" : formatCantidad(d.devolucionOrigen);

  return (
    <div className="mx-1 mb-2 space-y-2">
      {/* ══════════ MOBILE / TABLET: cards ══════════ */}
      <div className="lg:hidden space-y-2">
        {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff, tono }) => (
          <div key={d.id} className={`sunmi-border rounded-lg p-3 space-y-2 ${tono}`}>
            <div className="min-w-0">
              <div className="font-semibold sunmi-text-strong text-[14px] leading-tight break-words">
                {d.nombre}
              </div>
              <div className="text-[11px] sunmi-text-muted">{d.codigoBarra || "Sin código"}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <div className="text-[11px] sunmi-text-muted">Enviada</div>
                <div className="font-mono tabular-nums sunmi-text-strong">
                  {formatCantidad(enviada)}
                </div>
              </div>
              <div>
                <div className="text-[11px] sunmi-text-muted">Diferencia</div>
                <div
                  className={`font-mono tabular-nums font-semibold ${diff === 0 ? "sunmi-text-success" : "sunmi-text-warning"}`}
                >
                  {diff === 0 ? "0" : formatCantidad(diff)}
                </div>
              </div>
              <div>
                <div className="text-[11px] sunmi-text-muted">Devuelto a origen</div>
                <div className="font-mono tabular-nums sunmi-text-strong">
                  {devolucionTexto(d)}
                </div>
              </div>
              <div>
                <div className="text-[11px] sunmi-text-muted">Subtotal</div>
                <div className="font-mono tabular-nums sunmi-text-strong">
                  ${num(d.subtotal).toFixed(2)}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] sunmi-text-muted mb-1">Recibida</div>
              {inputsHabilitados ? (
                <SunmiInput
                  type="number"
                  value={edit?.recibido ?? ""}
                  onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                />
              ) : (
                <div className="font-mono tabular-nums sunmi-text-strong">
                  {formatCantidad(recibido)}
                </div>
              )}
            </div>

            {inputsHabilitados && num(edit?.recibido) !== enviada && (
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] sunmi-text-muted mb-1">Motivo</div>
                  <SunmiSelectAdv
                    value={edit?.motivoPrincipal || ""}
                    onChange={(val) => onMotivoChange(idx, val)}
                  >
                    <option value="">Seleccionar…</option>
                    {MOTIVOS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </SunmiSelectAdv>
                </div>
                {edit?.motivoPrincipal === "Otro" && (
                  <SunmiInput
                    type="text"
                    value={edit?.motivoDetalle || ""}
                    onChange={(e) => cambiar(idx, "motivoDetalle", e.target.value)}
                    placeholder="Detalle..."
                  />
                )}
              </div>
            )}

            {!inputsHabilitados && (d.motivoPrincipal || d.motivoDetalle) && (
              <div className="text-[12px] sunmi-text-muted">
                Motivo: {d.motivoPrincipal || "—"}
                {d.motivoDetalle ? ` · ${d.motivoDetalle}` : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ══════════ DESKTOP: tabla ══════════ */}
      <div className="hidden lg:block overflow-x-auto rounded-2xl sunmi-border">
        <SunmiTable
          headers={[
            "Producto",
            "Código",
            { label: "Enviada", className: "text-right" },
            { label: "Recibida", className: "text-right" },
            { label: "Diferencia", className: "text-right" },
            { label: "Devuelto a origen", className: "text-right" },
            "Motivo",
            "Detalle",
            { label: "Costo", className: "text-right" },
            { label: "Subtotal", className: "text-right" },
          ]}
        >
          {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff, tono }) => (
            <tr key={d.id} className={`border-t sunmi-divider ${tono}`}>
              <td className="px-2 py-1.5">{d.nombre}</td>
              <td className="px-2 py-1.5">{d.codigoBarra || "-"}</td>

              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {formatCantidad(enviada)}
              </td>

              <td className="px-2 py-1.5 text-right">
                {inputsHabilitados ? (
                  <SunmiInput
                    type="number"
                    value={edit?.recibido ?? ""}
                    onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                  />
                ) : (
                  <span className="font-mono tabular-nums">{formatCantidad(recibido)}</span>
                )}
              </td>

              <td
                className={`px-2 py-1.5 text-right font-mono tabular-nums font-semibold ${diff === 0 ? "sunmi-text-success" : "sunmi-text-warning"}`}
              >
                {diff === 0 ? "0" : formatCantidad(diff)}
              </td>

              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {devolucionTexto(d)}
              </td>

              <td className="px-2 py-1.5">
                {inputsHabilitados ? (
                  num(edit?.recibido) !== enviada ? (
                    <SunmiSelectAdv
                      value={edit?.motivoPrincipal || ""}
                      onChange={(val) => onMotivoChange(idx, val)}
                    >
                      <option value="">Seleccionar…</option>
                      {MOTIVOS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </SunmiSelectAdv>
                  ) : (
                    "-"
                  )
                ) : (
                  d.motivoPrincipal || "-"
                )}
              </td>

              <td className="px-2 py-1.5">
                {inputsHabilitados &&
                edit?.motivoPrincipal === "Otro" &&
                num(edit?.recibido) !== enviada ? (
                  <SunmiInput
                    type="text"
                    value={edit?.motivoDetalle || ""}
                    onChange={(e) => cambiar(idx, "motivoDetalle", e.target.value)}
                    placeholder="Detalle..."
                  />
                ) : (
                  d.motivoDetalle || "-"
                )}
              </td>

              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                ${num(d.precioCosto).toFixed(2)}
              </td>

              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                ${num(d.subtotal).toFixed(2)}
              </td>
            </tr>
          ))}
        </SunmiTable>
      </div>

      {/* Total devuelto al origen: solo informativo, cuando hubo faltante. */}
      {item.resumen?.devolucionOrigenTotal > 0 && (
        <div className="flex justify-between items-center gap-2 px-3 py-2 rounded-lg sunmi-state-warning-soft text-[12px]">
          <span className="sunmi-text-muted font-semibold">
            Devuelto al stock de origen por diferencias
          </span>
          <span className="sunmi-text-accent font-bold font-mono tabular-nums">
            {formatCantidad(item.resumen.devolucionOrigenTotal)}
          </span>
        </div>
      )}

      {/* Paginación */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 border-t sunmi-divider">
        <div className="flex items-center gap-2">
          <SunmiButton color="slate" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </SunmiButton>
          <span className="sunmi-text-muted text-[11px]">
            Página {safePage} de {totalPages} ({allItems.length} items)
          </span>
          <SunmiButton color="slate" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Siguiente
          </SunmiButton>
        </div>
        <SunmiPageSizer
          value={pageSize}
          options={[25, 50, 100]}
          onChange={(size) => {
            setPageSize(size);
            setPage(1);
            try { sessionStorage.setItem("trans-detalle-pageSize", String(size)); } catch {}
          }}
        />
      </div>
    </div>
  );
}
