"use client";

// components/compras-proveedor/BloquePagoAlProveedor.jsx
//
// EL PAGO AL PROVEEDOR, ADENTRO DE LA HOJA DE CERRAR LA RECEPCIÓN.
//
// Es el último bloque antes de confirmar: cerrar la compra es también decidir
// cómo queda la deuda. No es una pantalla aparte ni un paso después: la
// mercadería, la compra y la deuda entran juntas o no entra nada.
//
// ── LO QUE SE VE Y DE DÓNDE SALE ────────────────────────────────────────
//
// El total, el saldo y el motivo por el que todavía no se puede confirmar
// salen de `pagoDelCierreEnPantalla`, que pasa por las mismas dos funciones que
// usa el servidor. El formulario de medio, origen y turno es
// `CamposDeOrigenDelPago`, el mismo de Finanzas.
//
// Controlado: el estado vive en la hoja, que es la que confirma. Acá se dibuja
// y se avisa cada cambio.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import CamposDeOrigenDelPago, { Campo } from "@/components/finanzas/pagos/CamposDeOrigenDelPago";
import { formatearMoneda } from "@/lib/moneda";
import {
  ESTADO_PAGO_CIERRE,
  ESTADOS_PAGO_CIERRE,
  ROTULO_ESTADO_PAGO_CIERRE,
  estadoSacaPlata,
} from "@/lib/compras-proveedor/pagoDelCierre";

/** Un renglón rótulo / importe. */
function Importe({ rotulo, valor, fuerte = false }) {
  return (
    <span className="flex items-baseline justify-between gap-renglon">
      <span className="text-sm3 sunmi-text-muted">{rotulo}</span>
      <span
        className={`shrink-0 tabular-nums ${
          fuerte ? "text-base2 font-semibold sunmi-text-strong" : "text-sm3 sunmi-text-strong"
        }`}
      >
        {formatearMoneda(valor)}
      </span>
    </span>
  );
}

