"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import ModalMergeClientes from "@/components/clientes/ModalMergeClientes";
import SinPermisos from "@/components/auth/SinPermisos";

export default function ClientesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const localIdFinal = contexto?.localId || null;

  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estadoClientes, setEstadoClientes] = useState("activos");
  const [tagFiltro, setTagFiltro] = useState("");
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteEditar, setClienteEditar] = useState(null);
  const [mostrarVentas, setMostrarVentas] = useState(false);
  const [clienteVentas, setClienteVentas] = useState(null);
  const [clienteCC, setClienteCC] = useState(null);
  const [mostrarMerge, setMostrarMerge] = useState(false);

  // Import / Export
  const [mostrarImportExport, setMostrarImportExport] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importDecisions, setImportDecisions] = useState({});
  const [aplicando, setAplicando] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    if (localIdFinal) {
      cargarClientes();
      cargarTags();
    }
  }, [localIdFinal, estadoClientes]);

  // Abrir modal de edición si viene el parámetro editar en la URL
  useEffect(() => {
    const editarId = Number(searchParams.get("editar"));
    
    if (editarId > 0 && clientes.length > 0 && !loading && !mostrarModal) {
      const cliente = clientes.find((c) => c.id === editarId);
      
      if (cliente) {
        setClienteEditar(cliente);
        setMostrarModal(true);
        
        // Limpiar el query param editar sin recargar
        const params = new URLSearchParams(searchParams.toString());
        params.delete("editar");
        const newUrl = params.toString()
          ? `/modulos/clientes?${params.toString()}`
          : "/modulos/clientes";
        router.replace(newUrl);
      }
    }
  }, [clientes, loading, searchParams, mostrarModal, router]);

  const cargarTags = async () => {
    if (!localIdFinal) return;
    try {
      const res = await fetch(`/api/clientes/tags?localId=${localIdFinal}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setTags(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando tags:", error);
    }
  };

  const cargarClientes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (localIdFinal) {
        params.set("localId", String(localIdFinal));
      }
      if (estadoClientes === "activos") {
        params.set("activo", "true");
      } else if (estadoClientes === "inactivos") {
        params.set("activo", "false");
      }

      const url = params.toString()
        ? `/api/clientes/listar?${params.toString()}`
        : "/api/clientes/listar";

      const res = await fetch(url, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setClientes(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando clientes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNuevo = () => {
    setClienteEditar(null);
    setMostrarModal(true);
  };

  const handleEditar = (cliente) => {
    setClienteEditar(cliente);
    setMostrarModal(true);
  };

  const handleVerVentas = (cliente) => {
    setClienteVentas(cliente);
    setMostrarVentas(true);
  };

  const handleToggleActivo = async (cliente) => {
    const accion = cliente.activo ? "Desactivar" : "Reactivar";
    if (!confirm(`${accion} este cliente?`)) return;

    try {
      const res = await fetch(`/api/clientes/editar/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          activo: !cliente.activo,
          localId: localIdFinal,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        cargarClientes();
      }
    } catch (error) {
      console.error("Error actualizando estado:", error);
    }
  };

  const handleExportar = async () => {
    if (!localIdFinal) return;
    setExportando(true);
    try {
      const params = new URLSearchParams();
      params.set("localId", String(localIdFinal));
      if (estadoClientes === "activos") {
        params.set("activo", "true");
      } else if (estadoClientes === "inactivos") {
        params.set("activo", "false");
      }
      if (tagFiltro) {
        params.set("tagId", String(tagFiltro));
      }

      const res = await fetch(`/api/clientes/export/excel?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al exportar");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error exportando:", e);
      alert("Error de conexión al exportar");
    } finally {
      setExportando(false);
    }
  };

  const handleExportarPdf = async () => {
    if (!localIdFinal) return;
    setExportandoPdf(true);
    try {
      const params = new URLSearchParams();
      params.set("localId", String(localIdFinal));
      if (estadoClientes === "activos") {
        params.set("activo", "true");
      } else if (estadoClientes === "inactivos") {
        params.set("activo", "false");
      }
      if (tagFiltro) {
        params.set("tagId", String(tagFiltro));
      }

      const res = await fetch(`/api/clientes/export/pdf?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al exportar PDF");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes_${localIdFinal}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error exportando PDF:", e);
      alert("Error de conexión al exportar PDF");
    } finally {
      setExportandoPdf(false);
    }
  };

  const handleImportPreview = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!localIdFinal || localIdFinal === 0) {
      setImportResult({ error: "No hay contexto operativo activo." });
      e.target.value = "";
      return;
    }

    e.target.value = "";
    setImportando(true);
    setImportPreview(null);
    setImportResult(null);
    setImportDecisions({});

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("localId", String(localIdFinal));

      const res = await fetch(`/api/clientes/import/preview?localId=${localIdFinal}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (data.ok) {
        setImportPreview(data);
        // Inicializar decisions con las acciones sugeridas
        const decs = {};
        for (const f of data.filas) {
          if (f.action === "create") {
            decs[f.row] = { action: "create" };
          } else if (f.action === "update" && f.match?.clienteId) {
            decs[f.row] = { action: "update", targetClienteId: f.match.clienteId };
          } else if (f.action === "ambiguous") {
            decs[f.row] = { action: "skip" }; // por defecto skip, usuario elige
          } else {
            decs[f.row] = { action: "skip" };
          }
        }
        setImportDecisions(decs);
      } else {
        setImportResult({ error: data.error || "Error al previsualizar" });
      }
    } catch (err) {
      console.error("Error preview import:", err);
      setImportResult({ error: "Error de conexión" });
    } finally {
      setImportando(false);
    }
  };

  const handleImportApply = async () => {
    if (!importPreview || !localIdFinal) return;

    setAplicando(true);
    setImportResult(null);

    try {
      const decisions = [];
      const filasData = [];

      for (const f of importPreview.filas) {
        const dec = importDecisions[f.row];
        if (!dec || dec.action === "skip") {
          decisions.push({ row: f.row, action: "skip" });
        } else {
          decisions.push({
            row: f.row,
            action: dec.action,
            targetClienteId: dec.targetClienteId || undefined,
          });
        }
        filasData.push({ row: f.row, data: f.data });
      }

      const res = await fetch(`/api/clientes/import/apply?localId=${localIdFinal}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decisions, filasData }),
      });

      const data = await res.json();
      if (data.ok) {
        setImportResult(data);
        setImportPreview(null);
        setImportDecisions({});
        cargarClientes();
        cargarTags();
      } else {
        setImportResult({ error: data.error || "Error al aplicar" });
      }
    } catch (err) {
      console.error("Error apply import:", err);
      setImportResult({ error: "Error de conexión" });
    } finally {
      setAplicando(false);
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    // Filtro por búsqueda
    if (busqueda) {
      const b = busqueda.toLowerCase();
      const matchBusqueda =
        c.nombre.toLowerCase().includes(b) ||
        (c.documento && c.documento.includes(b)) ||
        (c.telefono && c.telefono.includes(b));
      if (!matchBusqueda) return false;
    }

    // Filtro por etiqueta
    if (tagFiltro) {
      const tieneTag = c.tags?.some((t) => String(t.id) === tagFiltro);
      if (!tieneTag) return false;
    }

    return true;
  });

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const permisosC = perfil?.permisos || [];
  const esAdminC = Array.isArray(permisosC) && permisosC.includes("*");
  if (!esAdminC && !permisosC.includes("clientes.ver")) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">Clientes</h1>
            <p className="text-sm sunmi-text-muted">
              Gestion de clientes del sistema
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <SunmiButton
            color="slate"
            onClick={() => setMostrarImportExport((v) => !v)}
          >
            Import / Export
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={() => setMostrarMerge(true)}
            disabled={!localIdFinal}
          >
            Unificar duplicados
          </SunmiButton>
          <SunmiButton color="amber" onClick={handleNuevo}>
            + Nuevo Cliente
          </SunmiButton>
        </div>
      </div>

      {/* Busqueda */}
      <SunmiCard className="p-3">
        <div className="flex flex-col md:flex-row gap-2">
          <SunmiInput
            type="text"
            placeholder="Buscar por nombre, documento o telefono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1"
          />
          <select
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            className="h-11 rounded-xl sunmi-select-native px-3 text-sm"
          >
            <option value="">Todas las etiquetas</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.nombre}
              </option>
            ))}
          </select>
          <select
            value={estadoClientes}
            onChange={(e) => setEstadoClientes(e.target.value)}
            className="h-11 rounded-xl sunmi-select-native px-3 text-sm"
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </SunmiCard>

      {/* Import / Export */}
      {mostrarImportExport && (
        <SunmiCard className="p-3">
          <SunmiSeparator label="Import / Export" />
          <div className="flex flex-col md:flex-row gap-3 items-start">
            {/* Export */}
            <div className="flex-1">
              <p className="text-[11px] sunmi-text-muted mb-1">
                Exportar clientes (respeta filtros activo y etiqueta)
              </p>
              <div className="flex gap-2">
                <SunmiButton
                  color="cyan"
                  onClick={handleExportar}
                  disabled={exportando || !localIdFinal || localIdFinal === 0}
                >
                  {exportando ? "Exportando…" : "Excel"}
                </SunmiButton>
                <SunmiButton
                  color="cyan"
                  onClick={handleExportarPdf}
                  disabled={exportandoPdf || !localIdFinal || localIdFinal === 0}
                >
                  {exportandoPdf ? "Generando…" : "PDF"}
                </SunmiButton>
              </div>
            </div>

            {/* Import */}
            <div className="flex-1">
              <p className="text-[11px] sunmi-text-muted mb-1">
                Importar desde Excel (.xlsx). Match por teléfono, email o
                documento.
              </p>
              <label
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  importando || !localIdFinal || localIdFinal === 0
                    ? "sunmi-control opacity-60 cursor-not-allowed"
                    : "sunmi-btn-accent-soft cursor-pointer"
                }`}
              >
                {importando ? "Analizando…" : "Subir Excel (Preview)"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportPreview}
                  disabled={importando || !localIdFinal || localIdFinal === 0}
                />
              </label>
            </div>
          </div>

          {(!localIdFinal || localIdFinal === 0) && (
            <p className="text-[11px] sunmi-text-muted mt-2">
              No hay contexto operativo activo.
            </p>
          )}

          {/* Preview de import */}
          {importPreview && (
            <div className="mt-3 space-y-2">
              <SunmiSeparator label="Preview" />

              {/* Resumen */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="sunmi-text-success">
                  Crear: {importPreview.resumen.create}
                </span>
                <span className="sunmi-text-link">
                  Actualizar: {importPreview.resumen.update}
                </span>
                <span className="sunmi-text-accent">
                  Ambiguo: {importPreview.resumen.ambiguous}
                </span>
                {importPreview.resumen.skip > 0 && (
                  <span className="sunmi-text-danger">
                    Skip: {importPreview.resumen.skip}
                  </span>
                )}
                <span className="sunmi-text-muted">
                  Total: {importPreview.resumen.total}
                </span>
              </div>

              {/* Tabla de filas */}
              <div className="max-h-[50vh] overflow-y-auto rounded border sunmi-border">
                <table className="w-full text-xs">
                  <thead className="sunmi-thead sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left sunmi-text-muted">#</th>
                      <th className="px-2 py-1.5 text-left sunmi-text-muted">Nombre</th>
                      <th className="px-2 py-1.5 text-left sunmi-text-muted">Identificador</th>
                      <th className="px-2 py-1.5 text-left sunmi-text-muted">Acción</th>
                      <th className="px-2 py-1.5 text-left sunmi-text-muted">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.filas.map((f) => {
                      const dec = importDecisions[f.row] || { action: "skip" };
                      const actionColors = {
                        create: "sunmi-text-success",
                        update: "sunmi-text-link",
                        ambiguous: "sunmi-text-accent",
                        skip: "sunmi-text-danger",
                      };
                      const bgColors = {
                        create: "",
                        update: "",
                        ambiguous: "sunmi-state-warning-soft",
                        skip: "sunmi-state-danger-soft",
                      };

                      return (
                        <tr
                          key={f.row}
                          className={`border-b sunmi-border last:border-0 ${bgColors[f.action] || ""}`}
                        >
                          <td className="px-2 py-1.5 sunmi-text-muted">{f.row}</td>
                          <td className="px-2 py-1.5 sunmi-text-strong max-w-[150px] truncate">
                            {f.data.nombre || "—"}
                          </td>
                          <td className="px-2 py-1.5 sunmi-text-muted max-w-[140px] truncate">
                            {f.data.telefono || f.data.email || f.data.documento || "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            {f.errors?.length > 0 ? (
                              <span className="sunmi-text-danger">Skip — {f.errors[0]}</span>
                            ) : f.action === "ambiguous" ? (
                              <select
                                value={dec.action === "update" ? `update:${dec.targetClienteId}` : dec.action}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "create") {
                                    setImportDecisions((prev) => ({
                                      ...prev,
                                      [f.row]: { action: "create" },
                                    }));
                                  } else if (val === "skip") {
                                    setImportDecisions((prev) => ({
                                      ...prev,
                                      [f.row]: { action: "skip" },
                                    }));
                                  } else if (val.startsWith("update:")) {
                                    const cid = Number(val.split(":")[1]);
                                    setImportDecisions((prev) => ({
                                      ...prev,
                                      [f.row]: { action: "update", targetClienteId: cid },
                                    }));
                                  }
                                }}
                                className="h-7 rounded sunmi-select-native sunmi-text-accent px-1.5 text-[11px]"
                              >
                                <option value="skip">Skip</option>
                                <option value="create">Crear nuevo</option>
                                {f.match?.matches?.map((m) => (
                                  <option key={m.id} value={`update:${m.id}`}>
                                    Actualizar: {m.nombre} (#{m.id})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={actionColors[dec.action] || "sunmi-text-muted"}>
                                {dec.action === "create" && "Crear"}
                                {dec.action === "update" && "Actualizar"}
                                {dec.action === "skip" && "Skip"}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 sunmi-text-muted max-w-[180px] truncate">
                            {f.action === "update" && f.match?.matches?.[0] && (
                              <span>
                                {f.match.matches[0].nombre} (#{f.match.matches[0].id})
                              </span>
                            )}
                            {f.action === "ambiguous" && f.match?.matches && (
                              <span className="sunmi-text-accent">
                                {f.match.matches.length} coincidencias
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botones */}
              <div className="flex gap-2 justify-end pt-1">
                <SunmiButton
                  color="slate"
                  onClick={() => {
                    setImportPreview(null);
                    setImportDecisions({});
                  }}
                >
                  Cancelar
                </SunmiButton>
                <SunmiButton
                  color="amber"
                  onClick={handleImportApply}
                  disabled={aplicando}
                >
                  {aplicando ? "Aplicando…" : "Aplicar importación"}
                </SunmiButton>
              </div>
            </div>
          )}

          {/* Resultado final de apply */}
          {importResult && (
            <div className="mt-3">
              {importResult.error ? (
                <div className="text-xs sunmi-text-danger sunmi-state-danger rounded px-3 py-2">
                  {importResult.error}
                </div>
              ) : (
                <>
                  <div className="flex gap-3 text-xs mb-2">
                    <span className="sunmi-text-success">
                      Creados: {importResult.resumen.creados}
                    </span>
                    <span className="sunmi-text-link">
                      Actualizados: {importResult.resumen.actualizados}
                    </span>
                    <span className="sunmi-text-danger">
                      Errores: {importResult.resumen.errores}
                    </span>
                    <span className="sunmi-text-muted">
                      Total: {importResult.resumen.total}
                    </span>
                  </div>

                  {importResult.detalle?.some((l) => l.error) && (
                    <div className="rounded sunmi-state-danger-soft overflow-hidden">
                      <div className="text-[11px] sunmi-text-danger px-3 py-1.5 border-b sunmi-border font-medium">
                        Filas con error
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {importResult.detalle
                          .filter((l) => l.error)
                          .map((l, i) => (
                            <div
                              key={i}
                              className="flex gap-3 px-3 py-1 text-xs border-b sunmi-border last:border-0"
                            >
                              <span className="sunmi-text-muted shrink-0">
                                Fila {l.row}
                              </span>
                              <span className="sunmi-text-strong truncate">
                                {l.nombre || "—"}
                              </span>
                              <span className="sunmi-text-danger ml-auto shrink-0">
                                {l.error}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </SunmiCard>
      )}

      {/* Tabla */}
      <SunmiCard className="p-3">
        <SunmiSeparator label={`Clientes (${clientesFiltrados.length})`} />

        <div className="overflow-x-auto mt-3">
          <SunmiTable
            headers={[
              "Nombre",
              "Documento",
              "Telefono",
              "Email",
              "Etiquetas",
              "Lista de precios",
              "Estado",
              "Acciones",
            ]}
          >
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 sunmi-text-muted">
                  Cargando...
                </td>
              </tr>
            ) : clientesFiltrados.length === 0 ? (
              <SunmiTableEmpty colSpan={8} message="No hay clientes" />
            ) : (
              clientesFiltrados.map((cliente) => (
                <SunmiTableRow key={cliente.id}>
                  <td className="px-2 py-1.5 font-medium">{cliente.nombre}</td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    {cliente.documento || "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    {cliente.telefono || "-"}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {cliente.email || "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {cliente.tags && cliente.tags.length > 0 ? (
                        cliente.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="text-[10px] px-2 py-0.5 rounded-full sunmi-badge-link"
                          >
                            {tag.nombre}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs sunmi-text-muted">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {cliente.listaPrecio?.nombre ? (
                      <span className="inline-flex items-center gap-1">
                        <span>{cliente.listaPrecio.nombre}</span>
                        {cliente.listaPrecio.activo === false && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded sunmi-state-warning-soft sunmi-text-accent">
                            Inactiva
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs sunmi-text-muted">Usa default</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <SunmiBadgeEstado value={cliente.activo} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/modulos/clientes/${cliente.id}?localId=${localIdFinal}`)}
                        className="sunmi-link text-xs font-medium"
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => setClienteCC(cliente)}
                        className="sunmi-link-success text-xs"
                      >
                        Cta Cte
                      </button>
                      <button
                        onClick={() => handleVerVentas(cliente)}
                        className="sunmi-link-accent text-xs"
                      >
                        Ventas
                      </button>
                      <button
                        onClick={() => handleEditar(cliente)}
                        className="sunmi-link text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActivo(cliente)}
                        className="sunmi-link-danger text-xs"
                      >
                        {cliente.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>
      </SunmiCard>

      {/* Modal */}
      {mostrarModal && (
        <ModalCliente
          key={clienteEditar?.id || "nuevo"}
          cliente={clienteEditar}
          localId={localIdFinal}
          onCerrar={() => setMostrarModal(false)}
          onGuardado={() => {
            setMostrarModal(false);
            cargarClientes();
          }}
        />
      )}

      {/* Modal Ventas */}
      {mostrarVentas && clienteVentas && (
        <ModalVentasCliente
          cliente={clienteVentas}
          localId={localIdFinal}
          onCerrar={() => {
            setMostrarVentas(false);
            setClienteVentas(null);
          }}
        />
      )}

      {/* Modal Cuenta Corriente */}
      {clienteCC && (
        <ModalCuentaCorriente
          cliente={clienteCC}
          localId={localIdFinal}
          onCerrar={() => setClienteCC(null)}
        />
      )}

      {/* Modal Merge */}
      {mostrarMerge && (
        <ModalMergeClientes
          localId={localIdFinal}
          onCerrar={() => setMostrarMerge(false)}
          onMerged={() => {
            setMostrarMerge(false);
            cargarClientes();
            cargarTags();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal crear/editar cliente
// ---------------------------------------------------------------------------
function ModalCliente({ cliente, localId, onCerrar, onGuardado }) {
  const esEdicion = !!cliente;

  const [form, setForm] = useState({
    nombre: cliente?.nombre || "",
    documento: cliente?.documento || "",
    telefono: cliente?.telefono || "",
    email: cliente?.email || "",
    direccion: cliente?.direccion || "",
    observaciones: cliente?.observaciones || "",
    limiteCredito: cliente?.limiteCredito != null ? String(cliente.limiteCredito) : "",
    descuentoPorcentaje: cliente?.descuentoPorcentaje != null ? String(cliente.descuentoPorcentaje) : "",
    listaPrecioId: cliente?.listaPrecio?.id ?? null,
  });

  const [tags, setTags] = useState([]);
  const [tagsSeleccionados, setTagsSeleccionados] = useState(
    cliente?.tags?.map((t) => t.id) || []
  );
  const [nuevoTagNombre, setNuevoTagNombre] = useState("");
  const [creandoTag, setCreandoTag] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [listasOpciones, setListasOpciones] = useState([]);

  useEffect(() => {
    if (localId) {
      cargarTags();
    }
  }, [localId]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/listas-precios/opciones", {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelado) setListasOpciones([]);
          return;
        }
        const data = await res.json();
        if (!cancelado) {
          setListasOpciones(data.ok && Array.isArray(data.items) ? data.items : []);
        }
      } catch {
        if (!cancelado) setListasOpciones([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const cargarTags = async () => {
    if (!localId) return;
    try {
      const res = await fetch(`/api/clientes/tags?localId=${localId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setTags(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando tags:", error);
    }
  };

  const handleCrearTag = async () => {
    if (!nuevoTagNombre.trim()) return;

    setCreandoTag(true);
    try {
      const res = await fetch("/api/clientes/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre: nuevoTagNombre.trim(), localId }),
      });

      const data = await res.json();
      if (data.ok) {
        setTags((prev) => [...prev, data.item]);
        setTagsSeleccionados((prev) => [...prev, data.item.id]);
        setNuevoTagNombre("");
      } else {
        setErrorMsg(data.error || "Error creando etiqueta");
      }
    } catch (error) {
      console.error("Error creando tag:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setCreandoTag(false);
    }
  };

  const handleToggleTag = (tagId) => {
    setTagsSeleccionados((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      setErrorMsg("El nombre es obligatorio");
      return;
    }

    setErrorMsg("");
    setGuardando(true);

    try {
      const url = esEdicion
        ? `/api/clientes/editar/${cliente.id}`
        : "/api/clientes/crear";

      const res = await fetch(url, {
        method: esEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          localId,
          limiteCredito: form.limiteCredito !== "" ? form.limiteCredito : null,
          descuentoPorcentaje: form.descuentoPorcentaje !== "" ? form.descuentoPorcentaje : null,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Error al guardar");
        return;
      }

      // Guardar tags del cliente
      const clienteId = esEdicion ? cliente.id : data.cliente?.id;
      if (clienteId && localId && tagsSeleccionados.length >= 0) {
        const resTags = await fetch(`/api/clientes/${clienteId}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tagIds: tagsSeleccionados, localId }),
        });

        const dataTags = await resTags.json();
        if (!dataTags.ok) {
          console.error("Error guardando tags:", dataTags.error);
        }
      }

      onGuardado();
    } catch (error) {
      console.error("Error guardando:", error);
      setErrorMsg("Error de conexion");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
          </h3>
          <button
            onClick={onCerrar}
            className="text-xl sunmi-link-muted"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Nombre *
            </label>
            <SunmiInput
              type="text"
              value={form.nombre}
              onChange={(e) => handleChange("nombre", e.target.value)}
              placeholder="Juan Perez"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              DNI / CUIT
            </label>
            <SunmiInput
              type="text"
              value={form.documento}
              onChange={(e) => handleChange("documento", e.target.value)}
              placeholder="12345678"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Telefono
            </label>
            <SunmiInput
              type="text"
              value={form.telefono}
              onChange={(e) => handleChange("telefono", e.target.value)}
              placeholder="3412345678"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Email
            </label>
            <SunmiInput
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="cliente@email.com"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Lista de precios
            </label>
            <SunmiSelectAdv
              value={form.listaPrecioId == null ? "" : form.listaPrecioId}
              onChange={(val) => {
                if (val === "" || val === null || val === undefined) {
                  handleChange("listaPrecioId", null);
                } else {
                  handleChange("listaPrecioId", Number(val));
                }
              }}
              placeholder="Sin lista específica (usa default)"
            >
              <option value="">Sin lista específica (usa default)</option>
              {listasOpciones.map((lp) => (
                <option key={lp.id} value={lp.id}>
                  {lp.esDefault ? `${lp.nombre} (default)` : lp.nombre}
                </option>
              ))}
              {cliente?.listaPrecio?.id &&
                !listasOpciones.some((lp) => lp.id === cliente.listaPrecio.id) && (
                  <option
                    key={`legacy-${cliente.listaPrecio.id}`}
                    value={cliente.listaPrecio.id}
                  >
                    {`${cliente.listaPrecio.nombre} (inactiva)`}
                  </option>
                )}
            </SunmiSelectAdv>
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Direccion
            </label>
            <SunmiInput
              type="text"
              value={form.direccion}
              onChange={(e) => handleChange("direccion", e.target.value)}
              placeholder="Calle 123"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Observaciones
            </label>
            <textarea
              value={form.observaciones}
              onChange={(e) => handleChange("observaciones", e.target.value)}
              placeholder="Notas internas del cliente..."
              className="w-full min-h-20 rounded-xl sunmi-textarea px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Límite de crédito (opcional)
            </label>
            <SunmiInput
              type="number"
              value={form.limiteCredito}
              onChange={(e) => handleChange("limiteCredito", e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
            <p className="text-[10px] sunmi-text-muted mt-1">
              Dejar vacío para sin límite
            </p>
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Descuento % (opcional)
            </label>
            <SunmiInput
              type="number"
              value={form.descuentoPorcentaje}
              onChange={(e) => handleChange("descuentoPorcentaje", e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              max="100"
            />
            <p className="text-[10px] sunmi-text-muted mt-1">
              Dejar vacío para sin descuento
            </p>
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Etiquetas
            </label>
            <div className="space-y-2">
              {/* Tags seleccionados */}
              <div className="flex flex-wrap gap-1">
                {tags
                  .filter((t) => tagsSeleccionados.includes(t.id))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="text-[10px] px-2 py-0.5 rounded-full sunmi-badge-link"
                    >
                      {tag.nombre} ✕
                    </button>
                  ))}
              </div>

              {/* Selector de tags */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleToggleTag(Number(e.target.value));
                    e.target.value = "";
                  }
                }}
                className="w-full h-11 rounded-xl sunmi-select-native px-3 text-sm"
              >
                <option value="">Agregar etiqueta...</option>
                {tags
                  .filter((t) => !tagsSeleccionados.includes(t.id))
                  .map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.nombre}
                    </option>
                  ))}
              </select>

              {/* Crear tag rápido */}
              <div className="flex gap-2">
                <SunmiInput
                  type="text"
                  value={nuevoTagNombre}
                  onChange={(e) => setNuevoTagNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCrearTag();
                    }
                  }}
                  placeholder="Crear nueva etiqueta..."
                  className="flex-1"
                />
                <SunmiButton
                  color="cyan"
                  onClick={handleCrearTag}
                  disabled={!nuevoTagNombre.trim() || creandoTag}
                >
                  {creandoTag ? "..." : "+"}
                </SunmiButton>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <SunmiButton
              color="slate"
              onClick={onCerrar}
              disabled={guardando}
              className="flex-1"
            >
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="amber"
              onClick={handleGuardar}
              disabled={guardando}
              className="flex-1"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal historial de ventas del cliente
// ---------------------------------------------------------------------------
function ModalVentasCliente({ cliente, localId, onCerrar }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const cargarVentas = async () => {
      // Validar que haya localId
      if (!localId) {
        setErrorMsg("No hay contexto operativo activo.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/clientes/${cliente.id}/ventas?localId=${localId}`, {
          credentials: "include",
        });

        if (res.status === 401) {
          setErrorMsg("No autenticado");
          return;
        }

        const data = await res.json();

        if (data.ok) {
          setVentas(data.items || []);
        } else {
          setErrorMsg(data.error || "Error cargando ventas");
        }
      } catch (error) {
        console.error("Error cargando ventas:", error);
        setErrorMsg("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    cargarVentas();
  }, [cliente.id, localId]);

  const formatFecha = (fechaStr) => {
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString("es-AR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return fechaStr;
    }
  };

  const formatPrecio = (n) => {
    return Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-3xl p-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Historial de Ventas</h3>
            <p className="text-sm sunmi-text-muted">{cliente.nombre}</p>
          </div>
          <button
            onClick={onCerrar}
            className="text-xl sunmi-link-muted"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 sunmi-text-muted">
            Cargando ventas...
          </div>
        ) : errorMsg ? (
          <div className="text-center py-8 sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">
            {errorMsg}
          </div>
        ) : ventas.length === 0 ? (
          <div className="text-center py-8 sunmi-text-muted">
            Sin ventas registradas
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <SunmiTable
              headers={["Fecha", "Ticket", "Total", "Local"]}
              className="text-xs"
            >
              {ventas.map((venta) => (
                <SunmiTableRow key={venta.id}>
                  <td className="px-2 py-1.5 text-sm">
                    {formatFecha(venta.fecha)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    #{venta.numero}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm sunmi-text-success">
                    ${formatPrecio(venta.total)}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {venta.localNombre}
                  </td>
                </SunmiTableRow>
              ))}
            </SunmiTable>
          </div>
        )}

        <div className="mt-4 pt-4 border-t sunmi-divider">
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Cuenta Corriente
// ---------------------------------------------------------------------------
function ModalCuentaCorriente({ cliente, localId, onCerrar }) {
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Sub-modales
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarAjuste, setMostrarAjuste] = useState(false);

  // Form pago
  const [montoPago, setMontoPago] = useState("");
  const [notaPago, setNotaPago] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  // Form ajuste
  const [montoAjuste, setMontoAjuste] = useState("");
  const [direccionAjuste, setDireccionAjuste] = useState("DEBITO");
  const [notaAjuste, setNotaAjuste] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  const cargarCC = async () => {
    if (!localId) {
      setErrorMsg("No hay contexto operativo activo.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente?localId=${localId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) {
        setMovimientos(data.items || []);
        setSaldo(data.saldo || 0);
      } else {
        setErrorMsg(data.error || "Error cargando cuenta corriente");
      }
    } catch (error) {
      console.error("Error cargando CC:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCC();
  }, [cliente.id, localId]);

  const handleRegistrarPago = async () => {
    const monto = Number(montoPago);
    if (!monto || monto <= 0) return;

    setGuardandoPago(true);
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente/pagos?localId=${localId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ monto, nota: notaPago || null }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setMostrarPago(false);
        setMontoPago("");
        setNotaPago("");
        cargarCC();
      } else {
        setErrorMsg(data.error || "Error registrando pago");
      }
    } catch (error) {
      console.error("Error registrando pago:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setGuardandoPago(false);
    }
  };

  const handleRegistrarAjuste = async () => {
    const monto = Number(montoAjuste);
    if (!monto || monto <= 0) return;

    setGuardandoAjuste(true);
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente/ajustes?localId=${localId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            monto,
            direccion: direccionAjuste,
            nota: notaAjuste || null,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setMostrarAjuste(false);
        setMontoAjuste("");
        setNotaAjuste("");
        setDireccionAjuste("DEBITO");
        cargarCC();
      } else {
        setErrorMsg(data.error || "Error registrando ajuste");
      }
    } catch (error) {
      console.error("Error registrando ajuste:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const formatFecha = (fechaStr) => {
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString("es-AR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return fechaStr;
    }
  };

  const formatPrecio = (n) =>
    Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const tipoLabel = { VENTA: "Venta", PAGO: "Pago", AJUSTE: "Ajuste" };

  return (
    <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-3xl p-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Cuenta Corriente</h3>
            <p className="text-sm sunmi-text-muted">{cliente.nombre}</p>
          </div>
          <button
            onClick={onCerrar}
            className="text-xl sunmi-link-muted"
          >
            ✕
          </button>
        </div>

        {/* Saldo */}
        <div
          className={`rounded-lg px-4 py-3 mb-4 text-center font-bold text-lg ${
            saldo > 0
              ? "sunmi-state-danger sunmi-text-danger"
              : "sunmi-state-success sunmi-text-success"
          }`}
        >
          Saldo: ${formatPrecio(saldo)}
          <span className="text-xs font-normal ml-2">
            {saldo > 0 ? "(debe)" : saldo < 0 ? "(a favor)" : "(sin deuda)"}
          </span>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 mb-4">
          <SunmiButton
            color="amber"
            onClick={() => {
              setMostrarPago(!mostrarPago);
              setMostrarAjuste(false);
              setErrorMsg("");
            }}
            className="flex-1"
          >
            Registrar Pago
          </SunmiButton>
          <SunmiButton
            color="cyan"
            onClick={() => {
              setMostrarAjuste(!mostrarAjuste);
              setMostrarPago(false);
              setErrorMsg("");
            }}
            className="flex-1"
          >
            Ajuste
          </SunmiButton>
        </div>

        {/* Mini-form Pago */}
        {mostrarPago && (
          <SunmiCard className="p-3 mb-4">
            <p className="text-sm font-medium mb-2">Registrar Pago</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Monto
                </label>
                <SunmiInput
                  type="number"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Nota (opcional)
                </label>
                <SunmiInput
                  type="text"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  placeholder="Efectivo, transferencia..."
                />
              </div>
              <SunmiButton
                color="amber"
                onClick={handleRegistrarPago}
                disabled={guardandoPago || !montoPago}
              >
                {guardandoPago ? "..." : "Guardar"}
              </SunmiButton>
            </div>
          </SunmiCard>
        )}

        {/* Mini-form Ajuste */}
        {mostrarAjuste && (
          <SunmiCard className="p-3 mb-4">
            <p className="text-sm font-medium mb-2">Registrar Ajuste</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Monto
                </label>
                <SunmiInput
                  type="number"
                  value={montoAjuste}
                  onChange={(e) => setMontoAjuste(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Tipo
                </label>
                <select
                  value={direccionAjuste}
                  onChange={(e) => setDireccionAjuste(e.target.value)}
                  className="h-11 rounded-xl sunmi-select-native px-3 text-sm"
                >
                  <option value="DEBITO">Debe (+deuda)</option>
                  <option value="CREDITO">Haber (-deuda)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[11px] sunmi-text-muted mb-1 block">
                  Nota
                </label>
                <SunmiInput
                  type="text"
                  value={notaAjuste}
                  onChange={(e) => setNotaAjuste(e.target.value)}
                  placeholder="Motivo del ajuste..."
                />
              </div>
              <SunmiButton
                color="cyan"
                onClick={handleRegistrarAjuste}
                disabled={guardandoAjuste || !montoAjuste}
              >
                {guardandoAjuste ? "..." : "Guardar"}
              </SunmiButton>
            </div>
          </SunmiCard>
        )}

        {errorMsg && (
          <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5 mb-3">
            {errorMsg}
          </div>
        )}

        {/* Tabla movimientos */}
        {loading ? (
          <div className="text-center py-8 sunmi-text-muted">
            Cargando movimientos...
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-8 sunmi-text-muted">
            Sin movimientos registrados
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <SunmiTable
              headers={["Fecha", "Tipo", "Nota", "Debe", "Haber"]}
              className="text-xs"
            >
              {movimientos.map((m) => (
                <SunmiTableRow key={m.id}>
                  <td className="px-2 py-1.5 text-sm">
                    {formatFecha(m.createdAt)}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {tipoLabel[m.tipo] || m.tipo}
                  </td>
                  <td className="px-2 py-1.5 text-sm sunmi-text-muted">
                    {m.nota || "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm sunmi-text-danger">
                    {m.direccion === "DEBITO" ? `$${formatPrecio(m.monto)}` : ""}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm sunmi-text-success">
                    {m.direccion === "CREDITO"
                      ? `$${formatPrecio(m.monto)}`
                      : ""}
                  </td>
                </SunmiTableRow>
              ))}
            </SunmiTable>
          </div>
        )}

        <div className="mt-4 pt-4 border-t sunmi-divider">
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
