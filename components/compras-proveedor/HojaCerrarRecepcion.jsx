"use client";

// LA HOJA QUE SE ABRE ANTES DE CERRAR LA RECEPCIÓN.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Un `confirm()` del navegador que decía "Solo continuar si la mercadería llegó
// físicamente" y se aceptaba sin leer. Detrás de ese OK, el servidor daba por
// recibido TODO lo pedido, incluidas las líneas que ningún comprobante trajo:
// medido sobre el pedido 232, nueve líneas que nadie vio metieron 620 unidades
// por $1.263.705,60.
//
// ── DOS BLOQUES, Y SOLO UNO PIDE RESPUESTA ────────────────────────────────
//
// Arriba, LAS QUE NADIE VIO: una por una, "llegó" o "no llegó", con "no llegó"
// marcado de entrada. Ahí no hay nada que interpretar —la pregunta es binaria y
// la respuesta por omisión es la que no inventa mercadería—, y es el único
// bloque que pide una respuesta.
//
// Abajo, LO QUE QUEDA A MEDIAS: cuántos renglones van sin mirar, cuántos
// precios sin contestar, cuántas líneas sin vincular. Se DICE y no bloquea. Un
// bloqueo sobre "faltan tres precios" no hace que alguien los conteste: hace
// que alguien invente una respuesta para poder cerrar, y esa respuesta escribe
// un costo. La decisión es de Emanuel; lo que no puede pasar es que cierre sin
// que la pantalla se lo haya dicho.
//
// El armado es el de `HojaCorregirLinea`: mismos bloques con línea fina, mismo
// pie de un botón ancho. No se eligió ninguna medida acá.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { formatearMoneda } from "@/lib/moneda";
import {
  LLEGADA,
  recibidosDelCierre,
  resumenDelCierre,
  textoDeLoQueQueda,
} from "@/lib/compras-proveedor/cierreDeRecepcion";

const limpio = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

/** Un bloque: línea fina arriba, título, contenido. El mismo de la otra hoja. */
function Bloque({ titulo, children }) {
  return (
    <section className="border-t sunmi-divider pt-renglon flex flex-col gap-renglon">
      <span className="text-sm3 font-medium sunmi-text-strong">{titulo}</span>
      {children}
    </section>
  );
}

export default function HojaCerrarRecepcion({
  abierta,
  onCerrar,
  onConfirmar,
  filas = [],
  sinComprobante = [],
  contados = {},
  guardando = false,
}) {
  // ── LA RESPUESTA POR OMISIÓN ES "NO LLEGÓ" ─────────────────────────────
  //
  // No es pesimismo: es la única que no escribe nada. Si alguien cierra sin
  // mirar este bloque, el stock queda como estaba y la mercadería que sí llegó
  // se puede cargar después; al revés —dar por recibido lo que nadie vio— el
  // error entra al stock y no se ve hasta que alguien cuenta el depósito.
  const [llegadas, setLlegadas] = useState({});

  useEffect(() => {
    if (!abierta) return;
    const inicial = {};
    for (const d of sinComprobante) {
      if (d?.pedidoDetalleId != null) inicial[d.pedidoDetalleId] = LLEGADA.NO_LLEGO;
    }
    setLlegadas(inicial);
  }, [abierta, sinComprobante]);

  const resumen = useMemo(
    () => resumenDelCierre({ filas, sinComprobante, llegadas }),
    [filas, sinComprobante, llegadas]
  );
  const loQueQueda = textoDeLoQueQueda(resumen);

  if (!abierta) return null;

  const confirmar = () => {
    onConfirmar?.(recibidosDelCierre({ filas, sinComprobante, llegadas, contados }));
  };

  return (
    <SunmiModalLayout
      open={!!abierta}
      title="Cerrar la recepción"
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja"
      destructivo
      espacioCuerpo="gap-renglon"
      footer={
        <div className="w-full flex flex-col gap-renglon">
          <SunmiButton
            color="primary"
            type="button"
            disabled={guardando}
            onClick={confirmar}
            className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
          >
            {guardando ? "Cerrando…" : "Cerrar la recepción"}
          </SunmiButton>
        </div>
      }
    >
      {/* ── 1 · LO QUE NINGÚN COMPROBANTE TRAJO ─────────────────────────── */}
      {sinComprobante.length > 0 ? (
        <div className="flex flex-col gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">
            {sinComprobante.length === 1
              ? "Una línea del pedido que ningún comprobante trajo"
              : `${sinComprobante.length} líneas del pedido que ningún comprobante trajo`}
          </span>
          <span className="text-sm3 sunmi-text-muted break-words">
            Pueden haber llegado sin papel o no haber llegado. Lo que digas que no llegó no entra
            al stock.
          </span>

          {sinComprobante.map((d) => {
            const id = d.pedidoDetalleId;
            const llego = llegadas[id] === LLEGADA.LLEGO;
            return (
              <div key={id} className="flex flex-col gap-dato">
                <span className="flex items-baseline justify-between gap-renglon">
                  <span className="min-w-0 text-sm3 sunmi-text-strong truncate">
                    {d.producto || "Sin nombre"}
                  </span>
                  <span className="shrink-0 text-sm2 sunmi-text-muted tabular-nums">
                    pediste {limpio(d.cantidadPedida)} · {formatearMoneda(d.costoCatalogo)}
                  </span>
                </span>
                <div className="flex gap-dentroFiltro">
                  <SunmiButton
                    color={llego ? "primary" : "slate"}
                    type="button"
                    aria-pressed={llego}
                    disabled={guardando}
                    onClick={() => setLlegadas((p) => ({ ...p, [id]: LLEGADA.LLEGO }))}
                    className="flex-1 min-h-toque justify-center rounded-control text-sm3"
                  >
                    Llegó
                  </SunmiButton>
                  <SunmiButton
                    color={!llego ? "primary" : "slate"}
                    type="button"
                    aria-pressed={!llego}
                    disabled={guardando}
                    onClick={() => setLlegadas((p) => ({ ...p, [id]: LLEGADA.NO_LLEGO }))}
                    className="flex-1 min-h-toque justify-center rounded-control text-sm3"
                  >
                    No llegó
                  </SunmiButton>
                </div>
              </div>
            );
          })}

          <span className="text-sm3 sunmi-text-muted break-words">
            Entran {resumen.llegaron} de {resumen.sinComprobante}: {limpio(resumen.unidadesQueEntran)}{" "}
            {resumen.unidadesQueEntran === 1 ? "bulto" : "bultos"} de lo pedido.
          </span>
        </div>
      ) : (
        <span className="text-sm3 sunmi-text-muted break-words">
          Todas las líneas del pedido tienen un comprobante que las respalda.
        </span>
      )}

      {/* ── 2 · LO QUE QUEDA A MEDIAS, QUE SE DICE Y NO BLOQUEA ─────────── */}
      {loQueQueda && (
        <Bloque titulo="Lo que queda a medias">
          <span className="text-sm3 sunmi-text-muted break-words">{loQueQueda}</span>
          <span className="text-sm3 sunmi-text-muted break-words">
            Se puede cerrar igual: lo que entra es lo que dice el papel y lo que contaste.
          </span>
        </Bloque>
      )}

      {/* ── 3 · QUÉ VA A PASAR, EN UNA LÍNEA ────────────────────────────── */}
      <Bloque titulo="Al cerrar">
        <span className="text-sm3 sunmi-text-muted break-words">
          Entra al stock lo contado y lo que declara el papel, el pedido queda RECIBIDO y no se
          puede seguir controlando.
        </span>
      </Bloque>
    </SunmiModalLayout>
  );
}
