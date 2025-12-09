"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
  const { ui } = useUIConfig();
  
  if (!item) return null;

  return (
    <div
      className="overflow-auto border"
      style={{
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("xl"),
        marginLeft: ui.helpers.spacing("xs"),
        marginRight: ui.helpers.spacing("xs"),
        marginBottom: ui.helpers.spacing("sm"),
      }}
    >
      <SunmiTable>
        <thead>
          <tr>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Producto
            </th>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Código
            </th>
            <th
              className="text-right"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Enviada
            </th>
            <th
              className="text-right"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Recibida
            </th>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Motivo
            </th>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Detalle
            </th>
            <th
              className="text-right"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Costo
            </th>
            <th
              className="text-right"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
              }}
            >
              Subtotal
            </th>
          </tr>
        </thead>

        <tbody>
          {item.items.map((d, idx) => {
            const enviada = num(d.cantidadEnviada);
            const edit = editItems[idx];
            const recibido = num(edit.recibido);

            const diff = recibido - enviada;

            let bgColor = "var(--sunmi-card-bg)";
            if (diff !== 0) bgColor = "rgba(146,64,14,0.4)"; // amber-800/40
            if (diff < 0) bgColor = "rgba(153,27,27,0.4)"; // red-800/40
            if (diff === 0) bgColor = "rgba(6,78,59,0.3)"; // emerald-800/30

            return (
              <tr
                key={d.id}
                className="border-t"
                style={{
                  borderTopColor: "var(--sunmi-card-border)",
                  borderTopWidth: "1px",
                  backgroundColor: bgColor,
                }}
              >
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  {d.nombre}
                </td>
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  {d.codigoBarra || "-"}
                </td>

                <td
                  className="text-right"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  {enviada}
                </td>

                {/* CANTIDAD RECIBIDA */}
                <td
                  className="text-right"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
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
                      className="border text-right"
                      style={{
                        backgroundColor: "var(--sunmi-table-row-bg)",
                        borderColor: "var(--sunmi-card-border)",
                        borderWidth: "1px",
                        color: "var(--sunmi-text)",
                        width: parseInt(ui.helpers.controlHeight()) * 2,
                        paddingLeft: ui.helpers.spacing("xs"),
                        paddingRight: ui.helpers.spacing("xs"),
                        paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                        paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                        borderRadius: ui.helpers.radius("md"),
                      }}
                    />
                  ) : (
                    recibido
                  )}
                </td>

                {/* MOTIVO */}
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
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
                        className="border"
                        style={{
                          backgroundColor: "var(--sunmi-table-row-bg)",
                          borderColor: "var(--sunmi-card-border)",
                          borderWidth: "1px",
                          color: "var(--sunmi-text)",
                          paddingLeft: ui.helpers.spacing("xs"),
                          paddingRight: ui.helpers.spacing("xs"),
                          paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                          paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                          borderRadius: ui.helpers.radius("md"),
                          width: parseInt(ui.helpers.controlHeight()) * 5,
                          fontSize: ui.helpers.font("sm"),
                        }}
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
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
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
                      className="border"
                      style={{
                        backgroundColor: "var(--sunmi-card-bg)",
                        borderColor: "var(--sunmi-card-border)",
                        borderWidth: "1px",
                        color: "var(--sunmi-text)",
                        width: parseInt(ui.helpers.controlHeight()) * 6,
                        paddingLeft: ui.helpers.spacing("sm"),
                        paddingRight: ui.helpers.spacing("sm"),
                        paddingTop: parseInt(ui.helpers.spacing("xs")) * 0.5,
                        paddingBottom: parseInt(ui.helpers.spacing("xs")) * 0.5,
                        borderRadius: ui.helpers.radius("md"),
                        fontSize: ui.helpers.font("sm"),
                      }}
                      placeholder="Detalle..."
                    />
                  ) : (
                    d.motivoDetalle || "-"
                  )}
                </td>

                <td
                  className="text-right"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  ${num(d.precioCosto).toFixed(2)}
                </td>

                <td
                  className="text-right"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
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
