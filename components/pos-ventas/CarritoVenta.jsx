"use client";

import { memo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
// `SunmiInput` se importaba acá para el stepper. Se fue con él al kit: un import
// que solo sostenía código mudado deja el módulo diciendo que depende de algo que
// ya no usa.
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiTable from "@/components/sunmi/SunmiTable";
import { fromUnidades } from "@/lib/conversiones/stock";
import { subtotalLinea } from "@/lib/pos-ventas/lineaPorImporte";
import { textoOfertaDeLinea } from "@/lib/ofertas/previewPos";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── LA OFERTA EN LA LÍNEA DEL CARRITO ──────────────────────────────────────
//
// "$1.000 · Oferta efectivo $900". El precio normal NO se reemplaza por el
// promocional, y no es una omisión: hasta que no se elija cómo se paga, el
// precio de oferta es una posibilidad. Mostrar $900 a secas sería prometer un
// precio que se cae si el cliente saca la tarjeta.
//
// Lo que tiene que quedar claro son las cuatro cosas: el precio normal, que hay
// una oferta, cuál es su condición, y cuánto es el precio promocional. Por eso
// la condición viaja en la etiqueta ("Oferta efectivo" vs "Oferta") en vez de en
// un ícono o un color, que no se leen.
function EtiquetaOferta({ item }) {
  const oferta = textoOfertaDeLinea(item);
  if (!oferta) return null;
  return (
    <span className="sunmi-text-success-soft whitespace-nowrap">
      {" · "}
      {oferta.etiqueta} ${formatPrecio(oferta.precio)}
    </span>
  );
}

// ── EL STOCK DEL CARRITO SE DIBUJA SOLO SI EL LOCAL LO PIDIÓ ───────────────
//
// Todo lo de este bloque es DISPLAY. Ninguna de estas funciones decide cuánto
// se puede vender: eso lo hace `item.stockMax`, que sigue limitando el stepper
// esté el stock visible o no.
//
// Volvieron tal cual estaban antes de ocultarlas, sin reescribirlas: la versión
// activada tiene que verse exactamente como se veía, y una reescritura "parecida"
// mueve píxeles que nadie pidió mover.

// Etiqueta del formato según unidad de medida (display descriptivo de stock — desktop)
function labelFormato(unidad) {
  switch (unidad) {
    case "cajon": return "cajones";
    case "pack": return "packs";
    // "caja" y "carton" no están en el enum `UnidadMedida`: eran ramas muertas.
    default: return "formatos";
  }
}

// Letra compacta del formato (chip de stock mobile): cajon→c, pack→p
function letraFormato(unidad) {
  switch (unidad) {
    case "cajon": return "c";
    case "pack": return "p";
    default: return "f";
  }
}

// Texto compacto del chip de stock (mobile). Stock real en unidades (stockMax).
// Positivo → "Stock: 2p + 10u". Negativo → "Stock: -13u" (sin desglose en bultos).
function stockChipText(item) {
  const factor = Number(item.factorPack) || 1;
  const total = Number(item.stockMax) || 0;
  if (total < 0) return `Stock: ${total}u`;
  const { bultos, sueltas } = fromUnidades({ unidades: total, factorPack: factor });
  return `Stock: ${bultos}${letraFormato(item.unidadMedida)} + ${sueltas}u`;
}

// ¿Mostrar desglose de stock para esta línea? Solo depósito, pack real (>1),
// excluyendo kg. Usa el stock real (stockMax = unidades) que ya trae la línea.
//
// `mostrarStock` va PRIMERO y corta: si el local no muestra stock, no hay
// desglose que evaluar. Ponerlo al final funcionaría igual y leería peor.
function mostrarStockDeposito(item, esDeposito, mostrarStock) {
  return (
    mostrarStock === true &&
    esDeposito === true &&
    Number(item.factorPack) > 1 &&
    item.unidadMedida !== "kg"
  );
}

// Línea descriptiva de stock (DESKTOP). Negativo → solo unidades (sin "-2 cajones + -1 uds").
function StockDeposito({ item }) {
  const factor = Number(item.factorPack) || 1;
  const total = Number(item.stockMax) || 0;
  if (total < 0) {
    return (
      <div className="text-[10px] pos-text-muted mt-0.5">Stock disponible: {total} uds</div>
    );
  }
  const { bultos, sueltas } = fromUnidades({ unidades: total, factorPack: factor });
  return (
    <div className="text-[10px] pos-text-muted mt-0.5">
      Stock disponible: {bultos} {labelFormato(item.unidadMedida)} x{factor} + {sueltas} uds
    </div>
  );
}

/* ── Stepper de cantidad (− input +) ── */
//
// ── ESTE CONTROL SE MUDÓ AL KIT, Y ACÁ QUEDÓ SU ADAPTADOR ────────────────
//
// Vivía acá entero, sin exportar, y por eso el panel de recepción de
// transferencias estuvo tres tandas rediseñando el suyo desde cero sin saber que
// existía. Dos controles de cantidad en el mismo ERP se separan el día que uno
// cambia, así que la pieza es del kit: `SunmiCampoCantidad`.
//
// ── LO QUE NO PODÍA PASAR, Y NO PASÓ ─────────────────────────────────────
//
// El carrito está en producción y cobra. El marcado que sale de acá es IDÉNTICO
// byte a byte al que salía antes de la mudanza —comprobado montando las dos
// versiones y comparando el HTML en los tres casos: escritorio, compacto y kg—.
// Lo único que se agregó son los `aria-label` de los dos botones y del campo, que
// no ocupan lugar y que antes no estaban.
//
// Está congelado en `components/sunmi/sunmiCampoCantidad.test.mjs`: si alguien
// toca el componente del kit y el carrito cambia de forma, ese candado se pone
// rojo con el HTML de los dos lados.
//
// Las cuatro cosas del POS que el kit conserva porque estaban bien: los botones
// con fondo relleno, el número centrado, el mínimo 1 —un carrito con cantidad 0
// no significa nada— y la coma normalizada a punto para vender por kilo.

/** Traduce el contrato del carrito —item + índice— al del kit. */
function CantidadStepper({ item, idx, onCantidadChange, compact }) {
  const esKg = item.unidadMedida === "kg";
  return (
    <SunmiCampoCantidad
      valor={item.cantidad}
      // El kit emite STRINGS —el estado de un formulario es lo que está escrito—
      // y el carrito razona con números. La traducción vive acá y no en el kit.
      onCambiar={(s) => onCantidadChange(idx, s === "" ? "" : Number(s))}
      etiqueta="Cantidad"
      minimo={esKg ? 0.001 : 1}
      paso={esKg ? 0.001 : 1}
      // `stockMax` puede ser negativo si el stock es negativo — no limitar hacia
      // abajo. El 9999 es el tope de siempre cuando no hay stock conocido.
      maximo={item.stockMax != null && item.stockMax > 0 ? item.stockMax : 9999}
      normalizaAlSalir
      // El borde va en el INPUT, como siempre en el carrito, y no en un
      // envoltorio. Ese es el único motivo por el que el marco es opcional en el
      // kit: recepción lo necesita afuera para poder pintarlo en danger, y
      // forzarlo acá le movería la caja al carrito.
      conMarco={false}
      // El compacto era `w-14` —49 px— y la cantidad de línea más larga de
      // producción es "26.412", que necesita 56. Es una venta por kilo: seis
      // caracteres es lo normal, no un caso raro.
      claseInput={compact ? "w-[56px] !text-center !py-1 text-sm" : "w-16 !text-center !py-1"}
      tamano="compacto"
    />
  );
}

/* ── Toggle formato pack / unidad suelta (solo depósito + pack) ── */
function ModoVentaToggle({ item, idx, onModoVentaChange }) {
  const factor = Number(item.factorPack) || 1;
  const modo = item.modoVentaLinea || "NORMAL";
  const base =
    "text-[10px] px-1.5 py-0.5 rounded border transition-colors select-none";
  const activo = "pos-control font-bold";
  const inactivo = "pos-text-muted";
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-[10px] pos-text-muted">Venta:</span>
      <button
        type="button"
        onClick={() => onModoVentaChange(idx, "NORMAL")}
        className={`${base} ${modo === "NORMAL" ? activo : inactivo}`}
      >
        Formato x{factor}
      </button>
      <button
        type="button"
        onClick={() => onModoVentaChange(idx, "UNIDAD_REMANENTE")}
        className={`${base} ${modo === "UNIDAD_REMANENTE" ? activo : inactivo}`}
      >
        Unidad suelta
      </button>
    </div>
  );
}

