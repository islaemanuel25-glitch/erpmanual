"use client";

// components/stock_locales/control/PantallaControlStock.jsx
//
// LA PANTALLA DEL CONTROL DE STOCK, PRESENTACIONAL. Recibe lo que armó
// `useControlStock` y dibuja una de tres vistas:
//
//   · inicio. Sin control, "Empezar control" y el historial de terminados, cada
//     uno con sus diferencias. Con control, armada como recibir una
//     transferencia: la cabecera con "Abierto" y, adentro, "Terminar control";
//     el buscador, los filtros Sin contar / Con diferencia / Contados / Todos,
//     la categoría y el listado de Stock con un campo "Contado" en cada tarjeta.
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

import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import TarjetaConteo, { CLASE_TONO } from "@/components/stock_locales/control/TarjetaConteo";
import { InsigniaEnCurso, InsigniaTerminada } from "@/components/transferencias/EstadoTransferenciaBadge";
// El texto del buscador y el del "⋯" son los de recibir una transferencia.
import { PLACEHOLDER_BUSCADOR, TITULO_MAS_ACCIONES } from "@/components/transferencias/RecepcionMovil";
import {
  AvisoDeEstado,
  Bloque,
  BotonTesoreria,
  CifraHero,
  EncabezadoDeDetalle,
  Renglon,
  TarjetaHero,
} from "@/components/tesoreria/PiezasTesoreria";
import { useAvisoAlSalir } from "@/hooks/useAvisoAlSalir";
import { formatearMoneda } from "@/lib/moneda";
import { MS_MAX_ENTRE_TECLAS_ESCANER, esLecturaDeEscaner } from "@/lib/pos-ventas/lecturaEscaner";
import {
  DECISION_NO_CONTADOS,
  FILTRO_CONTROL,
  VISTA_CONTROL,
  diaDelControl,
  textoQuedaronComoEstaban,
  momentoDelControl,
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

// El título "Control de stock" lo pone el shell (sale del ítem del menú): la
// pantalla no lo repite. Lo que decía su encabezado —el local y desde cuándo—
// está en la tarjeta de cabecera del control abierto.
function VistaInicio({ c, local, puedeGestionar }) {
  const control = c.estado?.control;
  if (control) return <ControlAbierto c={c} local={local} puedeGestionar={puedeGestionar} />;
  return (
    <div className="space-y-3.5">
      <Aviso texto={c.aviso} />
      <SinControl c={c} puedeGestionar={puedeGestionar} />
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

/** El aviso al querer salir con algo escrito sin aceptar. */
export const textoSinAceptar = (n) => `Tenés ${n} ${n === 1 ? "cantidad" : "cantidades"} sin aceptar`;

/**
 * EL CONTROL ABIERTO, ARMADO COMO RECIBIR UNA TRANSFERENCIA: la misma
 * `SunmiPantallaDeTrabajo` con las mismas piezas y en el mismo orden —la
 * tarjeta de cabecera con su chip y su "⋯", el buscador, los cuatro filtros en
 * dos filas y la categoría—. Sin la barra pegada abajo de recibir transferencia:
 * "Terminar control" va adentro de la cabecera. Las tarjetas de producto y su
 * fila de conteo son las de siempre.
 */
function ControlAbierto({ c, local, puedeGestionar }) {
  const n = c.contadores ?? { total: 0, contados: 0, sinContar: 0, conDiferencia: 0, categorias: [] };
  const control = c.estado?.control;
  const esDeposito = c.estado?.local?.es_deposito === true;
  const idFijado = c.fijado?.id ?? null;
  const items = c.items.filter((i) => i.id !== idFijado);
  const [masAcciones, setMasAcciones] = useState(false);

  // ── SALIR CON CANTIDADES SIN ACEPTAR ───────────────────────────────────
  //
  // Recargar o cerrar: el aviso del navegador. Volver o ir a otro módulo: la
  // hoja de confirmación. La lógica es la del editor de correcciones de venta,
  // que salió a `useAvisoAlSalir`.
  const [avisoSalida, setAvisoSalida] = useState(false);
  const { salir } = useAvisoAlSalir({
    activo: c.sinAceptar > 0,
    interceptarEnlaces: true,
    onIntento: () => setAvisoSalida(true),
  });

  // El foco va a la tarjeta que lo pidió: la del código leído o la del "Contar".
  const tarjeta = (item, foco = item.id === c.focoId ? c.foco : 0) => (
    <TarjetaConteo
      key={item.id}
      item={item}
      esDeposito={esDeposito}
      proveedorNombre={c.proveedoresPorId?.[item.proveedorId] ?? null}
      onGuardar={c.guardarTotal}
      onEscanear={c.escanearDesdeLaCantidad}
      onListo={c.alBuscador}
      autoFoco={foco}
      borrador={c.borradores?.[item.id]?.valores ?? null}
      onBorrador={c.anotarBorrador}
    />
  );

  const opcionesEstado = [
    { clave: FILTRO_CONTROL.SIN_CONTAR, texto: "Sin contar", cantidad: n.sinContar },
    { clave: FILTRO_CONTROL.CON_DIFERENCIA, texto: "Con diferencia", cantidad: n.conDiferencia },
    { clave: FILTRO_CONTROL.CONTADOS, texto: "Contados", cantidad: n.contados },
    { clave: FILTRO_CONTROL.TODOS, texto: "Todos", cantidad: n.total },
  ];

  return (
    <SunmiPantallaDeTrabajo
      idCategoria="categoria-control"
      contexto={
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold sunmi-text-strong truncate">Control de stock</span>
              <InsigniaEnCurso>Abierto</InsigniaEnCurso>
            </div>
            {puedeGestionar ? (
              <SunmiButton
                color="slate"
                onClick={() => setMasAcciones(true)}
                aria-label={TITULO_MAS_ACCIONES}
                aria-haspopup="dialog"
                className="shrink-0"
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </SunmiButton>
            ) : null}
          </div>
          <p className="text-sm2 sunmi-text-muted truncate">{`${local} · desde ${diaDelControl(control.abiertoEn)}`}</p>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">
                {n.contados} / {n.total}
              </span>{" "}
              contados
            </span>
            <span className={`text-sm2 ${n.sinContar > 0 ? "sunmi-text-accent" : "sunmi-text-success"}`}>
              {n.sinContar > 0 ? `${n.sinContar} sin contar` : "Nada sin contar"}
            </span>
          </div>
          {/* "Terminar control" dentro de la tarjeta, a todo su ancho: va con
              ella al scrollear, sin `fixed` ni `sticky`. */}
          {puedeGestionar ? (
            <SunmiButton color="amber" onClick={c.irATerminar} disabled={c.ocupado} className="w-full justify-center">
              Terminar control
            </SunmiButton>
          ) : null}
        </>
      }
      buscador={
        <div ref={c.buscadorRef} data-buscador-control="">
          <BuscadorDelControl c={c} />
        </div>
      }
      filtros={
        <SunmiFiltroEstado opciones={opcionesEstado} valor={c.chip} onCambiar={c.setChip} ariaLabel="Filtrar productos por estado" />
      }
      categoria={
        <SunmiSelectAdv
          id="categoria-control"
          value={c.categoria == null ? "" : String(c.categoria)}
          onChange={(v) => c.setCategoria(v === "" ? null : v)}
        >
          <option value="">Todas · {n.total}</option>
          {(n.categorias ?? []).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.nombre} · {cat.cantidad}
            </option>
          ))}
        </SunmiSelectAdv>
      }
      antesDeLista={
        <>
          <Aviso texto={c.aviso} />
          {puedeGestionar ? <StockQueNoCoincide c={c} /> : null}
          {c.errorLista ? <Aviso texto={c.errorLista} /> : null}
          {/* Lo escrito sin aceptar que la lista de ahora no muestra: sigue a la
              vista, con su "Aceptar", hasta que se acepte o se borre. */}
          {c.pendientesFuera?.length ? (
            <SunmiListaProductoCards>{c.pendientesFuera.map((i) => tarjeta(i))}</SunmiListaProductoCards>
          ) : null}
          {c.fijado ? <SunmiListaProductoCards>{tarjeta(c.fijado)}</SunmiListaProductoCards> : null}
        </>
      }
      lista={
        c.cargandoLista && items.length === 0 ? (
          <div className="py-6">
            <SunmiLoader />
          </div>
        ) : (
          <SunmiListaProductoCards>{items.map((i) => tarjeta(i))}</SunmiListaProductoCards>
        )
      }
      despuesDeLista={
        <>
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
        </>
      }
      // "Terminar control" en el lugar de "Confirmar": es lo que cierra el trabajo.
      // Sin `pieDePantalla`: la barra pegada abajo quedaba flotando a mitad de
      // pantalla y se movía con la barra del navegador. "Terminar control" va
      // en la tarjeta de cabecera.
      despuesDelPie={
        <>
          <SunmiModalLayout
            open={masAcciones}
            title={TITULO_MAS_ACCIONES}
            subtitle={`Control de stock · ${local}`}
            onClose={() => setMasAcciones(false)}
            z={NIVEL_MODAL_GLOBAL}
            forma="hoja"
            espacioCuerpo="gap-2"
          >
            <SunmiButton
              color="slate"
              className="w-full justify-center"
              onClick={() => {
                setMasAcciones(false);
                c.verDiferencias();
              }}
            >
              Ver diferencias
            </SunmiButton>
          </SunmiModalLayout>
          {avisoSalida ? (
            <SunmiHojaDeConfirmacion
              titulo="Cantidades sin aceptar"
              puntos={[textoSinAceptar(c.sinAceptar)]}
              textoConfirmar="Salir igual"
              textoTrabajando="Salir igual"
              colorConfirmar="red"
              textoVolver="Quedarme"
              trabajando={false}
              onConfirmar={() => {
                setAvisoSalida(false);
                salir();
              }}
              onVolver={() => setAvisoSalida(false)}
            />
          ) : null}
        </>
      }
    />
  );
}

