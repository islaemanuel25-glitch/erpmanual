"use client";

// components/stock_locales/control/PantallaControlStock.jsx
//
// LA PANTALLA DEL CONTROL DE STOCK, PRESENTACIONAL. Recibe lo que armó
// `useControlStock` y dibuja una de tres vistas:
//
//   C0/C1 · inicio: sin control, "Empezar control" y el último terminado; con
//           control, el avance, quién está contando, "Contar" y "Terminar".
//   C2    · contar: el buscador del POS (lector y nombre), el escaneado con su
//           cantidad, y lo que contó esta persona, para corregir o borrar.
//   C3    · terminar: lo que nadie contó, partido en vendidos durante el control
//           —que no se tocan— y los que quedan en cero.
//
// Se arma con el kit y con las piezas que ya usan Finanzas y Tesorería en el
// celular —el encabezado, la tarjeta del número grande, el renglón, el bloque y
// el botón—, no con unas parecidas al lado. Los colores son clases del tema.
//
// Los resúmenes cuentan PRODUCTOS, nunca suman unidades de productos distintos.

import { useState } from "react";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
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
import {
  VISTA_CONTROL,
  haceCuanto,
  momentoDelControl,
  porcentajeDeAvance,
  textoCantidad,
  textoNumero,
} from "@/lib/stock/control/controlStock";

const RUTA_BUSCADOR = "/api/stock_locales/buscar-producto";

/** Cuántos de "Quedan en 0" se ven antes de "Ver los n". */
const PRIMEROS_EN_CERO = 8;

const productos = (n) => `${n} ${n === 1 ? "producto" : "productos"}`;

export default function PantallaControlStock({ c, puedeGestionar, puedeContar }) {
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

  if (c.vista === VISTA_CONTROL.CONTAR) return <VistaContar c={c} local={local} />;
  if (c.vista === VISTA_CONTROL.TERMINAR) return <VistaTerminar c={c} local={local} />;
  return <VistaInicio c={c} local={local} puedeGestionar={puedeGestionar} puedeContar={puedeContar} />;
}

function Aviso({ texto }) {
  return texto ? <AvisoDeEstado tono="danger">{texto}</AvisoDeEstado> : null;
}

// ── C0 / C1 · INICIO ───────────────────────────────────────────────────────

