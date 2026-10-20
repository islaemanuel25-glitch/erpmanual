"use client";

// components/stock_locales/control/PantallaControlStock.jsx
//
// LA PANTALLA DEL CONTROL DE STOCK, PRESENTACIONAL. Recibe lo que armó
// `useControlStock` y dibuja una de tres vistas:
//
//   · inicio. Sin control, "Empezar control" y el historial de terminados, cada
//     uno con sus diferencias. Con control, la pantalla de Stock Locales con un
//     campo "Contado" en cada tarjeta: el avance, el MISMO `FiltrosStock`, los
//     chips Todos / Sin contar / Contados / Con diferencia, la lista y, abajo,
//     "Ver diferencias" y "Terminar control".
//   · terminar. Lo que nadie contó, partido en vendidos durante el control —que
//     no se tocan— y los que quedan en cero, con su confirmación.
//   · diferencias. Qué productos estaban mal, por cuánto y cuánta plata es.
//
// Se arma con el kit, con la tarjeta de Stock (`TarjetaStockMovil`, vía
// `TarjetaConteo`) y con las piezas de Finanzas y Tesorería en el celular —el
// encabezado, la tarjeta del número grande, el renglón y el botón—, no con unas
// parecidas al lado. Los colores son clases del tema.
//
// Los resúmenes cuentan PRODUCTOS, nunca suman unidades de productos distintos.
// La plata sí se suma: es lo único que tiene la misma unidad en todos.

import { useCallback, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import FiltrosStock from "@/components/stock_locales/FiltrosStock";
import TarjetaConteo, { CLASE_TONO } from "@/components/stock_locales/control/TarjetaConteo";
import {
  AvisoDeEstado,
  BarraDeAvance,
  Bloque,
  BotonTesoreria,
  CifraHero,
  EncabezadoDeDetalle,
  Renglon,
  TarjetaHero,
} from "@/components/tesoreria/PiezasTesoreria";
import { formatearMoneda } from "@/lib/moneda";
import {
  FILTRO_CONTROL,
  VISTA_CONTROL,
  diaDelControl,
  momentoDelControl,
  porcentajeDeAvance,
  textoCantidad,
  textoDeLaDiferencia,
  textoNumero,
} from "@/lib/stock/control/controlStock";

/** Cuántos de "Quedan en 0" se ven antes de "Ver los n". */
const PRIMEROS_EN_CERO = 8;

const productos = (n) => `${n} ${n === 1 ? "producto" : "productos"}`;

export default function PantallaControlStock({ c, puedeGestionar }) {
  if (c.cargando) {
    return (
      <div className="py-12">
        <SunmiLoader />
      </div>
    );
  }
  if (c.error && !c.estado) {
    return (
      <div className="space-y-3.5">
        <AvisoDeEstado tono="danger" accion={<BotonTesoreria tipo="secundario" onClick={c.recargar}>Reintentar</BotonTesoreria>}>
          {c.error}
        </AvisoDeEstado>
      </div>
    );
  }
  const local = c.estado?.local?.nombre || "";

  if (c.vista === VISTA_CONTROL.TERMINAR) return <VistaTerminar c={c} local={local} />;
  if (c.vista === VISTA_CONTROL.DIFERENCIAS) return <VistaDiferencias c={c} local={local} />;
  return <VistaInicio c={c} local={local} puedeGestionar={puedeGestionar} />;
}

function Aviso({ texto }) {
  return texto ? <AvisoDeEstado tono="danger">{texto}</AvisoDeEstado> : null;
}

// ── INICIO ─────────────────────────────────────────────────────────────────

function VistaInicio({ c, local, puedeGestionar }) {
  const control = c.estado?.control;
  const contexto = control ? `${local} · abierto desde ${diaDelControl(control.abiertoEn)}` : local;
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle etiqueta="STOCK · CONTROL" titulo="Control de stock" contexto={contexto} />
      <Aviso texto={c.aviso} />
      {control ? (
        <ControlAbierto c={c} puedeGestionar={puedeGestionar} />
      ) : (
        <SinControl c={c} puedeGestionar={puedeGestionar} />
      )}
    </div>
  );
}

function SinControl({ c, puedeGestionar }) {
  const historial = c.estado?.historial ?? [];
  return (
    <>
      {puedeGestionar && (
        <BotonTesoreria onClick={c.abrir} disabled={c.ocupado}>
          Empezar control
        </BotonTesoreria>
      )}
      {historial.length > 0 && (
        <Bloque titulo="CONTROLES TERMINADOS">
          {historial.map((h) => (
            <div key={h.id} className="space-y-1">
              <Renglon
                rotulo={momentoDelControl(h.terminadoEn)}
                nota={h.terminadoPorNombre ? `Lo cerró ${h.terminadoPorNombre}` : null}
                valor={`${h.puestosEnCero ?? 0} en 0`}
                valorLargo
              />
              <SunmiLinkButton onClick={() => c.verDiferencias(h.id)} className="text-sm2 font-medium">
                Ver diferencias ›
              </SunmiLinkButton>
            </div>
          ))}
        </Bloque>
      )}
    </>
  );
}

