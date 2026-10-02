"use client";

// components/finanzas/ResumenDelPeriodoMovil.jsx
//
// EL RESUMEN ECONÓMICO DEL PERÍODO EN CELULAR: el diseño FINAL aprobado en
// Figma (archivo uptcbzbnV5M4q32kgmupF9, nodos 4-2 y 5-2).
//
// ── LA PREGUNTA PRIMERO, LA CUENTA DESPUÉS ───────────────────────────────
//
// Contesta "¿cómo le fue al negocio?" antes que nada: el Resultado del período
// es el protagonista —arriba, grande— y debajo va el recorrido que lo forma. El
// orden de lectura es Resultado → Cómo se forma → Cobros → Pago a depósito →
// Movimientos de caja → Actividad (ésta la pone el contenedor).
//
//   Ventas − CMV = Margen bruto − Gastos económicos − Comisiones de cobro
//   = Resultado del período.
//
// La fórmula no vive acá: todo lo arma `resumenDelPeriodo` en el servidor. Este
// archivo dibuja el `resumen` que recibe —el MISMO que recibe el escritorio— y
// solo DERIVA porcentajes para mostrarlos (`presentacionResumen.js`).
//
// ── EL PERÍODO NO SE REPITE ──────────────────────────────────────────────
//
// El navegador de arriba ya dice "Jueves 1 de octubre". El héroe no lo vuelve a
// escribir: dice el Resultado, el porcentaje sobre ventas y cuántas ventas.
//
// ── LOS PORCENTAJES, SOLO DONDE EXPLICAN ─────────────────────────────────
//
// "Sobre ventas" va únicamente en Margen bruto y en Resultado. En Cobros el
// porcentaje ES la composición del cobro. Se recalculan en cada render y con
// ventas en cero no se dibujan.
//
// ── ACLARACIONES: EL SIGNIFICADO SE QUEDA, EL RUIDO NO ───────────────────
//
// Sin pieza de Info en el kit, las aclaraciones que hacen falta para leer bien
// una cifra van como nota corta del renglón: Gastos (cuenta por su fecha, esté
// pagado o no) y Comisiones de cobro. Las que la estructura ya dice sola no se
// repiten: el Margen lo explica el recorrido y su porcentaje, y la comisión y
// el neto por medio están en sus propios renglones de Cobros.
//
// ── NI "GASTO" A UN RETIRO DE CAJA ───────────────────────────────────────
//
// El aviso de retiros aparece solo si hubo retiros manuales y dice que salió
// plata y que todavía no está clasificada. No la llama gasto, no la interpreta
// por su motivo y no la incorpora al Resultado.

import { formatearMoneda } from "@/lib/moneda";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import SunmiPill from "@/components/sunmi/SunmiPill";
import {
  avisoDeRetirosManuales,
  composicionDeCobros,
  formatearPorcentaje,
  hayRetirosManuales,
  porcentajeSobreVentas,
  resultadoEsNegativo,
  textoDeResultado,
} from "@/lib/finanzas/presentacionResumen";

import { Bloque, Metrica, PagoADeposito, Renglon } from "./PiezasDelResumen";

