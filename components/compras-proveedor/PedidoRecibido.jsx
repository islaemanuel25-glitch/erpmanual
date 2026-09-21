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
// Nada de "línea", "item", "renglón", "al precio del ERP" ni "SIN_TOTAL". Se
// dice PRODUCTOS —también donde antes decía renglones del papel—, bultos, "te
// facturó", "a tus precios vale", "ganás". El que mira esta pantalla acaba de
// recibir mercadería, no de depurar un sistema.
//
// Y cuando la palabra lleva un número al lado, el número se cuenta con esa
// palabra: "15 productos" se cuenta por producto y no por renglón impreso, o la
// frase es falsa el día que un producto venga en dos renglones.
//
// ── LAS MEDIDAS SON LAS QUE YA USA ESTA PANTALLA ──────────────────────────
//
// `SunmiCard` con su `p-3`, los tokens de espacio `renglon` y `dato`, la escala
// de letra del proyecto y `SunmiSeparator` para los separadores finos. No se
// eligió ningún número acá.
//
// ── Y ESTA PANTALLA NO DECIDE SI HAY PAPEL ────────────────────────────────
//
// Lo pregunta. El criterio vive en `lib/compras-proveedor/papelDelPedido`, con
// su candado, porque esta pantalla ya afirmó una vez "se cerró sin ningún
// papel" sobre un pedido con comprobante leído: lo dedujo de que su lista de
// filas viniera vacía, sin saber que venía vacía porque nadie la había pedido.
// Son cuatro estados y no un booleano, a propósito — "todavía no sé" y "no se
// pudo saber" no se pueden dibujar como "no hay".

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { formatearMoneda } from "@/lib/moneda";
import { gananciaDelDeposito } from "@/lib/compras-proveedor/gananciaDelDeposito";
import { cuantosProductos, loQueEntro, textoDeCantidad } from "@/lib/compras-proveedor/loQueEntro";
import { PAPEL, papelDelPedido } from "@/lib/compras-proveedor/papelDelPedido";

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
  conciliacion = null,
  falloElPapel = false,
}) {
  const proveedor = pedido?.proveedor?.nombre || "el proveedor";

  // ── SI HAY PAPEL NO LO DECIDE ESTA PANTALLA ───────────────────────────
  //
  // Lo contesta `papelDelPedido` mirando la MISMA respuesta que trae las filas,
  // que es la que el servidor usa para resolverlo. Acá se miraba `filas.length`,
  // y una lista vacía puede ser tres cosas distintas: que no haya comprobantes,
  // que los haya y no estén leídos, o —el defecto— que la pantalla nunca haya
  // preguntado. Las tres se veían como "se cerró sin ningún papel", que sobre el
  // pedido 232 era falso y hablaba de mercadería.
  const estadoDelPapel = papelDelPedido({ conciliacion, fallo: falloElPapel });
  const hayPapel = estadoDelPapel === PAPEL.CON_PAPEL;
  const cuenta = gananciaDelDeposito(filas);

  // Las líneas que ningún comprobante trajo salen SIEMPRE de la conciliación:
  // cuando el pedido no tiene papel, o lo tiene sin leer, ahí vienen todas las
  // del pedido, que es exactamente lo que hay que mostrar. La lista que esta
  // pantalla armaba por su cuenta con `pedido.detalles` se fue: era una segunda
  // fuente para el mismo dato, y solo la alcanzaba la rama equivocada.
  const { delPapel, sinPapel } = loQueEntro({ filas, sinComprobante });
  const productosDelPapel = cuantosProductos(filas);

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

      {/* ── MIENTRAS NO SE SABE, NO SE AFIRMA ────────────────────────────
          Cada estado dice lo suyo. Lo que no puede pasar —y es de donde salió
          este bloque— es que "todavía no pregunté" se dibuje con el mismo
          cartel que "no hay papel". */}
      {estadoDelPapel === PAPEL.CARGANDO && <SunmiLoader />}

      {estadoDelPapel === PAPEL.NO_SE_PUDO && (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-muted break-words">
            No se pudo leer el papel de este pedido. Volvé a entrar en un rato: lo que entró está
            guardado, lo que falta es mostrarlo.
          </p>
        </SunmiCard>
      )}

      {estadoDelPapel === PAPEL.SIN_LEER && (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-muted break-words">
            El papel de {proveedor} está subido pero todavía no se leyó, así que no hay con qué
            comparar lo que costó: abajo está lo que entró, a tus precios.
          </p>
        </SunmiCard>
      )}

      {estadoDelPapel === PAPEL.SIN_PAPEL && (
        <SunmiCard className="p-3">
          <p className="text-sm2 sunmi-text-muted break-words">
            Este pedido se cerró sin ningún papel del proveedor, así que no hay con qué comparar
            lo que costó: abajo está lo que entró, a tus precios.
          </p>
        </SunmiCard>
      )}

      {/* ── 2 · LA PLATA, ARRIBA Y EN CASTELLANO ───────────────────────────
          "Te facturó" y "a tus precios vale" en vez de factura y precio del
          ERP; la ganancia en grande porque es la respuesta, y debajo, en
          chico, qué significa. */}
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
            {/* EL NÚMERO CUENTA PRODUCTOS, NO RENGLONES. Acá decía
                `filas.length`, que es cuántas veces aparece algo impreso en el
                papel: con un producto repartido en dos renglones, "15
                productos" sobre 14 distintos sería falso. El criterio está en
                `cuantosProductos` y es el mismo en toda la pantalla. */}
            El papel de {proveedor} · {productosDelPapel}{" "}
            {productosDelPapel === 1 ? "producto" : "productos"}
          </span>
          <p className="text-sm2 sunmi-text-muted break-words">
            {comprobante.estado === "SIN_TOTAL"
              ? "No traía total impreso, así que el total lo sumó el sistema."
              : "El total del papel coincidió con la suma de sus productos."}
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
          donde alguien puede notar que algo no llegó.

          Y EL TÍTULO DEPENDE DE SI HAY PAPEL. Sin papel, estas líneas no son
          "las que el papel no trajo": son todo lo que entró, y llamarlas por la
          ausencia de algo que no existe es la misma clase de frase falsa que
          trajo esta corrección. */}
      {sinPapel.length > 0 && (
        <div className="space-y-1">
          <span className="block text-sm3 font-medium sunmi-text-strong">
            {!hayPapel
              ? "Entró esto"
              : sinPapel.length === 1
                ? "Este no venía en el papel"
                : `Estos ${sinPapel.length} no venían en el papel`}
          </span>
          <SunmiCard className="p-3 space-y-renglon">
            {hayPapel && (
              <p className="text-sm2 sunmi-text-muted break-words">
                Entraron con la cantidad que habías pedido. Si alguno no llegó, hay que corregirlo.
              </p>
            )}
            {sinPapel.map((r, i) => (
              <div key={r.pedidoDetalleId ?? i} className="space-y-renglon">
                {/* El separador va entre renglones. Con la frase de arriba
                    presente también va antes del primero, porque ahí separa del
                    texto; sin ella, un separador arriba de todo es una línea
                    suelta contra el borde de la tarjeta. */}
                {(hayPapel || i > 0) && <SunmiSeparator />}
                <RenglonDeProducto r={r} />
              </div>
            ))}
          </SunmiCard>
        </div>
      )}
    </section>
  );
}
