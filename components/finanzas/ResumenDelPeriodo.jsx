"use client";

// components/finanzas/ResumenDelPeriodo.jsx
//
// LAS MÉTRICAS DEL PERÍODO, Y LAS QUE TODAVÍA NO EXISTEN.
//
// ── EL BLOQUE ECONÓMICO: VENTAS, CMV, MARGEN, GASTOS, COMISIONES, RESULTADO ─
//
// Responde cuánto generó económicamente el local en el período:
//
//   Ventas − CMV = Margen bruto − Gastos económicos − Comisiones de cobro
//   = Resultado del período.
//
// Es el nombre exacto —"Resultado del período", no "ganancia real"— porque
// todavía NO incorpora impuestos ni el circuito completo del dinero. Los gastos
// entran por su fecha ECONÓMICA (`Gasto.fecha`), estén pagados o no; las
// comisiones son las de Cobros, el mismo número, no una segunda suma. Nada de
// esto resta pagos a proveedores, pago a depósito, retiros ni recaudación: eso
// es movimiento de dinero, no costo económico, y va en el futuro bloque.
//
// ── LO QUE NO SE PUEDE CALCULAR NO SE DIBUJA EN CERO ─────────────────────
//
// Lo que el ERP todavía no sabe viaja en `resumen.noDisponible` con su motivo y
// se dibuja "Todavía no disponible", nunca en cero. Hoy queda ahí solo "Pagos a
// proveedores": se registran, pero no se suman al período, y además no van en el
// Resultado. El Resultado SÍ se muestra siempre; cuando puede estar sobre o
// subestimado —comisiones pendientes, ventas con costo cero— se avisa con el
// mismo patrón de advertencia que el margen, sin inventar un número.
//
// ── NI "GASTO" A UN RETIRO DE CAJA ───────────────────────────────────────
//
// Un retiro es plata que salió del cajón. Puede ser un pago a un proveedor, un
// adelanto o el cambio que alguien fue a buscar: acá se lee el motivo como
// texto libre y nada más. Un pago a proveedor en efectivo registrado en su
// submódulo también deja un RETIRO, y este resumen todavía no lo distingue de
// uno manual: queda para cuando los pagos se incorporen al período. Y los de recaudación ni siquiera salen del
// negocio —es la venta que ya se contó, cambiando de lugar—, por eso van en su
// propio renglón.

//
// ── EL PAGO A DEPÓSITO ES UN NÚMERO DE TRANSFERENCIAS ────────────────────
//
// Lo que el local recibió del depósito y confirmó en el período. Viaja armado
// desde el servidor —`resumen.pagoADeposito`— y acá solo se dibuja: ni se suma
// ni se resta de nada, porque todavía no hay un "resto" que calcular con un
// solo uso. Las pendientes van atenuadas y con su nota: no son plata que ya se
// descontó. El detalle es de Transferencias, y se abre con "Ver" solo si quien
// mira puede entrar ahí.

import { formatearMoneda } from "@/lib/moneda";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import {
  NOTA_PENDIENTES,
  NOTA_RECONOCIMIENTO,
  ROTULO_PAGO_A_DEPOSITO,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";

/** El número grande del bloque principal. */
function Metrica({ rotulo, valor, detalle = null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs sunmi-text-muted">{rotulo}</div>
      <div className="text-xl2 font-semibold tabular-nums sunmi-text-strong">{valor}</div>
      {detalle ? <div className="text-sm2 sunmi-text-muted">{detalle}</div> : null}
    </div>
  );
}

/** Un renglón de los que van en columna, con su rótulo a la izquierda. */
function Renglon({ rotulo, valor, nota = null, atenuado = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className={`text-sm3 ${atenuado ? "sunmi-text-muted" : "sunmi-text-strong"}`}>
          {rotulo}
        </div>
        {nota ? <div className="text-xs2 sunmi-text-muted">{nota}</div> : null}
      </div>
      <div
        className={`shrink-0 text-sm3 font-medium tabular-nums ${
          atenuado ? "sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

/**
 * UNA MÉTRICA QUE TODAVÍA NO SE PUEDE CALCULAR.
 *
 * ── POR QUÉ NO USA `Renglon` ─────────────────────────────────────────────
 *
 * Porque aquél pone el valor a la derecha, alineado con los importes, y ahí una
 * frase larga se parte en dos renglones a 390 px y se lee peor que un número. Y
 * sobre todo: una raya en la columna de los importes se confunde con un cero o
 * con un dato que no se pudo traer.
 *
 * Acá la frase va DEBAJO del rótulo, a ancho completo y con todas sus palabras.
 * Lo que tiene que quedar claro es que el sistema no lo sabe, no que valga cero.
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

/**
 * EL PAGO A DEPÓSITO DEL PERÍODO, con las pendientes de recepción aparte.
 *
 * El importe es lo recibido y confirmado; las pendientes se informan con el
 * renglón atenuado —el mismo trato que el fiado en Cobros— para que no se lean
 * como plata que ya salió.
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
          Con su motivo. No en cero: ver el encabezado. */}
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
