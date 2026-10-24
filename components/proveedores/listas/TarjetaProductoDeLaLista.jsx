"use client";

// UN PRODUCTO TUYO, FRENTE A LA LISTA QUE SE LEYÓ — CON LA FORMA DE LA
// RECEPCIÓN DE TRANSFERENCIAS (diseño de Emanuel, 2026-10-24).
//
// ── POR QUÉ CAMBIÓ ────────────────────────────────────────────────────────
//
// La tarjeta de la versión anterior no dejaba claro qué era tu producto y qué
// era el renglón de la lista: los dos iban en el mismo gris, uno abajo del otro,
// con una píldora de estado al costado. Ahora tu producto es el título y el
// renglón va rotulado «En la lista:», y la tarjeta tiene la forma de la de
// recibir una transferencia, que Emanuel ya usa todos los días: el caso feliz
// arriba a la derecha, corregir abajo a la izquierda, el número abajo a la
// derecha.
//
// La forma NO se escribe acá: es `TarjetaDeRevision` (`PiezasDeRevision`), la
// misma que dibuja `TarjetaRecepcionMovil`, con las mismas dos clases de acción.
//
// ── QUÉ DECIDE ESTA PIEZA Y QUÉ NO ────────────────────────────────────────
//
// Qué botón va en cada esquina según el estado. QUÉ hace cada botón lo decide el
// servidor —`item.usar`, de `tusProductos.js`— y QUÉ es cada estado también. La
// pieza no llama a ninguna ruta: avisa con `onUsar`, `onVincular`, `onNoViene` y
// `onCorregir`, y la pantalla hace el resto.
//
//   Sin vincular   «Vincular» arriba, «No viene» abajo.
//   No viene       «Vincular» arriba: cambiar de idea es vincularlo.
//   Para revisar   «✓ Usar» arriba si hay una lectura que aceptar, «Corregir» abajo.
//   Cambia         el mismo «✓ Usar», relleno: tocarlo lo desmarca.
//   Mismo precio,  «Corregir» abajo: una tarjeta con renglón vinculado nunca
//   No lo cambio   queda sin acción (2026-10-24).
//   Actualizado    sin botones: su costo ya está escrito.
//
// Sin la lista abierta no hay ningún botón: el servidor los rechazaría. En una
// lista de control no hay «Usar»: controlar no escribe ningún costo. Desde una
// ubicación que no administra los costos, solo «Vincular» y «No viene».

import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  CLASE_ACCION_CORREGIR,
  CLASE_ACCION_RAPIDA,
  TarjetaDeRevision,
} from "@/components/revision/PiezasDeRevision";
import { money, pct } from "@/components/proveedores/listas/PiezasPantallas";
import { ACCION_USAR, ESTADO_TU_PRODUCTO } from "@/lib/proveedores/listas/tusProductos";

export const TEXTO_USAR = "✓ Usar";
export const TEXTO_VINCULAR = "Vincular";
export const TEXTO_NO_VIENE = "No viene";
export const TEXTO_CORREGIR = "Corregir";
export const ROTULO_EN_LA_LISTA = "En la lista:";
export const TEXTO_NO_ESTA = "no está";
export const MARCA_VINCULADO = "✓";

/**
 * @param item        uno de `tusProductosDeLaLista().items`
 * @param abierta     si la lista se puede tocar todavía
 * @param controlando si es una lista de control
 * @param trabajando  hay un pedido en vuelo para ESTA tarjeta
 */
