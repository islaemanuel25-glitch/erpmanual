"use client";

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
  // editItems indices must match allItems, so we track the global offset
  const offset = (safePage - 1) * pageSize;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] mx-1 mb-2">
      <SunmiTable headers={["Producto", "Código", "Enviada", "Recibida", "Motivo", "Detalle", "Costo", "Subtotal"]}>
          {pagedItems.map((d, localIdx) => {
            const idx = offset + localIdx;
            const enviada = num(d.cantidadEnviada);
            const edit = editItems[idx];
            const recibido = num(edit?.recibido ?? enviada);

            const diff = recibido - enviada;

            let bg = "";
            if (diff !== 0) bg = "sunmi-state-warning-soft";
            if (diff < 0) bg = "sunmi-state-danger-soft";
            if (diff === 0) bg = "sunmi-state-success";

            return (
              <tr key={d.id} className={`border-t border-[var(--border)] ${bg}`}>
                <td className="px-2 py-1">{d.nombre}</td>
                <td className="px-2 py-1">{d.codigoBarra || "-"}</td>

                <td className="px-2 py-1 text-right">{enviada}</td>

                {/* CANTIDAD RECIBIDA */}
                <td className="px-2 py-1 text-right">
                  {inputsHabilitados ? (
                    <SunmiInput
                      type="number"
                      value={edit?.recibido ?? ""}
                      onChange={(e) => {
                        const copia = [...editItems];
                        copia[idx].recibido = e.target.value;

                        if (num(e.target.value) === enviada) {
                          copia[idx].motivoPrincipal = "";
                          copia[idx].motivoDetalle = "";
                        }

                        setEditItems(copia);
                      }}
                    />
                  ) : (
                    recibido
                  )}
                </td>

                {/* MOTIVO */}
                <td className="px-2 py-1">
                  {inputsHabilitados ? (
                    num(edit?.recibido) !== enviada ? (
                      <SunmiSelectAdv
                        value={edit?.motivoPrincipal || ""}
                        onChange={(val) => {
                          const copia = [...editItems];
                          copia[idx].motivoPrincipal = val;

                          if (val !== "Otro") {
                            copia[idx].motivoDetalle = "";
                          }

                          setEditItems(copia);
                        }}
                      >
                        <option value="">Seleccionar…</option>
                        <option value="Faltante">Faltante</option>
                        <option value="Producto dañado">Producto dañado</option>
                        <option value="Otro">Otro (especificar)</option>
                      </SunmiSelectAdv>
                    ) : (
                      "-"
                    )
                  ) : (
                    d.motivoPrincipal || "-"
                  )}
                </td>

                {/* DETALLE */}
                <td className="px-2 py-1">
                  {inputsHabilitados &&
                  edit?.motivoPrincipal === "Otro" &&
                  num(edit?.recibido) !== enviada ? (
                    <SunmiInput
                      type="text"
                      value={edit?.motivoDetalle || ""}
                      onChange={(e) => {
                        const copia = [...editItems];
                        copia[idx].motivoDetalle = e.target.value;
                        setEditItems(copia);
                      }}
                      placeholder="Detalle..."
                    />
                  ) : (
                    d.motivoDetalle || "-"
                  )}
                </td>

                <td className="px-2 py-1 text-right">
                  ${num(d.precioCosto).toFixed(2)}
                </td>

                <td className="px-2 py-1 text-right">
                  ${num(d.subtotal).toFixed(2)}
                </td>
              </tr>
            );
          })}
      </SunmiTable>

      {/* Paginación */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 border-t border-[var(--border)]">
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