// ¿Esta línea admite venta por unidad suelta? Solo en depósito, con pack real
// (factorPack > 1) y cuya salida normal del depósito es por bulto.
function admiteRemanente(item, esDeposito) {
  return (
    esDeposito === true &&
    Number(item.factorPack) > 1 &&
    item.modoSalida === "BULTO"
  );
}

/* ── Fila horizontal scrolleable de chips (MOBILE): selector Formato/Unidad +
      chip de stock compacto cuando el local lo muestra. ── */
function ChipsRowMobile({ item, idx, esDeposito, onModoVentaChange, mostrarStock = false }) {
  const mostrarToggle = admiteRemanente(item, esDeposito) && !!onModoVentaChange;
  const conStock = mostrarStockDeposito(item, esDeposito, mostrarStock);
  if (!mostrarToggle && !conStock) return null;

  const factor = Number(item.factorPack) || 1;
  const modo = item.modoVentaLinea || "NORMAL";
  const chip =
    "shrink-0 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap select-none";
  const activo = "pos-control font-bold";
  const inactivo = "pos-text-muted";

  return (
    <div className="flex items-center gap-1 mt-1 overflow-x-auto -mx-0.5 px-0.5">
      {mostrarToggle && (
        <>
          <button
            type="button"
            onClick={() => onModoVentaChange(idx, "NORMAL")}
            className={`${chip} ${modo === "NORMAL" ? activo : inactivo}`}
          >
            Formato x{factor}
          </button>
          <button
            type="button"
            onClick={() => onModoVentaChange(idx, "UNIDAD_REMANENTE")}
            className={`${chip} ${modo === "UNIDAD_REMANENTE" ? activo : inactivo}`}
          >
            Unidad suelta
          </button>
        </>
      )}
      {conStock && (
        <span className={`${chip} pos-text-muted border-dashed`}>{stockChipText(item)}</span>
      )}
    </div>
  );
}