function ControlAbierto({ c, puedeGestionar }) {
  const n = c.contadores ?? { total: 0, contados: 0, sinContar: 0, conDiferencia: 0 };
  const esDeposito = c.estado?.local?.es_deposito === true;
  const idFijado = c.fijado?.id ?? null;
  const items = c.items.filter((i) => i.id !== idFijado);

  // El nombre del proveedor sale del catálogo que ya trae `FiltrosStock`, como
  // en Stock Locales: el listado solo manda `proveedorId`.
  const [proveedoresPorId, setProveedoresPorId] = useState({});
  const alCargarCatalogos = useCallback(({ proveedores }) => {
    const mapa = {};
    for (const p of proveedores || []) mapa[p.id] = p.nombre;
    setProveedoresPorId(mapa);
  }, []);

  // El foco va a la tarjeta que lo pidió: la del código leído o la del "Contar".
  const tarjeta = (item, foco = item.id === c.focoId ? c.foco : 0) => (
    <TarjetaConteo
      key={item.id}
      item={item}
      esDeposito={esDeposito}
      proveedorNombre={proveedoresPorId[item.proveedorId] ?? null}
      onGuardar={c.guardarTotal}
      onEscanear={c.escanearDesdeLaCantidad}
      onListo={c.alBuscador}
      autoFoco={foco}
    />
  );
  return (
    <>
      <TarjetaHero franja={false}>
        <CifraHero rotulo={null} valor={n.contados} />
        <p className="text-sm2 sunmi-text-muted">{`contados de ${n.total}`}</p>
        <BarraDeAvance pct={porcentajeDeAvance(n.contados, n.total - n.contados)} />
      </TarjetaHero>

      {puedeGestionar ? <StockQueNoCoincide c={c} /> : null}

      <div ref={c.buscadorRef} data-buscador-control="">
        <FiltrosStock
          compact
          localSeleccionado={c.estado?.local?.id ?? null}
          onFiltroChange={c.alCambiarFiltros}
          onReset={c.alLimpiar}
          onCatalogos={alCargarCatalogos}
          onEscanear={c.escanear}
          textoDesdeAfuera={c.textoParaBuscador}
        />
      </div>

      <SunmiChipsFiltro
        textoTodas={null}
        valor={c.chip}
        onCambiar={c.setChip}
        opciones={[
          { clave: FILTRO_CONTROL.TODOS, texto: "Todos" },
          { clave: FILTRO_CONTROL.SIN_CONTAR, texto: `Sin contar · ${n.sinContar}` },
          { clave: FILTRO_CONTROL.CONTADOS, texto: `Contados · ${n.contados}` },
          { clave: FILTRO_CONTROL.CON_DIFERENCIA, texto: `Con diferencia · ${n.conDiferencia}` },
        ]}
      />

      {c.errorLista ? <Aviso texto={c.errorLista} /> : null}

      {c.fijado ? <SunmiListaProductoCards>{tarjeta(c.fijado)}</SunmiListaProductoCards> : null}

      {c.cargandoLista && items.length === 0 ? (
        <div className="py-6">
          <SunmiLoader />
        </div>
      ) : (
        <SunmiListaProductoCards>{items.map((i) => tarjeta(i))}</SunmiListaProductoCards>
      )}
      {!c.cargandoLista && c.items.length === 0 && !c.fijado ? (
        <p className="text-sm2 sunmi-text-muted py-2">No hay productos con este filtro.</p>
      ) : null}

      <SunmiPaginador
        page={c.page}
        totalPages={c.totalPages}
        totalItems={c.totalItems}
        onPrev={() => c.setPage((p) => Math.max(1, p - 1))}
        onNext={() => c.setPage((p) => Math.min(c.totalPages, p + 1))}
        onGoToPage={(p) => c.setPage(Math.min(Math.max(1, Number(p) || 1), c.totalPages))}
      />

      <BotonTesoreria tipo="secundario" onClick={() => c.verDiferencias()} disabled={c.ocupado}>
        Ver diferencias
      </BotonTesoreria>
      {puedeGestionar && (
        <BotonTesoreria tipo="secundario" onClick={c.irATerminar} disabled={c.ocupado}>
          Terminar control
        </BotonTesoreria>
      )}
    </>
  );
}