export default function TarjetaProductoDeLaLista({
  item,
  abierta = false,
  controlando = false,
  // Si la ubicación activa administra los costos de la lista. Si no, desde acá
  // se vincula y nada más: ni «Usar» ni «Corregir» (lo explica una sola vez el
  // aviso de arriba de la pantalla).
  puedeCambiarCostos = true,
  trabajando = false,
  error = "",
  onUsar,
  onVincular,
  onNoViene,
  onCorregir,
}) {
  const { estado } = item;
  const sinRenglon = estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR || estado === ESTADO_TU_PRODUCTO.NO_VIENE;
  const revisar = estado === ESTADO_TU_PRODUCTO.REVISAR;
  const cambia = estado === ESTADO_TU_PRODUCTO.CAMBIA;

  // ── DEBAJO DEL NOMBRE: QUÉ RENGLÓN LE TOCÓ, Y LA CUENTA ──────────────────
  const debajo = (
    <>
      <p className="text-xs sunmi-text-muted">{ROTULO_EN_LA_LISTA}</p>
      {item.renglon ? (
        // El ✓ dice que el vínculo está hecho: sin él, una tarjeta vinculada y
        // sin costo nuevo no se distinguía de una colgada (ALFAJOR FULBITO,
        // 2026-10-24).
        <p className="text-sm2 sunmi-text-strong break-words">
          <span className="sunmi-text-success" aria-label="vinculado">
            {MARCA_VINCULADO}
          </span>{" "}
          {[item.renglon.codigo, item.renglon.descripcion].filter(Boolean).join(" · ")}
        </p>
      ) : (
        <p className="text-sm2 sunmi-text-warning">{TEXTO_NO_ESTA}</p>
      )}
      <p className="text-xs sunmi-text-muted tabular-nums break-words">{cuentaDe(item)}</p>
    </>
  );

  // ── ARRIBA A LA DERECHA: EL CASO FELIZ ───────────────────────────────────
  let accionArriba = null;
  if (abierta && sinRenglon) {
    accionArriba = (
      <SunmiButton onClick={() => onVincular?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_RAPIDA}`}>
        {TEXTO_VINCULAR}
      </SunmiButton>
    );
  } else if (abierta && puedeCambiarCostos && !controlando && item.usar && (revisar || cambia)) {
    // Relleno cuando ya está en uso: es el mismo botón marcado, como un
    // interruptor, y tocarlo lo desmarca. `primary` es el acento del tema.
    accionArriba = (
      <SunmiButton
        color={cambia ? "primary" : undefined}
        aria-pressed={cambia}
        onClick={() => onUsar?.(item)}
        disabled={trabajando}
        className={`shrink-0 ${cambia ? "" : CLASE_ACCION_RAPIDA}`}
      >
        {TEXTO_USAR}
      </SunmiButton>
    );
  }

  // ── ABAJO A LA IZQUIERDA: LO DEMÁS ──────────────────────────────────────
  let accionAbajo = null;
  if (abierta && estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR) {
    accionAbajo = (
      <SunmiButton onClick={() => onNoViene?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
        {TEXTO_NO_VIENE}
      </SunmiButton>
    );
  } else if (abierta && puedeCambiarCostos && item.filaId && estado !== ESTADO_TU_PRODUCTO.ACTUALIZADO) {
    // Toda vinculada tiene «Corregir», también «Mismo precio» y «No lo cambio»:
    // una tarjeta con renglón nunca queda sin acción. La aplicada no: su costo
    // ya está escrito, y eso se deshace desde la lista.
    accionAbajo = (
      <SunmiButton onClick={() => onCorregir?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
        {TEXTO_CORREGIR}
      </SunmiButton>
    );
  }

  // ── ABAJO A LA DERECHA: EL COSTO NUEVO Y EL PORCENTAJE ───────────────────
  // Verde adentro del rango del proveedor, ámbar afuera. Sin costo nuevo, una
  // raya: un renglón que todavía no se sabe cómo leer no tiene número.
  const tonoPct = item.enRango === true ? "sunmi-text-success" : item.enRango === false ? "sunmi-text-warning" : "sunmi-text-muted";
  const alPie = (
    <span className="shrink-0 text-right">
      <span className="block whitespace-nowrap tabular-nums text-lg2 font-semibold sunmi-text-strong">
        {item.costoNuevo === null || item.costoNuevo === undefined ? "—" : money(item.costoNuevo)}
      </span>
      {item.costoNuevo !== null && item.costoNuevo !== undefined && item.variacionPct !== null && item.variacionPct !== undefined && (
        <span className={`block text-sm2 font-semibold tabular-nums ${tonoPct}`}>{pct(item.variacionPct)}</span>
      )}
    </span>
  );

  const avisos = (
    <>
      {revisar && item.motivoTexto && <p className="text-sm2 sunmi-text-warning">{item.motivoTexto}</p>}
      {error && (
        <p className="text-sm2 sunmi-text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </>
  );

  return (
    <TarjetaDeRevision
      nombre={item.nombre}
      debajo={debajo}
      accionArriba={accionArriba}
      avisos={avisos}
      accionAbajo={accionAbajo}
      alPie={alPie}
      data-producto={item.productoBaseId}
    />
  );
}

/**
 * La cuenta, en gris, con la multiplicación hecha: "$ 955,00 × 20 = $ 19.100,00
 * · hoy $ 19.200,00" (Emanuel, 2026-10-24). Sin renglón, lo que cuesta hoy.
 *
 * El precio de la izquierda se saca del costo nuevo dividido el multiplicador y
 * no del renglón crudo: con recargo o impuesto, "$ 955 × 20" no daría el número
 * de la derecha, y una cuenta que no cierra es peor que ninguna. Sin recargo es
 * el mismo $ 955 del papel.
 *
 * Sin lectura que la explique —sin multiplicador o sin costo nuevo— se dicen el
 * renglón y el costo de hoy, sin inventar la cuenta.
 */
export function cuentaDe(item) {
  if (!item.renglon || item.renglon.precio === null || item.renglon.precio === undefined) {
    return `Hoy cuesta ${money(item.costoHoy)}`;
  }
  const hoy = ` · hoy ${money(item.costoHoy)}`;
  const nuevo = item.costoNuevo;
  const mult = Number(item.multiplicador);
  if (nuevo === null || nuevo === undefined || !Number.isFinite(mult) || mult < 1) {
    return `${money(item.renglon.precio)}${hoy}`;
  }
  if (mult === 1) return `${money(nuevo)}${hoy}`;
  return `${money(nuevo / mult)} × ${mult} = ${money(nuevo)}${hoy}`;
}
