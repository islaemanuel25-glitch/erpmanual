"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";

const fmtFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TurnosPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [estado, setEstado] = useState("todos");
  const [vendedorId, setVendedorId] = useState("");

  // Permisos
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");
  const puedeVerTodos = esAdmin || permisos.includes("turnos.ver_todos");

  // Vendedores para filtro (solo si puede ver todos)
  const [vendedores, setVendedores] = useState([]);

  useEffect(() => {
    if (!puedeVerTodos || !contexto?.localId) return;
    fetch(`/api/usuarios?localId=${contexto.localId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.items) setVendedores(data.items);
        else if (data.ok && data.usuarios) setVendedores(data.usuarios);
      })
      .catch(() => {});
  }, [puedeVerTodos, contexto?.localId]);

  const fetchTurnos = useCallback(async () => {
    if (!contexto?.localId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fechaDesde) params.set("fechaDesde", fechaDesde);
      if (fechaHasta) params.set("fechaHasta", fechaHasta);
      if (estado !== "todos") params.set("estado", estado);
      if (vendedorId) params.set("vendedorId", vendedorId);

      const res = await fetch(`/api/pos-ventas/turnos/listar?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setTurnos(data.items || []);
      }
    } catch (err) {
      console.error("Error cargando turnos:", err);
    } finally {
      setLoading(false);
    }
  }, [contexto?.localId, fechaDesde, fechaHasta, estado, vendedorId]);

  useEffect(() => {
    if (contexto?.localId) fetchTurnos();
  }, [contexto?.localId]);

  if (cargandoUser || cargandoCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }
  if (!puedeUsar) return <SinPermisos />;

  const headers = [
    "Vendedor",
    "Apertura",
    "Cierre",
    "M. Inicial",
    "Esperado",
    "Real",
    "Diferencia",
    "Ventas",
    "Efectivo",
    "Digital",
    "",
  ];

  return (
    <div className="p-3 space-y-3">
      <SunmiCard>
        <h1 className="text-lg font-bold mb-2">Turnos</h1>
        <SunmiSeparator label="Filtros" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <SunmiInput
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            placeholder="Desde"
          />
          <SunmiInput
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            placeholder="Hasta"
          />
          <SunmiSelectAdv
            value={estado}
            onChange={(val) => setEstado(val)}
            options={[
              { value: "todos", label: "Todos" },
              { value: "abierto", label: "Abierto" },
              { value: "cerrado", label: "Cerrado" },
            ]}
          />
          {puedeVerTodos && (
            <SunmiSelectAdv
              value={vendedorId}
              onChange={(val) => setVendedorId(val)}
              options={[
                { value: "", label: "Todos los vendedores" },
                ...vendedores.map((v) => ({
                  value: String(v.id),
                  label: v.nombre || v.email,
                })),
              ]}
            />
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <SunmiButton color="amber" onClick={fetchTurnos}>
            Buscar
          </SunmiButton>
        </div>
      </SunmiCard>

      <SunmiCard>
        {loading ? (
          <SunmiLoader />
        ) : (
          <SunmiTable headers={headers}>
            {turnos.length === 0 ? (
              <SunmiTableEmpty colSpan={headers.length} />
            ) : (
              turnos.map((t) => (
                <SunmiTableRow key={t.id}>
                  <td className="px-3 py-2 text-sm">
                    {t.vendedor?.nombre || t.vendedor?.email || "-"}
                  </td>
                  <td className="px-3 py-2 text-sm">{fmtFecha(t.apertura)}</td>
                  <td className="px-3 py-2 text-sm">
                    {t.cierre ? (
                      fmtFecha(t.cierre)
                    ) : (
                      <span className="sunmi-text-success font-semibold">Abierto</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-right">{fmt(t.montoInicial)}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmt(t.montoEsperadoEfectivo)}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmt(t.montoRealEfectivo)}</td>
                  <td className={`px-3 py-2 text-sm text-right font-semibold ${
                    t.diferenciaEfectivo != null && t.diferenciaEfectivo < 0
                      ? "sunmi-text-danger"
                      : t.diferenciaEfectivo != null && t.diferenciaEfectivo > 0
                      ? "sunmi-text-success"
                      : ""
                  }`}>
                    {fmt(t.diferenciaEfectivo)}
                  </td>
                  <td className="px-3 py-2 text-sm text-center">{t.cantidadVentas ?? "-"}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmt(t.totalVentasEfectivo)}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmt(t.totalVentasDigital)}</td>
                  <td className="px-3 py-2">
                    <SunmiButton
                      color="cyan"
                      onClick={() => router.push(`/modulos/turnos/${t.id}`)}
                    >
                      Ver
                    </SunmiButton>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        )}
      </SunmiCard>
    </div>
  );
}