/**
 * LOS CONTADOS CUYO STOCK NO ES LO CONTADO MÁS LO QUE PASÓ DESPUÉS. Lo arma el
 * servidor leyendo el Libro (`revisarControl`); "Corregir" lo deja en lo que
 * debería con un Ajuste por control. Sin ninguno, no se dibuja nada.
 */
export function StockQueNoCoincide({ c }) {
  const productos = (c.revision?.productos ?? []).filter((p) => p.corregir);
  if (productos.length === 0) return null;
  return (
    <section className="rounded-xl2 border sunmi-border-warning sunmi-state-warning-soft p-4 space-y-3">
      <h2 className="text-xs2 font-semibold tracking-wider sunmi-text-warning">EL STOCK NO COINCIDE CON LO CONTADO</h2>
      {productos.map((p) => (
        <div key={p.productoLocalId} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm3 font-medium sunmi-text-strong break-words">{p.nombre}</div>
            <div className="text-xs2 sunmi-text-muted tabular-nums">
              {`contado ${textoNumero(p.contado)} · después ${textoNumero(p.posteriores)} · debería ${textoCantidad(p.deberia, p.unidadFisica)} · hay ${textoCantidad(p.actual, p.unidadFisica)}`}
            </div>
            {p.filasDeOtroLocal?.length ? (
              <div className="text-xs2 sunmi-text-warning">{`Tiene ${p.filasDeOtroLocal.length === 1 ? "una fila" : `${p.filasDeOtroLocal.length} filas`} de stock de otro local`}</div>
            ) : null}
          </div>
          <SunmiButton color="secondary" type="button" onClick={() => c.corregirProducto(p.productoLocalId)} disabled={c.ocupado} className="shrink-0">
            Corregir
          </SunmiButton>
        </div>
      ))}
    </section>
  );
}

// ── TERMINAR ───────────────────────────────────────────────────────────────

function VistaTerminar({ c, local }) {
  const t = c.terminar;
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle etiqueta="CONTROL DE STOCK · TERMINAR" titulo="Terminar control" contexto={local} onVolver={c.volverAlInicio} />
      <Aviso texto={c.aviso} />
      {!t ? (
        <div className="py-12">
          <SunmiLoader />
        </div>
      ) : (
        <ListasDeTerminar c={c} t={t} />
      )}
    </div>
  );
}

