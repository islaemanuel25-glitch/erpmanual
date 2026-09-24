"use client";

// UNA LÍNEA DE LA FACTURA, CON LA MISMA TARJETA QUE LA RECEPCIÓN DE UNA
// TRANSFERENCIA.
//
// ── ESTO ES UNA COPIA, NO UNA INSPIRACIÓN ─────────────────────────────────
//
// La composición, las clases y los dos estados —colapsada cuando no hay nada
// que decidir, abierta cuando sí— salen de `TarjetaRecepcionMovil` tal cual
// están. No se eligió ningún tamaño acá: `p-2` colapsada, `p-4 space-y-3`
// abierta, `text-sm2` en la línea de resumen, `text-md2 font-semibold` en el
// nombre, `text-lg2 font-semibold` en el importe, y las dos clases de botón que
// ese archivo define —`sunmi-btn-accent-outline` para el caso feliz y
// `sunmi-btn-accent-suave` para corregir—.
//
// Las tandas anteriores fueron con medidas y el resultado se veía distinto,
// justamente porque una medida escrita a mano al lado de una pieza no es la
// pieza: es otro número que coincide hasta que uno de los dos se mueve.
//
// ── LO ÚNICO QUE NO EXISTE ALLÁ: EL PRECIO ────────────────────────────────
//
// Una transferencia se mueve entre dos locales del mismo grupo y su recepción
// no mira precios. Una factura puede traer el mismo producto a otro precio, y
// eso hay que verlo y decidirlo.
//
// Se agrega CON LA FORMA QUE ESA PIEZA YA TIENE para un número que cambió: el
// anterior arriba, en chico y tachado, y el nuevo abajo, en grande y en
// warning. Es exactamente cómo ella muestra un importe corregido — se lee "de
// cuánto era" → "cuánto es". No se inventó un tratamiento nuevo.
//
// ── Y UN PRECIO YA DECIDIDO NO SE MUESTRA COMO PROBLEMA ───────────────────
//
// La diferencia entre lo que factura el proveedor y el costo interno es la
// ganancia del depósito: es estable y vuelve igual en cada recepción. Una vez
// decidida, sigue siendo una diferencia y se sigue viendo —el número no se
// esconde— pero deja el tono de alerta y el tachado, que son la forma de decir
// "esto hay que resolverlo". Lo que queda es una línea que dice qué se decidió.

import { Check, Pencil } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { formatearMoneda } from "@/lib/moneda";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  cantidadFueConvertida,
  diferenciaDeCantidad,
  estadoDeLinea,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
// ── LA DECISIÓN DE PRECIO YA NO SE MIRA DESDE LA TARJETA ──────────────────
//
// Se importaban `decisionVigente`, `hayQueDecidirElPrecio` y `precioCambio`
// para elegir entre el bloque tachado y el de "Ya decidido", que eran los dos
// que se fueron. La decisión no cambió de reglas: sigue viviendo en la hoja de
// Corregir, que es la que la toma y la guarda.

/** Las mismas dos clases de botón que usa la tarjeta de transferencias. */
const CLASE_COINCIDE = "sunmi-btn-accent-outline";
const CLASE_CORREGIR = "sunmi-btn-accent-suave";

export const TEXTO_COINCIDE = "✓ Coincide";
export const TEXTO_CORREGIR = "Corregir";

/** Cantidades: enteras sin decimales, fraccionarias con hasta 3 útiles. */
const fmtCant = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

