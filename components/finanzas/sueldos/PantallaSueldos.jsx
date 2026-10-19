"use client";

// components/finanzas/sueldos/PantallaSueldos.jsx
//
// FINANZAS → SUELDOS, PRESENTACIONAL. Recibe lo que contestó
// `GET /api/finanzas/sueldos` y lo dibuja; no suma plata —los totales vienen
// armados de `resumenDeSueldos`— y no escribe: pagar y asignar los hacen sus
// piezas, y después la pantalla vuelve a leer.
//
// Cuatro vistas, en la URL (`ctx.vista`):
//   · Resumen ......... PAGADO EN EL PERÍODO, EMPLEADOS y "Pagar sueldo".
//   · Empleado ........ el historial de uno en el período, con su total.
//   · Sin empleado .... los sueldos viejos sin empleado, con "Asignar empleado".
//   · Pagar ........... `FormularioPagarSueldo`.
//
// Móvil primero, con las piezas que ya usa Finanzas en el celular —`Bloque` y
// `Renglon` del Resumen, la tarjeta y el botón de Tesorería— y el selector de
// período estándar. Ningún color ni tamaño escrito a mano.

import { useState } from "react";

import SelectorDePeriodo from "@/components/periodo/SelectorDePeriodo";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { Bloque, Renglon } from "@/components/finanzas/PiezasDelResumen";
import { BotonTesoreria, CifraHero, EncabezadoDeDetalle, TarjetaHero } from "@/components/tesoreria/PiezasTesoreria";
import { formatearMoneda } from "@/lib/moneda";
import { VISTA_SUELDOS } from "@/lib/finanzas/contextoSueldos";
import { diaYMes, textoDePagosDelEmpleado } from "@/lib/finanzas/sueldos";

import FormularioPagarSueldo from "./FormularioPagarSueldo";
import HojaAsignarEmpleado from "./HojaAsignarEmpleado";
import { RenglonTocable, TarjetaDePagos } from "./PiezasSueldos";

export const ROTULO_SIN_EMPLEADO = "Sin empleado asignado";

