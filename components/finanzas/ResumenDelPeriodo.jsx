"use client";

// components/finanzas/ResumenDelPeriodo.jsx
//
// LAS MÉTRICAS DEL PERÍODO, Y LAS QUE TODAVÍA NO EXISTEN.
//
// ── LO QUE NO SE PUEDE CALCULAR NO SE DIBUJA EN CERO ─────────────────────
//
// Es la regla de esta pantalla y la que más fácil se rompe sin querer. "Gastos
// operativos $0,00" se lee como que no hubo gastos, y lo que pasa es que el ERP
// no los conoce: no hay sueldos, ni alquiler, ni servicios registrados en
// ninguna tabla. Un cero ahí es una afirmación falsa sobre la plata del negocio.
//
// Los pagos a proveedores SÍ se registran, en su submódulo, pero este resumen
// todavía no los suma: también van como "Todavía no disponible", y su motivo
// —que viene del servidor— dice exactamente eso.
//
// Las tres que faltan viajan desde el servidor en `resumen.noDisponible`, con su
// motivo, y se dibujan con la frase "Todavía no disponible". No están escritas
// en este archivo a propósito: el día que exista el modelo de gastos, la lista
// se acorta sola desde donde se sabe.
//
// ── Y NO SE DICE "GANANCIA REAL" ─────────────────────────────────────────
//
// El margen bruto es ventas menos el costo de la mercadería vendida. La ganancia
// real es eso MENOS los gastos, y los gastos no existen. Llamarle ganancia al
// margen sería el mismo error que el cero, con otra palabra.
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

import { formatearMoneda } from "@/lib/moneda";

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
          valor={formatearMoneda(resumen.costoVendido)}
        />
        <Renglon
          rotulo="Margen bruto"
          nota="Ventas menos el costo de lo vendido. No es la ganancia del negocio."
          valor={formatearMoneda(resumen.margenBruto)}
        />

        {control.difiere && (
          <div className="text-xs2 sunmi-text-warning">
            El margen guardado en cada venta suma {formatearMoneda(control.sumaGananciaBrutaPersistida)}.
            La diferencia es el recargo por medio de pago, que el POS deja fuera del margen de
            mercadería.
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
