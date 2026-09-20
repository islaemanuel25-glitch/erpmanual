"use client";

// LAS LÍNEAS DE LA FACTURA, EN EL ORDEN DEL PAPEL.
//
// ── EL ORDEN LO MANDA LA FACTURA Y NO EL PEDIDO ───────────────────────────
//
// El renglón 1 del papel es el primero de la pantalla. Parece un detalle y es
// lo que hace usable la pantalla: se controla con la factura en la mano, y si
// la pantalla ordena por otra cosa —el pedido, el nombre, el código— hay que
// buscar cada renglón en vez de bajar con el dedo.
//
// Las líneas ya llegan en ese orden: `ComprobanteLinea` se guarda en el orden
// en que el lector las transcribió, y la conciliación no las reordena. Acá no
// se ordena nada, y eso es deliberado — hay un candado en transferencias que
// dice lo mismo sobre su lista.
//
// ── LOS CUATRO FILTROS SON LA PIEZA DEL KIT ───────────────────────────────
//
// `SunmiFiltroEstado`, la misma de la recepción de una transferencia y la del
// pedido. Lo que cambia son las opciones, que salen de
// `estadoDeLineaFacturada` y se calculan sobre las mismas filas que después se
// muestran: el número del filtro y lo que el filtro muestra no pueden separarse.

import { useMemo, useState } from "react";

import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiPill from "@/components/sunmi/SunmiPill";
import TarjetaLineaFactura from "./TarjetaLineaFactura";
import { formatearMoneda } from "@/lib/moneda";
import {
  FILTRO,
  opcionesDeFiltro,
  pasaFiltro,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  gananciaDelDeposito,
  textoDeLaCuenta,
} from "@/lib/compras-proveedor/gananciaDelDeposito";

/**
 * Un renglón de importe: rótulo a la izquierda, número a la derecha.
 *
 * Los tres se dibujan con la misma pieza para que las comas queden alineadas y
 * los tres números se lean como una cuenta y no como tres datos sueltos.
 *
 * La ganancia va en `fuerte` —es la respuesta— y en rojo cuando es NEGATIVA,
 * que es un caso real y no teórico: en el comprobante 5 del pedido 232 hay una
 * línea que se factura por encima del precio interno. Un número negativo sin
 * señal se lee como uno positivo cuando se mira rápido.
 */
function RenglonDeImporte({ rotulo, valor, porcentaje = null, fuerte = false }) {
  const negativo = Number(valor) < 0;
  return (
    <span className="flex items-baseline justify-between gap-renglon">
      <span className={`${fuerte ? "text-sm2 sunmi-text-strong" : "text-sm2 sunmi-text-muted"}`}>
        {rotulo}
      </span>
      <span
        className={`shrink-0 whitespace-nowrap tabular-nums ${
          fuerte
            ? `text-lg2 font-semibold ${negativo ? "sunmi-text-danger" : "sunmi-text-strong"}`
            : "text-sm2 sunmi-text-strong"
        }`}
      >
        {formatearMoneda(valor)}
        {porcentaje != null
          ? ` (${porcentaje < 0 ? "−" : ""}${Math.abs(porcentaje).toFixed(1).replace(".", ",")} %)`
          : ""}
      </span>
    </span>
  );
}