export default function PantallaSueldos({
  datos,
  cargando = false,
  error = "",
  ctx,
  faltaRango = false,
  hoy,
  onCambiarUnidad,
  onElegirRango,
  onAtras,
  onAdelante,
  onReintentar,
  onIr,
  onVolver,
  onRecargar,
}) {
  const local = datos?.local?.nombre || "";
  const periodo = datos?.periodo?.descripcion?.titulo || "";

  const selector = (
    <SelectorDePeriodo
      datos={datos}
      ctx={ctx}
      hoy={hoy}
      onCambiarUnidad={onCambiarUnidad}
      onElegirRango={onElegirRango}
      onAtras={onAtras}
      onAdelante={onAdelante}
    />
  );
  const estado = (
    <>
      {faltaRango && (
        <SunmiAviso tono="neutral" titulo="Elegí el período">
          Con «Otro» elegí desde y hasta para ver los sueldos de esas fechas.
        </SunmiAviso>
      )}
      {cargando && !datos && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}
      {error && !cargando && (
        <div role="alert" className="rounded-xl border sunmi-border-danger px-4 py-3 space-y-2">
          <p className="text-sm2 sunmi-text-danger">{error}</p>
          {onReintentar ? (
            <SunmiButton color="slate" type="button" onClick={onReintentar} className="min-h-toque">
              Reintentar
            </SunmiButton>
          ) : null}
        </div>
      )}
    </>
  );
  const hay = Boolean(datos && !error);

  if (ctx.vista === VISTA_SUELDOS.PAGAR) {
    return (
      <div className="space-y-3.5">
        <EncabezadoDeDetalle titulo="Pagar sueldo" local={local} onVolver={onVolver} />
        {estado}
        {hay && (
          <FormularioPagarSueldo
            datos={datos}
            empleadoInicial={ctx.empleado}
            hoy={hoy}
            onPagado={() => {
              onRecargar?.();
              onVolver();
            }}
          />
        )}
      </div>
    );
  }

  if (ctx.vista === VISTA_SUELDOS.EMPLEADO) {
    const e = (datos?.empleados || []).find((x) => x.id === ctx.empleado) || null;
    return (
      <div className="space-y-3.5">
        <EncabezadoDeDetalle titulo={e?.nombre || "Empleado"} local={local} contexto={periodo} onVolver={onVolver} />
        {selector}
        {estado}
        {hay && !e && (
          <SunmiAviso tono="neutral" titulo="No está en la lista">
            Ese empleado no es de este local o está dado de baja y no cobró en el período.
          </SunmiAviso>
        )}
        {hay && e && (
          <>
            <TarjetaDePagos titulo={`${e.nombre.toUpperCase()} · ESTE PERÍODO`} pagos={e.pagos} total={e.total} />
            {datos.puedePagar && e.activo ? (
              <BotonTesoreria onClick={() => onIr({ vista: VISTA_SUELDOS.PAGAR, empleado: e.id })}>
                Pagar sueldo
              </BotonTesoreria>
            ) : null}
          </>
        )}
      </div>
    );
  }

  if (ctx.vista === VISTA_SUELDOS.SIN_EMPLEADO) {
    return (
      <div className="space-y-3.5">
        <EncabezadoDeDetalle titulo={ROTULO_SIN_EMPLEADO} local={local} contexto={periodo} onVolver={onVolver} />
        {selector}
        {estado}
        {hay && <SueldosSinEmpleado datos={datos} onRecargar={onRecargar} />}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <header className="space-y-0.5">
        <h1 className="text-lg2 font-semibold sunmi-text-strong">Sueldos</h1>
        {local ? <p className="text-sm2 sunmi-text-muted">{local}</p> : null}
      </header>
      {selector}
      {estado}
      {hay && <ResumenDeSueldos datos={datos} onIr={onIr} />}
    </div>
  );
}

function ResumenDeSueldos({ datos, onIr }) {
  const sin = datos.sinEmpleado;
  return (
    <>
      <TarjetaHero franja={false}>
        <CifraHero rotulo="PAGADO EN EL PERÍODO" valor={formatearMoneda(datos.total)} />
        <Renglon rotulo="Desde la caja" valor={formatearMoneda(datos.desdeLaCaja)} />
        <Renglon rotulo="Desde Finanzas" valor={formatearMoneda(datos.desdeFinanzas)} />
      </TarjetaHero>

      <Bloque titulo="EMPLEADOS">
        {datos.empleados.length === 0 && !sin ? (
          <p className="text-sm2 sunmi-text-muted">Este local no tiene empleados activos.</p>
        ) : null}
        {datos.empleados.map((e) => (
          <RenglonTocable
            key={e.id}
            titulo={e.activo ? e.nombre : `${e.nombre} (de baja)`}
            detalle={textoDePagosDelEmpleado(e)}
            valor={formatearMoneda(e.total)}
            etiqueta={`Ver los pagos de ${e.nombre}`}
            onClick={() => onIr({ vista: VISTA_SUELDOS.EMPLEADO, empleado: e.id })}
          />
        ))}
        {sin ? (
          <RenglonTocable
            titulo={ROTULO_SIN_EMPLEADO}
            detalle={`${sin.sueldos.length} ${sin.sueldos.length === 1 ? "sueldo" : "sueldos"} para completar`}
            valor={formatearMoneda(sin.total)}
            etiqueta="Ver los sueldos sin empleado asignado"
            onClick={() => onIr({ vista: VISTA_SUELDOS.SIN_EMPLEADO })}
          />
        ) : null}
      </Bloque>

      {datos.puedePagar ? (
        <BotonTesoreria onClick={() => onIr({ vista: VISTA_SUELDOS.PAGAR })}>Pagar sueldo</BotonTesoreria>
      ) : null}
    </>
  );
}

/** Los sueldos viejos sin empleado, cada uno con "Asignar empleado". */
function SueldosSinEmpleado({ datos, onRecargar }) {
  const [asignando, setAsignando] = useState(null);
  const sueldos = datos.sinEmpleado?.sueldos || [];
  return (
    <>
      {sueldos.length === 0 ? (
        <SunmiAviso tono="success" titulo="No queda ninguno">
          Todos los sueldos del período tienen su empleado.
        </SunmiAviso>
      ) : (
        <Bloque titulo={`SIN EMPLEADO · ${sueldos.length}`}>
          {sueldos.map((s) => (
            <div key={s.id} className="space-y-2">
              <Renglon
                rotulo={`${diaYMes(s.fecha)} · ${s.concepto}`}
                nota={s.beneficiario ? `A nombre de: ${s.beneficiario}` : null}
                valor={formatearMoneda(s.total)}
              />
              {datos.puedePagar ? (
                <BotonTesoreria tipo="secundario" onClick={() => setAsignando(s)}>
                  Asignar empleado
                </BotonTesoreria>
              ) : null}
            </div>
          ))}
        </Bloque>
      )}
      <HojaAsignarEmpleado
        sueldo={asignando}
        empleados={datos.empleados.filter((e) => e.activo)}
        onCerrar={() => setAsignando(null)}
        onAsignado={() => {
          setAsignando(null);
          onRecargar?.();
        }}
      />
    </>
  );
}