function ListasDeTerminar({ c, t }) {
  const [todos, setTodos] = useState(false);
  // "Poner n en 0 y terminar" no ejecuta: abre la confirmación, y recién su
  // "Poner en 0" llama al servidor.
  const [confirmando, setConfirmando] = useState(false);
  const alConfirmar = async () => {
    await c.confirmarTerminar();
    setConfirmando(false);
  };
  const visibles = todos ? t.aCero : t.aCero.slice(0, PRIMEROS_EN_CERO);
  return (
    <>
      <TarjetaHero franja={false}>
        <CifraHero rotulo="NADIE LOS CONTÓ Y EL SISTEMA DICE QUE HAY" valor={t.vendidos.length + t.aCero.length} />
        <p className="text-sm2 sunmi-text-muted">productos</p>
        <Renglon rotulo="Quedan en 0" valor={t.aCero.length} />
        <Renglon rotulo="Se vendieron durante el control" valor={t.vendidos.length} colorValor="sunmi-text-warning" />
      </TarjetaHero>

      {t.vendidos.length > 0 && (
        <section className="rounded-xl2 border sunmi-border-warning sunmi-state-warning-soft p-4 space-y-3">
          <h2 className="text-xs2 font-semibold tracking-wider sunmi-text-warning">SE VENDIERON DURANTE EL CONTROL</h2>
          {t.vendidos.map((p) => (
            <div key={p.productoLocalId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm3 font-medium sunmi-text-strong break-words">{p.nombre}</div>
                <div className="text-xs2 sunmi-text-muted tabular-nums">
                  {`vendidas ${textoNumero(p.vendidas)} · sistema ${textoCantidad(p.stock, p.unidadFisica)}`}
                </div>
              </div>
              <SunmiButton color="secondary" type="button" onClick={() => c.irAContar(p.productoLocalId)} className="shrink-0">
                Contar
              </SunmiButton>
            </div>
          ))}
        </section>
      )}

      {t.aCero.length > 0 && (
        <Bloque titulo="QUEDAN EN 0">
          {visibles.map((p) => (
            <Renglon key={p.productoLocalId} rotulo={p.nombre} valor={`${textoCantidad(p.stock, p.unidadFisica)} → 0`} />
          ))}
          {!todos && t.aCero.length > PRIMEROS_EN_CERO && (
            <SunmiLinkButton onClick={() => setTodos(true)} className="self-start text-sm2 font-medium">
              {`Ver los ${t.aCero.length} ›`}
            </SunmiLinkButton>
          )}
        </Bloque>
      )}

      <BotonTesoreria onClick={() => setConfirmando(true)} disabled={c.ocupado}>
        {`Poner ${t.aCero.length} en 0 y terminar`}
      </BotonTesoreria>

      <ConfirmarTerminar
        abierto={confirmando}
        cantidad={t.aCero.length}
        ocupado={c.ocupado}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={alConfirmar}
      />
    </>
  );
}

/**
 * LA CONFIRMACIÓN DE TERMINAR: la hoja de confirmación del kit, que es
 * `SunmiModalLayout` con dos botones grandes. Cerrarla sin querer no pierde
 * nada —se vuelve a tocar el botón—, así que el velo cierra; mientras el
 * servidor procesa, la pieza apaga el velo y los dos botones, y "Poner en 0" no
 * se puede mandar dos veces. El texto del botón no cambia mientras procesa.
 */
export function ConfirmarTerminar({ abierto, cantidad, ocupado, onCancelar, onConfirmar }) {
  if (!abierto) return null;
  return (
    <SunmiHojaDeConfirmacion
      titulo="Terminar control"
      puntos={[`Vas a poner ${productos(cantidad)} en 0 y terminar el control`]}
      textoConfirmar="Poner en 0"
      textoTrabajando="Poner en 0"
      colorConfirmar="red"
      textoVolver="Cancelar"
      trabajando={ocupado}
      onConfirmar={onConfirmar}
      onVolver={onCancelar}
    />
  );
}

// ── DIFERENCIAS ────────────────────────────────────────────────────────────

function VistaDiferencias({ c, local }) {
  const d = c.diferencias;
  const control = d?.control;
  const contexto = !control
    ? local
    : d.congelado
      ? `${local} · terminado ${momentoDelControl(control.terminadoEn)}`
      : `${local} · abierto desde ${diaDelControl(control.abiertoEn)}, sin terminar`;
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle
        etiqueta="CONTROL DE STOCK · DIFERENCIAS"
        titulo="Diferencias del control"
        contexto={contexto}
        onVolver={c.volverAlInicio}
      />
      <Aviso texto={c.aviso} />
      {!d ? (
        c.aviso ? null : (
          <div className="py-12">
            <SunmiLoader />
          </div>
        )
      ) : (
        <InformeDeDiferencias d={d} />
      )}
    </div>
  );
}

/**
 * EL INFORME: la plata que falta y la que sobra, a costo, en grande; cuántos
 * productos dieron distinto; y la lista, primero los faltantes de más plata a
 * menos y después los sobrantes. Sin `costos.ver` el servidor no manda los
 * importes, y el informe queda con las cantidades.
 */
export function InformeDeDiferencias({ d }) {
  const filas = d.filas.filter((f) => Number(f.diferencia) !== 0);
  const t = d.totales;
  return (
    <>
      <TarjetaHero franja={false}>
        {d.conPlata ? (
          <div className="grid grid-cols-2 gap-3">
            <CifraHero rotulo="FALTANTE $" valor={formatearMoneda(t.faltante)} color="sunmi-text-danger" />
            <CifraHero rotulo="SOBRANTE $" valor={formatearMoneda(t.sobrante)} color="sunmi-text-warning" />
          </div>
        ) : null}
        <p className="text-sm2 sunmi-text-muted">{`${productos(t.productos)} con diferencia`}</p>
        {d.conPlata && t.sinCosto > 0 ? (
          <p className="text-xs2 sunmi-text-muted">{`${productos(t.sinCosto)} sin costo cargado: no suman plata.`}</p>
        ) : null}
        {!d.conPlata ? <p className="text-xs2 sunmi-text-muted">La plata la ve quien puede ver costos.</p> : null}
      </TarjetaHero>

      {filas.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted py-2">No hubo diferencias.</p>
      ) : (
        <Bloque titulo="PRODUCTOS CON DIFERENCIA">
          {filas.map((f) => {
            const dif = textoDeLaDiferencia(f.diferencia, f.unidadFisica);
            return (
              <Renglon
                key={f.productoLocalId}
                rotulo={f.nombre}
                nota={`Sistema ${textoNumero(f.sistema)} · Contado ${textoNumero(f.contado)}${f.puestoEnCero ? " · puesto en 0" : ""}`}
                valor={dif.texto}
                colorValor={CLASE_TONO[dif.tono]}
                notaValor={d.conPlata ? formatearMoneda(f.importe) : null}
              />
            );
          })}
        </Bloque>
      )}
    </>
  );
}