export default function ListaDeLaFactura({
  comprobante,
  filas = [],
  onCorregir,
  onCoincide,
  /** Qué líneas marcó la persona como controladas. `{ pedidoDetalleId: true }` */
  revisadas = {},
  /** La acción del pie. Se llama así y no `pie` porque `pie={` ya es el pie de
   *  `SunmiTabla`, con otro contrato y su propio candado: dos props con el
   *  mismo nombre y distinto significado es cómo un candado empieza a mirar el
   *  archivo equivocado. */
  accionDelPie = null,
  /**
   * Un pedido ya recibido se LEE: las mismas tarjetas y la misma conversión,
   * sin botones que inviten a hacer algo que ya no corresponde y sin pie de
   * acción. Lo que cambia es lo que cada tarjeta muestra al final: qué entró.
   */
  soloLectura = false,
  /** Lo que va después de la lista. En un pedido cerrado, las líneas que
   *  ningún comprobante trajo, que también son parte de lo que se leyó. */
  despuesDeLista = null,
}) {
  const [filtro, setFiltro] = useState(FILTRO.TODOS);

  const opciones = useMemo(() => opcionesDeFiltro(filas), [filas]);
  const visibles = useMemo(
    () => (filas || []).filter((f) => pasaFiltro(f, filtro)),
    [filas, filtro]
  );

  // ── LOS TRES NÚMEROS DEL PIE ───────────────────────────────────────────
  //
  // Lo que factura el proveedor, lo que vale esa misma mercadería al precio
  // interno, y la diferencia — que es LA GANANCIA DEL DEPÓSITO, el margen con
  // el que le vende a los locales. Antes acá había un solo número, el total de
  // la factura, y saber cuánto se gana en la compra pedía hacer la cuenta a
  // mano renglón por renglón.
  //
  // ESTA SUMA NO ES LA QUE VERIFICA LA LECTURA. Aquélla —`verificarComprobante`—
  // suma las líneas para compararlas contra el total impreso del papel, y por
  // eso no puede usarse cuando el papel no trae total: compararía la cuenta
  // contra sí misma. Ésta suma para saber cuánto se paga y cuánto se gana, no
  // se compara contra nada del papel y no habilita ninguna escritura. Las dos
  // están explicadas juntas en `gananciaDelDeposito`.
  const cuenta = useMemo(() => gananciaDelDeposito(filas), [filas]);

  // ── QUÉ SE PIERDE CON ESTE PAPEL, EN UNA LÍNEA ────────────────────────
  //
  // Un comprobante SIN_TOTAL se concilia igual, pero hay algo que no se pudo
  // hacer y quien controla tiene que saberlo antes de empezar: no hubo total
  // impreso contra el cual verificar la lectura. Va en una línea y no en un
  // párrafo, porque es un dato y no una explicación.
  const avisoDelComprobante =
    comprobante?.estado === "SIN_TOTAL"
      ? "Sin total impreso: controlá el papel renglón por renglón."
      : comprobante?.estado === "CARGADO"
        ? "Lectura verificada contra el total del papel."
        : comprobante?.estado || "—";

  // ── EL CONTADOR CUENTA LO MISMO QUE MUESTRAN LAS TARJETAS ──────────────
  //
  // Cuenta REVISADAS: las que la persona marcó. Antes contaba las que el
  // cálculo decía que coincidían, mientras las tarjetas se ponían en verde por
  // otra cosa — y la pantalla se contradecía sola, con tarjetas en "Coincide"
  // y el contador diciendo "0 / 15 sin diferencias · 15 para revisar".
  //
  // Un número de arriba que no es el que se ve abajo es peor que no tenerlo:
  // obliga a decidir a cuál de los dos creerle.
  // ── LA MARCA ES DEL RENGLÓN, Y LA VERDAD ESTÁ EN LA BASE ───────────────
  //
  // `revisadas` es el eco optimista de la pantalla —lo que se acaba de tocar y
  // todavía no volvió del servidor—; `f.revisada` es lo que dice la base. El
  // eco manda mientras exista, y cuando la conciliación se recarga los dos
  // dicen lo mismo.
  //
  // La clave es `lineaId` y no `pedidoDetalleId`: dos renglones del papel
  // pueden apuntar a la misma línea del pedido —las 120 y 121 del comprobante 5
  // van las dos al detalle 2565— y con la clave vieja marcar uno marcaba el
  // otro, y el contador de arriba contaba dos.
  const yaRevisada = (f) => revisadas?.[f?.lineaId] ?? f?.revisada === true;
  const resumen = useMemo(
    () => ({
      revisadas: (filas || []).filter(yaRevisada).length,
      pendientes: (filas || []).filter((f) => !yaRevisada(f)).length,
    }),
    [filas, revisadas]
  );

  // ── LO MISMO QUE DIBUJA LA RECEPCIÓN DE UNA TRANSFERENCIA ─────────────
  //
  // Mismas ranuras de `SunmiPantallaDeTrabajo` y en el mismo orden: dónde
  // estoy, filtrar, la lista. El armado —gutter, separación entre bloques,
  // contenedor de la lista y pie— lo pone la pieza, que salió de allá.
  //
  // No hay buscador ni desplegable de categoría: una factura tiene los
  // renglones que tiene y se controla con el papel al lado, así que buscar
  // entre ellos es resolver un problema que no existe. Las ranuras que no se
  // usan van vacías y la pieza no les reserva separación.
  return (
    <SunmiPantallaDeTrabajo
      contexto={
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold sunmi-text-strong truncate">
              {comprobante?.identidad || `Factura #${comprobante?.id}`}
            </span>
            <SunmiPill color={comprobante?.estado === "SIN_TOTAL" ? "amber" : "slate"}>
              {comprobante?.estado === "SIN_TOTAL" ? "Sin total" : "Leída"}
            </SunmiPill>
          </div>

          {/* El estado del papel en criollo, que es lo que hay que saber antes
              de empezar a controlar. */}
          <p className="text-sm2 sunmi-text-muted truncate">{avisoDelComprobante}</p>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">
                {resumen.revisadas} / {filas.length}
              </span>{" "}
              revisadas
            </span>
            <span
              className={`text-sm2 ${
                resumen.pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"
              }`}
            >
              {resumen.pendientes > 0
                ? `${resumen.pendientes} sin revisar`
                : "Todo revisado"}
            </span>
          </div>

          {/* ── LOS TRES NÚMEROS VAN ACÁ ARRIBA, NO EN EL PIE ─────────────
              Vivían en el pie pegajoso, que tapa la última tarjeta de la lista
              mientras se scrollea, y el botón de recibir se les montaba encima.
              Acá están donde ya está el resumen del pedido, no se mueven con el
              scroll de la lista, y el pie queda con una sola cosa adentro. */}
          <div className="border-t sunmi-divider pt-renglon flex flex-col gap-dato">
            <RenglonDeImporte rotulo="Factura" valor={cuenta.facturado} />
            <RenglonDeImporte rotulo="Al precio del ERP" valor={cuenta.interno} />
            <RenglonDeImporte
              rotulo="Ganancia"
              valor={cuenta.ganancia}
              porcentaje={cuenta.porcentaje}
              fuerte
            />
            {/* CUÁNTAS LÍNEAS RESPALDAN EL NÚMERO. Sin esto, una factura con la
                mitad de las líneas sin vincular muestra una ganancia a media
                asta que se lee como el total. */}
            <span className="text-xs2 sunmi-text-muted break-words">{textoDeLaCuenta(cuenta)}</span>
          </div>
        </>
      }
      filtros={
        <SunmiFiltroEstado
          opciones={opciones}
          valor={filtro}
          onCambiar={setFiltro}
          ariaLabel="Filtrar líneas de la factura"
        />
      }
      lista={
        <>
          {visibles.length === 0 && (
            <p className="text-center py-6 sunmi-text-muted text-sm2">
              No hay líneas que coincidan con este filtro.
            </p>
          )}
          {visibles.map((f) => (
            <TarjetaLineaFactura
              key={f.lineaId}
              fila={f}
              revisada={yaRevisada(f)}
              onCorregir={onCorregir}
              onCoincide={onCoincide}
              soloLectura={soloLectura}
            />
          ))}
        </>
      }
      despuesDeLista={despuesDeLista}
      // ── EN EL PIE QUEDA LA ACCIÓN, SOLA ─────────────────────────────────
      //
      // Un pie pegajoso tapa lo que hay detrás mientras se scrollea, así que
      // todo lo que se meta ahí es alto que la lista pierde. Con los tres
      // importes adentro medía cuatro renglones y el botón se les montaba
      // encima. Ahora lleva una sola cosa y el alto es el del botón.
      pieDePantalla={soloLectura ? null : accionDelPie}
    />
  );
}
