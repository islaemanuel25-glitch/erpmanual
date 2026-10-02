"use client";

// components/finanzas/ResumenDelPeriodoEscritorio.jsx
//
// EL RESUMEN DEL PERÍODO EN ESCRITORIO: LA PRESENTACIÓN DE ANTES, CONSERVADA.
//
// El Figma aprobado es SOLO de celular. Escritorio todavía no tiene diseño, y
// la decisión fue no extenderle el de celular: conserva lo que dibujaba en
// `3feaf1c` —el commit sobre el que se hizo la tanda mobile—. Este cuerpo es
// ése, sin cambios; las piezas que comparte con el celular están en
// `PiezasDelResumen.jsx` y con sus props por defecto dibujan el mismo nodo de
// antes. El candado de escritorio lo compara contra el render de la base.
//
// Si algún día escritorio se diseña, se cambia acá —y se regenera el golden de
// ese candado diciendo por qué—, no "de paso" desde el celular.
//
// La fórmula no vive acá: Ventas − CMV = Margen; Margen − Gastos − Comisiones =
// Resultado, todo armado por `resumenDelPeriodo` en el servidor. Este archivo
// solo dibuja el `resumen` que recibe.

import { formatearMoneda } from "@/lib/moneda";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";

import { Bloque, Metrica, PagoADeposito, Renglon } from "./PiezasDelResumen";

/**
 * UNA MÉTRICA QUE TODAVÍA NO SE PUEDE CALCULAR.
 *
 * La frase va DEBAJO del rótulo, a ancho completo: una raya en la columna de
 * los importes se confunde con un cero o con un dato que no se pudo traer. Lo
 * que tiene que quedar claro es que el sistema no lo sabe, no que valga cero.
 */
function NoDisponible({ rotulo, motivo }) {
  return (
    <div className="min-w-0">
      <div className="text-sm3 sunmi-text-muted">{rotulo}</div>
      <div className="text-sm3 font-medium sunmi-text-muted">Todavía no disponible</div>
      <div className="text-xs2 sunmi-text-muted">{motivo}</div>
    </div>
  );
}

export default function ResumenDelPeriodoEscritorio({ resumen, descripcion }) {
  if (!resumen) return null;

  const { cobros, caja } = resumen;
  const control = resumen.controlMargen || {};

  return (
    <div className="space-y-3.5">
      {/* ── VENTAS, COSTO Y MARGEN ────────────────────────────────────────
          Los tres juntos y en este orden porque el tercero es la resta de los
          dos de arriba: puestos así, quien mira puede comprobar el número.
          Es la razón por la que el margen sale de la resta y no del campo
          `gananciaBruta`, que al crear la venta excluye el recargo de pago.
          Cuando los dos difieren se dice, abajo, en vez de esconderlo. */}
      <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
        <Metrica
          rotulo="Ventas"
          valor={formatearMoneda(resumen.ventas)}
          detalle={
            descripcion
              ? `${descripcion.titulo}${descripcion.subtitulo ? ` · ${descripcion.subtitulo}` : ""}`
              : null
          }
        />

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        <Renglon
          rotulo="Costo de la mercadería vendida"
          valor={`− ${formatearMoneda(resumen.costoVendido)}`}
        />
        <Renglon
          rotulo="Margen bruto"
          nota="Ventas menos el costo de lo vendido."
          valor={formatearMoneda(resumen.margenBruto)}
        />

        {control.difiere && (
          <div className="text-xs2 sunmi-text-warning">
            El margen guardado en cada venta suma {formatearMoneda(control.sumaGananciaBrutaPersistida)}.
            La diferencia es el recargo por medio de pago, que el POS deja fuera del margen de
            mercadería.
          </div>
        )}

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        {/* ── GASTOS Y COMISIONES, LOS DOS QUE BAJAN DEL MARGEN ──────────────
            Gastos por fecha económica (impagos incluidos); "Ver gastos" abre el
            MISMO conjunto en el módulo. Comisiones son las de Cobros, el mismo
            número que se muestra abajo. */}
        <Renglon
          rotulo="Gastos"
          nota="Del período por su fecha, estén pagados o no."
          valor={`− ${formatearMoneda(resumen.gastos)}`}
        />
        {resumen.verGastos && (
          <div className="flex justify-end">
            <EnlaceAlModulo href={resumen.verGastos} texto="Ver gastos" />
          </div>
        )}
        <Renglon
          rotulo="Comisiones de cobro"
          nota="Lo que cobran los medios por cobrar una venta."
          valor={`− ${formatearMoneda(resumen.comisionesDeCobro)}`}
        />

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        <Metrica rotulo="Resultado del período" valor={formatearMoneda(resumen.resultado)} />

        {/* Advertencias: el Resultado se muestra igual; estas dicen cuándo puede
            estar sobre/subestimado, sin estimar ni esconder nada. */}
        {resumen.comisionesPendientes && (
          <div className="text-xs2 sunmi-text-warning">
            Hay comisiones pendientes de determinar en este período. El resultado puede estar
            sobreestimado hasta que se calculen.
          </div>
        )}
        {resumen.ventasSinCosto > 0 && (
          <div className="text-xs2 sunmi-text-warning">
            {resumen.ventasSinCosto === 1
              ? "Hay 1 venta con costo $0 en este período"
              : `Hay ${resumen.ventasSinCosto} ventas con costo $0 en este período`}
            ; el margen y el resultado pueden estar sobreestimados.
          </div>
        )}

        <div className="text-xs2 sunmi-text-muted">
          {resumen.cantidadVentas === 1
            ? "1 venta en el período"
            : `${resumen.cantidadVentas} ventas en el período`}
        </div>
      </section>

      {/* ── LO QUE TODAVÍA NO SE PUEDE CALCULAR ───────────────────────────
          Con su motivo. No en cero. */}
      <Bloque titulo="TODAVÍA NO DISPONIBLE">
        {(resumen.noDisponible || []).map((m) => (
          <NoDisponible key={m.clave} rotulo={m.rotulo} motivo={m.motivo} />
        ))}
      </Bloque>

      {/* ── CÓMO SE COBRÓ ─────────────────────────────────────────────────── */}
      <Bloque titulo="COBROS">
        {(cobros?.medios || []).length === 0 && (
          <div className="text-sm2 sunmi-text-muted">No hubo cobros en el período.</div>
        )}

        {(cobros?.medios || []).map((m) => (
          <Renglon
            key={m.medio}
            rotulo={m.rotulo}
            // El fiado se marca: es una venta a cuenta corriente, no plata que
            // entró. Sin la nota, el renglón se lee como un cobro más.
            nota={
              !m.esCobro
                ? "A cuenta corriente: todavía no entró"
                : m.comision > 0
                  ? `Comisión ${formatearMoneda(m.comision)} · neto ${formatearMoneda(m.neto)}`
                  : null
            }
            valor={formatearMoneda(m.monto)}
            atenuado={!m.esCobro}
          />
        ))}

        {(cobros?.medios || []).length > 0 && (
          <>
            <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
            <Renglon rotulo="Comisiones" valor={formatearMoneda(cobros.comisiones)} atenuado />
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
        <Renglon
          rotulo="Retiros de recaudación"
          nota="Es la venta que ya se contó, saliendo del cajón. No es un gasto."
          valor={formatearMoneda(caja?.retirosDeRecaudacion)}
          atenuado
        />
        <div className="text-xs2 sunmi-text-muted">
          Un retiro dice que salió plata del cajón y con qué motivo se escribió. El sistema no
          registra en qué se usó.
        </div>
      </Bloque>
    </div>
  );
}