function CarritoVenta({
  items,
  onCantidadChange,
  onEliminar,
  onLimpiar,
  subtotal,
  descuento = 0,
  descuentoInfo = null,
  onAbrirDescuento,
  clienteSeleccionado = null,
  onAbrirCliente,
  esDeposito = false,
  onModoVentaChange,
  // Solo VISUAL. El tope de cantidad sale de `item.stockMax` y no mira esto:
  // apagarlo oculta el número, no levanta el límite.
  mostrarStock = false,
}) {
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);
  if (items.length === 0) {
    return (
      <SunmiCard className="p-2 lg:p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold pos-text-muted-strong">
            Carrito vacio
          </span>
          {onAbrirCliente && (
            <button
              onClick={onAbrirCliente}
              className={`text-xs pos-text-link ${
                clienteSeleccionado ? "font-medium" : ""
              }`}
            >
              {clienteSeleccionado ? clienteSeleccionado.nombre : "Cliente"}
            </button>
          )}
        </div>
        <div className="text-sm pos-text-muted text-center py-4">
          No hay productos en el carrito.
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-2 lg:p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold pos-text-muted-strong">
          Carrito ({items.length})
        </span>
        <div className="flex items-center gap-3">
          {onAbrirCliente && (
            <button
              onClick={onAbrirCliente}
              className={`text-xs pos-text-link ${
                clienteSeleccionado ? "font-medium" : ""
              }`}
            >
              {clienteSeleccionado ? clienteSeleccionado.nombre : "Cliente"}
            </button>
          )}
          {onAbrirDescuento && (
            <button
              onClick={onAbrirDescuento}
              className={`text-xs ${
                descuento > 0
                  ? "pos-text-success font-medium"
                  : "pos-text-accent"
              }`}
            >
              {descuento > 0 ? `Desc. -$${formatPrecio(descuento)}` : "Descuento"}
            </button>
          )}
          {confirmarLimpiar ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs pos-text-danger">¿Vaciar carrito?</span>
              <button
                onClick={() => { onLimpiar(); setConfirmarLimpiar(false); }}
                className="text-xs font-bold pos-text-danger"
              >
                Vaciar
              </button>
              <button
                onClick={() => setConfirmarLimpiar(false)}
                className="text-xs pos-text-muted"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmarLimpiar(true)}
              className="text-xs pos-text-danger"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* MOBILE: lista compacta (altura reducida + fila de chips scrolleable) */}
      <div className="block lg:hidden space-y-1">
        {items.map((item, idx) => (
          <div
            key={item.claveCarrito || `${item.productoBaseId}-${idx}`}
            className="p-1.5 rounded-lg pos-bg-surface animate-fade-in"
          >
            {/* Fila 1: nombre + total + quitar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 font-medium text-sm truncate">{item.nombre}</div>
              <span className="shrink-0 text-sm font-bold pos-text-accent">
                ${formatPrecio(subtotalLinea(item))}
              </span>
              <button
                onClick={() => onEliminar(idx)}
                className="shrink-0 pos-text-danger text-base leading-none px-1"
                title="Quitar"
                aria-label="Quitar"
              >
                ✕
              </button>
            </div>

            {item.listaPrecioNombre && item.tipoPrecioAplicado && item.tipoPrecioAplicado !== "PRECIO_VENTA" && (
              <span className="block text-[10px] sunmi-text-muted truncate">
                {item.listaPrecioNombre}
              </span>
            )}

            {/* Fila 2: servicio (desglose sin stepper) o producto normal (precio + stepper) */}
            {item.esServicio ? (
              <div className="mt-1 text-[11px] pos-text-muted space-y-0.5">
                <div className="flex justify-between">
                  <span>Carga solicitada</span>
                  <span>$ {formatPrecio(item.importeBaseServicio)}</span>
                </div>
                {Number(item.recargoServicioPct) > 0 && (
                  <div className="flex justify-between">
                    <span>Recargo {item.recargoServicioPct}%</span>
                    <span>$ {formatPrecio(item.recargoServicioImporte)}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] pos-text-muted whitespace-nowrap">
                    $ {formatPrecio(item.precio)} c/u
                    <EtiquetaOferta item={item} />
                  </span>
                  <CantidadStepper
                    item={item}
                    idx={idx}
                    onCantidadChange={onCantidadChange}
                    compact
                  />
                </div>

                {/* Fila 3: selector Formato/Unidad + stock compacto si se muestra */}
                <ChipsRowMobile
                  mostrarStock={mostrarStock}
                  item={item}
                  idx={idx}
                  esDeposito={esDeposito}
                  onModoVentaChange={onModoVentaChange}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {/* DESKTOP: tabla normal */}
      <div className="hidden lg:block overflow-x-auto">
        <SunmiTable
          headers={["Producto", "Cant.", "P. Unit.", "Subtotal", ""]}
        >
          {items.map((item, idx) => (
            <tr
              key={item.claveCarrito || `${item.productoBaseId}-${idx}`}
              className="pos-bg-row pos-bg-row-hover animate-fade-in"
            >
              <td className="px-2 py-1.5 truncate max-w-[160px] text-sm">
                <div className="truncate">{item.nombre}</div>
                {item.esServicio ? (
                  <span className="block text-[10px] pos-text-muted">
                    Carga solicitada $ {formatPrecio(item.importeBaseServicio)}
                    {Number(item.recargoServicioPct) > 0
                      ? ` · Recargo ${item.recargoServicioPct}% $ ${formatPrecio(item.recargoServicioImporte)}`
                      : ""}
                  </span>
                ) : (
                  <>
                    {textoOfertaDeLinea(item) && (
                      <span className="block text-xs2 sunmi-text-muted truncate">
                        $ {formatPrecio(item.precio)}
                        <EtiquetaOferta item={item} />
                      </span>
                    )}
                    {item.listaPrecioNombre && item.tipoPrecioAplicado && item.tipoPrecioAplicado !== "PRECIO_VENTA" && (
                      <span className="block text-[10px] sunmi-text-muted truncate">
                        {item.listaPrecioNombre}
                      </span>
                    )}
                    {admiteRemanente(item, esDeposito) && onModoVentaChange && (
                      <ModoVentaToggle
                        item={item}
                        idx={idx}
                        onModoVentaChange={onModoVentaChange}
                      />
                    )}
                    {mostrarStockDeposito(item, esDeposito, mostrarStock) && (
                      <StockDeposito item={item} />
                    )}
                  </>
                )}
              </td>
              <td className="px-2 py-1.5">
                {item.esServicio ? (
                  <span className="block text-center text-sm">1</span>
                ) : (
                  <CantidadStepper
                    item={item}
                    idx={idx}
                    onCantidadChange={onCantidadChange}
                  />
                )}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm">
                $ {formatPrecio(item.precio)}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap text-sm font-medium">
                $ {formatPrecio(subtotalLinea(item))}
              </td>
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onEliminar(idx)}
                  className="pos-text-danger text-lg leading-none"
                  title="Eliminar"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </SunmiTable>
      </div>

      {/* Subtotal */}
      <div className="flex justify-end mt-2 px-1">
        <div className="text-right">
          <span className="text-xs pos-text-muted mr-2">SUBTOTAL</span>
          <span className="text-lg font-bold">$ {formatPrecio(subtotal)}</span>
        </div>
      </div>
    </SunmiCard>
  );
}

export default memo(CarritoVenta);
