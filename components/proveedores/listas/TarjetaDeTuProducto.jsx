"use client";

// UN PRODUCTO TUYO, FRENTE A LA LISTA QUE SE LEYÓ.
//
// Es la tarjeta de la revisión de una lista (diseño aprobado por Emanuel,
// 2026-10-23): nombre en negrita, a la derecha qué le pasa, y debajo lo que
// hace falta para decidir sin abrir nada. El estado lo decide
// `tusProductos.js`; acá solo se dibuja.
//
//   Sin vincular   el costo de hoy, "No lo encontré…" y «Vincular con la lista».
//   Revisar        el renglón de la lista, hoy → nuevo con el %, el motivo en
//                  ámbar y «Revisar», que abre la decisión de siempre.
//   Cambia         el renglón de la lista y hoy → nuevo con el % en verde.
//   Lo demás       con su etiqueta en gris y sin botón: ya está decidido.
//
// Los botones solo existen con la lista abierta: en una cerrada vincular o
// revisar los rechaza el servidor, y un botón que no puede hacer nada se toca
// igual y confunde.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { money, pct } from "@/components/proveedores/listas/PiezasPantallas";
import { ESTADO_TU_PRODUCTO, ETIQUETA_TU_PRODUCTO } from "@/lib/proveedores/listas/tusProductos";

/** El color de la etiqueta. Ámbar es el único que pide trabajo. */
const COLOR_ETIQUETA = Object.freeze({
  SIN_VINCULAR: "slate",
  REVISAR: "amber",
  CAMBIA: "green",
  ACTUALIZADO: "green",
  MISMO_PRECIO: "slate",
  NO_LO_CAMBIO: "slate",
  NO_VIENE: "slate",
});

/**
 * @param item        uno de `tusProductosDeLaLista().items`
 * @param proveedor   el nombre, para "No lo encontré en la lista de Dab."
 * @param abierta     si la lista se puede tocar todavía
 * @param onVincular  «Vincular con la lista»
 * @param onRevisar   «Revisar»
 */
export default function TarjetaDeTuProducto({
  item,
  proveedor = "",
  abierta = false,
  // Una lista de CONTROL no cambia ningún costo: lo que en una de actualizar
  // dice «Cambia», acá dice que la lista trae otro precio.
  controlando = false,
  onVincular,
  onRevisar,
}) {
  const { estado } = item;
  const etiqueta =
    controlando && estado === ESTADO_TU_PRODUCTO.CAMBIA ? "Otro precio" : ETIQUETA_TU_PRODUCTO[estado];
  const revisar = estado === ESTADO_TU_PRODUCTO.REVISAR;
  return (
    <SunmiCard
      className={`p-3 space-y-1.5 ${revisar ? "border sunmi-border-warning" : ""}`}
      data-producto={item.productoBaseId}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm3 font-bold sunmi-text-strong leading-snug break-words min-w-0">
          {item.nombre}
        </span>
        <span className="shrink-0">
          <SunmiPill color={COLOR_ETIQUETA[estado] ?? "slate"}>{etiqueta}</SunmiPill>
        </span>
      </div>

      {estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR || estado === ESTADO_TU_PRODUCTO.NO_VIENE ? (
        <>
          <p className="text-sm2 sunmi-text-strong tabular-nums">Costo hoy {money(item.costoHoy)}</p>
          {estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR && (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              No lo encontré en la lista{proveedor ? ` de ${proveedor}` : ""}.
            </p>
          )}
        </>
      ) : (
        <>
          {item.renglon && <RenglonDeLaLista renglon={item.renglon} proveedor={proveedor} />}
          <HoyYNuevo item={item} />
          {revisar && item.motivoTexto && (
            <p className="text-sm2 sunmi-text-warning leading-snug">{item.motivoTexto}</p>
          )}
        </>
      )}

      {abierta && estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR && (
        <SunmiButton
          color="ghost"
          type="button"
          onClick={() => onVincular?.(item)}
          className="w-full min-h-toque justify-center text-sm3 font-semibold border sunmi-border-accent sunmi-text-accent"
        >
          Vincular con la lista
        </SunmiButton>
      )}
      {abierta && revisar && item.filaId && (
        <SunmiButton
          color="ghost"
          type="button"
          onClick={() => onRevisar?.(item)}
          className="w-full min-h-toque justify-center text-sm3 font-semibold border sunmi-border-accent sunmi-text-accent"
        >
          Revisar
        </SunmiButton>
      )}
    </SunmiCard>
  );
}

/** "Dab 1612 · SOLITAS ANIMACION 400G · $ 1.469,75 por 10", en gris. */
function RenglonDeLaLista({ renglon, proveedor }) {
  const partes = [
    [proveedor, renglon.codigo].filter(Boolean).join(" "),
    renglon.descripcion,
    renglon.precio === null
      ? null
      : `${money(renglon.precio)}${renglon.cantidad > 1 ? ` por ${renglon.cantidad}` : ""}`,
  ].filter(Boolean);
  return <p className="text-sm2 sunmi-text-muted leading-snug break-words">{partes.join(" · ")}</p>;
}

/**
 * Costo hoy → costo nuevo, y el porcentaje a la derecha. Sin costo nuevo —una
 * fila que todavía no se sabe cómo leer— se dice el de hoy solo: una flecha a
 * "—" afirmaría que el costo pasa a ser nada.
 */
function HoyYNuevo({ item }) {
  const verde = item.estado === ESTADO_TU_PRODUCTO.CAMBIA || item.estado === ESTADO_TU_PRODUCTO.ACTUALIZADO;
  const ambar = item.estado === ESTADO_TU_PRODUCTO.REVISAR;
  if (item.costoNuevo === null || item.estado === ESTADO_TU_PRODUCTO.MISMO_PRECIO) {
    return <p className="text-sm2 sunmi-text-strong tabular-nums">Costo hoy {money(item.costoHoy)}</p>;
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm2 sunmi-text-strong tabular-nums">
        {money(item.costoHoy)} → <span className="font-bold">{money(item.costoNuevo)}</span>
      </span>
      {item.variacionPct !== null && (
        <span
          className={`text-sm2 font-semibold tabular-nums shrink-0 ${
            verde ? "sunmi-text-success" : ambar ? "sunmi-text-warning" : "sunmi-text-muted"
          }`}
        >
          {pct(item.variacionPct)}
        </span>
      )}
    </div>
  );
}
