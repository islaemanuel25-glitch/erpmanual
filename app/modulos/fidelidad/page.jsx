"use client";

import { useState, useEffect } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

export default function FidelidadPage() {
  const { perfil: perfilFid, cargando: cargandoFid } = useUser();

  // Local selector
  const [locales, setLocales] = useState([]);
  const [localSeleccionado, setLocalSeleccionado] = useState(null);
  const [cargandoLocales, setCargandoLocales] = useState(true);

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

  // ── Cargar locales ────────────────────────────────────
  useEffect(() => {
    const fetchLocales = async () => {
      try {
        const res = await fetch("/api/locales/listar?soloLocales=true", {
          credentials: "include",
        });
        const json = await res.json();
        if (json?.ok) {
          setLocales(json.items || []);
          const ultimo = localStorage.getItem("ultimoLocal");
          if (ultimo && json.items.some((l) => l.id === Number(ultimo))) {
            setLocalSeleccionado(Number(ultimo));
          } else if (json.items.length > 0) {
            setLocalSeleccionado(json.items[0].id);
          }
        }
      } catch (e) {
        console.error("Error cargando locales:", e);
      } finally {
        setCargandoLocales(false);
      }
    };
    fetchLocales();
  }, []);

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

    localStorage.setItem("ultimoLocal", String(localSeleccionado));

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
  if (cargandoFid || cargandoLocales) {
    return (
      <div className="p-2 lg:p-3 max-w-2xl mx-auto">
        <div className="text-center py-8 text-slate-400">Cargando...</div>
      </div>
    );
  }

  const permisosFid = perfilFid?.permisos || [];
  const esAdminFid = Array.isArray(permisosFid) && permisosFid.includes("*");
  if (!esAdminFid) return <SinPermisos />;

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

        {/* Selector de local */}
        <SunmiSeparator label="Local" />

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-400">Local</span>
          <SunmiSelectAdv
            value={localSeleccionado ? String(localSeleccionado) : ""}
            onChange={(v) => setLocalSeleccionado(Number(v) || null)}
          >
            <option value="">Seleccionar local…</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </SunmiSelectAdv>
        </div>

        {!localSeleccionado && (
          <div className="text-center py-6 text-slate-500 text-sm">
            Seleccioná un local para configurar puntos.
          </div>
        )}

        {localSeleccionado && cargandoConfig && (
          <div className="text-center py-6 text-slate-400 text-sm">
            Cargando configuración…
          </div>
        )}

        {localSeleccionado && !cargandoConfig && (
          <>
            <SunmiSeparator label="Configuración" />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">Puntos activos</span>
              <SunmiToggleEstado
                value={activo}
                onChange={(v) => setActivo(v)}
              />
            </div>

            {activo && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">
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
                  <span className="text-[10px] text-slate-500">
                    Cuántos puntos se acreditan por cada $1 de compra
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">
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
                  <span className="text-[10px] text-slate-500">
                    Cuántos $ de descuento vale cada punto al canjear
                  </span>
                </div>

                {/* Equivalencias */}
                {(ppwNum > 0 || pppNum > 0) && (
                  <div className="mt-1 p-3 rounded-lg bg-slate-900/50 border border-slate-700 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-300 mb-1">
                      Equivalencias
                    </div>
                    {ppwNum > 0 && (
                      <div className="text-xs text-slate-400">
                        1 punto cada{" "}
                        <span className="text-amber-400 font-medium">
                          ${Math.round(1 / ppwNum)}
                        </span>{" "}
                        de compra
                      </div>
                    )}
                    {pppNum > 0 && (
                      <div className="text-xs text-slate-400">
                        1 punto vale{" "}
                        <span className="text-purple-400 font-medium">
                          ${pppNum.toFixed(2)}
                        </span>{" "}
                        de descuento
                      </div>
                    )}
                    {ppwNum > 0 && pppNum > 0 && (
                      <div className="text-xs text-slate-400">
                        Devolución:{" "}
                        <span className="text-emerald-400 font-medium">
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
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div className="text-[11px] text-slate-400 mb-1">
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
                      <div className="mt-2 text-center text-amber-400 font-bold text-lg">
                        {simPuntosGanados} puntos
                      </div>
                    )}
                    {simCompraNum > 0 && ppwNum <= 0 && (
                      <div className="mt-2 text-center text-xs text-slate-500">
                        Configurá puntos por peso
                      </div>
                    )}
                  </div>

                  {/* Simular puntos → descuento */}
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div className="text-[11px] text-slate-400 mb-1">
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
                      <div className="mt-2 text-center text-xs text-slate-500">
                        Configurá peso por punto
                      </div>
                    )}
                  </div>
                </div>

                {/* Exclusiones */}
                <SunmiSeparator label="Exclusiones" />

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">
                    Categorías excluidas
                  </span>
                  {categorias.length === 0 ? (
                    <div className="text-[10px] text-slate-500">
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
                                ? "bg-red-500/20 border-red-500/50 text-red-400"
                                : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500"
                            }`}
                          >
                            {excl && "✕ "}
                            {cat.nombre}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-[10px] text-slate-500">
                    Los productos de estas categorías no sumarán puntos
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">
                    Productos excluidos
                  </span>
                  <SunmiInput
                    value={busqProd}
                    onChange={(e) => setBusqProd(e.target.value)}
                    placeholder="Buscar producto por nombre o código…"
                  />
                  {buscandoProd && (
                    <div className="text-[10px] text-slate-500">Buscando…</div>
                  )}
                  {resultadosProd.length > 0 && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/50 max-h-40 overflow-y-auto">
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
                            className={`w-full text-left px-3 py-1.5 text-xs border-b border-slate-800 last:border-0 ${
                              ya
                                ? "text-slate-600"
                                : "text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            {p.nombre}
                            {p.codigoBarra && (
                              <span className="text-slate-500 ml-1">
                                ({p.codigoBarra})
                              </span>
                            )}
                            {ya && (
                              <span className="text-slate-600 ml-1">
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-500/20 border border-red-500/50 text-red-400"
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
                            className="hover:text-red-300"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] text-slate-500">
                    Estos productos no sumarán puntos
                  </span>
                </div>
              </>
            )}

            {/* Mensajes */}
            {errorMsg && (
              <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="text-xs text-emerald-400 text-center bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1.5">
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