export default function BloquePagoAlProveedor({
  proveedor,
  /** Lo que resolvió `pagoDelCierreEnPantalla`. */
  estadoEnPantalla,
  /** Lo que suman las facturas que sí traen total, para ayudar a escribirlo. */
  sumaConocida = null,
  valor,
  onCambiar,
  puedeRegistrarPago = false,
  medios = [],
  /** La ubicación dueña del pedido, `{ id, nombre }`: de ahí sale la plata. */
  ubicacionDuena = null,
  deshabilitado = false,
}) {
  const { estado, totalEscrito, totalConfirmado, montoAhora, medio, turnoId, vencimiento } = valor;
  // Por función y no sobre `valor`: la búsqueda de turnos contesta tarde, y
  // mezclar su respuesta con un `valor` viejo pisaría lo que se cargó mientras.
  const cambiar = (parcial) => onCambiar?.((previo) => ({ ...previo, ...parcial }));
  const sacaPlata = estadoSacaPlata(estado);
  const { pideTotal, total, saldo } = estadoEnPantalla;

  return (
    <div className="flex flex-col gap-renglon">
      <span className="flex items-baseline justify-between gap-renglon">
        <span className="text-sm3 sunmi-text-muted">Proveedor</span>
        <span className="min-w-0 text-sm3 sunmi-text-strong truncate">{proveedor}</span>
      </span>

      {/* ── EL TOTAL: LO QUE FACTURA EL PROVEEDOR ─────────────────────────
          Si todas las facturas traen total impreso, es ésa suma y no se toca.
          Si alguna no lo trae, se escribe y se confirma: el sistema no lo
          completa con los productos. */}
      {pideTotal ? (
        <div className="flex flex-col gap-dato">
          <Campo rotulo="Total a pagar al proveedor">
            <SunmiInput
              inputMode="decimal"
              value={totalEscrito}
              onChange={(e) => cambiar({ totalEscrito: e.target.value, totalConfirmado: false })}
              placeholder="0,00"
              aria-label="Total a pagar al proveedor"
              disabled={deshabilitado}
            />
          </Campo>
          <span className="text-sm2 sunmi-text-muted break-words">
            Alguna factura no trae total impreso. Escribí el total del papel, con IVA y
            percepciones.
            {sumaConocida != null
              ? ` Las que sí lo traen suman ${formatearMoneda(sumaConocida)}.`
              : ""}
          </span>
          <SunmiButton
            color={totalConfirmado ? "primary" : "slate"}
            type="button"
            aria-pressed={totalConfirmado}
            disabled={deshabilitado || total == null}
            onClick={() => cambiar({ totalConfirmado: !totalConfirmado })}
            className="w-full min-h-toque justify-center rounded-control text-sm3"
          >
            {totalConfirmado ? "Total confirmado" : "Confirmo que el total es éste"}
          </SunmiButton>
        </div>
      ) : (
        <Importe rotulo="Total a pagar al proveedor" valor={total} fuerte />
      )}

      {/* ── CÓMO QUEDA EL PAGO ──────────────────────────────────────────
          Tres botones, el mismo patrón que "Llegó / No llegó" de esta hoja. No
          viene ninguno elegido: es una decisión, no un valor por omisión. */}
      <Campo rotulo="Estado del pago">
        <div className="flex gap-dentroFiltro">
          {ESTADOS_PAGO_CIERRE.map((e) => {
            const elegido = estado === e;
            const necesitaPermiso = estadoSacaPlata(e) && !puedeRegistrarPago;
            return (
              <SunmiButton
                key={e}
                color={elegido ? "primary" : "slate"}
                type="button"
                aria-pressed={elegido}
                disabled={deshabilitado || necesitaPermiso}
                onClick={() => cambiar({ estado: e })}
                className="flex-1 min-h-toque justify-center rounded-control text-sm3"
              >
                {ROTULO_ESTADO_PAGO_CIERRE[e]}
              </SunmiButton>
            );
          })}
        </div>
      </Campo>
      {!puedeRegistrarPago && (
        <span className="text-sm2 sunmi-text-muted break-words">
          Para dejarla pagada o parcial hace falta el permiso de registrar pagos a proveedores.
          Pendiente la deja como deuda completa.
        </span>
      )}

      {sacaPlata && (
        <>
          {estado === ESTADO_PAGO_CIERRE.PARCIAL ? (
            <Campo rotulo="Monto que se paga ahora">
              <SunmiInput
                inputMode="decimal"
                value={montoAhora}
                onChange={(e) => cambiar({ montoAhora: e.target.value })}
                placeholder="0,00"
                aria-label="Monto que se paga ahora"
                disabled={deshabilitado}
              />
            </Campo>
          ) : (
            <Importe rotulo="Se paga ahora" valor={total} />
          )}

          <CamposDeOrigenDelPago
            activo={sacaPlata && !deshabilitado}
            medios={medios}
            medio={medio}
            onMedio={(v) => cambiar({ medio: v })}
            origen={ubicacionDuena}
            turnoId={turnoId}
            onTurno={(v) => cambiar({ turnoId: v })}
          />
        </>
      )}

      {estado && <Importe rotulo={sacaPlata ? "Saldo restante" : "Saldo pendiente"} valor={saldo} fuerte />}

      {estado && estado !== ESTADO_PAGO_CIERRE.PAGADA && (
        <Campo rotulo="Vencimiento del proveedor">
          <SunmiInput
            type="date"
            value={vencimiento}
            onChange={(e) => cambiar({ vencimiento: e.target.value })}
            aria-label="Vencimiento del proveedor"
            disabled={deshabilitado}
          />
          <span className="text-sm2 sunmi-text-muted break-words">
            {vencimiento ? "La fecha que dio el proveedor." : "Sin fecha: pasa a cobrar."}
          </span>
        </Campo>
      )}
    </div>
  );
}
