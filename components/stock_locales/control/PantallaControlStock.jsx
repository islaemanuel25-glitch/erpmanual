"use client";

// components/stock_locales/control/PantallaControlStock.jsx
//
// LA PANTALLA DEL CONTROL DE STOCK, PRESENTACIONAL. Recibe lo que armó
// `useControlStock` y dibuja una de dos vistas:
//
//   · inicio. Sin control, "Empezar control" y el último terminado. Con control,
//     la pantalla de Stock Locales con un campo "Contado" en cada tarjeta: el
//     avance, el buscador (lector y nombre), los chips Todos / Sin contar /
//     Contados, la lista y, abajo, "Terminar control".
//   · terminar. Lo que nadie contó, partido en vendidos durante el control —que
//     no se tocan— y los que quedan en cero, con su confirmación.
//
// Se arma con el kit, con la tarjeta de Stock (`TarjetaStockMovil`, vía
// `TarjetaConteo`) y con las piezas de Finanzas y Tesorería en el celular —el
// encabezado, la tarjeta del número grande, el renglón y el botón—, no con unas
// parecidas al lado. Los colores son clases del tema.
//
// Los resúmenes cuentan PRODUCTOS, nunca suman unidades de productos distintos.

import { useRef, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import TarjetaConteo from "@/components/stock_locales/control/TarjetaConteo";
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
import { MS_MAX_ENTRE_TECLAS_ESCANER, esLecturaDeEscaner } from "@/lib/pos-ventas/lecturaEscaner";
import {
  FILTRO_CONTROL,
  VISTA_CONTROL,
  diaDelControl,
  momentoDelControl,
  porcentajeDeAvance,
  textoCantidad,
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
        <ControlAbierto c={c} control={control} puedeGestionar={puedeGestionar} />
      ) : (
        <SinControl c={c} puedeGestionar={puedeGestionar} />
      )}
    </div>
  );
}

function SinControl({ c, puedeGestionar }) {
  const ultimo = c.estado?.ultimo;
  return (
    <>
      {puedeGestionar && (
        <BotonTesoreria onClick={c.abrir} disabled={c.ocupado}>
          Empezar control
        </BotonTesoreria>
      )}
      {ultimo && (
        <Bloque titulo="ÚLTIMO CONTROL">
          <Renglon
            rotulo={momentoDelControl(ultimo.terminadoEn)}
            nota={ultimo.terminadoPorNombre ? `Lo cerró ${ultimo.terminadoPorNombre}` : null}
            valor={`${ultimo.puestosEnCero ?? 0} en 0`}
            valorLargo
          />
        </Bloque>
      )}
    </>
  );
}

function ControlAbierto({ c, control, puedeGestionar }) {
  const universo = control.contados + control.sinContar;
  const esDeposito = c.estado?.local?.es_deposito === true;
  const idFijado = c.fijado?.id ?? null;
  const items = c.lista.items.filter((i) => i.id !== idFijado);
  const tarjeta = (item, foco = 0) => (
    <TarjetaConteo
      key={item.id}
      item={item}
      esDeposito={esDeposito}
      onGuardar={c.guardarTotal}
      onEscanear={c.escanear}
      onListo={c.alBuscador}
      autoFoco={foco}
    />
  );
  return (
    <>
      <TarjetaHero franja={false}>
        <CifraHero rotulo={null} valor={control.contados} />
        <p className="text-sm2 sunmi-text-muted">{`contados de ${universo}`}</p>
        <BarraDeAvance pct={porcentajeDeAvance(control.contados, control.sinContar)} />
      </TarjetaHero>

      <Buscador c={c} />

      <SunmiChipsFiltro
        textoTodas="Todos"
        valor={c.filtro}
        onCambiar={c.setFiltro}
        opciones={[
          { clave: FILTRO_CONTROL.SIN_CONTAR, texto: `Sin contar · ${control.sinContar}` },
          { clave: FILTRO_CONTROL.CONTADOS, texto: `Contados · ${control.contados}` },
        ]}
      />

      {c.fijado ? <SunmiListaProductoCards>{tarjeta(c.fijado, c.foco)}</SunmiListaProductoCards> : null}

      {c.cargandoLista && items.length === 0 ? (
        <div className="py-6">
          <SunmiLoader />
        </div>
      ) : (
        <SunmiListaProductoCards>{items.map((i) => tarjeta(i))}</SunmiListaProductoCards>
      )}
      {!c.cargandoLista && c.lista.items.length === 0 && !c.fijado ? (
        <p className="text-sm2 sunmi-text-muted py-2">No hay productos con este filtro.</p>
      ) : null}

      <SunmiPaginador
        page={c.page}
        totalPages={c.lista.totalPages}
        totalItems={c.lista.total}
        onPrev={() => c.setPage((p) => Math.max(1, p - 1))}
        onNext={() => c.setPage((p) => Math.min(c.lista.totalPages, p + 1))}
        onGoToPage={(n) => c.setPage(Math.min(Math.max(1, Number(n) || 1), c.lista.totalPages))}
      />

      {puedeGestionar && (
        <BotonTesoreria tipo="secundario" onClick={c.irATerminar} disabled={c.ocupado}>
          Terminar control
        </BotonTesoreria>
      )}
    </>
  );
}

/**
 * EL BUSCADOR: el lector lleva a la tarjeta del producto, el texto filtra la
 * lista. El lector se reconoce con la regla de la caja: teclas muy seguidas y
 * un Enter (`esLecturaDeEscaner`).
 */
function Buscador({ c }) {
  const [texto, setTexto] = useState(c.q);
  const ultima = useRef(0);
  const rafaga = useRef("");

  const cambiar = (t) => {
    setTexto(t);
    c.buscar(t);
  };

  const alTeclear = (e) => {
    const ahora = Date.now();
    const ms = ahora - ultima.current;
    ultima.current = ahora;
    if (e.key === "Enter") {
      e.preventDefault();
      if (esLecturaDeEscaner(ms, rafaga.current)) {
        const codigo = rafaga.current;
        cambiar("");
        c.escanear(codigo);
      }
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
      inputRef={c.buscadorRef}
      id="buscar-control"
      placeholder="Escaneá o buscá un producto"
      ariaLabel="Escaneá o buscá un producto"
      value={texto}
      onChange={cambiar}
      onVoz={cambiar}
      onKeyDown={alTeclear}
      autoFocus
    />
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
