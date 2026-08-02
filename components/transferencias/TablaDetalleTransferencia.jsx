"use client";

// Sección "Productos transferidos" del detalle.
//
// Calca el bloque de Ítems de components/reportes-ventas/VentaDetalleAdmin.jsx:
// `section space-y-2` con SectionHead + subtítulo "N líneas", cards en
// `md:hidden` y tabla en `hidden md:block`, celdas `px-2.5 py-3` y filas
// `align-middle sunmi-row-hover transition-colors`.
//
// Cambios respecto de la versión anterior: el breakpoint pasó de `lg` a `md`
// (el de Ventas), se quitaron los `mx-1` y el borde `rounded-2xl` que envolvía
// la tabla, y las columnas ahora dependen del ESTADO — una transferencia
// "Enviada" no tiene recepción, así que mostrar Recibida / Diferencia /
// Devuelto / Motivo vacías solo agrega ruido.
//
// La columna "Devuelto a origen" sigue siendo INFORMATIVA y de solo lectura:
// refleja lo que la recepción registró según `(enviada − recibida) × factor`,
// calculado por el servidor con el mismo helper que usa confirmar-recepcion.
// Esta pantalla no mueve stock. La lógica de edición, los motivos y la
// paginación quedaron intactos.

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import {
  SectionHead,
  BadgePresentacion,
  fmtCantidad,
  fmtMoneda,
  cantidadOGuion,
} from "./detallePresentacion";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
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

  // ── Qué columnas tienen sentido en este estado ─────────────────────────────
  //
  // Enviada    → todavía nadie recibió: solo lo despachado.
  // Recibiendo → hay carga de recepción en curso: aparecen los controles.
  // Recibida   → recepción cerrada: se suma "Devuelto al origen".
  // Cancelada  → histórico, sin controles operativos.
  const estado = item.estado;
  const esCancelada = estado === "Cancelada";
  const hayRecepcion = allItems.some((d) => d.cantidadRecibida != null);

  const verRecibida = inputsHabilitados || hayRecepcion;
  const verDiferencia = verRecibida;
  const verDevuelto = allItems.some((d) => d.devolucionOrigen != null);
  // Motivo y detalle: editables mientras se recibe; si no, solo si hay algo
  // cargado que mostrar. Una columna entera de guiones no aporta.
  const verMotivo =
    !esCancelada && (inputsHabilitados || allItems.some((d) => d.motivoPrincipal));
  const verDetalle =
    !esCancelada && (inputsHabilitados || allItems.some((d) => d.motivoDetalle));

  const filasVisibles = pagedItems.map((d, localIdx) => {
    const idx = offset + localIdx;
    const enviada = num(d.cantidadEnviada);
    const edit = editItems[idx];
    // Sin recepción cargada y sin edición habilitada, no hay "recibido" que
    // mostrar: null se distingue de 0.
    const recibidoCrudo = inputsHabilitados
      ? (edit?.recibido ?? enviada)
      : d.cantidadRecibida;
    const recibido = recibidoCrudo == null ? null : num(recibidoCrudo);
    const diff = recibido == null ? null : recibido - enviada;
    let tono = "";
    if (diff === null) tono = "";
    else if (diff === 0) tono = "sunmi-state-success";
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

  const claseDiff = (diff) =>
    diff === null ? "sunmi-text-muted" : diff === 0 ? "sunmi-text-success" : "sunmi-text-warning";

  const headers = [
    "Producto",
    "Código",
    "Presentación",
    { label: "Enviada", className: "text-right" },
    ...(verRecibida ? [{ label: "Recibida", className: "text-right" }] : []),
    ...(verDiferencia ? [{ label: "Diferencia", className: "text-right" }] : []),
    ...(verDevuelto ? [{ label: "Devuelto al origen", className: "text-right" }] : []),
    ...(verMotivo ? ["Motivo"] : []),
    ...(verDetalle ? ["Detalle"] : []),
    { label: "Costo", className: "text-right" },
    { label: "Subtotal", className: "text-right" },
  ];

  return (
    <section className="space-y-2">
      <SectionHead
        title="Productos transferidos"
        subtitle={`${allItems.length} línea${allItems.length === 1 ? "" : "s"}`}
      />
      <SunmiCard>
        {allItems.length === 0 && (
          <div className="text-center py-8 sunmi-text-muted text-sm">Sin productos</div>
        )}

        {/* ══════════ Móvil: una card por línea ══════════ */}
        {allItems.length > 0 && (
          <div className="md:hidden space-y-2">
            {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff }) => (
              <div key={d.id} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-semibold sunmi-text-strong text-[14px] leading-tight break-words">
                    {d.nombre}
                  </div>
                  <div className="font-mono font-bold text-[15px] sunmi-text-strong whitespace-nowrap tabular-nums">
                    {fmtMoneda(d.subtotal)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <BadgePresentacion d={d} />
                  <span className="text-[11px] sunmi-text-muted">
                    {d.codigoBarra || "Sin código"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] sunmi-text-muted">
                  <span>
                    Enviada{" "}
                    <span className="tabular-nums sunmi-text-link">{fmtCantidad(enviada)}</span>
                  </span>
                  {verRecibida && !inputsHabilitados && (
                    <span>
                      Recibida{" "}
                      <span className="tabular-nums sunmi-text-strong">
                        {cantidadOGuion(recibido)}
                      </span>
                    </span>
                  )}
                  {verDiferencia && (
                    <span>
                      Diferencia{" "}
                      <span className={`tabular-nums font-semibold ${claseDiff(diff)}`}>
                        {diff === null ? "—" : fmtCantidad(diff)}
                      </span>
                    </span>
                  )}
                  {verDevuelto && (
                    <span>
                      Devuelto{" "}
                      <span className="tabular-nums sunmi-text-strong">
                        {cantidadOGuion(d.devolucionOrigen)}
                      </span>
                    </span>
                  )}
                  <span>
                    Costo <span className="tabular-nums">{fmtMoneda(d.precioCosto)}</span>
                  </span>
                </div>

                {/* Input de recepción: se mantiene utilizable en móvil */}
                {inputsHabilitados && (
                  <div>
                    <div className="text-[11px] sunmi-text-muted mb-1">Recibida</div>
                    <SunmiInput
                      type="number"
                      value={edit?.recibido ?? ""}
                      onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                    />
                  </div>
                )}

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
        )}

        {/* ══════════ Desktop: tabla a todo el ancho ══════════ */}
        {allItems.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <SunmiTable headers={headers}>
              {filasVisibles.map(({ d, idx, edit, enviada, recibido, diff, tono }) => (
                <tr
                  key={d.id}
                  className={`align-middle sunmi-row-hover transition-colors ${tono}`}
                >
                  <td className="px-2.5 py-3">
                    <div className="font-semibold sunmi-text-strong text-[13px] leading-snug">
                      {d.nombre}
                    </div>
                  </td>
                  <td className="px-2.5 py-3 font-mono text-[12px] sunmi-text-muted whitespace-nowrap">
                    {d.codigoBarra || "—"}
                  </td>
                  <td className="px-2.5 py-3">
                    <BadgePresentacion d={d} />
                  </td>

                  <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtCantidad(enviada)}
                  </td>

                  {verRecibida && (
                    <td className="px-2.5 py-3 text-right">
                      {inputsHabilitados ? (
                        <SunmiInput
                          type="number"
                          value={edit?.recibido ?? ""}
                          onChange={(e) => onRecibidoChange(idx, enviada, e.target.value)}
                        />
                      ) : (
                        <span className="font-mono tabular-nums">{cantidadOGuion(recibido)}</span>
                      )}
                    </td>
                  )}

                  {verDiferencia && (
                    <td
                      className={`px-2.5 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${claseDiff(diff)}`}
                    >
                      {diff === null ? "—" : fmtCantidad(diff)}
                    </td>
                  )}

                  {verDevuelto && (
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {cantidadOGuion(d.devolucionOrigen)}
                    </td>
                  )}

                  {verMotivo && (
                    <td className="px-2.5 py-3">
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
                          "—"
                        )
                      ) : (
                        d.motivoPrincipal || "—"
                      )}
                    </td>
                  )}

                  {verDetalle && (
                    <td className="px-2.5 py-3">
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
                        d.motivoDetalle || "—"
                      )}
                    </td>
                  )}

                  <td className="px-2.5 py-3 text-right font-mono tabular-nums sunmi-text-muted whitespace-nowrap">
                    {fmtMoneda(d.precioCosto)}
                  </td>

                  <td className="px-2.5 py-3 text-right font-mono font-bold tabular-nums sunmi-text-strong whitespace-nowrap">
                    {fmtMoneda(d.subtotal)}
                  </td>
                </tr>
              ))}
            </SunmiTable>
          </div>
        )}

        {/* NO va acá un total de devolución al origen.
            `resumen.devolucionOrigenTotal` suma las devoluciones de todas las
            líneas, y esas líneas pueden estar en unidades, bultos, kilos o
            piezas: el número resultante no es ninguna de esas magnitudes y
            engaña más de lo que informa.
            La cantidad exacta vive donde SÍ se conoce la presentación: en la
            columna "Devuelto al origen" de cada producto. Que hubo devolución
            ya lo dicen el badge "Con diferencias" del encabezado y el tile
            "Líneas devueltas al origen" de la sección Totales. */}

        {/* Paginación — mismo lugar que en el listado: dentro de la card,
            separada por una línea. */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t sunmi-divider">
            <div className="flex items-center gap-2">
              <SunmiButton color="slate" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </SunmiButton>
              <span className="sunmi-text-muted text-[11px]">
                Página {safePage} de {totalPages} ({allItems.length} líneas)
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
        )}
      </SunmiCard>
    </section>
  );
}