export default function TarjetaLineaFactura({
  fila,
  onCorregir,
  onCoincide,
  /**
   * ── QUIÉN DICE QUE ESTA LÍNEA ESTÁ REVISADA ─────────────────────────────
   *
   * La persona, tocando "✓ Coincide". No el sistema.
   *
   * Acá la tarjeta se colapsaba cuando el cálculo daba "coincide" —cantidad
   * igual y precio igual—, o sea que se ponía el tilde verde sola y daba por
   * controlado un renglón que nadie miró. Y la pantalla se contradecía: las
   * tarjetas en verde mientras el contador de arriba decía "0 / 15 sin
   * diferencias · 15 para revisar".
   *
   * En la recepción de una transferencia ese botón es la MARCA de que alguien
   * controló el renglón contra el papel. Acá es lo mismo. Lo que el sistema
   * calculó se sigue mostrando como dato —la comparación, el precio— pero no
   * marca nada por su cuenta.
   */
  revisada = false,
  guardando = false,
  /**
   * ── EL PEDIDO NACIÓ DE ESTA FACTURA: NO HUBO PEDIDO ─────────────────────
   *
   * Llegó mercadería de un proveedor al que nadie le encargó nada. Entonces
   * "Pediste" no se dibuja, y tampoco "falta" ni "sobra": los tres comparan
   * contra un pedido que no existió, y un "Pediste 0" o un "sobra 8" serían
   * afirmaciones falsas sobre la mercadería.
   *
   * Viene del PEDIDO y no se deduce de la fila: una línea no pedida de un
   * pedido normal tiene exactamente la misma forma, y ahí "sobra 8" es verdad.
   */
  sinPedidoPrevio = false,
}) {
  const estado = estadoDeLinea(fila);
  // Los tres renglones —Factura, Papel y ERP— ya resueltos, con los dos
  // precios en la MISMA unidad. El módulo es puro y tiene sus candados.
  const renglones = renglonesDeLaTarjeta(fila);
  const faltan = diferenciaDeCantidad(fila);
  const esNoPedida = estado === ESTADO_LINEA.NO_PEDIDO;
  const sinVincular = estado === ESTADO_LINEA.SIN_VINCULAR;
  const resuelta = revisada;
  // La cantidad SIEMPRE en la escala del pedido. Lo crudo se muestra al lado
  // cuando se convirtió, para que se pueda cotejar con el papel sin dudar.
  const cantidad = cantidadEnEscalaDelPedido(fila);
  const convertida = cantidadFueConvertida(fila);
  // ── LLEGÓ SIN FACTURA: LA MISMA TARJETA, OTRO RÓTULO ─────────────────────
  //
  // La fila la arma `filaSinPapel` y su cantidad es LO CONTADO, no lo que dice
  // un papel. Por eso el primer renglón dice "Llegó" y no "Factura", y en vez
  // de Papel contra ERP va el costo del pedido solo: no hay dos precios.
  const sinPapel = fila?.sinPapel === true;

  // ── LA TARJETA COLAPSADA, PARA LO QUE YA SE CONTROLÓ ───────────────────
  //
  // Mismo criterio que allá: una línea ya revisada se lee de un vistazo y no
  // ocupa media pantalla. Con 197 líneas es la diferencia entre barrer la lista
  // y scrollear un documento. Lo que la colapsa es el toque de la persona, no
  // el cálculo.
  if (resuelta) {
    return (
      <SunmiCard className="p-2" data-linea-factura={fila?.producto || fila?.lineaId}>
        {/* Tocarla la vuelve a abrir, que es de donde sale "Desmarcar". Mismo
            gesto que la tarjeta colapsada de la recepción de una transferencia:
            la lista queda atrás y cerrar es un gesto, no una decisión. */}
        <SunmiLinkButton
          onClick={() => onCorregir?.(fila)}
          aria-label={`Ver ${fila?.producto || "este producto"}`}
          className="block w-full text-left no-underline"
        >
        <div className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
          <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong text-left">
            {fila?.producto || fila?.textoCrudo || "Sin nombre"}
          </span>
          {/* El MISMO número que el pie de la tarjeta abierta: es la misma
              tarjeta, y decir el neto acá y el total con impuestos allá haría
              que el renglón cambiara de valor al tocarlo. */}
          <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 sunmi-text-strong">
            {fmtCant(cantidad)}
            {renglones.total === null ? "" : ` · ${formatearMoneda(renglones.total)}`}
          </span>
        </div>
        </SunmiLinkButton>
      </SunmiCard>
    );
  }

  // ── LA TARJETA ABIERTA, PARA LO QUE HAY QUE MIRAR ──────────────────────
  //
  // El tono de alerta es para lo que hay que resolver. Una línea que coincide
  // —y una cuyo único desvío era un precio ya decidido— no tiene nada que
  // resolver: se muestra igual, porque nadie la controló todavía, pero sin el
  // naranja que dice "acá hay un problema".
  // Sin pedido previo NADA es "no pedido": no hubo pedido. Pintar de rojo una
  // línea por no estar en un pedido que no existió sería marcar como problema
  // la mercadería que se está recibiendo.
  const tono = esNoPedida && !sinPedidoPrevio
    ? "sunmi-state-danger"
    : estado === ESTADO_LINEA.COINCIDE
      ? ""
      : "sunmi-state-warning";

  return (
    <SunmiCard
      className={`p-4 space-y-3 ${tono}`.trimEnd()}
      data-linea-factura={fila?.producto || fila?.lineaId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-md2 font-semibold sunmi-text-strong break-words">
            {fila?.producto || fila?.textoCrudo || "Sin nombre"}
          </p>

          {sinVincular ? (
            <p className="text-xs sunmi-text-muted break-words">
              Todavía no se sabe qué producto es. Tocá Corregir para elegirlo.
            </p>
          ) : esNoPedida && !sinPedidoPrevio ? (
            <p className="text-xs sunmi-text-muted break-words">
              El proveedor lo facturó y no estaba en el pedido.
            </p>
          ) : (
            /* ── UNA SOLA RAMA PARA LAS TRES LÍNEAS ──────────────────────
               Acá había una rama aparte para `sinPedidoPrevio` —un pedido que
               NACIÓ de la factura— que dibujaba "Factura 12" y nada más. Su
               comentario decía que el precio "está a la derecha, igual que
               siempre", y eso dejó de ser cierto cuando ese bloque de la
               esquina se fue: el pedido 242 quedó mostrando la cantidad y el
               total, y
               ningún precio.

               Se vio abriendo la pantalla de verdad a 390 px, no en los
               candados: los números salían bien de `renglonesDeLaTarjeta` y la
               rama que los dibuja nunca corría. Son 5 los pedidos nacidos de
               factura en producción.

               Papel y ERP valen igual sin pedido previo —son el papel contra el
               precio interno, que no dependen de haber pedido nada—. Lo único
               que se calla en ese caso es la comparación contra lo pedido, que
               es lo de abajo. */
            <>
              {/* ── LÍNEA 1 · FACTURA ────────────────────────────────────
                  Cuánto vino, en la escala del PEDIDO. Misma forma que el
                  "Enviado" de la tarjeta de transferencias: rótulo chico en
                  gris y el número en acento, que es el dato que se cotejа
                  contra el papel. */}
              <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                <span className="text-xs sunmi-text-muted shrink-0">{sinPapel ? "Llegó" : "Factura"}</span>
                <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-accent">
                  {renglones.cantidad ?? "—"}
                </span>
                {/* De dónde salió ese número, cuando no es el del papel. Sin
                    esto, quien coteja ve 8 donde el papel dice 80 y no sabe si
                    la pantalla se equivocó. */}
                {convertida && (
                  <span className="text-xs tabular-nums sunmi-text-muted shrink-0">
                    el papel dice {fmtCant(fila?.cantidad)} u
                  </span>
                )}
                {/* "falta" y "sobra" comparan contra el pedido, así que no se
                    dicen cuando no hubo ninguno: serían afirmaciones falsas
                    sobre la mercadería que se está recibiendo. */}
                {!sinPedidoPrevio && faltan != null && faltan !== 0 && (
                  <span className="text-xs tabular-nums sunmi-text-muted shrink-0">
                    {faltan > 0 ? `falta ${fmtCant(faltan)}` : `sobra ${fmtCant(-faltan)}`}
                  </span>
                )}
              </p>

              {/* ── LÍNEA 2 · PAPEL ──────────────────────────────────────
                  Lo que el proveedor cobra por UNA unidad de compra, con el
                  sufijo que la hace inequívoca. El sufijo se deriva, no se
                  escribe: es el mismo "/ pack" de la tarjeta de transferencias
                  y por el mismo motivo — un importe sin unidad al lado de otro
                  importe no se puede comparar. */}
              {/* El costo del pedido, con la misma forma que el renglón Papel:
                  es el único precio que hay cuando llegó sin factura. */}
              {renglones.costo && (
                <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                  <span className="text-xs sunmi-text-muted shrink-0">Costo</span>
                  <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-strong">
                    {formatearMoneda(renglones.costo.importe)}
                    <span className="text-xs font-normal sunmi-text-muted">
                      {" "}/ {renglones.costo.unidad}
                    </span>
                  </span>
                </p>
              )}

              {renglones.papel && (
                <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                  <span className="text-xs sunmi-text-muted shrink-0">Papel</span>
                  <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-strong">
                    {formatearMoneda(renglones.papel.importe)}
                    <span className="text-xs font-normal sunmi-text-muted">
                      {" "}/ {renglones.papel.unidad}
                    </span>
                  </span>
                </p>
              )}

              {/* ── LÍNEA 3 · ERP, EN LA MISMA UNIDAD ────────────────────
                  El precio interno y cuánto gana el depósito sobre él. Verde
                  con "+" cuando el ERP es mayor, naranja con "−" cuando el
                  proveedor cobra más. El signo y el color dicen lo mismo a
                  propósito: un color solo no se lee.

                  No se dibuja si no hay con qué comparar —renglón sin vincular,
                  producto sin costo—. Una comparación contra nada es peor que
                  ninguna. */}
              {renglones.erp && (
                <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                  <span className="text-xs sunmi-text-muted shrink-0">ERP</span>
                  <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-strong">
                    {formatearMoneda(renglones.erp.importe)}
                    <span className="text-xs font-normal sunmi-text-muted">
                      {" "}/ {renglones.erp.unidad}
                    </span>
                  </span>
                  {renglones.erp.texto && (
                    <span
                      className={`text-sm2 font-semibold tabular-nums shrink-0 ${
                        renglones.erp.gana ? "sunmi-text-success" : "sunmi-text-warning"
                      }`}
                    >
                      {renglones.erp.texto}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── "✓ COINCIDE" ARRIBA A LA DERECHA ────────────────────────────
            La misma esquina fija que la tarjeta de transferencias: el caso
            feliz en un toque, sin abrir nada. Se ofrece solo cuando el cálculo
            no encontró diferencias — ofrecerlo sobre algo que no coincide
            invita a cerrar sin mirar, que es justo lo que tiene que evitar.

            ── ACÁ ESTABAN EL TACHADO Y "YA DECIDIDO", Y SE FUERON ────────
            Eran dos bloques de precio sin rótulo, en la misma esquina, que se
            turnaban. El tachado ponía el costo del ERP arriba y el del papel
            abajo en warning; "Ya decidido" ponía el número que quedó. Los dos
            decían en gris y chico lo que ahora dicen las líneas Papel y ERP con
            su nombre al lado, y el tachado además afirmaba que algo se
            reemplazó cuando la decisión todavía no se tomó.

            La decisión de precio no se movió: sigue viviendo en la hoja de
            Corregir, con los mismos dos caminos. */}
        {!esNoPedida && !sinVincular && estado === ESTADO_LINEA.COINCIDE && (
          <SunmiLinkButton
            onClick={() => onCoincide?.(fila)}
            disabled={guardando}
            aria-label={
              sinPapel
                ? `Llegó lo pedido de ${fila?.producto || "este producto"}`
                : `Aceptar lo que dice la factura para ${fila?.producto || "este producto"}`
            }
            className={`shrink-0 no-underline ${CLASE_COINCIDE}`}
          >
            {TEXTO_COINCIDE}
          </SunmiLinkButton>
        )}
      </div>

      <SunmiSeparator />

      {/* ── EL PIE: LA ACCIÓN A LA IZQUIERDA, EL TOTAL A LA DERECHA ──────
          Las dos esquinas fijas de la tarjeta de transferencias, copiadas.

          ── Y AHORA CON RÓTULO, PORQUE EL NÚMERO CAMBIÓ DE BASE ──────────
          Acá decía `fila.subtotal` —el subtotal IMPRESO, o sea el neto— sin
          rótulo, y arriba el renglón "Papel" muestra el costo CON los
          impuestos del pie adentro. Dos bases en la misma tarjeta: sobre el
          pedido 246 se leía "Papel $21.790,88 / pack" y abajo "$17.573,34",
          que es el mismo importe dividido por 1,24.

          El número pasa a ser el total en la base del "Papel" y lleva su
          nombre al lado, con el mismo rótulo chico que ya usan "Factura",
          "Papel" y "ERP". El cálculo vive en `tarjetaDeRecepcion.js` con sus
          candados. */}
      <div className="flex items-center justify-between gap-3">
        <SunmiButton
          type="button"
          onClick={() => onCorregir?.(fila)}
          disabled={guardando}
          className={`shrink-0 ${CLASE_CORREGIR}`}
        >
          {TEXTO_CORREGIR}
        </SunmiButton>

        {renglones.total !== null && (
          <span className="shrink-0 flex items-baseline gap-2">
            <span className="text-xs sunmi-text-muted shrink-0">Total</span>
            <span className="whitespace-nowrap tabular-nums text-lg2 font-semibold sunmi-text-strong">
              {formatearMoneda(renglones.total)}
            </span>
          </span>
        )}
      </div>
    </SunmiCard>
  );
}
