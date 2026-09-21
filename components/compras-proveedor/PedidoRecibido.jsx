"use client";

// UN PEDIDO YA RECIBIDO, EN CASTELLANO Y PARA LEER.
//
// ── QUÉ REEMPLAZA, Y POR QUÉ ES UNA PANTALLA APARTE ───────────────────────
//
// La pantalla de un pedido cerrado mostraba la misma maquinaria que la
// recepción: un contador de "4 / 15 revisadas · 11 sin revisar", cuatro filtros
// —Todas, Revisar, Coinciden, Sin vincular—, la tabla de comprobantes con su
// cuadradito de seleccionar, un bloque "Detalle (24 items)" vacío, y cuatro
// fechas de flujo. Todo eso es trabajo pendiente y vocabulario de sistema sobre
// algo que ya se cerró.
//
// Se hizo un componente propio en vez de esconder bloques uno por uno: mientras
// las dos pantallas compartan el árbol, cada cosa que se agregue a la recepción
// aparece también acá y hay que acordarse de taparla. Acá no hay nada que
// tapar porque no hay nada.
//
// ── EL IDIOMA ─────────────────────────────────────────────────────────────
//
// Nada de "línea", "item", "al precio del ERP" ni "SIN_TOTAL". Se dice
// renglones del papel, productos, bultos, "te facturó", "a tus precios vale",
// "ganás". El que mira esta pantalla acaba de recibir mercadería, no de
// depurar un sistema.
//
// ── LAS MEDIDAS SON LAS QUE YA USA ESTA PANTALLA ──────────────────────────
//
// `SunmiCard` con su `p-3`, los tokens de espacio `renglon` y `dato`, la escala
// de letra del proyecto y `SunmiSeparator` para los separadores finos. No se
// eligió ningún número acá.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { formatearMoneda } from "@/lib/moneda";
import { gananciaDelDeposito } from "@/lib/compras-proveedor/gananciaDelDeposito";
import { loQueEntro, textoDeCantidad } from "@/lib/compras-proveedor/loQueEntro";

/** Un renglón de producto: nombre arriba, cuenta abajo, total a la derecha. */
function RenglonDeProducto({ r }) {
  return (
    <div className="flex items-start justify-between gap-renglon">
      <span className="min-w-0 flex flex-col">
        <span className="text-sm3 sunmi-text-strong break-words">{r.producto}</span>
        <span className="text-sm2 sunmi-text-muted tabular-nums">
          {textoDeCantidad(r)}
          {r.costo != null ? ` · ${formatearMoneda(r.costo)} cada uno` : ""}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 font-semibold sunmi-text-strong">
        {r.total == null ? "—" : formatearMoneda(r.total)}
      </span>
    </div>
  );
}

/** Los tres números de plata, con el rótulo en castellano. */
function RenglonDePlata({ rotulo, valor, fuerte = false, porcentaje = null }) {
  return (
    <div className="flex items-baseline justify-between gap-renglon">
      <span className={fuerte ? "text-sm3 sunmi-text-strong" : "text-sm2 sunmi-text-muted"}>
        {rotulo}
      </span>
      <span
        className={`shrink-0 whitespace-nowrap tabular-nums ${
          fuerte ? "text-xl2 font-semibold sunmi-text-accent" : "text-sm2 sunmi-text-strong"
        }`}
      >
        {formatearMoneda(valor)}
        {porcentaje != null
          ? ` (${porcentaje < 0 ? "−" : ""}${Math.abs(porcentaje).toFixed(1).replace(".", ",")} %)`
          : ""}
      </span>
    </div>
  );
}

