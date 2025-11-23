"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";

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
  if (!item) return null;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-700 mx-1 mb-2">
      <SunmiTable>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left">Producto</th>
            <th className="px-2 py-1 text-left">Código</th>
            <th className="px-2 py-1 text-right">Enviada</th>
            <th className="px-2 py-1 text-right">Recibida</th>
            <th className="px-2 py-1 text-left">Motivo</th>
            <th className="px-2 py-1 text-left">Detalle</th>
            <th className="px-2 py-1 text-right">Costo</th>
            <th className="px-2 py-1 text-right">Subtotal</th>
          </tr>
        </thead>

        <tbody>
          {item.items.map((d, idx) => {
            const enviada = num(d.cantidadEnviada);
            const edit = editItems[idx];
            const recibido = num(edit.recibido);

            const diff = recibido - enviada;

            let bg = "bg-slate-900";
            if (diff !== 0) bg = "bg-amber-800/40";
            if (diff < 0) bg = "bg-red-800/40";
            if (diff === 0) bg = "bg-emerald-800/30";

            return (
              <tr key={d.id} className={`border-t border-slate-800 ${bg}`}>
                <td className="px-2 py-1">{d.nombre}</td>
                <td className="px-2 py-1">{d.codigoBarra || "-"}</td>

                <td className="px-2 py-1 text-right">{enviada}</td>

                {/* CANTIDAD RECIBIDA */}
                <td className="px-2 py-1 text-right">
                  {inputsHabilitados ? (
                    <input
                      type="number"
                      value={edit.recibido}
                      onChange={(e) => {
                        const copia = [...editItems];
                        copia[idx].recibido = e.target.value;

                        if (num(e.target.value) === enviada) {
                          copia[idx].motivoPrincipal = "";
                          copia[idx].motivoDetalle = "";
                        }

                        setEditItems(copia);
                      }}
                      className="w-16 px-1 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 text-right"
                    />
                  ) : (
                    recibido
                  )}
                </td>

                {/* MOTIVO */}
                <td className="px-2 py-1">
                  {inputsHabilitados ? (
                    num(edit.recibido) !== enviada ? (
                      <select
                        value={edit.motivoPrincipal}
                        onChange={(e) => {
                          const copia = [...editItems];
                          copia[idx].motivoPrincipal = e.target.value;

                          if (e.target.value !== "Otro") {
                            copia[idx].motivoDetalle = "";
                          }

                          setEditItems(copia);
                        }}
                        className="px-1 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 w-40 text-sm"
                      >
                        <option value="">Seleccionar…</option>
                        <option value="Faltante">Faltante</option>
                        <option value="Producto dañado">Producto dañado</option>
                        <option value="Otro">Otro (especificar)</option>
                      </select>
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
                  edit.motivoPrincipal === "Otro" &&
                  num(edit.recibido) !== enviada ? (
                    <input
                      type="text"
                      value={edit.motivoDetalle}
                      onChange={(e) => {
                        const copia = [...editItems];
                        copia[idx].motivoDetalle = e.target.value;
                        setEditItems(copia);
                      }}
                      className="w-48 px-2 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
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
        </tbody>
      </SunmiTable>
    </div>
  );
}
