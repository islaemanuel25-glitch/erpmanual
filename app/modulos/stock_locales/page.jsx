"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FiltrosStock from "@/components/stock_locales/FiltrosStock";
import TablaStock from "@/components/stock_locales/TablaStock";
import ModalAjuste from "@/components/stock_locales/ModalAjuste";
import ModalLimites from "@/components/stock_locales/ModalLimites";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import useContextoActivo from "@/hooks/useContextoActivo";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

export default function StockLocalesPage() {
  const router = useRouter();
  const { perfil: perfilSt, cargando: cargandoSt } = useUser();
  const { loading: cargandoContexto, contexto, needsContexto } = useContextoActivo();

  const [filtro, setFiltro] = useState({});
  const [page, setPage] = useState(1);

  const [openAjuste, setOpenAjuste] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState(null);

  const [openLimites, setOpenLimites] = useState(false);
  const [productoLimites, setProductoLimites] = useState(null);

  const [refrescar, setRefrescar] = useState(false);

  const abrirAjuste = (producto) => {
    setProductoAjuste(producto);
    setOpenAjuste(true);
  };

  const abrirLimites = (producto) => {
    setProductoLimites(producto);
    setOpenLimites(true);
  };

  const localSeleccionado = contexto?.localId || null;
  const localActual = contexto
    ? { id: contexto.localId, nombre: contexto.nombre, esDeposito: contexto.esDeposito }
    : { id: null, nombre: "", esDeposito: false };

  if (cargandoSt || cargandoContexto) {
    return (
      <div className="p-4 sunmi-bg min-h-screen">
        <p className="sunmi-text-muted">Cargando módulo de stock...</p>
      </div>
    );
  }

  const permisosSt = perfilSt?.permisos || [];
  const esAdminSt = Array.isArray(permisosSt) && permisosSt.includes("*");
  if (!esAdminSt && !permisosSt.includes("stock.ver")) return <SinPermisos />;

  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-2 sunmi-bg w-full min-h-screen">
      <SunmiCard className="p-2 flex flex-col gap-2">

        <SunmiSeparator
          label={`Stock${localActual.nombre ? ` — ${localActual.nombre}` : ""}`}
        />

        {/* FILTROS compactos */}
        <FiltrosStock
          compact
          localSeleccionado={localSeleccionado}
          onFiltroChange={setFiltro}
          onReset={() => setFiltro({})}
        />

        <SunmiSeparator label="Listado" />

        {/* TABLA DE STOCK */}
        <TablaStock
          localSeleccionado={localSeleccionado}
          localNombre={localActual.nombre}
          localEsDeposito={localActual.esDeposito}
          filtro={filtro}
          page={page}
          setPage={setPage}
          refrescar={refrescar}
          setRefrescar={setRefrescar}
          onAjustar={abrirAjuste}
          onEditarLimites={abrirLimites}
        />

      </SunmiCard>

      {/* MODAL AJUSTE */}
      <ModalAjuste
        open={openAjuste}
        onClose={(changed) => {
          setOpenAjuste(false);
          if (changed) setRefrescar(true);
        }}
        producto={productoAjuste}
        local={localActual}
      />

      {/* MODAL LIMITES */}
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
