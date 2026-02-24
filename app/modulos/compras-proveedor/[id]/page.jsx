"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

const ESTADO_BADGE = {
  BORRADOR: "bg-slate-600 text-slate-200",
  CONFIRMADO: "bg-amber-600 text-amber-100",
  ENVIADO: "bg-cyan-600 text-cyan-100",
  RECIBIDO: "bg-green-600 text-green-100",
};

function formatFecha(f) {
  if (!f) return "-";
  return new Date(f).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DetallePedidoProveedorPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Para recepción: cantidades recibidas editables
  const [recibidos, setRecibidos] = useState({});
  const [kgRecibidos, setKgRecibidos] = useState({});

  // Factura / ganancia
  const [totalFactura, setTotalFactura] = useState("");
  const [totalReal, setTotalReal] = useState("");
  const [nroFactura, setNroFactura] = useState("");
  const [fechaFactura, setFechaFactura] = useState("");

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compras-proveedor/obtener?id=${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setPedido(data.item);
        // Inicializar recibidos con la cantidad pedida
        const rec = {};
        const kgRec = {};
        for (const d of data.item.detalles || []) {
          rec[d.id] = Number(d.cantidadRecibida ?? d.cantidad);
          // Para fiambres: inicializar kg
          const base = d.producto?.base;
          if (base?.modoCompraProveedor === "UNIDAD") {
            if (d.kgRecibidos != null) {
              kgRec[d.id] = Number(d.kgRecibidos);
            } else {
              const pesoRef = Number(base.pesoReferenciaKg || base.pesoPromedioKg || 1);
              kgRec[d.id] = Number(d.cantidad) * pesoRef;
            }
          }
        }
        setRecibidos(rec);
        setKgRecibidos(kgRec);

        // Factura
        setTotalFactura(data.item.totalFactura != null ? String(Number(data.item.totalFactura)) : "");
        setTotalReal(data.item.totalReal != null ? String(Number(data.item.totalReal)) : "");
        setNroFactura(data.item.nroFactura || "");
        setFechaFactura(data.item.fechaFactura ? data.item.fechaFactura.slice(0, 10) : "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) cargar();
  }, [id]);

  const ejecutarAccion = async (accion) => {
    setActing(true);
    try {
      let url = "";
      let bodyData = {};

      if (accion === "confirmar") {
        url = `/api/compras-proveedor/confirmar/${id}`;
      } else if (accion === "enviar") {
        url = `/api/compras-proveedor/marcar-enviado/${id}`;
      } else if (accion === "recibir") {
        url = `/api/compras-proveedor/recibir/${id}`;
        bodyData = {
          recibidos,
          kgRecibidos,
          totalFactura: totalFactura || null,
          totalReal: totalReal || null,
          nroFactura: nroFactura || null,
          fechaFactura: fechaFactura || null,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (data.ok) {
        cargar();
      } else {
        alert(data.error || "Error al ejecutar acción");
      }
    } finally {
      setActing(false);
    }
  };

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  if (loading) {
    return (
      <div className="sunmi-bg w-full min-h-full p-4">
        <SunmiCard>
          <p className="text-slate-400">Cargando...</p>
        </SunmiCard>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="sunmi-bg w-full min-h-full p-4">
        <SunmiCard>
          <p className="text-red-400">Pedido no encontrado</p>
          <SunmiButton
            color="slate"
            className="mt-3"
            onClick={() => router.push("/modulos/compras-proveedor")}
          >
            ← Volver
          </SunmiButton>
        </SunmiCard>
      </div>
    );
  }

  const esRecepcion = pedido.estado === "ENVIADO";
  const tieneFiambre = (pedido?.detalles || []).some(
    (d) => d.producto?.base?.modoCompraProveedor === "UNIDAD"
  );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <SunmiHeader title={`Pedido #${pedido.id}`} />
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                ESTADO_BADGE[pedido.estado] || ""
              }`}
            >
              {pedido.estado}
            </span>
          </div>

          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/compras-proveedor")}
          >
            ← Volver
          </SunmiButton>
        </div>

        {/* Info del pedido */}
        <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-400 text-xs">Proveedor</span>
              <p className="text-slate-100">{pedido.proveedor?.nombre}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">Depósito</span>
              <p className="text-slate-100">{pedido.deposito?.nombre}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">Creado</span>
              <p className="text-slate-100">{formatFecha(pedido.createdAt)}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">Notas</span>
              <p className="text-slate-100">{pedido.notas || "-"}</p>
            </div>
          </div>

          {/* Fechas de flujo */}
          <div className="grid grid-cols-3 gap-4 text-sm mt-3 pt-3 border-t border-slate-700/40">
            <div>
              <span className="text-slate-400 text-xs">Confirmado</span>
              <p className="text-slate-100">{formatFecha(pedido.fechaConfirmado)}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">Enviado</span>
              <p className="text-slate-100">{formatFecha(pedido.fechaEnviado)}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">Recibido</span>
              <p className="text-slate-100">{formatFecha(pedido.fechaRecibido)}</p>
            </div>
          </div>
        </SunmiPanel>

        {/* Panel factura — editable en ENVIADO, readonly en RECIBIDO */}
        {(esRecepcion || pedido.estado === "RECIBIDO") && (
          <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b border-slate-600/40">
              <h3 className="text-[13px] font-semibold text-slate-200">
                Factura y ganancia
              </h3>
            </div>

            {esRecepcion ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Total factura ($)</label>
                  <SunmiInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalFactura}
                    onChange={(e) => setTotalFactura(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Total real ($)</label>
                  <SunmiInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalReal}
                    onChange={(e) => setTotalReal(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nro factura</label>
                  <SunmiInput
                    value={nroFactura}
                    onChange={(e) => setNroFactura(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha factura</label>
                  <SunmiInput
                    type="date"
                    value={fechaFactura}
                    onChange={(e) => setFechaFactura(e.target.value)}
                  />
                </div>
                {totalFactura && totalReal && (
                  <div className="col-span-2 md:col-span-4 pt-2 border-t border-slate-700/40">
                    <span className="text-xs text-slate-400">Ganancia depósito: </span>
                    <span className={`text-sm font-bold ${
                      Number(totalFactura) - Number(totalReal) >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      ${(Number(totalFactura) - Number(totalReal)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-400 text-xs">Total factura</span>
                  <p className="text-slate-100">
                    {pedido.totalFactura != null ? `$${Number(pedido.totalFactura).toFixed(2)}` : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">Total real</span>
                  <p className="text-slate-100">
                    {pedido.totalReal != null ? `$${Number(pedido.totalReal).toFixed(2)}` : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">Nro factura</span>
                  <p className="text-slate-100">{pedido.nroFactura || "-"}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">Fecha factura</span>
                  <p className="text-slate-100">
                    {pedido.fechaFactura ? new Date(pedido.fechaFactura).toLocaleDateString("es-AR") : "-"}
                  </p>
                </div>
                {pedido.totalFactura != null && pedido.totalReal != null && (
                  <div className="col-span-2 md:col-span-4 pt-2 border-t border-slate-700/40">
                    <span className="text-xs text-slate-400">Ganancia depósito: </span>
                    <span className={`text-sm font-bold ${
                      Number(pedido.totalFactura) - Number(pedido.totalReal) >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      ${(Number(pedido.totalFactura) - Number(pedido.totalReal)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </SunmiPanel>
        )}

        {/* Detalle de productos */}
        <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
          <div className="flex items-center pb-2 mb-3 border-b border-slate-600/40">
            <h3 className="text-[13px] font-semibold text-slate-200">
              Detalle ({pedido.detalles?.length || 0} items)
            </h3>
          </div>

          <div className="overflow-x-auto rounded border border-slate-700">
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
              ]}
            >
              {(pedido.detalles || []).length === 0 ? (
                <SunmiTableEmpty label="Sin items" />
              ) : (
                pedido.detalles.map((det) => {
                  const esFiambre = det.producto?.base?.modoCompraProveedor === "UNIDAD";
                  return (
                    <SunmiTableRow key={det.id}>
                      <td className="px-3 py-1.5 text-sm">
                        {det.producto?.base?.nombre || "-"}
                        {esFiambre && (
                          <span className="ml-2 text-[10px] text-cyan-400 font-medium">FIAMBRE</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-slate-400">
                        {det.producto?.base?.sku || "-"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {Number(det.cantidad)}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{det.unidad}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {det.precioCosto
                          ? `$${Number(det.precioCosto).toFixed(2)}`
                          : "-"}
                      </td>

                      {/* Cant. recibida (en recepción) */}
                      {esRecepcion && (
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(recibidos[det.id]) || 0;
                                setRecibidos((prev) => ({
                                  ...prev,
                                  [det.id]: Math.max(0, cur - 1),
                                }));
                              }}
                              className="w-6 h-6 rounded-md bg-slate-700 text-slate-200 text-[13px] font-bold hover:bg-slate-600 active:scale-95 transition flex items-center justify-center"
                            >−</button>
                            <SunmiInput
                              type="text"
                              inputMode="numeric"
                              value={recibidos[det.id] ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setRecibidos((prev) => ({ ...prev, [det.id]: "" }));
                                  return;
                                }
                                const val = parseInt(raw, 10);
                                setRecibidos((prev) => ({
                                  ...prev,
                                  [det.id]: isNaN(val) ? "" : Math.max(0, val),
                                }));
                              }}
                              onBlur={() => {
                                const cur = Number(recibidos[det.id]);
                                if (isNaN(cur) || cur < 0) {
                                  setRecibidos((prev) => ({ ...prev, [det.id]: 0 }));
                                }
                              }}
                              className="w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(recibidos[det.id]) || 0;
                                setRecibidos((prev) => ({
                                  ...prev,
                                  [det.id]: cur + 1,
                                }));
                              }}
                              className="w-6 h-6 rounded-md bg-slate-700 text-slate-200 text-[13px] font-bold hover:bg-slate-600 active:scale-95 transition flex items-center justify-center"
                            >+</button>
                          </div>
                        </td>
                      )}

                      {/* Kg recibidos (fiambre, en recepción) */}
                      {esRecepcion && tieneFiambre && (
                        <td className="px-3 py-1.5 w-28">
                          {esFiambre ? (
                            <SunmiInput
                              type="number"
                              min="0"
                              step="0.01"
                              value={kgRecibidos[det.id] ?? ""}
                              onChange={(e) =>
                                setKgRecibidos((prev) => ({
                                  ...prev,
                                  [det.id]: e.target.value,
                                }))
                              }
                              className="w-24 text-center"
                              placeholder="kg"
                            />
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                      )}

                      {/* Estado RECIBIDO: mostrar valores finales */}
                      {pedido.estado === "RECIBIDO" && (
                        <td className="px-3 py-1.5 text-center text-green-400">
                          {det.cantidadRecibida != null
                            ? Number(det.cantidadRecibida)
                            : "-"}
                        </td>
                      )}
                      {pedido.estado === "RECIBIDO" && tieneFiambre && (
                        <td className="px-3 py-1.5 text-center text-green-400">
                          {esFiambre && det.kgRecibidos != null
                            ? `${Number(det.kgRecibidos).toFixed(2)} kg`
                            : "-"}
                        </td>
                      )}
                    </SunmiTableRow>
                  );
                })
              )}
            </SunmiTable>
          </div>
        </SunmiPanel>

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          {pedido.estado === "BORRADOR" && (
            <SunmiButton
              color="amber"
              disabled={acting}
              onClick={() => ejecutarAccion("confirmar")}
            >
              {acting ? "Procesando..." : "Confirmar pedido"}
            </SunmiButton>
          )}

          {pedido.estado === "CONFIRMADO" && (
            <SunmiButton
              color="cyan"
              disabled={acting}
              onClick={() => ejecutarAccion("enviar")}
            >
              {acting ? "Procesando..." : "Marcar como enviado"}
            </SunmiButton>
          )}

          {pedido.estado === "ENVIADO" && (
            <SunmiButton
              color="green"
              disabled={acting}
              onClick={() => ejecutarAccion("recibir")}
            >
              {acting ? "Procesando..." : "Recibir pedido"}
            </SunmiButton>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