export default function PedidoRecibido({
  pedido,
  comprobante = null,
  filas = [],
  sinComprobante = [],
}) {
  const proveedor = pedido?.proveedor?.nombre || "el proveedor";
  const hayPapel = filas.length > 0;
  const cuenta = gananciaDelDeposito(filas);

  // ── UN PEDIDO CERRADO SIN NINGÚN PAPEL TAMBIÉN SE LEE ──────────────────
  //
  // Es el camino de "llegó sin factura": se cuenta contra el pedido y se cierra
  // sin comprobante. Ahí no hay conciliación de dónde sacar las filas, y sin
  // esto la pantalla quedaba con el encabezado y nada más.
  //
  // Las líneas del pedido entran por el mismo lugar que las que ningún
  // comprobante trajo, porque es exactamente lo que son. Y la plata no se
  // dibuja: sin papel no hay precio facturado contra el cual comparar, y un
  // "Te facturó $0,00" sería una afirmación falsa.
  const sinPapelDelPedido =
    hayPapel || sinComprobante.length > 0
      ? sinComprobante
      : (pedido?.detalles || []).map((d) => ({
          pedidoDetalleId: d.id,
          producto: d.producto?.base?.nombre || null,
          cantidadRecibida: d.cantidadRecibida,
          costoCatalogo: d.precioCosto,
          unidad: d.unidad,
        }));

  const { delPapel, sinPapel } = loQueEntro({ filas, sinComprobante: sinPapelDelPedido });

  return (
    <section className="space-y-3">
      {/* ── 1 · QUÉ ES Y CUÁNDO LLEGÓ ──────────────────────────────────────
          Dos renglones. Las cuatro fechas de flujo —creado, confirmado,
          enviado, anulado— se fueron: después de recibir, la única que alguien
          busca es cuándo llegó. */}
      <SunmiCard className="p-3 space-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold sunmi-text-strong truncate">Pedido #{pedido?.id}</span>
          <SunmiPill color="green">Recibido</SunmiPill>
        </div>
        <p className="text-sm2 sunmi-text-muted truncate">
          {proveedor} · llegó el {diaMesAR(pedido?.fechaRecibido)} a las{" "}
          {horaAR(pedido?.fechaRecibido)}
        </p>
      </SunmiCard>

      {/* ── 2 · LA PLATA, ARRIBA Y EN CASTELLANO ───────────────────────────
          "Te facturó" y "a tus precios vale" en vez de factura y precio del
          ERP; la ganancia en grande porque es la respuesta, y debajo, en
          chico, qué significa. */}
      {!hayPapel && (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-muted break-words">
            Este pedido se cerró sin ningún papel del proveedor, así que no hay con qué comparar
            lo que costó: abajo está lo que entró, a tus precios.
          </p>
        </SunmiCard>
      )}

      {hayPapel && (
      <SunmiCard className="p-3 space-y-dato">
        <RenglonDePlata rotulo={`Te facturó ${proveedor}`} valor={cuenta.facturado} />
        <RenglonDePlata rotulo="A tus precios vale" valor={cuenta.interno} />
        <SunmiSeparator />
        <RenglonDePlata rotulo="Ganás" valor={cuenta.ganancia} fuerte />
        <p className="text-sm2 sunmi-text-muted break-words">
          Es lo que gana el depósito con esta compra
          {cuenta.porcentaje != null
            ? `: ${Math.abs(cuenta.porcentaje).toFixed(1).replace(".", ",")} %`
            : ""}
          .
        </p>
      </SunmiCard>
      )}

      {/* ── 3 · UNA SOLA TARJETA DEL PAPEL ─────────────────────────────────
          Antes había dos contando lo mismo: la tabla de comprobantes, con su
          cuadradito de seleccionar y sus columnas de sistema, y la tarjeta de
          la conciliación que decía "Sin número todavía · Sin total". Queda
          una, y dice en criollo lo único que hay que saber del papel. */}
      {comprobante && (
        <SunmiCard className="p-3 space-y-dato">
          <span className="text-sm3 sunmi-text-strong break-words">
            El papel de {proveedor} · {filas.length}{" "}
            {filas.length === 1 ? "renglón" : "renglones"}
          </span>
          <p className="text-sm2 sunmi-text-muted break-words">
            {comprobante.estado === "SIN_TOTAL"
              ? "No traía total impreso, así que el total lo sumó el sistema."
              : "El total del papel coincidió con la suma de sus renglones."}
          </p>
        </SunmiCard>
      )}

      {/* ── 4 · ENTRÓ ESTO ─────────────────────────────────────────────────
          Un renglón por producto en UNA tarjeta con separadores finos. Antes
          era una tarjeta grande por renglón del papel, con sus botones: eso es
          para operar, y acá no hay nada que operar. */}
      {delPapel.length > 0 && (
        <div className="space-y-1">
          <span className="block text-sm3 font-medium sunmi-text-strong">Entró esto</span>
          <SunmiCard className="p-3 space-y-renglon">
            {delPapel.map((r, i) => (
              <div key={r.pedidoDetalleId ?? i} className="space-y-renglon">
                {i > 0 && <SunmiSeparator />}
                <RenglonDeProducto r={r} />
              </div>
            ))}
          </SunmiCard>
        </div>
      )}

      {/* ── 5 · LOS QUE NO VENÍAN EN EL PAPEL ──────────────────────────────
          Entraron con la cantidad pedida porque el cierre viejo completaba lo
          que nadie declaraba. Se dice con todas las letras: es el único lugar
          donde alguien puede notar que algo no llegó. */}
      {sinPapel.length > 0 && (
        <div className="space-y-1">
          <span className="block text-sm3 font-medium sunmi-text-strong">
            {sinPapel.length === 1
              ? "Este no venía en el papel"
              : `Estos ${sinPapel.length} no venían en el papel`}
          </span>
          <SunmiCard className="p-3 space-y-renglon">
            <p className="text-sm2 sunmi-text-muted break-words">
              Entraron con la cantidad que habías pedido. Si alguno no llegó, hay que corregirlo.
            </p>
            {sinPapel.map((r, i) => (
              <div key={r.pedidoDetalleId ?? i} className="space-y-renglon">
                <SunmiSeparator />
                <RenglonDeProducto r={r} />
              </div>
            ))}
          </SunmiCard>
        </div>
      )}
    </section>
  );
}
