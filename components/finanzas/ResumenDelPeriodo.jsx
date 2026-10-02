"use client";

// components/finanzas/ResumenDelPeriodo.jsx
//
// EL RESUMEN ECONÓMICO DEL PERÍODO, EN MOBILE.
//
// ── LA PREGUNTA PRIMERO, LA CUENTA DESPUÉS ───────────────────────────────
//
// La pantalla contesta "¿cómo le fue al negocio?" antes que nada: el Resultado
// del período es el protagonista —arriba, grande— y debajo va el recorrido que
// lo forma. El orden de lectura es Resultado → Cómo se forma → Cobros → Pago a
// depósito → Movimientos de caja → Actividad (ésta la pone el contenedor).
//
//   Ventas − CMV = Margen bruto − Gastos económicos − Comisiones de cobro
//   = Resultado del período.
//
// Es el nombre exacto —"Resultado del período", no "ganancia real"— porque
// todavía NO incorpora impuestos ni el circuito completo del dinero. Nada de
// esto resta pagos a proveedores, pago a depósito, retiros ni recaudación: eso
// es movimiento de dinero, no costo económico (el costo de la mercadería
// vendida ya está en el CMV).
//
// ── LOS PORCENTAJES, SOLO DONDE EXPLICAN ─────────────────────────────────
//
// "Sobre ventas" va únicamente en Margen bruto y en Resultado —las dos etapas
// que dicen qué proporción de lo vendido quedó—. En Ventas, CMV, Gastos y
// Comisiones no hay porcentaje: cargarían la pantalla sin agregar lectura. En
// Cobros sí, porque ahí el porcentaje ES la composición del cobro. Todos se
// DERIVAN en el render (`parte / ventas * 100`), no se persisten, y con ventas
// en cero no se dibujan —ver `presentacionResumen.js`—.
//
// ── NI "GASTO" A UN RETIRO DE CAJA ───────────────────────────────────────
//
// Un retiro es plata que salió del cajón. El aviso aparece solo si hubo retiros
// y dice exactamente eso: que salió y que todavía no está clasificada. No la
// llama gasto, no la interpreta por su motivo y no la incorpora al Resultado.
// La recaudación retirada ni siquiera sale del negocio —es la venta que ya se
// contó, cambiando de lugar—, por eso va atenuada y con su nota.
//
// ── EL PAGO A DEPÓSITO ES UN NÚMERO DE TRANSFERENCIAS ────────────────────
//
// Lo que el local recibió del depósito y confirmó en el período. Viaja armado
// desde el servidor —`resumen.pagoADeposito`— y acá solo se dibuja: ni se suma
// ni se resta de nada. El pendiente va atenuado y con su nota: no es plata que
// ya se descontó.

