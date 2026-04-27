"use client";

import { useState, useEffect } from "react";
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

function formatFecha(f) {
  if (!f) return "-";
  return new Date(f).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function defaultDesde() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultHasta() {
  return new Date().toISOString().slice(0, 10);
}

export default function GananciaComprasPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [desde, setDesde] = useState(defaultDesde);
  const [hasta, setHasta] = useState(defaultHasta);
  const [proveedorId, setProveedorId] = useState("");
  const [proveedores, setProveedores] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Cargar proveedores
  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/proveedores/listar?estado=activos&pageSize=200", {
        credentials: "include",
      });
      const d = await res.json();
      if (d.ok) setProveedores(d.items || []);
    };
    load();
  }, []);

  const buscar = async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      if (proveedorId) qs.set("proveedorId", proveedorId);

      const res = await fetch(`/api/compras-proveedor/ganancia?${qs}`, {
        credentials: "include",
      });
      const d = await res.json();
      if (d.ok) setData(d);
      else setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buscar();
  }, []);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  const r = data?.resumen;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <SunmiHeader title="Ganancia depósito" />
          <SunmiBackButton href="/modulos/compras-proveedor" />
        </div>

        {/* Filtros */}
        <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Desde</label>
              <SunmiInput
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Hasta</label>
              <SunmiInput
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
            <div className="min-w-[180px]">
              <label className="block text-xs sunmi-text-muted mb-1">Proveedor</label>
              <SunmiSelectAdv value={proveedorId} onChange={setProveedorId}>
                <SunmiSelectOption value="">Todos</SunmiSelectOption>
                {proveedores.map((p) => (
                  <SunmiSelectOption key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </div>
            <SunmiButton color="amber" onClick={buscar} disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </SunmiButton>
          </div>
        </SunmiPanel>

        {/* Cards resumen */}
        {r && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SunmiPanel className="sunmi-state-success ring-1 text-center py-3">
              <p className="text-xs sunmi-text-muted">Ganancia total</p>
              <p className={`text-lg font-bold ${r.gananciaTotal >= 0 ? "sunmi-text-success" : "sunmi-text-danger"}`}>
                ${r.gananciaTotal.toFixed(2)}
              </p>
            </SunmiPanel>
            <SunmiPanel className="sunmi-surface ring-1 sunmi-ring text-center py-3">
              <p className="text-xs sunmi-text-muted">Total facturado</p>
              <p className="text-lg font-bold sunmi-text-strong">${r.totalFactura.toFixed(2)}</p>
            </SunmiPanel>
            <SunmiPanel className="sunmi-surface ring-1 sunmi-ring text-center py-3">
              <p className="text-xs sunmi-text-muted">Total real (costo)</p>
              <p className="text-lg font-bold sunmi-text-strong">${r.totalReal.toFixed(2)}</p>
            </SunmiPanel>
            <SunmiPanel className="sunmi-surface ring-1 sunmi-ring text-center py-3">
              <p className="text-xs sunmi-text-muted">Compras recibidas</p>
              <p className="text-lg font-bold sunmi-text-strong">{r.cantidadCompras}</p>
            </SunmiPanel>
          </div>
        )}

        {/* Ranking proveedores */}
        {data?.rankingProveedores?.length > 0 && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Ranking proveedores
              </h3>
            </div>
            <div className="overflow-x-auto rounded border sunmi-border">
              <SunmiTable headers={["Proveedor", "Compras", "Facturado", "Real", "Ganancia"]}>
                {data.rankingProveedores.map((prov) => (
                  <SunmiTableRow key={prov.proveedorId}>
                    <td className="px-3 py-1.5 text-sm">{prov.proveedorNombre}</td>
                    <td className="px-3 py-1.5 text-xs text-center">{prov.compras}</td>
                    <td className="px-3 py-1.5 text-xs text-right">${prov.totalFactura.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-xs text-right">${prov.totalReal.toFixed(2)}</td>
                    <td className={`px-3 py-1.5 text-xs text-right font-medium ${
                      prov.ganancia >= 0 ? "sunmi-text-success" : "sunmi-text-danger"
                    }`}>
                      ${prov.ganancia.toFixed(2)}
                    </td>
                  </SunmiTableRow>
                ))}
              </SunmiTable>
            </div>
          </SunmiPanel>
        )}

        {/* Tabla detalle compras */}
        {data?.compras && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Compras recibidas ({data.compras.length})
              </h3>
            </div>
            <div className="overflow-x-auto rounded border sunmi-border">
              <SunmiTable headers={["#", "Proveedor", "Recibido", "Nro Fact.", "Facturado", "Real", "Ganancia", ""]}>
                {data.compras.length === 0 ? (
                  <SunmiTableEmpty label="Sin compras en el período" />
                ) : (
                  data.compras.map((c) => (
                    <SunmiTableRow key={c.id}>
                      <td className="px-3 py-1.5 text-xs sunmi-text-muted">{c.id}</td>
                      <td className="px-3 py-1.5 text-sm">{c.proveedorNombre}</td>
                      <td className="px-3 py-1.5 text-xs">{formatFecha(c.fechaRecibido)}</td>
                      <td className="px-3 py-1.5 text-xs sunmi-text-muted">{c.nroFactura || "-"}</td>
                      <td className="px-3 py-1.5 text-xs text-right">
                        {c.totalFactura != null ? `$${c.totalFactura.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right">
                        {c.totalReal != null ? `$${c.totalReal.toFixed(2)}` : "-"}
                      </td>
                      <td className={`px-3 py-1.5 text-xs text-right font-medium ${
                        c.ganancia != null && c.ganancia >= 0 ? "sunmi-text-success" :
                        c.ganancia != null ? "sunmi-text-danger" : "sunmi-text-muted"
                      }`}>
                        {c.ganancia != null ? `$${c.ganancia.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <SunmiButton
                          color="slate"
                          onClick={() => router.push(`/modulos/compras-proveedor/${c.id}`)}
                        >
                          Ver
                        </SunmiButton>
                      </td>
                    </SunmiTableRow>
                  ))
                )}
              </SunmiTable>
            </div>
          </SunmiPanel>
        )}
      </SunmiCard>
    </div>
  );
}
