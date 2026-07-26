"use client";

import { useState, useEffect, useRef } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

export default function ModalMergeClientes({ localId, onCerrar, onMerged }) {
  // Paso 1: seleccionar principal
  const [busqPrincipal, setBusqPrincipal] = useState("");
  const [resultadosPrincipal, setResultadosPrincipal] = useState([]);
  const [principal, setPrincipal] = useState(null);

  // Paso 2: buscar duplicados + seleccionar
  const [busqDuplicados, setBusqDuplicados] = useState("");
  const [resultadosDuplicados, setResultadosDuplicados] = useState([]);
  const [seleccionados, setSeleccionados] = useState({});

  const [ejecutando, setEjecutando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const timerPrincipal = useRef(null);
  const timerDuplicados = useRef(null);

  // Buscar principal (debounced)
  useEffect(() => {
    if (timerPrincipal.current) clearTimeout(timerPrincipal.current);
    if (!busqPrincipal || busqPrincipal.length < 2) {
      setResultadosPrincipal([]);
      return;
    }

    timerPrincipal.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/clientes/buscar?q=${encodeURIComponent(busqPrincipal)}&localId=${localId}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) setResultadosPrincipal(data.items || []);
      } catch {
        // silent
      }
    }, 350);

    return () => clearTimeout(timerPrincipal.current);
  }, [busqPrincipal, localId]);

  // Buscar duplicados (debounced)
  useEffect(() => {
    if (timerDuplicados.current) clearTimeout(timerDuplicados.current);
    if (!busqDuplicados || busqDuplicados.length < 2) {
      setResultadosDuplicados([]);
      return;
    }

    timerDuplicados.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/clientes/buscar?q=${encodeURIComponent(busqDuplicados)}&localId=${localId}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) {
          // Excluir principal de resultados
          const filtrados = (data.items || []).filter(
            (c) => c.id !== principal?.id
          );
          setResultadosDuplicados(filtrados);
        }
      } catch {
        // silent
      }
    }, 350);

    return () => clearTimeout(timerDuplicados.current);
  }, [busqDuplicados, localId, principal]);

  const handleSeleccionarPrincipal = (cliente) => {
    setPrincipal(cliente);
    setBusqPrincipal("");
    setResultadosPrincipal([]);
    // Limpiar seleccionados que coincidan con el nuevo principal
    setSeleccionados((prev) => {
      const next = { ...prev };
      delete next[cliente.id];
      return next;
    });
  };

  const handleToggleDuplicado = (cliente) => {
    setSeleccionados((prev) => {
      const next = { ...prev };
      if (next[cliente.id]) {
        delete next[cliente.id];
      } else {
        next[cliente.id] = cliente;
      }
      return next;
    });
  };

  const seleccionadosList = Object.values(seleccionados);

  const handleMerge = async () => {
    if (!principal || seleccionadosList.length === 0) return;

    const nombres = seleccionadosList.map((c) => c.nombre).join(", ");
    if (
      !confirm(
        `Unificar ${seleccionadosList.length} cliente(s) en "${principal.nombre}"?\n\nSe eliminarán: ${nombres}\n\nEsta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    setEjecutando(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/clientes/merge?localId=${localId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientePrincipalId: principal.id,
          clientesSecundariosIds: seleccionadosList.map((c) => c.id),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onMerged();
      } else {
        setErrorMsg(data.error || "Error al unificar");
      }
    } catch {
      setErrorMsg("Error de conexión");
    } finally {
      setEjecutando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Unificar clientes duplicados</h3>
          <button
            onClick={onCerrar}
            className="text-xl text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Paso 1: Cliente principal */}
        <SunmiSeparator label="1. Cliente principal (el que queda)" />

        {principal ? (
          <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex-1">
              <span className="text-sm font-medium text-emerald-300">
                {principal.nombre}
              </span>
              <span className="text-xs text-slate-400 ml-2">
                #{principal.id}
                {principal.telefono ? ` | ${principal.telefono}` : ""}
                {principal.email ? ` | ${principal.email}` : ""}
              </span>
            </div>
            <button
              onClick={() => {
                setPrincipal(null);
                setSeleccionados({});
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <SunmiInput
              type="text"
              placeholder="Buscar cliente principal..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={busqPrincipal}
              onChange={(e) => setBusqPrincipal(e.target.value)}
              autoFocus
            />
            {resultadosPrincipal.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-900">
                {resultadosPrincipal.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSeleccionarPrincipal(c)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0"
                  >
                    <span className="text-slate-200 font-medium">
                      {c.nombre}
                    </span>
                    <span className="text-slate-500 ml-2">
                      #{c.id}
                      {c.telefono ? ` | ${c.telefono}` : ""}
                      {c.documento ? ` | ${c.documento}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paso 2: Duplicados */}
        {principal && (
          <>
            <SunmiSeparator label="2. Seleccionar duplicados (se eliminan)" />

            <div className="mb-2">
              <SunmiInput
                type="text"
                placeholder="Buscar duplicados..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={busqDuplicados}
                onChange={(e) => setBusqDuplicados(e.target.value)}
              />
            </div>

            {resultadosDuplicados.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-slate-700 mb-3">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/80 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-slate-400 w-8"></th>
                      <th className="px-2 py-1.5 text-left text-slate-400">ID</th>
                      <th className="px-2 py-1.5 text-left text-slate-400">Nombre</th>
                      <th className="px-2 py-1.5 text-left text-slate-400">Teléfono</th>
                      <th className="px-2 py-1.5 text-left text-slate-400">Email</th>
                      <th className="px-2 py-1.5 text-left text-slate-400">Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosDuplicados.map((c) => {
                      const checked = !!seleccionados[c.id];
                      return (
                        <tr
                          key={c.id}
                          onClick={() => handleToggleDuplicado(c)}
                          className={`border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/50 ${
                            checked ? "bg-red-500/10" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              className="accent-red-500"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-slate-500">
                            #{c.id}
                          </td>
                          <td className="px-2 py-1.5 text-slate-200">
                            {c.nombre}
                          </td>
                          <td className="px-2 py-1.5 text-slate-400">
                            {c.telefono || "-"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-400">
                            {c.email || "-"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-400">
                            {c.documento || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Seleccionados */}
            {seleccionadosList.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-slate-400 mb-1">
                  Se eliminarán ({seleccionadosList.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {seleccionadosList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleToggleDuplicado(c)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                    >
                      {c.nombre} (#{c.id}) ✕
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {errorMsg && (
          <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 mb-3">
            {errorMsg}
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2 pt-2">
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            disabled={ejecutando}
            className="flex-1"
          >
            Cancelar
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={handleMerge}
            disabled={ejecutando || !principal || seleccionadosList.length === 0}
            className="flex-1"
          >
            {ejecutando
              ? "Unificando..."
              : `Unificar ${seleccionadosList.length > 0 ? seleccionadosList.length : ""} cliente(s)`}
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