/**
 * EL BUSCADOR, CON EL ASPECTO DEL DE TRANSFERENCIAS: `SunmiCampoBusquedaVoz`,
 * lupa, campo y micrófono. El lector se reconoce con la regla de la caja
 * (teclas muy seguidas y un Enter: `esLecturaDeEscaner`) y va como lectura; lo
 * tecleado se busca a los 300 ms.
 */
function BuscadorDelControl({ c }) {
  const ultima = useRef(0);
  const rafaga = useRef("");
  const alTeclear = (e) => {
    const ahora = Date.now();
    const ms = ahora - ultima.current;
    ultima.current = ahora;
    if (e.key === "Enter") {
      e.preventDefault();
      if (esLecturaDeEscaner(ms, rafaga.current)) c.escanear(rafaga.current);
      rafaga.current = "";
      return;
    }
    if (e.key.length === 1) {
      if (ms > MS_MAX_ENTRE_TECLAS_ESCANER) rafaga.current = "";
      rafaga.current += e.key;
    }
  };
  return (
    <SunmiCampoBusquedaVoz
      value={c.texto}
      onChange={c.setTexto}
      onVoz={c.setTexto}
      onKeyDown={alTeclear}
      placeholder={PLACEHOLDER_BUSCADOR}
      ariaLabel="Buscar producto del control"
    />
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
  // "Terminar control" no ejecuta: abre la confirmación, y recién ahí se elige
  // qué hacer con lo que nadie contó. Esa elección es la que viaja al servidor.
  const [confirmando, setConfirmando] = useState(false);
  const alConfirmar = async (decision) => {
    await c.confirmarTerminar(decision);
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
        Terminar control
      </BotonTesoreria>

      <ConfirmarTerminar
        abierto={confirmando}
        aCero={t.aCero.length}
        sinContar={t.aCero.length + t.vendidos.length}
        ocupado={c.ocupado}
        onCancelar={() => setConfirmando(false)}
        onDecidir={alConfirmar}
      />
    </>
  );
}

/**
 * LA CONFIRMACIÓN DE TERMINAR: la hoja de confirmación del kit, que es
 * `SunmiModalLayout` con sus botones grandes. Cerrarla sin querer no pierde
 * nada —se vuelve a tocar el botón—, así que el velo cierra; mientras el
 * servidor procesa, la pieza apaga el velo y los botones, y nada se puede
 * mandar dos veces. El texto de los botones no cambia mientras procesa.
 *
 * ── QUÉ HACER CON LO QUE NADIE CONTÓ SE ELIGE ACÁ, CADA VEZ ──────────────
 *
 * Antes terminar ponía en 0 todo lo no contado con stock, sin preguntar. Ahora,
 * si quedó algo así, la hoja lo dice y ofrece las dos salidas: "Poner n en 0 y
 * terminar" —lo de siempre; lo vendido durante el control no se toca— o
 * "Dejarlos como están y terminar", que no mueve ningún stock. Sin nada no
 * contado con stock, es la hoja de siempre: "Terminar" y "Cancelar".
 */
export function ConfirmarTerminar({ abierto, aCero, sinContar, ocupado, onCancelar, onDecidir }) {
  if (!abierto) return null;
  const enCero = () => onDecidir(DECISION_NO_CONTADOS.EN_CERO);
  const comoEstaban = () => onDecidir(DECISION_NO_CONTADOS.COMO_ESTABAN);
  if (sinContar === 0) {
    return (
      <SunmiHojaDeConfirmacion
        titulo="Terminar control"
        puntos={["Vas a terminar el control"]}
        textoConfirmar="Terminar"
        textoTrabajando="Terminar"
        colorConfirmar="amber"
        textoVolver="Cancelar"
        trabajando={ocupado}
        onConfirmar={enCero}
        onVolver={onCancelar}
      />
    );
  }
  const puntos = [
    `${sinContar === 1 ? "Quedó 1 producto" : `Quedaron ${sinContar} productos`} sin contar con stock distinto de 0`,
    ...(aCero < sinContar ? ["Los vendidos durante el control no se tocan"] : []),
  ];
  const textoEnCero = `Poner ${aCero} en 0 y terminar`;
  const textoComoEstaban = "Dejarlos como están y terminar";
  // Si todo lo no contado se vendió durante el control, no hay nada para poner
  // en 0: queda una sola salida.
  return aCero > 0 ? (
    <SunmiHojaDeConfirmacion
      titulo="Terminar control"
      puntos={puntos}
      textoConfirmar={textoEnCero}
      textoTrabajando={textoEnCero}
      colorConfirmar="red"
      textoAlternativa={textoComoEstaban}
      onAlternativa={comoEstaban}
      textoVolver="Cancelar"
      trabajando={ocupado}
      onConfirmar={enCero}
      onVolver={onCancelar}
    />
  ) : (
    <SunmiHojaDeConfirmacion
      titulo="Terminar control"
      puntos={puntos}
      textoConfirmar={textoComoEstaban}
      textoTrabajando={textoComoEstaban}
      colorConfirmar="amber"
      textoVolver="Cancelar"
      trabajando={ocupado}
      onConfirmar={comoEstaban}
      onVolver={onCancelar}
    />
  );
}

// ── DIFERENCIAS ────────────────────────────────────────────────────────────

/**
 * El shell ya dice "Control de stock": acá no va otro título. Va la MISMA
 * tarjeta de cabecera que el control abierto —la de recibir una transferencia—
 * con "Diferencias" y su chip, y el Volver en la fila del shell, como allá.
 * En escritorio el shell no tiene esa fila, y el mismo nodo se dibuja en la
 * tarjeta (`hidden md:block`, el corte de `LayoutBase`).
 */
function VistaDiferencias({ c, local }) {
  const d = c.diferencias;
  const control = d?.control;
  const volver = useAccionDePagina(() => <SunmiBackButton onVolver={c.volverAlInicio} />, [c.volverAlInicio]);
  return (
    <div className="space-y-3.5">
      <SunmiCard className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold sunmi-text-strong truncate">Diferencias</span>
            {!control ? null : d.congelado ? (
              <InsigniaTerminada>Terminado</InsigniaTerminada>
            ) : (
              <InsigniaEnCurso>Abierto</InsigniaEnCurso>
            )}
          </div>
          <div className="hidden md:block shrink-0">{volver}</div>
        </div>
        <p className="text-sm2 sunmi-text-muted truncate">
          {control ? `${local} · desde ${diaDelControl(control.abiertoEn)}` : local}
        </p>
      </SunmiCard>
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
  // Lo que se eligió al terminar queda en el control: si se dejaron como
  // estaban, no entran al informe y se dice arriba, siempre igual.
  const comoEstaban = d.control?.noContadosDecision === DECISION_NO_CONTADOS.COMO_ESTABAN;
  return (
    <>
      {comoEstaban ? (
        <AvisoDeEstado tono="warning">{textoQuedaronComoEstaban(d.control.noContadosComoEstaban ?? 0)}</AvisoDeEstado>
      ) : null}
      <TarjetaHero franja={false}>
        {/* Uno debajo del otro, cada uno en su renglón: lado a lado, con siete
            cifras, se pisaban y el segundo se salía de la tarjeta. */}
        {d.conPlata ? (
          <div className="space-y-1">
            <Renglon rotulo="Faltante" valor={formatearMoneda(t.faltante)} colorValor="sunmi-text-danger" valorGrande />
            <Renglon rotulo="Sobrante" valor={formatearMoneda(t.sobrante)} colorValor="sunmi-text-warning" valorGrande />
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
