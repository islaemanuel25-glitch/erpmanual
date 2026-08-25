"use client";

import { useEffect, useRef } from "react";
import { fromUnidades, kgToPiezas } from "@/lib/conversiones/stock";
import { useStockData } from "@/hooks/useStockData";
import { useColumnasVisibles } from "@/hooks/useColumnasVisibles";
import ColumnPicker from "@/components/stock_locales/ColumnPicker";
import TarjetaStockMovil from "@/components/stock_locales/TarjetaStockMovil";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import {
  formatCantidad,
  esPackDeposito,
  getUnidadDeposito,
  getUnidadLocal,
  getPresentacionDeposito,
  esFiambreFijoItem,
} from "@/lib/stock/presentacion";

// ── Componente ──────────────────────────────────────────────────────────
export default function TablaStock({
  localSeleccionado,
  localNombre,
  localEsDeposito,
  filtro,
  page,
  setPage,
  refrescar,
  setRefrescar,
  onAjustar,
  onEditarLimites,
  // Mapa id → nombre del proveedor. Lo arma la pantalla con el catálogo que ya
  // carga para el filtro: el listado devuelve `proveedorId` y no el nombre, y
  // sumarle un join a un endpoint que también sirve al escritorio sería un
  // cambio de alcance por un renglón de texto.
  proveedoresPorId = null,
  // La tabla ya decidía si mostrar las acciones; la tarjeta usa la misma
  // decisión en vez de tomar una propia.
  puedeAjustar = true,
  // Le avisa a la pantalla cuándo terminó la PRIMERA carga del listado y para
  // qué ubicación. De eso cuelga que los contadores no salgan a competir con
  // esta consulta: ver `hooks/useResumenStock.js`.
  onPrimeraCarga = null,
}) {
  // Datos del listado (fetch/estado extraído a hook).
  const { items, total, totalPages, loading, error } = useStockData({
    localSeleccionado,
    filtro,
    page,
    refrescar,
    setRefrescar,
  });

  // ── EL AVISO SALE CUANDO UNA CARGA TERMINÓ, NO CUANDO NO HAY NINGUNA ────
  //
  // La primera versión de esto miraba `!loading` a secas, y se abría sola en el
  // primer render: `useStockData` pone `loading` en true DENTRO de su función
  // async, así que entre que el efecto corre y el fetch arranca hay un instante
  // en que `loading` todavía es false y no empezó nada.
  //
  // Medido en la pantalla real: el resumen salía a los 2.777 ms y el listado
  // recién terminaba a los 4.294 — 1.517 ms compitiendo, o sea exactamente lo
  // que la puerta existe para evitar. La sonda lo agarró; leyendo el código
  // parecía correcto.
  //
  // Ahora hacen falta las DOS cosas: que haya empezado una carga y que haya
  // terminado. `error` sin `loading` es un final tan válido como los items: si
  // solo se avisara del éxito, un listado que falla dejaría las cards cargando
  // para siempre.
  const avisadoRef = useRef(null);
  const arrancoRef = useRef(false);
  const genRef = useRef(0);
  // La intención de recontar se anota cuando alguien PRENDE `refrescar` —al
  // guardar—, no cuando el listado termina: para entonces ya volvió a false.
  const pendienteRef = useRef(false);
  useEffect(() => {
    if (refrescar) pendienteRef.current = true;
  }, [refrescar]);
  useEffect(() => {
    if (loading) arrancoRef.current = true;
  }, [loading]);
  useEffect(() => {
    if (!localSeleccionado || loading || !arrancoRef.current) return;

    // ── SE AVISA POR LA PRIMERA CARGA Y POR CADA GUARDADO ──────────────────
    //
    // No se puede mirar `refrescar` acá: `useStockData` lo devuelve a false en
    // el MISMO tick en que apaga `loading`, así que para cuando este efecto
    // corre ya vale false y el guardado sería indistinguible de una carga
    // cualquiera. Por eso la intención se anota cuando el booleano se PRENDE, y
    // se consume cuando el listado termina.
    //
    // Lo que sube es una GENERACIÓN: un contador que solo avanza. El hook del
    // resumen se apoya en eso —una generación nueva vale por una invalidación,
    // exactamente una— en vez de mirar un booleano que va y vuelve.
    //
    // Cambiar de página u ordenar NO avisa: no prenden `refrescar` y la
    // ubicación no cambió, así que no hay nada que recontar.
    const esPrimeraDeEsteLocal = avisadoRef.current !== String(localSeleccionado);
    if (!esPrimeraDeEsteLocal && !pendienteRef.current) return;
    avisadoRef.current = String(localSeleccionado);
    pendienteRef.current = false;
    genRef.current += 1;
    onPrimeraCarga?.({
      ok: !error,
      localId: Number(localSeleccionado) || null,
      gen: genRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSeleccionado, loading, error, refrescar]);

  // Columnas visibles (estado + localStorage extraído a hook).
  const { isVisible, toggleCol, visibleCount, COLUMN_DEFS } = useColumnasVisibles();

  // ── Render helpers por columna ────────────────────────────────────────
  const renderCellStock = (p, fmtOpts, isFiambreFijo) => {
    if (esPackDeposito(p, localEsDeposito)) {
      const { bultos, sueltas } = fromUnidades({
        unidades: Number(p.stock || 0),
        factorPack: p.factorPack,
      });
      // Un stock NEGATIVO se lee igual que uno positivo, con el signo adelante.
      //
      // Antes la condición era `bultos > 0 || sueltas > 0`, así que con un
      // negativo los dos daban ≤ 0, caía al formato de sueltas y decía
      // "-551.5 uds" donde tenía que decir "-2 bultos + -181.5 uds". El
      // desglose se perdía justo en las filas que más hay que mirar. Estaba
      // protegido por accidente, no por diseño: sin esa condición habría
      // mostrado el par roto que devolvía fromUnidades con negativos.
      if (bultos !== 0 || sueltas !== 0) {
        return (
          <span>
            {bultos !== 0 && <strong>{bultos} bultos</strong>}
            {bultos !== 0 && sueltas !== 0 && " + "}
            {sueltas !== 0 && `${sueltas} uds`}
          </span>
        );
      }
      return <span>{formatCantidad(p.stock, p.unidadMedida, fmtOpts)}</span>;
    }
    return (
      <span>
        {formatCantidad(p.stock, p.unidadMedida, fmtOpts)}
        {p.unidadMedida === "kg" && p.modoCompraProveedor === "UNIDAD" && p.pesoReferenciaKg > 0 && !isFiambreFijo && (
          <span className="block text-[10px] sunmi-text-muted">
            ≈ {kgToPiezas(Number(p.stock || 0), p.pesoReferenciaKg)} pzs
          </span>
        )}
        {isFiambreFijo && localEsDeposito && (
          <span className="block text-[10px] sunmi-text-muted">
            = {(Number(p.stock || 0) * p.pesoReferenciaKg).toFixed(3)} kg
          </span>
        )}
        {isFiambreFijo && !localEsDeposito && (
          <span className="block text-[10px] sunmi-text-muted">
            ≈ {kgToPiezas(Number(p.stock || 0), p.pesoReferenciaKg)} pzs
          </span>
        )}
      </span>
    );
  };

  // ── Guard ─────────────────────────────────────────────────────────────
  if (!localSeleccionado) {
    return (
      <p className="sunmi-text-muted text-sm py-4">
        No hay contexto operativo activo.
      </p>
    );
  }

  return (
    <div>
      {/* El selector de columnas es de la TABLA, así que se esconde con ella: en
          el celular no hay columnas que elegir. */}
      <div className="hidden md:block">
        <ColumnPicker columnDefs={COLUMN_DEFS} isVisible={isVisible} toggleCol={toggleCol} />
      </div>

      {loading && (
        <p className="sunmi-text-muted text-sm2 mb-3">Cargando stock...</p>
      )}
      {error && <p className="sunmi-text-danger text-sm2 mb-3">{error}</p>}

      {/* ── CELULAR: TARJETAS DE VERDAD, NO LA TABLA CON SCROLL ─────────────
          La tabla vive dentro de un `overflow-x-auto`, así que en un teléfono se
          arrastraba de costado para leer una fila. El encargo pide una vista
          móvil real, y es la mitad del sentido de esta tanda. */}
      <div className="md:hidden">
        <SunmiListaProductoCards>
        {items.map((p) => (
          <TarjetaStockMovil
            key={p.id}
            item={p}
            proveedorNombre={proveedoresPorId?.[p.proveedorId] ?? null}
            onAjustar={onAjustar}
            onLimites={onEditarLimites}
            puedeAjustar={puedeAjustar}
          />
        ))}
        </SunmiListaProductoCards>
        {!loading && items.length === 0 && (
          <p className="sunmi-text-muted text-sm2 py-4">No hay productos con estos filtros.</p>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border sunmi-border">
        <table className="min-w-full text-[12px] sunmi-table">
          <thead className="sunmi-thead">
            <tr>
              {isVisible("producto") && <th className="px-2 py-1 text-left">Producto</th>}
              {isVisible("codigo")   && <th className="px-2 py-1 text-left">Código</th>}
              {isVisible("unidad")   && <th className="px-2 py-1 text-left">Unidad</th>}
              {isVisible("stock")    && <th className="px-2 py-1 text-right">Stock</th>}
              {isVisible("min")      && <th className="px-2 py-1 text-right">Mín</th>}
              {isVisible("max")      && <th className="px-2 py-1 text-right">Máx</th>}
              {isVisible("costo")    && <th className="px-2 py-1 text-right">Costo</th>}
              {isVisible("venta")    && <th className="px-2 py-1 text-right">Venta</th>}
              {isVisible("acciones") && <th className="px-2 py-1 text-center">Acciones</th>}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={visibleCount}
                  className="px-2 py-3 text-center sunmi-text-muted"
                >
                  No hay productos para mostrar.
                </td>
              </tr>
            )}

            {items.map((p) => {
              const presentacionDep = getPresentacionDeposito(p);
              const isFiambreFijo = esFiambreFijoItem(p);
              const fmtOpts = { esFiambreFijo: isFiambreFijo, esDeposito: localEsDeposito };
              return (
                <tr key={p.id} className="hover:bg-[var(--table-row-hover)]">
                  {isVisible("producto") && (
                    <td className="px-2 py-1">{p.nombre}</td>
                  )}
                  {isVisible("codigo") && (
                    <td className="px-2 py-1">{p.codigoBarra || "-"}</td>
                  )}
                  {isVisible("unidad") && (
                    <td className="px-2 py-1">
                      {localEsDeposito ? (
                        getUnidadDeposito(p)
                      ) : (
                        <div className="flex flex-col">
                          <span>{getUnidadLocal(p)}</span>
                          {presentacionDep && (
                            <span className="text-[10px] sunmi-text-muted">
                              Presentación dep: {presentacionDep}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {isVisible("stock") && (
                    <td className="px-2 py-1 text-right">
                      {renderCellStock(p, fmtOpts, isFiambreFijo)}
                    </td>
                  )}
                  {isVisible("min") && (
                    <td className="px-2 py-1 text-right">
                      {esPackDeposito(p, localEsDeposito) && p.stockMin != null
                        ? fromUnidades({ unidades: Number(p.stockMin), factorPack: p.factorPack }).bultos
                        : p.stockMin != null ? formatCantidad(p.stockMin, p.unidadMedida, fmtOpts) : "-"}
                    </td>
                  )}
                  {isVisible("max") && (
                    <td className="px-2 py-1 text-right">
                      {esPackDeposito(p, localEsDeposito) && p.stockMax != null
                        ? fromUnidades({ unidades: Number(p.stockMax), factorPack: p.factorPack }).bultos
                        : p.stockMax != null ? formatCantidad(p.stockMax, p.unidadMedida, fmtOpts) : "-"}
                    </td>
                  )}
                  {isVisible("costo") && (
                    <td className="px-2 py-1 text-right">
                      {localEsDeposito
                        ? `$ ${Number(p.precioCosto || 0).toFixed(2)}`
                        : `$ ${Number(p.precioUnitario || 0).toFixed(2)}`}
                    </td>
                  )}
                  {isVisible("venta") && (
                    <td className="px-2 py-1 text-right">
                      {localEsDeposito
                        ? `$ ${Number(p.precioVenta || 0).toFixed(2)}`
                        : `$ ${Number(
                            p.precioVentaUnitario || p.precioVenta || 0
                          ).toFixed(2)}`}
                    </td>
                  )}
                  {isVisible("acciones") && (
                    <td className="px-2 py-1 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          className="sunmi-btn sunmi-btn-primary text-[11px] px-2 py-1"
                          onClick={() => onAjustar(p)}
                        >
                          Ajustar
                        </button>
                        <button
                          className="sunmi-btn sunmi-btn-secondary text-[11px] px-2 py-1"
                          onClick={() => onEditarLimites(p)}
                        >
                          Límites
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      {/* El paginador del kit reemplaza a los dos botones a mano: trae el "ir a
          página", los tamaños y el conteo, y se ve igual que en el resto del
          ERP. Sirve a las dos vistas, así que va fuera del par móvil/escritorio. */}
      <div className="mt-4">
        <SunmiPaginador
          page={page}
          totalPages={totalPages}
          totalItems={total}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onGoToPage={(n) => setPage(Math.min(Math.max(1, Number(n) || 1), totalPages))}
        />
      </div>
    </div>
  );
}