import { formatearMoneda } from "@/lib/moneda";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import SunmiPill from "@/components/sunmi/SunmiPill";
import {
  NOTA_PENDIENTES,
  NOTA_RECONOCIMIENTO,
  ROTULO_PAGO_A_DEPOSITO,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";
import {
  avisoDeRetirosManuales,
  composicionDeCobros,
  formatearPorcentaje,
  hayRetirosManuales,
  porcentajeSobreVentas,
  resultadoEsNegativo,
  textoDeResultado,
} from "@/lib/finanzas/presentacionResumen";

/** El número grande de un bloque. `hero` lo lleva a tamaño protagonista y
 *  `tono` tiñe el valor —danger para un resultado negativo—. */
function Metrica({ rotulo, valor, detalle = null, hero = false, tono = "strong" }) {
  const colorValor =
    tono === "danger" ? "sunmi-text-danger" : tono === "muted" ? "sunmi-text-muted" : "sunmi-text-strong";
  return (
    <div className="min-w-0">
      <div className="text-xs sunmi-text-muted">{rotulo}</div>
      <div className={`${hero ? "text-xl3" : "text-xl2"} font-semibold tabular-nums ${colorValor}`}>{valor}</div>
      {detalle ? <div className="text-sm2 sunmi-text-muted">{detalle}</div> : null}
    </div>
  );
}

/**
 * Un renglón rótulo/importe. `nota` va debajo del rótulo (izquierda);
 * `notaValor` va debajo del importe (derecha) y es lo que lleva el "% sobre
 * ventas" de Margen y Resultado sin empujar el número. `fuerte` resalta la
 * etapa (Margen, Resultado) y `atenuado` baja el tono de las restas.
 */
function Renglon({
  rotulo,
  valor,
  nota = null,
  notaValor = null,
  notaValorColor = "sunmi-text-muted",
  atenuado = false,
  fuerte = false,
}) {
  const tono = atenuado ? "sunmi-text-muted" : "sunmi-text-strong";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className={`text-sm3 ${fuerte ? "font-semibold" : ""} ${tono}`}>{rotulo}</div>
        {nota ? <div className="text-xs2 sunmi-text-muted">{nota}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-sm3 ${fuerte ? "font-semibold" : "font-medium"} tabular-nums ${tono}`}>{valor}</div>
        {notaValor ? <div className={`text-xs2 ${notaValorColor}`}>{notaValor}</div> : null}
      </div>
    </div>
  );
}

/**
 * EL PAGO A DEPÓSITO DEL PERÍODO, con las pendientes de recepción aparte.
 *
 * El importe es lo recibido y confirmado; las pendientes se informan con el
 * renglón atenuado —el mismo trato que el fiado en Cobros— para que no se lean
 * como plata que ya salió. Y se deja escrito, discreto, que esto no resta del
 * Resultado: es informativo.
 */
function PagoADeposito({ pago }) {
  const pendientes = pago.pendientes || { total: 0, cantidadTransferencias: 0 };
  const hayPendientes = Number(pendientes.cantidadTransferencias || 0) > 0;
  return (
    <Bloque titulo="PAGO A DEPÓSITO">
      <Renglon
        rotulo={ROTULO_PAGO_A_DEPOSITO}
        nota={`${rotuloDeTransferencias(pago.cantidadTransferencias)} recibidas en el período`}
        valor={formatearMoneda(pago.total)}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-xs2 sunmi-text-muted">{NOTA_RECONOCIMIENTO}</div>
        {pago.verDetalle ? <EnlaceAlModulo href={pago.verDetalle} texto="Ver" /> : null}
      </div>

      <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

      <Renglon
        rotulo={ROTULO_PENDIENTE_DE_RECEPCION}
        nota={
          hayPendientes
            ? `${rotuloDeTransferencias(pendientes.cantidadTransferencias)} · ${NOTA_PENDIENTES}`
            : "Ninguna sin confirmar."
        }
        valor={formatearMoneda(pendientes.total)}
        atenuado
      />
      <div className="text-xs2 sunmi-text-muted">No resta del resultado.</div>
    </Bloque>
  );
}

function Bloque({ titulo, children }) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">{titulo}</h2>
      {children}
    </section>
  );
}

export default function ResumenDelPeriodo({ resumen, descripcion }) {
  if (!resumen) return null;

  const { cobros, caja } = resumen;
  const control = resumen.controlMargen || {};

  // Porcentajes DERIVADOS, no persistidos. `null` con ventas en cero.
  const resultadoPct = formatearPorcentaje(porcentajeSobreVentas(resumen.resultado, resumen.ventas));
  const margenPct = formatearPorcentaje(porcentajeSobreVentas(resumen.margenBruto, resumen.ventas));
  const negativo = resultadoEsNegativo(resumen.resultado);

  const descripcionTexto = descripcion
    ? `${descripcion.titulo}${descripcion.subtitulo ? ` · ${descripcion.subtitulo}` : ""}`
    : null;

  const cobrosComp = composicionDeCobros(cobros);

  return (
    <div className="space-y-3.5">
      {/* ── RESULTADO DEL PERÍODO · el protagonista ───────────────────────── */}
      <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-2">
        <Metrica
          rotulo="Resultado del período"
          valor={textoDeResultado(resumen.resultado)}
          tono={negativo ? "danger" : "strong"}
          hero
          detalle={descripcionTexto}
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

        <Renglon rotulo="Gastos" valor={`− ${formatearMoneda(resumen.gastos)}`} atenuado />
        {resumen.verGastos && (
          <div className="flex justify-end">
            <EnlaceAlModulo href={resumen.verGastos} texto="Ver gastos" />
          </div>
        )}
        <Renglon
          rotulo="Comisiones de cobro"
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
      {resumen.pagoADeposito?.aplica ? <PagoADeposito pago={resumen.pagoADeposito} /> : null}

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