function VistaInicio({ c, local, puedeGestionar, puedeContar }) {
  const control = c.estado?.control;
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle etiqueta="STOCK · CONTROL" titulo="Control de stock" contexto={local} />
      <Aviso texto={c.aviso} />
      {control ? (
        <ControlAbierto c={c} control={control} puedeGestionar={puedeGestionar} puedeContar={puedeContar} />
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

function ControlAbierto({ c, control, puedeGestionar, puedeContar }) {
  const pct = porcentajeDeAvance(control.contados, control.sinContar);
  return (
    <>
      <TarjetaHero franja={false}>
        <CifraHero
          rotulo={`CONTROL ABIERTO · DESDE ${momentoDelControl(control.abiertoEn).toUpperCase()}`}
          valor={control.contados}
        />
        <p className="text-sm2 sunmi-text-muted">productos contados</p>
        <BarraDeAvance pct={pct} />
        <Renglon rotulo="Sin contar" valor={control.sinContar} />
      </TarjetaHero>

      {control.personas.length > 0 && (
        <Bloque titulo="QUIÉN ESTÁ CONTANDO">
          {control.personas.map((p) => (
            <Renglon key={p.clave} rotulo={p.nombre} nota={`último escaneo ${haceCuanto(p.ultimo)}`} valor={productos(p.productos)} />
          ))}
        </Bloque>
      )}

      {puedeContar && (
        <BotonTesoreria onClick={() => c.irAContar()} disabled={c.ocupado}>
          Contar
        </BotonTesoreria>
      )}
      {puedeGestionar && (
        <BotonTesoreria tipo="secundario" onClick={c.irATerminar} disabled={c.ocupado}>
          Terminar control
        </BotonTesoreria>
      )}
    </>
  );
}

// ── C2 · CONTAR ────────────────────────────────────────────────────────────

function VistaContar({ c, local }) {
  const quien = c.estado?.quien?.nombre;
  const control = c.estado?.control;
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle
        etiqueta="CONTROL DE STOCK · CONTAR"
        titulo="Contar"
        contexto={[local, quien ? `contando: ${quien}` : null].filter(Boolean).join(" · ")}
        onVolver={c.volverAlInicio}
      />
      <Aviso texto={c.aviso} />
      {!control ? null : (
        <>
          <BuscadorProductos
            key={c.vueltas}
            localId={c.estado?.local?.id}
            apiPath={RUTA_BUSCADOR}
            onAgregar={(p) => c.elegirProducto(p.productoLocalId)}
            wrapCard={false}
            mostrarStock={false}
            placeholder="Escaneá o buscá un producto"
          />
          {c.escaneado && <Escaneado c={c} />}
          <LoQueContaste c={c} />
        </>
      )}
    </div>
  );
}

function Escaneado({ c }) {
  const p = c.escaneado;
  const listo = c.cantidad !== "" && Number.isFinite(Number(c.cantidad));
  return (
    <Bloque titulo="ESCANEADO">
      <div className="space-y-0.5">
        <div className="text-base2 font-semibold sunmi-text-strong break-words">{p.nombre}</div>
        {p.codigoBarra ? <div className="text-sm2 sunmi-text-muted tabular-nums">{p.codigoBarra}</div> : null}
      </div>
      {p.aviso ? <AvisoDeEstado tono="warning">{p.aviso}</AvisoDeEstado> : null}
      <FilaCantidad
        valor={c.cantidad}
        onCambiar={c.setCantidad}
        admiteDecimales={p.admiteDecimales}
        unidad={p.unidad}
      />
      <BotonTesoreria onClick={c.guardar} disabled={!listo || c.ocupado}>
        {listo ? `Guardar ${textoCantidad(c.cantidad, p.unidadFisica)}` : "Guardar"}
      </BotonTesoreria>
    </Bloque>
  );
}

function FilaCantidad({ valor, onCambiar, admiteDecimales, unidad }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm3 sunmi-text-strong">Cantidad</span>
      <div className="flex items-center gap-2">
        <SunmiCampoCantidad
          valor={valor}
          onCambiar={onCambiar}
          etiqueta="Cantidad"
          minimo={0}
          paso={1}
          decimales={admiteDecimales ? 3 : 0}
          claseMarco="w-24"
          claseInput="text-lg2 font-semibold tabular-nums"
        />
        <span className="text-sm2 sunmi-text-muted">{unidad}</span>
      </div>
    </div>
  );
}

function LoQueContaste({ c }) {
  const mios = c.estado?.misConteos || [];
  if (mios.length === 0) return null;
  return (
    <Bloque titulo="LO QUE CONTASTE">
      <div className="space-y-1.5">
        {mios.map((m) =>
          c.editando?.id === m.id ? (
            <Edicion key={m.id} c={c} m={m} />
          ) : (
            <SunmiActionCard key={m.id} onClick={() => c.empezarAEditar(m)} aria-label={`Corregir ${m.nombre}`}>
              <div className="flex w-full items-baseline gap-2">
                <span className="flex-1 min-w-0 text-sm3 font-medium sunmi-text-strong break-words">{m.nombre}</span>
                <span className="shrink-0 text-sm3 font-semibold tabular-nums sunmi-text-strong">
                  {textoCantidad(m.cantidad, m.unidadFisica)}
                </span>
              </div>
              <div className="text-xs2 sunmi-text-muted">{haceCuanto(m.creadoEn)}</div>
            </SunmiActionCard>
          )
        )}
      </div>
    </Bloque>
  );
}

function Edicion({ c, m }) {
  const e = c.editando;
  const listo = e.cantidad !== "" && Number.isFinite(Number(e.cantidad));
  return (
    <div className="rounded-xl border sunmi-divider p-3 space-y-2.5">
      <div className="text-sm3 font-semibold sunmi-text-strong break-words">{m.nombre}</div>
      <FilaCantidad valor={e.cantidad} onCambiar={c.cambiarEdicion} admiteDecimales={e.admiteDecimales} unidad={e.unidad} />
      <BotonTesoreria onClick={() => c.corregir()} disabled={!listo || c.ocupado}>
        {listo ? `Corregir a ${textoCantidad(e.cantidad, m.unidadFisica)}` : "Corregir"}
      </BotonTesoreria>
      <BotonTesoreria tipo="peligro" onClick={() => c.corregir({ borrar: true })} disabled={c.ocupado}>
        Borrar conteo
      </BotonTesoreria>
      <BotonTesoreria tipo="fantasma" onClick={c.cancelarEdicion} disabled={c.ocupado}>
        Cancelar
      </BotonTesoreria>
    </div>
  );
}

// ── C3 · TERMINAR ──────────────────────────────────────────────────────────

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

      <BotonTesoreria onClick={c.confirmarTerminar} disabled={c.ocupado}>
        {`Poner ${t.aCero.length} en 0 y terminar`}
      </BotonTesoreria>
    </>
  );
}
