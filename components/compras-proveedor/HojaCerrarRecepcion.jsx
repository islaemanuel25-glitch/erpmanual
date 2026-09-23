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
import {
  ESTADO_PAGO_CIERRE,
  estadoSacaPlata,
  pagoDelCierreEnPantalla,
  totalDeLasFacturasDelCierre,
} from "@/lib/compras-proveedor/pagoDelCierre";
import {
  MEDIO_PAGO_PROVEEDOR,
  MEDIOS_PAGO_PROVEEDOR,
  ROTULO_MEDIO_PAGO,
} from "@/lib/finanzas/pagosProveedores";

import BloquePagoAlProveedor from "./BloquePagoAlProveedor";

/** Los medios con que se le paga a un proveedor, como los ofrece Finanzas. */
const MEDIOS = MEDIOS_PAGO_PROVEEDOR.map((m) => ({ valor: m, texto: ROTULO_MEDIO_PAGO[m] }));

/** El pago arranca sin decidir: nadie elige "pendiente" por no haber mirado. */
const PAGO_INICIAL = Object.freeze({
  estado: null,
  totalEscrito: "",
  totalConfirmado: false,
  montoAhora: "",
  medio: MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA,
  turnoId: "",
  vencimiento: "",
});

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
  // ── EL MOTIVO POR EL QUE EL CIERRE NO ENTRÓ ──────────────────────────
  //
  // Va acá, donde se tocó el botón, y no en un cartel del navegador: el
  // `alert` sale de la pantalla, no se puede copiar, y en un teléfono tapa
  // justo lo que hay que mirar. El 2026-09-22 la regla que frenaba el cierre
  // del 242 llegó como "Error interno al recibir pedido" y el motivo —que
  // nombraba el producto y decía qué tocar— se quedó en el log del servidor.
  motivoDelFallo = null,
  // ── EL PAGO AL PROVEEDOR ─────────────────────────────────────────────
  //
  // `totalesDeFacturas` es el total impreso de cada comprobante del pedido
  // —null donde el papel no lo trae—, de la misma conciliación que dibuja la
  // pantalla. Con él se decide si el total se conoce o hay que escribirlo.
  proveedor = "el proveedor",
  totalesDeFacturas = [],
  puedeRegistrarPago = false,
  // La ubicación dueña del pedido, `{ id, nombre }`: la que debe y la única de
  // la que puede salir el pago inicial. Se muestra fija.
  ubicacionDuena = null,
}) {
  // El pago NO se reinicia al reabrir la hoja: la pantalla la cierra al
  // confirmar y la vuelve a abrir si el servidor frena, y ahí lo cargado —el
  // total escrito, el monto, el turno— tiene que seguir estando. Después de un
  // cierre que entró, el pedido pasa a RECIBIDO y esta hoja deja de existir.
  const [pago, setPago] = useState(PAGO_INICIAL);

  const facturas = useMemo(() => totalDeLasFacturasDelCierre(totalesDeFacturas), [totalesDeFacturas]);
  const enPantalla = pagoDelCierreEnPantalla({
    totales: totalesDeFacturas,
    totalEscrito: pago.totalEscrito,
    totalConfirmado: pago.totalConfirmado,
    estado: pago.estado,
    pago: {
      monto: pago.estado === ESTADO_PAGO_CIERRE.PARCIAL ? pago.montoAhora : undefined,
      medio: pago.medio,
      // El origen no se elige: es la ubicación dueña del pedido.
      localOrigenId: ubicacionDuena?.id ?? null,
      turnoId: pago.turnoId,
    },
  });

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
    if (!enPantalla.listo) return;
    const sacaPlata = estadoSacaPlata(pago.estado);
    // Lo que viaja es lo que la persona decidió, sin convertir: el total y el
    // monto tal cual se escribieron los interpreta el servidor con la misma
    // regla que usó esta hoja para dejar confirmar.
    const pagoAlProveedor = {
      estado: pago.estado,
      totalAPagar: enPantalla.pideTotal ? pago.totalEscrito : undefined,
      totalConfirmado: enPantalla.pideTotal ? pago.totalConfirmado : undefined,
      vencimientoProveedor: pago.estado === ESTADO_PAGO_CIERRE.PAGADA ? null : pago.vencimiento || null,
      pago: sacaPlata
        ? {
            monto: pago.estado === ESTADO_PAGO_CIERRE.PARCIAL ? pago.montoAhora : undefined,
            medio: pago.medio,
            localOrigenId: ubicacionDuena?.id ?? null,
            turnoId: pago.turnoId ? Number(pago.turnoId) : null,
          }
        : null,
    };
    onConfirmar?.(recibidosDelCierre({ filas, sinComprobante, llegadas, contados }), pagoAlProveedor);
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
          {motivoDelFallo && (
            <p className="text-sm3 sunmi-text-danger break-words" aria-live="polite">
              {motivoDelFallo}
            </p>
          )}
          {/* Lo que falta para poder confirmar, dicho: un botón apagado sin
              motivo se lee como que la aplicación se trabó. */}
          {!enPantalla.listo && enPantalla.error && (
            <p className="text-sm3 sunmi-text-muted break-words">{enPantalla.error}</p>
          )}
          <SunmiButton
            color="primary"
            type="button"
            disabled={guardando || !enPantalla.listo}
            onClick={confirmar}
            className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
          >
            {guardando ? "Cerrando…" : "Confirmar cierre de compra"}
          </SunmiButton>
        </div>
      }
    >
      {/* ── 1 · LO QUE NINGÚN COMPROBANTE TRAJO ─────────────────────────── */}
      {sinComprobante.length > 0 ? (
        <div className="flex flex-col gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">
            {sinComprobante.length === 1
              ? "Un producto del pedido que ningún comprobante trajo"
              : `${sinComprobante.length} productos del pedido que ningún comprobante trajo`}
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
          Todos los productos del pedido tienen un comprobante que los respalda.
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

      {/* ── 3 · EL PAGO AL PROVEEDOR ─────────────────────────────────────
          Antes del botón final, a propósito: cerrar la compra es también
          decidir cómo queda la deuda, y se confirman juntas. */}
      <Bloque titulo="Pago al proveedor">
        <BloquePagoAlProveedor
          proveedor={proveedor}
          estadoEnPantalla={enPantalla}
          sumaConocida={facturas.sumaConocida}
          valor={pago}
          onCambiar={setPago}
          puedeRegistrarPago={puedeRegistrarPago}
          medios={MEDIOS}
          ubicacionDuena={ubicacionDuena}
          deshabilitado={guardando}
        />
      </Bloque>

      {/* ── 4 · QUÉ VA A PASAR, EN UNA LÍNEA ────────────────────────────── */}
      <Bloque titulo="Al confirmar">
        <span className="text-sm3 sunmi-text-muted break-words">
          Entra al stock lo contado y lo que declara el papel, el pedido queda RECIBIDO y no se
          puede seguir controlando, y nace la deuda con el proveedor con el pago que elegiste.
          Todo junto: si algo falla, no queda nada a medias.
        </span>
      </Bloque>
    </SunmiModalLayout>
  );
}
