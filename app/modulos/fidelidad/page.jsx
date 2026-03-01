"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function FidelidadPage() {
  const router = useRouter();
  const { perfil: perfilFid, cargando: cargandoFid } = useUser();
  const { loading: cargandoContexto, contexto, needsContexto } = useContextoActivo();

  const localSeleccionado = contexto?.localId || null;

  // Config
  const [activo, setActivo] = useState(false);
  const [puntosPorPeso, setPuntosPorPeso] = useState("");
  const [pesoPorPunto, setPesoPorPunto] = useState("");
  const [cargandoConfig, setCargandoConfig] = useState(false);

  // Exclusiones
  const [categorias, setCategorias] = useState([]);
  const [exclCatIds, setExclCatIds] = useState([]);
  const [exclProdIds, setExclProdIds] = useState([]);
  const [prodNombres, setProdNombres] = useState({});
  const [busqProd, setBusqProd] = useState("");
  const [resultadosProd, setResultadosProd] = useState([]);
  const [buscandoProd, setBuscandoProd] = useState(false);

  // Simulador
  const [simCompra, setSimCompra] = useState("");
  const [simPuntos, setSimPuntos] = useState("");

  // UI
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Valores numéricos derivados
  const ppwNum = Number(puntosPorPeso) || 0;
  const pppNum = Number(pesoPorPunto) || 0;

  // ── Cargar categorías ───────────────────────────────────
  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await fetch("/api/categorias/listar?pageSize=200&estado=activas", {
          credentials: "include",
        });
        const json = await res.json();
        if (json?.ok) setCategorias(json.items || []);
      } catch (e) {
        console.error("Error cargando categorías:", e);
      }
    };
    fetchCategorias();
  }, []);

  // ── Búsqueda de productos para excluir ──────────────────
  useEffect(() => {
    if (!busqProd.trim() || !localSeleccionado) {
      setResultadosProd([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoProd(true);
      try {
        const res = await fetch(
          `/api/productos/listar?localId=${localSeleccionado}&q=${encodeURIComponent(busqProd.trim())}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) setResultadosProd(data.items || []);
      } catch (e) {
        console.error("Error buscando productos:", e);
      } finally {
        setBuscandoProd(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [busqProd, localSeleccionado]);

  // ── Cargar config cuando cambia local ─────────────────
  useEffect(() => {
    if (!localSeleccionado) {
      setActivo(false);
      setPuntosPorPeso("");
      setPesoPorPunto("");
      setExclCatIds([]);
      setExclProdIds([]);
      setProdNombres({});
      setBusqProd("");
      setResultadosProd([]);
      return;
    }

    const fetchConfig = async () => {
      setCargandoConfig(true);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch(
          `/api/puntos-config?localId=${localSeleccionado}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok && data.config) {
          setActivo(!!data.config.activo);
          setPuntosPorPeso(
            data.config.reglasJson?.puntosPorPeso != null
              ? String(data.config.reglasJson.puntosPorPeso)
              : ""
          );
          setPesoPorPunto(
            data.config.redencionJson?.pesoPorPunto != null
              ? String(data.config.redencionJson.pesoPorPunto)
              : ""
          );
          const exclJson = data.config.exclusionesJson || {};
          setExclCatIds(exclJson.categoriaIds || []);
          setExclProdIds(exclJson.productoBaseIds || []);
          setProdNombres(exclJson._nombres || {});
        } else {
          setActivo(false);
          setPuntosPorPeso("");
          setPesoPorPunto("");
          setExclCatIds([]);
          setExclProdIds([]);
          setProdNombres({});
        }
      } catch (e) {
        console.error("Error cargando config puntos:", e);
        setErrorMsg("Error cargando configuración.");
      } finally {
        setCargandoConfig(false);
      }
    };
    fetchConfig();
  }, [localSeleccionado]);

  // ── Guardar ───────────────────────────────────────────
  const handleGuardar = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!localSeleccionado) return;

    if (activo) {
      if (ppwNum <= 0 && pppNum <= 0) {
        setErrorMsg("Completá al menos puntos por peso o peso por punto.");
        return;
      }
    }

    setGuardando(true);
    try {
      const res = await fetch(`/api/puntos-config?localId=${localSeleccionado}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          activo,
          reglasJson: ppwNum > 0 ? { puntosPorPeso: ppwNum } : null,
          redencionJson: pppNum > 0 ? { pesoPorPunto: pppNum } : null,
          exclusionesJson: {
            categoriaIds: exclCatIds,
            productoBaseIds: exclProdIds,
            _nombres: prodNombres,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg("Configuración guardada correctamente.");
      } else {
        setErrorMsg(data.error || "Error al guardar.");
      }
    } catch (e) {
      console.error("Error guardando config:", e);
      setErrorMsg("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Render ────────────────────────────────────────────
  if (cargandoFid || cargandoContexto) {
    return (
      <div className="p-2 lg:p-3 max-w-2xl mx-auto">
        <div className="text-center py-8 sunmi-text-muted">Cargando...</div>
      </div>
    );
  }

  const permisosFid = perfilFid?.permisos || [];
  const esAdminFid = Array.isArray(permisosFid) && permisosFid.includes("*");
  if (!esAdminFid) return <SinPermisos />;

  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  // Simulador cálculos
  const simCompraNum = Number(simCompra) || 0;
  const simPuntosNum = Number(simPuntos) || 0;
  const simPuntosGanados = ppwNum > 0 ? Math.floor(simCompraNum * ppwNum) : 0;
  const simDescuento = pppNum > 0 ? simPuntosNum * pppNum : 0;

  return (
    <div className="p-2 lg:p-3 max-w-2xl mx-auto space-y-3">
      <SunmiCard>
        <SunmiCardHeader
          title="Fidelidad — Puntos"
          subtitle="Configurá el sistema de puntos por local"
        />

        <p className="text-sm sunmi-text-accent font-medium mt-1">
          {contexto?.nombre || "Sin local"}
        </p>

        {cargandoConfig && (
          <div className="text-center py-6 sunmi-text-muted text-sm">
            Cargando configuración…
          </div>
        )}

        {!cargandoConfig && (
          <>
            <SunmiSeparator label="Configuración" />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] sunmi-text-muted">Puntos activos</span>
              <SunmiToggleEstado
                value={activo}
                onChange={(v) => setActivo(v)}
              />
            </div>

            {activo && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] sunmi-text-muted">
                    Puntos por peso
                  </span>
                  <SunmiInput
                    type="number"
                    step="0.001"
                    min="0"
                    value={puntosPorPeso}
                    onChange={(e) => setPuntosPorPeso(e.target.value)}
                    placeholder="Ej: 0.01 (1 punto cada $100)"
                  />
                  <span className="text-[10px] sunmi-text-muted">
                    Cuántos puntos se acreditan por cada $1 de compra
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] sunmi-text-muted">
                    Peso por punto (redención)
                  </span>
                  <SunmiInput
                    type="number"
                    step="0.01"
                    min="0"
                    value={pesoPorPunto}
                    onChange={(e) => setPesoPorPunto(e.target.value)}
                    placeholder="Ej: 10 ($10 de descuento por punto)"
                  />
                  <span className="text-[10px] sunmi-text-muted">
                    Cuántos $ de descuento vale cada punto al canjear
                  </span>
                </div>

                {/* Equivalencias */}
                {(ppwNum > 0 || pppNum > 0) && (
                  <div className="mt-1 p-3 rounded-lg sunmi-surface border sunmi-border space-y-1">
                    <div className="text-[11px] font-semibold sunmi-text-muted mb-1">
                      Equivalencias
                    </div>
                    {ppwNum > 0 && (
                      <div className="text-xs sunmi-text-muted">
                        1 punto cada{" "}
                        <span className="sunmi-text-accent font-medium">
                          ${Math.round(1 / ppwNum)}
                        </span>{" "}
                        de compra
                      </div>
                    )}
                    {pppNum > 0 && (
                      <div className="text-xs sunmi-text-muted">
                        1 punto vale{" "}
                        <span className="text-purple-400 font-medium">
                          ${pppNum.toFixed(2)}
                        </span>{" "}
                        de descuento
                      </div>
                    )}
                    {ppwNum > 0 && pppNum > 0 && (
                      <div className="text-xs sunmi-text-muted">
                        Devolución:{" "}
                        <span className="sunmi-text-success font-medium">
                          {(ppwNum * pppNum * 100).toFixed(2)}%
                        </span>{" "}
                        del valor de compra
                      </div>
                    )}
                  </div>
                )}

                {/* Simulador */}
                <SunmiSeparator label="Simulador" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Simular compra → puntos */}
                  <div className="p-3 rounded-lg sunmi-surface border sunmi-border">
                    <div className="text-[11px] sunmi-text-muted mb-1">
                      Compra ($) → Puntos ganados
                    </div>
                    <SunmiInput
                      type="number"
                      step="1"
                      min="0"
                      value={simCompra}
                      onChange={(e) => setSimCompra(e.target.value)}
                      placeholder="Monto de compra"
                    />
                    {simCompraNum > 0 && ppwNum > 0 && (
                      <div className="mt-2 text-center sunmi-text-accent font-bold text-lg">
                        {simPuntosGanados} puntos
                      </div>
                    )}
                    {simCompraNum > 0 && ppwNum <= 0 && (
                      <div className="mt-2 text-center text-xs sunmi-text-muted">
                        Configurá puntos por peso
                      </div>
                    )}
                  </div>

                  {/* Simular puntos → descuento */}
                  <div className="p-3 rounded-lg sunmi-surface border sunmi-border">
                    <div className="text-[11px] sunmi-text-muted mb-1">
                      Puntos → Descuento ($)
                    </div>
                    <SunmiInput
                      type="number"
                      step="1"
                      min="0"
                      value={simPuntos}
                      onChange={(e) => setSimPuntos(e.target.value)}
                      placeholder="Cantidad de puntos"
                    />
                    {simPuntosNum > 0 && pppNum > 0 && (
                      <div className="mt-2 text-center text-purple-400 font-bold text-lg">
                        -${simDescuento.toFixed(2)}
                      </div>
                    )}
                    {simPuntosNum > 0 && pppNum <= 0 && (
                      <div className="mt-2 text-center text-xs sunmi-text-muted">
                        Configurá peso por punto
                      </div>
                    )}
                  </div>
                </div>

                {/* Exclusiones */}
                <SunmiSeparator label="Exclusiones" />

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] sunmi-text-muted">
                    Categorías excluidas
                  </span>
                  {categorias.length === 0 ? (
                    <div className="text-[10px] sunmi-text-muted">
                      No hay categorías cargadas
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {categorias.map((cat) => {
                        const excl = exclCatIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              if (excl)
                                setExclCatIds((prev) =>
                                  prev.filter((x) => x !== cat.id)
                                );
                              else
                                setExclCatIds((prev) => [...prev, cat.id]);
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                              excl
                                ? "sunmi-state-danger sunmi-text-danger"
                                : "sunmi-control sunmi-text-muted"
                            }`}
                          >
                            {excl && "✕ "}
                            {cat.nombre}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-[10px] sunmi-text-muted">
                    Los productos de estas categorías no sumarán puntos
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] sunmi-text-muted">
                    Productos excluidos
                  </span>
                  <SunmiInput
                    value={busqProd}
                    onChange={(e) => setBusqProd(e.target.value)}
                    placeholder="Buscar producto por nombre o código…"
                  />
                  {buscandoProd && (
                    <div className="text-[10px] sunmi-text-muted">Buscando…</div>
                  )}
                  {resultadosProd.length > 0 && (
                    <div className="rounded-lg border sunmi-border sunmi-surface max-h-40 overflow-y-auto">
                      {resultadosProd.slice(0, 8).map((p) => {
                        const ya = exclProdIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              if (ya) return;
                              setExclProdIds((prev) => [...prev, p.id]);
                              setProdNombres((prev) => ({
                                ...prev,
                                [p.id]: p.nombre,
                              }));
                              setBusqProd("");
                              setResultadosProd([]);
                            }}
                            disabled={ya}
                            className={`w-full text-left px-3 py-1.5 text-xs border-b sunmi-divider last:border-0 ${
                              ya
                                ? "sunmi-text-muted"
                                : "sunmi-text-muted hover:bg-[var(--table-row-hover)]"
                            }`}
                          >
                            {p.nombre}
                            {p.codigoBarra && (
                              <span className="sunmi-text-muted ml-1">
                                ({p.codigoBarra})
                              </span>
                            )}
                            {ya && (
                              <span className="sunmi-text-muted ml-1">
                                — ya excluido
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {exclProdIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {exclProdIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs sunmi-state-danger sunmi-text-danger"
                        >
                          {prodNombres[id] || `ID ${id}`}
                          <button
                            type="button"
                            onClick={() => {
                              setExclProdIds((prev) =>
                                prev.filter((x) => x !== id)
                              );
                              setProdNombres((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                            }}
                            className="sunmi-link-danger"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] sunmi-text-muted">
                    Estos productos no sumarán puntos
                  </span>
                </div>
              </>
            )}

            {/* Mensajes */}
            {errorMsg && (
              <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="text-xs sunmi-text-success text-center sunmi-state-success rounded px-2 py-1.5">
                {successMsg}
              </div>
            )}

            {/* Botón guardar */}
            <div className="flex justify-end pt-2">
              <SunmiButton
                onClick={handleGuardar}
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Guardar configuración"}
              </SunmiButton>
            </div>
          </>
        )}
      </SunmiCard>
    </div>
  );
}
