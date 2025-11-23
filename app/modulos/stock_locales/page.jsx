"use client";

import { useState, useEffect } from "react";
import FiltrosStock from "@/components/stock_locales/FiltrosStock";
import TablaStock from "@/components/stock_locales/TablaStock";
import ModalAjuste from "@/components/stock_locales/ModalAjuste";
import ModalLimites from "@/components/stock_locales/ModalLimites";

export default function StockLocalesPage() {
  const [locales, setLocales] = useState([]);
  const [localSeleccionado, setLocalSeleccionado] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState({});
  const [page, setPage] = useState(1);

  const [openAjuste, setOpenAjuste] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState(null);

  const [openLimites, setOpenLimites] = useState(false);
  const [productoLimites, setProductoLimites] = useState(null);

  const [refrescar, setRefrescar] = useState(false);

  useEffect(() => {
    const fetchLocales = async () => {
      try {
        const res = await fetch("/api/locales/listar", {
          credentials: "include",
        });
        const json = await res.json();

        if (json?.ok) {
          setLocales(json.items);

          const ultimo = localStorage.getItem("ultimoLocal");

          if (ultimo && json.items.some((l) => l.id === Number(ultimo))) {
            setLocalSeleccionado(Number(ultimo));
          } else {
            const primerLocal = json.items.find((l) => !l.esDeposito);
            setLocalSeleccionado(primerLocal?.id || json.items[0]?.id || "");
          }
        }

        setCargando(false);
      } catch (e) {
        console.error("Error cargando locales:", e);
        setCargando(false);
      }
    };

    fetchLocales();
  }, []);

  useEffect(() => {
    if (localSeleccionado) {
      localStorage.setItem("ultimoLocal", localSeleccionado);
      setRefrescar(true);
    }
  }, [localSeleccionado]);

  const abrirAjuste = (producto) => {
    setProductoAjuste(producto);
    setOpenAjuste(true);
  };

  const abrirLimites = (producto) => {
    setProductoLimites(producto);
    setOpenLimites(true);
  };

  const localActual =
    locales.find((l) => l.id === localSeleccionado) || {
      id: localSeleccionado,
      nombre: "Local",
    };

  if (cargando) {
    return (
      <div className="p-4 sunmi-bg min-h-screen">
        <p className="text-slate-400">Cargando módulo de stock...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sunmi-bg w-full min-h-screen flex flex-col gap-4">

      {/* 🟦 CABECERA SUNMI */}
      <div className="sunmi-card">
        <div className="sunmi-header-cyan">Stock de Locales</div>

        <div className="mt-3 flex flex-col gap-2">
          <span className="text-[13px] text-slate-400">Local seleccionado</span>

          <select
            className="sunmi-input"
            value={localSeleccionado ?? ""}
            onChange={(e) => {
              setLocalSeleccionado(Number(e.target.value));
              setPage(1);
            }}
          >
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 🟦 FILTROS */}
      <FiltrosStock
        localSeleccionado={localSeleccionado}
        onFiltroChange={setFiltro}
        onReset={() => setFiltro({})}
      />

      {/* 🟦 TABLA */}
      <TablaStock
        localSeleccionado={localSeleccionado}
        localNombre={localActual.nombre}
        filtro={filtro}
        page={page}
        setPage={setPage}
        refrescar={refrescar}
        setRefrescar={setRefrescar}
        onAjustar={abrirAjuste}
        onEditarLimites={abrirLimites}
      />

      {/* 🟦 MODAL AJUSTE */}
      <ModalAjuste
        open={openAjuste}
        onClose={(changed) => {
          setOpenAjuste(false);
          if (changed) setRefrescar(true);
        }}
        producto={productoAjuste}
        local={localActual}
      />

      {/* 🟦 MODAL LIMITES */}
      <ModalLimites
        open={openLimites}
        onClose={(changed) => {
          setOpenLimites(false);
          if (changed) setRefrescar(true);
        }}
        producto={productoLimites}
        local={localActual}
      />
    </div>
  );
}
