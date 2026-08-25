"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CarruselControles from "@/components/productos/CarruselControles";
import { useResumenStock } from "@/hooks/useResumenStock";
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

  // ── LA CARD ACTIVA VIVE EN EL FILTRO, NO AL LADO ─────────────────────────
  //
  // Se guarda dentro de `filtro` y no en un estado paralelo para que no puedan
  // desincronizarse: el listado lee `filtro`, así que si la card viviera aparte
  // habría dos verdades sobre qué se está mostrando.
  const estadoActivo = filtro.estado || null;

  const alTocarCard = useCallback((id) => {
    setPage(1);
    setFiltro((prev) => {
      // Tocar la card activa la apaga. Solo una puede estar prendida.
      if (prev.estado === id) {
        const { estado, ...resto } = prev;
        return resto;
      }
      return { ...prev, estado: id };
    });
  }, []);

  // ── LA CARD SOBREVIVE A BUSCAR Y FILTRAR ─────────────────────────────────
  //
  // `FiltrosStock` emite el juego COMPLETO de sus filtros, así que pasarle
  // `setFiltro` directo reemplazaba el objeto entero y se llevaba puesto
  // `estado` —la card activa— apenas se escribía en el buscador o se elegía una
  // categoría. La card se apagaba sola y el listado volvía a traer todo.
  //
  // Acá se FUSIONA: los filtros normales pisan lo suyo y `estado` se conserva.
  // El pedido del listado lleva los dos a la vez, que es lo que se pidió.
  //
  // La card solo se apaga por las dos vías previstas: tocarla de nuevo, o
  // Limpiar —que sí borra todo, incluida ella—.
  const alCambiarFiltros = useCallback((nuevos) => {
    setPage(1);
    setFiltro((prev) => (prev.estado ? { ...nuevos, estado: prev.estado } : nuevos));
  }, []);

  const alLimpiar = useCallback(() => {
    setPage(1);
    setFiltro({});
  }, []);

  // ── EL CATÁLOGO SE PIDE UNA SOLA VEZ ─────────────────────────────────────
  //
  // Acá había un `fetch` propio a `/api/catalogos/proveedores`, y `FiltrosStock`
  // ya lo traía por su lado: dos pedidos idénticos en cada entrada a la pantalla.
  // Ahora lo informa el componente que lo carga y esta pantalla solo lo recibe.
  //
  // `useCallback` no es prolijidad: el efecto de `FiltrosStock` que dispara el
  // filtrado tiene `onFiltroChange` entre sus dependencias, y una función inline
  // se recrea en cada render. Lo mismo vale para este handler.
  const [proveedoresPorId, setProveedoresPorId] = useState({});
  const alCargarCatalogos = useCallback(({ proveedores }) => {
    const mapa = {};
    for (const p of proveedores || []) mapa[p.id] = p.nombre;
    setProveedoresPorId(mapa);
  }, []);

  // Lo que el listado le informa a los contadores: cuándo terminó su primera
  // carga y para qué ubicación. Es la puerta de `ordenDeCargaProductos`.
  const [listadoListo, setListadoListo] = useState(null);

  // Se declara ACÁ y no más abajo porque el resumen depende de él: después de
  // ajustar o de tocar límites los conteos cambiaron y hay que volver a pedirlos.
  const [refrescar, setRefrescar] = useState(false);

  const localSeleccionadoParaResumen = contexto?.localId || null;
  const {
    estados,
    cargando: cargandoResumen,
    error: errorResumen,
  } = useResumenStock({
    localSeleccionado: localSeleccionadoParaResumen,
    listadoListo,
  });

  const [openAjuste, setOpenAjuste] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState(null);

  const [openLimites, setOpenLimites] = useState(false);
  const [productoLimites, setProductoLimites] = useState(null);

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

        {/* ── ESTADO DEL STOCK: VA ARRIBA DEL BUSCADOR ────────────────────
            Es el orden del diseño aprobado. Las cards filtran el listado y no
            tocan datos: son controles de revisión, y por eso se superponen
            entre sí en vez de repartir el catálogo. */}
        <CarruselControles
          titulo="Estado del stock"
          controles={estados}
          activo={estadoActivo}
          onSelect={alTocarCard}
          cargando={cargandoResumen}
        />
        {errorResumen && (
          <p className="text-xs sunmi-text-danger" role="status">
            {errorResumen}
          </p>
        )}

        {/* FILTROS compactos */}
        <FiltrosStock
          compact
          localSeleccionado={localSeleccionado}
          onFiltroChange={alCambiarFiltros}
          onReset={alLimpiar}
          onCatalogos={alCargarCatalogos}
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
          proveedoresPorId={proveedoresPorId}
          onPrimeraCarga={setListadoListo}
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
