"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import useAccionesEnvioPedido from "@/hooks/useAccionesEnvioPedido";
import {
  subtotalLinea,
  permiteToggleUnidad,
  unidadDisplay,
} from "@/lib/compras-proveedor/calculoPedido";

const ESTADO_BADGE = {
  BORRADOR: "sunmi-badge-muted",
  CONFIRMADO: "sunmi-badge-accent",
  ENVIADO: "sunmi-badge-link",
  RECIBIDO: "sunmi-badge-success",
  ANULADO: "sunmi-badge-danger",
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

  // Costos editables por ítem (en recepción Y en borrador)
  const [costos, setCostos] = useState({});

  // Edición en BORRADOR: cantidad pedida y unidad por línea
  const [cantidadesEdit, setCantidadesEdit] = useState({});
  const [unidadesEdit, setUnidadesEdit] = useState({});

  // Buscar producto extra (recepción)
  const [extraSearch, setExtraSearch] = useState("");
  const [extraResults, setExtraResults] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraAdding, setExtraAdding] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Factura / ganancia (totalFactura es computed, no editable)
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

        // Costos editables (recepción Y borrador)
        const costosInit = {};
        let totalEst = 0;
        for (const d of data.item.detalles || []) {
          const c = d.precioCosto != null ? Number(d.precioCosto) : 0;
          costosInit[d.id] = c > 0 ? c.toFixed(2) : "";
          totalEst += (Number(d.cantidad) || 0) * c;
        }
        setCostos(costosInit);

        // Edición en BORRADOR: cantidad pedida y unidad iniciales por línea
        const cantInit = {};
        const uniInit = {};
        for (const d of data.item.detalles || []) {
          cantInit[d.id] = String(Number(d.cantidad) || 1);
          uniInit[d.id] = d.unidad || "BULTO";
        }
        setCantidadesEdit(cantInit);
        setUnidadesEdit(uniInit);

        // Factura
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

  // BORRADOR (PENDIENTE) se edita SOLO en /nueva. Si el pedido está en borrador,
  // redirigir al editor único en vez de mantener un editor duplicado acá.
  useEffect(() => {
    if (pedido?.estado === "BORRADOR") {
      router.replace(`/modulos/compras-proveedor/nueva?pedidoId=${pedido.id}`);
    }
  }, [pedido, router]);

  const ejecutarAccion = async (accion) => {
    setActing(true);
    try {
      let url = "";
      let bodyData = {};

      if (accion === "confirmar") {
        url = `/api/compras-proveedor/confirmar/${id}`;
      } else if (accion === "enviar") {
        url = `/api/compras-proveedor/marcar-enviado/${id}`;
      } else if (accion === "anular") {
        url = `/api/compras-proveedor/anular/${id}`;
      } else if (accion === "recibir") {
        url = `/api/compras-proveedor/recibir/${id}`;
        bodyData = {
          recibidos,
          kgRecibidos,
          costos,
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
        // Marcar como enviado → salir del detalle para evitar que el usuario
        // siga "tocando botones" hasta recibir por error.
        if (accion === "enviar") {
          router.push("/modulos/compras-proveedor");
          return;
        }
        cargar();
      } else {
        alert(data.error || "Error al ejecutar acción");
      }
    } finally {
      setActing(false);
    }
  };

  // --- Buscar producto extra (debounced) ---
  const debounceRef = useRef(null);

  const buscarExtra = useCallback(
    (text) => {
      setExtraSearch(text);
      setExtraResults([]);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!text.trim() || !pedido?.proveedorId) {
        setExtraLoading(false);
        return;
      }

      setExtraLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/compras-proveedor/productos?proveedorId=${pedido.proveedorId}&search=${encodeURIComponent(text.trim())}`,
            { credentials: "include" }
          );
          const data = await res.json();
          if (data.ok) {
            // Filtrar productos ya en el pedido
            const idsEnPedido = new Set(
              (pedido.detalles || []).map((d) => d.productoLocalId)
            );
            const filtrados = (data.items || []).filter(
              (p) => !idsEnPedido.has(p.productoLocalId)
            );
            setExtraResults(filtrados.slice(0, 10));
          }
        } catch {
          // silenciar
        } finally {
          setExtraLoading(false);
        }
      }, 350);
    },
    [pedido]
  );

  const agregarExtra = async (producto) => {
    setExtraAdding(producto.productoLocalId);
    try {
      const res = await fetch(`/api/compras-proveedor/agregar-item/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoLocalId: producto.productoLocalId,
          cantidad: 1,
          cantidadRecibida: 1,
          precioCosto: producto.precio_costo || null,
          unidad: producto.modoCompra || "BULTO",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setExtraSearch("");
        setExtraResults([]);
        await cargar();
      } else {
        alert(data.error || "Error al agregar producto");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setExtraAdding(null);
    }
  };

  // Compartir el pedido al proveedor (PDF / copia) — hook compartido con el modal de /nueva.
  const { descargarPDF, copiarPedido } = useAccionesEnvioPedido(pedido);

  // Persiste cambios de cantidad/unidad/precioCosto de una línea en BORRADOR.
  // Optimista: actualiza local state primero, después manda al server.
  const editarItemAPI = async (detalleId, patch) => {
    try {
      const res = await fetch(`/api/compras-proveedor/editar-item/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalleId, ...patch }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo guardar el cambio");
      }
    } catch {
      alert("Error de conexión al guardar el cambio");
    }
  };

  const eliminarDetalle = async (detalleId) => {
    if (!confirm("¿Eliminar este ítem del pedido?")) return;
    setDeleting(detalleId);
    try {
      const res = await fetch(`/api/compras-proveedor/eliminar-item/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalleId }),
      });
      const data = await res.json();
      if (data.ok) {
        // Si era el último ítem de un BORRADOR, el pedido se eliminó en la base:
        // no intentar recargarlo, volver al listado.
        if (data.pedidoEliminado) {
          router.push("/modulos/compras-proveedor");
          return;
        }
        await cargar();
      } else {
        alert(data.error || "Error al eliminar ítem");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setDeleting(null);
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
          <p className="sunmi-text-muted">Cargando...</p>
        </SunmiCard>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="sunmi-bg w-full min-h-full p-4">
        <SunmiCard>
          <p className="sunmi-text-danger">Pedido no encontrado</p>
          <div className="mt-3 flex justify-end">
            <SunmiBackButton href="/modulos/compras-proveedor" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  // BORRADOR redirige a /nueva (efecto de arriba); no renderizar el detalle mientras tanto.
  if (pedido.estado === "BORRADOR") return null;

  const esRecepcion = pedido.estado === "ENVIADO";
  const esBorrador = pedido.estado === "BORRADOR";
  const tieneFiambre = (pedido?.detalles || []).some(
    (d) => d.producto?.base?.modoCompraProveedor === "UNIDAD"
  );

  // Subtotal económico de una línea según el estado (fuente única: calculoPedido).
  // Fiambre → kg × costo (kg reales en recepción/recibido, piezas×pesoRef en borrador).
  const calcLineaDetalle = (d) => {
    const base = d.producto?.base;
    let cant, costo, kg;
    if (esBorrador) {
      cant = Number(cantidadesEdit[d.id] ?? d.cantidad) || 0;
      costo = Number(costos[d.id] ?? d.precioCosto ?? 0) || 0;
      kg = null; // se deriva piezas × pesoRef dentro de subtotalLinea
    } else if (esRecepcion) {
      cant = Number(recibidos[d.id]) || 0;
      costo = Number(costos[d.id] ?? d.precioCosto ?? 0) || 0;
      kg =
        kgRecibidos[d.id] != null && kgRecibidos[d.id] !== ""
          ? Number(kgRecibidos[d.id])
          : null;
    } else {
      cant = Number(d.cantidadRecibida ?? d.cantidad) || 0;
      costo = Number(d.precioCosto) || 0;
      kg = d.kgRecibidos != null ? Number(d.kgRecibidos) : null;
    }
    return subtotalLinea({ base, cantidad: cant, costo, kg });
  };

  // Total estimado/factura reactivo = suma de subtotales económicos.
  const computedTotalFactura = (pedido?.detalles || []).reduce(
    (acc, d) => acc + (calcLineaDetalle(d).subtotal || 0),
    0
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
              {pedido.estado === "BORRADOR" ? "EN CURSO" : pedido.estado}
            </span>
          </div>

          <SunmiBackButton href="/modulos/compras-proveedor" />
        </div>

        {/* Info del pedido */}
        <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="sunmi-text-muted text-xs">Proveedor</span>
              <p className="sunmi-text-strong">{pedido.proveedor?.nombre}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Depósito</span>
              <p className="sunmi-text-strong">{pedido.deposito?.nombre}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Creado</span>
              <p className="sunmi-text-strong">{formatFecha(pedido.createdAt)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Notas</span>
              <p className="sunmi-text-strong">{pedido.notas || "-"}</p>
            </div>
          </div>

          {/* Fechas de flujo */}
          <div className="grid grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t sunmi-divider">
            <div>
              <span className="sunmi-text-muted text-xs">Confirmado</span>
              <p className="sunmi-text-strong">{formatFecha(pedido.fechaConfirmado)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Enviado</span>
              <p className="sunmi-text-strong">{formatFecha(pedido.fechaEnviado)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Recibido</span>
              <p className="sunmi-text-strong">{formatFecha(pedido.fechaRecibido)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Anulado</span>
              <p className={pedido.fechaAnulado ? "sunmi-text-danger" : "sunmi-text-strong"}>
                {formatFecha(pedido.fechaAnulado)}
              </p>
            </div>
          </div>
        </SunmiPanel>

        {/* Banner ENVIADO: esperando mercadería */}
        {esRecepcion && (
          <div
            className="rounded-2xl border p-3 mb-4"
            style={{ borderColor: "var(--pos-warning, #f59e0b)" }}
          >
            <div
              className="text-[13px] font-semibold mb-1"
              style={{ color: "var(--pos-warning, #f59e0b)" }}
            >
              Pedido enviado al proveedor. Esperando mercadería.
            </div>
            <div className="text-[12px] sunmi-text-muted">
              No marques recepción hasta que la mercadería haya llegado físicamente
              al depósito. Cuando llegue, usá el botón &quot;Recibir mercadería&quot;
              al final del detalle.
            </div>
          </div>
        )}

        {/* Panel factura — editable en ENVIADO, readonly en RECIBIDO */}
        {(esRecepcion || pedido.estado === "RECIBIDO") && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Factura y ganancia
              </h3>
            </div>

            {esRecepcion ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs sunmi-text-muted mb-1">Total factura ($)</label>
                  <p className="text-lg font-bold sunmi-text-accent">
                    ${computedTotalFactura.toFixed(2)}
                  </p>
                  <p className="text-[10px] sunmi-text-muted">Calculado: cant. recibida × costo</p>
                </div>
                <div>
                  <label className="block text-xs sunmi-text-muted mb-1">Total real ($)</label>
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
                  <label className="block text-xs sunmi-text-muted mb-1">Nro factura</label>
                  <SunmiInput
                    value={nroFactura}
                    onChange={(e) => setNroFactura(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="block text-xs sunmi-text-muted mb-1">Fecha factura</label>
                  <SunmiInput
                    type="date"
                    value={fechaFactura}
                    onChange={(e) => setFechaFactura(e.target.value)}
                  />
                </div>
                {totalReal && (
                  <div className="col-span-2 md:col-span-4 pt-2 border-t sunmi-divider">
                    <span className="text-xs sunmi-text-muted">Ganancia depósito: </span>
                    <span className={`text-sm font-bold ${
                      computedTotalFactura - Number(totalReal) >= 0 ? "sunmi-text-success" : "sunmi-text-danger"
                    }`}>
                      ${(computedTotalFactura - Number(totalReal)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="sunmi-text-muted text-xs">Total factura</span>
                  <p className="sunmi-text-strong">
                    {pedido.totalFactura != null ? `$${Number(pedido.totalFactura).toFixed(2)}` : "-"}
                  </p>
                </div>
                <div>
                  <span className="sunmi-text-muted text-xs">Total real</span>
                  <p className="sunmi-text-strong">
                    {pedido.totalReal != null ? `$${Number(pedido.totalReal).toFixed(2)}` : "-"}
                  </p>
                </div>
                <div>
                  <span className="sunmi-text-muted text-xs">Nro factura</span>
                  <p className="sunmi-text-strong">{pedido.nroFactura || "-"}</p>
                </div>
                <div>
                  <span className="sunmi-text-muted text-xs">Fecha factura</span>
                  <p className="sunmi-text-strong">
                    {pedido.fechaFactura ? new Date(pedido.fechaFactura).toLocaleDateString("es-AR") : "-"}
                  </p>
                </div>
                {pedido.totalFactura != null && pedido.totalReal != null && (
                  <div className="col-span-2 md:col-span-4 pt-2 border-t sunmi-divider">
                    <span className="text-xs sunmi-text-muted">Ganancia depósito: </span>
                    <span className={`text-sm font-bold ${
                      Number(pedido.totalFactura) - Number(pedido.totalReal) >= 0 ? "sunmi-text-success" : "sunmi-text-danger"
                    }`}>
                      ${(Number(pedido.totalFactura) - Number(pedido.totalReal)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </SunmiPanel>
        )}

        {/* Banner BORRADOR editable */}
        {esBorrador && (
          <div
            className="rounded-2xl border p-3 mb-4 text-[12px]"
            style={{ borderColor: "var(--pos-link)", color: "var(--pos-link)" }}
          >
            <span className="font-semibold">Estás editando un borrador.</span>{" "}
            <span className="sunmi-text-muted">
              Podés editar cantidades, unidad y costo de cada línea, o agregar
              y quitar productos. Cuando esté listo, usá &quot;Confirmar
              pedido&quot; abajo.
            </span>
          </div>
        )}

        {/* Detalle de productos */}
        <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
          <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
            <h3 className="text-[13px] font-semibold sunmi-text-strong">
              Detalle ({pedido.detalles?.length || 0} items)
            </h3>
          </div>

          {/* DESKTOP: tabla */}
          <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
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
                "Subtotal",
                ...((esRecepcion || esBorrador) ? [""] : []),
              ]}
            >
              {(pedido.detalles || []).length === 0 ? (
                <SunmiTableEmpty label="Sin items" />
              ) : (
                pedido.detalles.map((det) => {
                  const base = det.producto?.base;
                  const esFiambre = base?.modoCompraProveedor === "UNIDAD";
                  const r = calcLineaDetalle(det);
                  const puedeToggle = esBorrador && permiteToggleUnidad(base);
                  return (
                    <SunmiTableRow key={det.id}>
                      <td className="px-3 py-1.5 text-sm">
                        {base?.nombre || "-"}
                        {esFiambre && (
                          <span className="ml-2 text-[10px] sunmi-text-link font-medium">FIAMBRE</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs sunmi-text-muted">{base?.sku || "-"}</td>
                      <td className="px-3 py-1.5 text-center">
                        {esBorrador ? (
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
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {puedeToggle ? (
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
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
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
                          det.precioCosto ? `$${Number(det.precioCosto).toFixed(2)}` : "-"
                        )}
                      </td>

                      {esRecepcion && (
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: Math.max(0, cur - 1) })); }}>−</SunmiButton>
                            <SunmiInput
                              type="text"
                              inputMode="numeric"
                              value={recibidos[det.id] ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") { setRecibidos((prev) => ({ ...prev, [det.id]: "" })); return; }
                                const val = parseInt(raw, 10);
                                setRecibidos((prev) => ({ ...prev, [det.id]: isNaN(val) ? "" : Math.max(0, val) }));
                              }}
                              onBlur={() => { const cur = Number(recibidos[det.id]); if (isNaN(cur) || cur < 0) setRecibidos((prev) => ({ ...prev, [det.id]: 0 })); }}
                              className="w-[56px] text-center"
                            />
                            <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: cur + 1 })); }}>+</SunmiButton>
                          </div>
                        </td>
                      )}

                      {esRecepcion && tieneFiambre && (
                        <td className="px-3 py-1.5 w-28">
                          {esFiambre ? (
                            <SunmiInput type="number" min="0" step="0.01" value={kgRecibidos[det.id] ?? ""}
                              onChange={(e) => setKgRecibidos((prev) => ({ ...prev, [det.id]: e.target.value }))}
                              className="w-24 text-center" placeholder="kg" />
                          ) : (<span className="sunmi-text-muted text-xs">-</span>)}
                        </td>
                      )}

                      {pedido.estado === "RECIBIDO" && (
                        <td className="px-3 py-1.5 text-center sunmi-text-success">
                          {det.cantidadRecibida != null ? Number(det.cantidadRecibida) : "-"}
                        </td>
                      )}
                      {pedido.estado === "RECIBIDO" && tieneFiambre && (
                        <td className="px-3 py-1.5 text-center sunmi-text-success">
                          {esFiambre && det.kgRecibidos != null ? `${Number(det.kgRecibidos).toFixed(2)} kg` : "-"}
                        </td>
                      )}

                      <td className="px-3 py-1.5 text-xs text-right font-medium">
                        {r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : (
                          <span className="sunmi-text-accent" title={r.advertencia || ""}>⚠ {r.advertencia}</span>
                        )}
                      </td>

                      {(esRecepcion || esBorrador) && (
                        <td className="px-3 py-1.5 text-center">
                          <SunmiButton color="red" type="button" disabled={deleting === det.id} onClick={() => eliminarDetalle(det.id)}>
                            {deleting === det.id ? "..." : "Quitar"}
                          </SunmiButton>
                        </td>
                      )}
                    </SunmiTableRow>
                  );
                })
              )}
              {(pedido.detalles || []).length > 0 && (() => {
                const baseCols = 5;
                const extraCols =
                  (esRecepcion ? 1 : 0) +
                  (esRecepcion && tieneFiambre ? 1 : 0) +
                  (pedido.estado === "RECIBIDO" ? 1 : 0) +
                  (pedido.estado === "RECIBIDO" && tieneFiambre ? 1 : 0);
                const accionCol = (esRecepcion || esBorrador) ? 1 : 0;
                return (
                  <tr className="border-t sunmi-divider">
                    <td colSpan={baseCols + extraCols} className="px-3 py-2 text-sm font-semibold text-right sunmi-text-strong">
                      TOTAL ESTIMADO
                    </td>
                    <td className="px-3 py-2 text-sm font-bold text-right sunmi-text-accent">
                      ${computedTotalFactura.toFixed(2)}
                    </td>
                    {accionCol ? <td /> : null}
                  </tr>
                );
              })()}
            </SunmiTable>
          </div>

          {/* MOBILE: cards */}
          <div className="md:hidden flex flex-col gap-2">
            {(pedido.detalles || []).length === 0 ? (
              <p className="text-xs sunmi-text-muted italic px-1">Sin items</p>
            ) : (
              pedido.detalles.map((det) => {
                const base = det.producto?.base;
                const esFiambre = base?.modoCompraProveedor === "UNIDAD";
                const r = calcLineaDetalle(det);
                const puedeToggle = esBorrador && permiteToggleUnidad(base);
                return (
                  <div key={`m-${det.id}`} className="rounded-xl border sunmi-border p-3 sunmi-surface flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium sunmi-text-strong truncate">
                          {base?.nombre || "-"}
                          {esFiambre && (<span className="ml-2 text-[10px] sunmi-text-link font-medium">FIAMBRE</span>)}
                        </div>
                        <div className="text-[11px] sunmi-text-muted">{base?.sku || ""}</div>
                      </div>
                      {(esRecepcion || esBorrador) && (
                        <SunmiButton color="red" type="button" disabled={deleting === det.id} onClick={() => eliminarDetalle(det.id)}>
                          {deleting === det.id ? "..." : "Quitar"}
                        </SunmiButton>
                      )}
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] sunmi-text-muted">Cant. pedida</span>
                        {esBorrador ? (
                          <SunmiInput type="text" inputMode="numeric" value={cantidadesEdit[det.id] ?? ""}
                            onChange={(e) => setCantidadesEdit((prev) => ({ ...prev, [det.id]: e.target.value }))}
                            onBlur={() => {
                              const v = parseInt(cantidadesEdit[det.id], 10);
                              const final = isNaN(v) || v < 1 ? 1 : v;
                              setCantidadesEdit((prev) => ({ ...prev, [det.id]: String(final) }));
                              if (final !== Number(det.cantidad)) editarItemAPI(det.id, { cantidad: final });
                            }}
                            className="w-[80px] text-center" />
                        ) : (<span className="sunmi-text-strong">{Number(det.cantidad)}</span>)}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] sunmi-text-muted">Unidad</span>
                        {puedeToggle ? (
                          <div className="w-28">
                            <SunmiSelectAdv value={unidadesEdit[det.id] || "BULTO"}
                              onChange={(v) => { setUnidadesEdit((prev) => ({ ...prev, [det.id]: v })); if (v !== det.unidad) editarItemAPI(det.id, { unidad: v }); }}>
                              <SunmiSelectOption value="BULTO">BULTO</SunmiSelectOption>
                              <SunmiSelectOption value="UNIDAD">UNIDAD</SunmiSelectOption>
                            </SunmiSelectAdv>
                          </div>
                        ) : (<span className="sunmi-text-muted">{unidadDisplay(base, det.unidad)}</span>)}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] sunmi-text-muted">Costo</span>
                        {(esRecepcion || esBorrador) ? (
                          <div className="flex items-center gap-0.5">
                            <span className="sunmi-text-muted text-xs">$</span>
                            <SunmiInput type="text" inputMode="decimal" value={costos[det.id] ?? ""}
                              onChange={(e) => setCostos((prev) => ({ ...prev, [det.id]: e.target.value.replace(",", ".") }))}
                              onBlur={() => {
                                const v = Number(costos[det.id]); const final = isNaN(v) || v < 0 ? 0 : v;
                                setCostos((prev) => ({ ...prev, [det.id]: String(final) }));
                                if (esBorrador) { const prevCosto = Number(det.precioCosto); if (final !== prevCosto) editarItemAPI(det.id, { precioCosto: final > 0 ? final : null }); }
                              }}
                              className="w-[90px] text-center" />
                          </div>
                        ) : (<span className="sunmi-text-strong">{det.precioCosto ? `$${Number(det.precioCosto).toFixed(2)}` : "-"}</span>)}
                      </div>
                    </div>

                    {esRecepcion && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] sunmi-text-muted">Cant. recibida</span>
                          <div className="flex items-center gap-1">
                            <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: Math.max(0, cur - 1) })); }}>−</SunmiButton>
                            <SunmiInput type="text" inputMode="numeric" value={recibidos[det.id] ?? ""}
                              onChange={(e) => { const raw = e.target.value; if (raw === "") { setRecibidos((prev) => ({ ...prev, [det.id]: "" })); return; } const val = parseInt(raw, 10); setRecibidos((prev) => ({ ...prev, [det.id]: isNaN(val) ? "" : Math.max(0, val) })); }}
                              onBlur={() => { const cur = Number(recibidos[det.id]); if (isNaN(cur) || cur < 0) setRecibidos((prev) => ({ ...prev, [det.id]: 0 })); }}
                              className="w-[64px] text-center" />
                            <SunmiButton color="slate" type="button" onClick={() => { const cur = Number(recibidos[det.id]) || 0; setRecibidos((prev) => ({ ...prev, [det.id]: cur + 1 })); }}>+</SunmiButton>
                          </div>
                        </div>
                        {esFiambre && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] sunmi-text-muted">Kg recibidos</span>
                            <SunmiInput type="number" min="0" step="0.01" value={kgRecibidos[det.id] ?? ""}
                              onChange={(e) => setKgRecibidos((prev) => ({ ...prev, [det.id]: e.target.value }))}
                              className="w-28 text-center" placeholder="kg" />
                          </div>
                        )}
                      </div>
                    )}

                    {pedido.estado === "RECIBIDO" && (
                      <div className="text-[12px] sunmi-text-success">
                        Recibido: {det.cantidadRecibida != null ? Number(det.cantidadRecibida) : "-"}
                        {esFiambre && det.kgRecibidos != null ? ` · ${Number(det.kgRecibidos).toFixed(2)} kg` : ""}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t sunmi-divider pt-2">
                      <span className="text-xs sunmi-text-muted">Subtotal</span>
                      <span className="text-sm font-bold sunmi-text-accent">
                        {r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : `⚠ ${r.advertencia}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            {(pedido.detalles || []).length > 0 && (
              <div className="flex items-center justify-between rounded-xl border sunmi-border p-3 sunmi-surface">
                <span className="text-sm font-semibold sunmi-text-strong">TOTAL ESTIMADO</span>
                <span className="text-base font-bold sunmi-text-accent">${computedTotalFactura.toFixed(2)}</span>
              </div>
            )}
          </div>
        </SunmiPanel>

        {/* Agregar productos al pedido — visible en BORRADOR y ENVIADO */}
        {(esRecepcion || esBorrador) && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                {esBorrador ? "Agregar productos al pedido" : "Agregar producto extra"}
              </h3>
            </div>

            <SunmiInput
              type="text"
              placeholder="Buscar producto extra (nombre / SKU / código de barra)"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={extraSearch}
              onChange={(e) => buscarExtra(e.target.value)}
              className="mb-3"
            />

            {extraLoading && (
              <p className="text-xs sunmi-text-muted">Buscando...</p>
            )}

            {!extraLoading && extraSearch.trim() && extraResults.length === 0 && (
              <p className="text-xs sunmi-text-muted">Sin resultados</p>
            )}

            {extraResults.length > 0 && (
              <div className="overflow-x-auto rounded border sunmi-border">
                <SunmiTable headers={["Producto", "SKU", "Cód. barra", "Modo", "Costo", ""]}>
                  {extraResults.map((p) => (
                    <SunmiTableRow key={p.productoLocalId}>
                      <td className="px-3 py-1.5 text-sm">{p.nombre}</td>
                      <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.sku || "-"}</td>
                      <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.codigo_barra || "-"}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {p.modoCompra === "UNIDAD" ? (
                          <span className="sunmi-text-link">FIAMBRE</span>
                        ) : (
                          "BULTO"
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {p.precio_costo ? `$${Number(p.precio_costo).toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-1.5">
                        <SunmiButton
                          color="cyan"
                          size="xs"
                          disabled={extraAdding === p.productoLocalId}
                          onClick={() => agregarExtra(p)}
                        >
                          {extraAdding === p.productoLocalId ? "..." : "Agregar"}
                        </SunmiButton>
                      </td>
                    </SunmiTableRow>
                  ))}
                </SunmiTable>
              </div>
            )}
          </SunmiPanel>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          {["BORRADOR", "CONFIRMADO", "ENVIADO"].includes(pedido.estado) && (
            <SunmiButton
              color="red"
              disabled={acting}
              onClick={() => {
                if (!confirm("¿Anular este pedido? Esta acción no se puede deshacer.")) return;
                ejecutarAccion("anular");
              }}
            >
              {acting ? "Procesando..." : "Anular pedido"}
            </SunmiButton>
          )}

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
            <>
              <SunmiButton color="slate" onClick={descargarPDF}>
                Descargar PDF
              </SunmiButton>
              <SunmiButton color="slate" onClick={copiarPedido}>
                Copiar pedido
              </SunmiButton>
              <SunmiButton
                color="cyan"
                disabled={acting}
                onClick={() => {
                  if (!confirm("¿Confirmás que este pedido ya fue enviado al proveedor?")) return;
                  ejecutarAccion("enviar");
                }}
              >
                {acting ? "Procesando..." : "Marcar como enviado"}
              </SunmiButton>
            </>
          )}

          {pedido.estado === "ENVIADO" && (
            <SunmiButton
              color="amber"
              disabled={acting}
              title="Solo continuar si la mercadería llegó físicamente al depósito"
              onClick={() => {
                if (!confirm("Solo continuar si la mercadería llegó físicamente.\n\n¿Confirmás la recepción de este pedido?")) return;
                ejecutarAccion("recibir");
              }}
            >
              {acting ? "Procesando..." : "Recibir mercadería"}
            </SunmiButton>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