export default function ResumenDelPeriodoMovil({ resumen }) {
  if (!resumen) return null;

  const { cobros, caja } = resumen;
  const control = resumen.controlMargen || {};

  // Porcentajes DERIVADOS, no persistidos. `null` con ventas en cero.
  const resultadoPct = formatearPorcentaje(porcentajeSobreVentas(resumen.resultado, resumen.ventas));
  const margenPct = formatearPorcentaje(porcentajeSobreVentas(resumen.margenBruto, resumen.ventas));
  const negativo = resultadoEsNegativo(resumen.resultado);

  const cobrosComp = composicionDeCobros(cobros);

  return (
    <div className="space-y-3.5">
      {/* ── RESULTADO DEL PERÍODO · el protagonista ─────────────────────────
          La franja de arriba es decorativa: `sunmi-bg-accent` es el fondo en
          accent del tema, la misma clase que marca la franja de la tarjeta de
          local en Transferencias. */}
      <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-2">
        <span className="block h-1 w-9 rounded-full sunmi-bg-accent" aria-hidden="true" />
        <Metrica
          rotulo="Resultado del período"
          valor={textoDeResultado(resumen.resultado)}
          tono={negativo ? "danger" : "strong"}
          hero
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm2 sunmi-text-muted">
            {resumen.cantidadVentas === 1 ? "1 venta" : `${resumen.cantidadVentas} ventas`}
          </span>
          {resultadoPct && <SunmiPill color="amber">{resultadoPct} sobre ventas</SunmiPill>}
        </div>
        {resumen.comisionesPendientes && (
          <div className="text-xs2 sunmi-text-warning">
            Hay comisiones pendientes de determinar en este período. El resultado puede estar
            sobreestimado hasta que se calculen.
          </div>
        )}
      </section>

      {/* ── CÓMO SE FORMA · el recorrido vertical ─────────────────────────── */}
      <Bloque titulo="CÓMO SE FORMA">
        {/* Sin la cantidad de ventas acá: ya está arriba, junto al Resultado. */}
        <Renglon rotulo="Ventas" valor={formatearMoneda(resumen.ventas)} />
        <Renglon
          rotulo="Costo de mercadería vendida"
          valor={`− ${formatearMoneda(resumen.costoVendido)}`}
          atenuado
        />

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        <Renglon
          rotulo="Margen bruto"
          valor={formatearMoneda(resumen.margenBruto)}
          notaValor={margenPct ? `${margenPct} sobre ventas` : null}
          fuerte
        />
        {control.difiere && (
          <div className="text-xs2 sunmi-text-warning">
            El margen guardado en cada venta suma {formatearMoneda(control.sumaGananciaBrutaPersistida)}.
            La diferencia es el recargo por medio de pago, que el POS deja fuera del margen de
            mercadería.
          </div>
        )}

        <Renglon
          rotulo="Gastos"
          nota="Cuenta por la fecha del gasto, esté pagado o no."
          valor={`− ${formatearMoneda(resumen.gastos)}`}
          atenuado
        />
        {resumen.verGastos && (
          <div className="flex justify-end">
            <EnlaceAlModulo href={resumen.verGastos} texto="Ver gastos" />
          </div>
        )}
        <Renglon
          rotulo="Comisiones de cobro"
          nota="Lo que cobran los medios de pago."
          valor={`− ${formatearMoneda(resumen.comisionesDeCobro)}`}
          atenuado
        />

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        <Renglon
          rotulo="Resultado"
          valor={textoDeResultado(resumen.resultado)}
          notaValor={resultadoPct ? `${resultadoPct} sobre ventas` : null}
          notaValorColor="sunmi-text-accent"
          fuerte
        />
        {resumen.ventasSinCosto > 0 && (
          <div className="text-xs2 sunmi-text-warning">
            {resumen.ventasSinCosto === 1
              ? "Hay 1 venta con costo $0 en este período"
              : `Hay ${resumen.ventasSinCosto} ventas con costo $0 en este período`}
            ; el margen y el resultado pueden estar sobreestimados.
          </div>
        )}
      </Bloque>

      {/* ── CÓMO SE COBRÓ · composición ───────────────────────────────────── */}
      <Bloque titulo="COBROS">
        {cobrosComp.medios.length === 0 && (
          <div className="text-sm2 sunmi-text-muted">No hubo cobros en el período.</div>
        )}

        {cobrosComp.medios.map((m) => (
          <Renglon
            key={m.medio}
            rotulo={m.rotulo}
            // El fiado se marca: es una venta a cuenta corriente, no plata que
            // entró. El resto lleva su porcentaje de la composición del cobro.
            nota={
              !m.esCobro
                ? "A cuenta corriente: todavía no entró"
                : m.pct != null
                  ? formatearPorcentaje(m.pct, 0)
                  : null
            }
            valor={formatearMoneda(m.monto)}
            atenuado={!m.esCobro}
          />
        ))}

        {cobrosComp.medios.length > 0 && (
          <>
            <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
            <Renglon rotulo="Comisión" valor={`− ${formatearMoneda(cobros.comisiones)}`} atenuado />
            <Renglon rotulo="Neto recibido" valor={formatearMoneda(cobros.netoDigital)} atenuado />
          </>
        )}
      </Bloque>

      {/* ── PAGO A DEPÓSITO ───────────────────────────────────────────────
          Solo donde aplica: el depósito no se paga a sí mismo, y para él el
          bloque no existe —no se dibuja en cero—. */}
      {resumen.pagoADeposito?.aplica ? (
        <PagoADeposito pago={resumen.pagoADeposito} aclararQueNoResta />
      ) : null}

      {/* ── MOVIMIENTOS DE CAJA ───────────────────────────────────────────── */}
      <Bloque titulo="MOVIMIENTOS DE CAJA">
        <Renglon
          rotulo="Ingresos manuales"
          nota={
            caja?.cantidadIngresos
              ? `${caja.cantidadIngresos} ${caja.cantidadIngresos === 1 ? "movimiento" : "movimientos"}`
              : "Sin movimientos"
          }
          valor={formatearMoneda(caja?.ingresos)}
        />
        <Renglon
          rotulo="Retiros manuales"
          nota={
            caja?.cantidadRetiros
              ? `${caja.cantidadRetiros} ${caja.cantidadRetiros === 1 ? "movimiento" : "movimientos"}`
              : "Sin movimientos"
          }
          valor={formatearMoneda(caja?.retiros)}
        />
        {hayRetirosManuales(caja) && (
          <div className="text-xs2 sunmi-text-warning">{avisoDeRetirosManuales(caja)}</div>
        )}
        <Renglon
          rotulo="Recaudación retirada"
          nota="Es la venta que ya se contó, saliendo del cajón. No es un gasto."
          valor={formatearMoneda(caja?.retirosDeRecaudacion)}
          atenuado
        />
      </Bloque>
    </div>
  );
}
