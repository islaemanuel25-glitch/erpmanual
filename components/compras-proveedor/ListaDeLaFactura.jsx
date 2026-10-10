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
// El catálogo que dice el estado del papel en castellano. Sin esto, el último
// `||` devolvía el nombre crudo del enum —"MAL_LEIDO"— al celular.
import { comoSeDice } from "@/lib/compras-proveedor/comprobante/pantalla";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import {
  FILTRO,
  esFilaDeEnvase,
  opcionesDeFiltro,
  pasaFiltro,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  gananciaDelDeposito,
  textoDeLaCuenta,
} from "@/lib/compras-proveedor/gananciaDelDeposito";
import { claveDeFila } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";

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
  // El pedido nació de una factura: no hubo pedido contra el cual comparar.
  // Viaja hasta la tarjeta, que es la que dibuja "Pediste".
  sinPedidoPrevio = false,
  comprobante,
  filas: filasDelPapel = [],
  /** El total IMPRESO del papel. Es lo que muestra el rótulo "Factura". */
  totalDelPapel = null,
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
   * ── LLEGÓ SIN FACTURA ───────────────────────────────────────────────────
   *
   * Es ESTA misma lista, con las líneas del pedido como filas —las arma
   * `filaSinPapel`— y sin papel del cual hablar: la cabecera no nombra un
   * comprobante ni dice cuánto facturó, porque no hay nada impreso.
   */
  sinPapel = false,
  /**
   * Lo que va entre la lista y el pie. Sin papel es el "Agregar producto" de
   * la recepción, para lo que vino sin pedirse.
   *
   * ESTA PROP YA ESTUVO Y SE SACÓ, porque nadie la pasaba (abajo está por qué).
   * Vuelve con un consumidor: el camino sin factura.
   */
  despuesDeLista = null,
  // ── ACÁ ESTABAN `soloLectura` Y `despuesDeLista` ────────────────────────
  //
  // Los trajo el primer intento de mostrar un pedido ya recibido con esta misma
  // lista. No alcanzaba: un pedido cerrado no tiene filtros, ni contador de
  // revisadas, ni tarjetas para operar, así que terminó siendo otra pantalla
  // —`PedidoRecibido`— y estas dos props se quedaron sin nadie que las pasara.
  //
  // Se sacan en vez de dejarlas "por si acaso": una prop que nadie usa se lee
  // como una capacidad de la pieza, y la próxima persona la va a mantener.
}) {
  const [filtro, setFiltro] = useState(FILTRO.TODOS);

  // ── LOS ENVASES VAN APARTE ─────────────────────────────────────────────
  //
  // Las botellas de cambio de Secco a $0,025 suman al papel y no son
  // mercadería: no se revisan, no se filtran y no cuentan en la ganancia. Se
  // listan debajo, con su importe, para que el papel se pueda cotejar entero.
  // Ver `comprobante/envase.js`.
  const envases = useMemo(() => (filasDelPapel || []).filter(esFilaDeEnvase), [filasDelPapel]);
  const filas = useMemo(
    () => (filasDelPapel || []).filter((f) => !esFilaDeEnvase(f)),
    [filasDelPapel]
  );

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
  // ── Y ACÁ SE ESCAPABA "MAL_LEIDO" A LA PANTALLA ──────────────────────
  //
  // El último `||` devolvía el ESTADO CRUDO del enum, así que un comprobante
  // que no cerraba mostraba literalmente "MAL_LEIDO" en el celular. El catálogo
  // que lo dice en castellano —`comoSeDice`— existe desde hace tandas y esta
  // pantalla no lo estaba usando: tenía dos casos escritos a mano y el resto
  // caía al enum.
  const avisoDelComprobante =
    comprobante?.estado === "SIN_TOTAL"
      ? "Sin total impreso: controlá el papel producto por producto."
      : comprobante?.estado === "CARGADO"
        ? "Lectura verificada contra el total del papel."
        : comprobante?.estado
          ? comoSeDice(comprobante.estado).titulo
          : "—";

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
  // La clave sale de `claveDeFila`: el renglón del papel cuando hay papel, y la
  // línea del pedido cuando llegó sin factura. Es la misma que usa la página
  // para escribir el eco, así que no pueden mirar dos lugares distintos.
  const yaRevisada = (f) => revisadas?.[claveDeFila(f)] ?? f?.revisada === true;
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
        sinPapel ? (
          // ── SIN PAPEL: LA MISMA TARJETA, SIN LO QUE HABLA DEL PAPEL ────────
          //
          // Queda el nombre del caso, qué se hace, y el contador de revisados,
          // que es el mismo. Los tres importes se van: "Factura" y "Ganancia"
          // comparan contra un papel que no llegó.
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold sunmi-text-strong truncate">Llegó sin factura</span>
              <SunmiPill color="amber">Sin papel</SunmiPill>
            </div>
            <p className="text-sm2 sunmi-text-muted break-words">
              Contá lo que llegó. El costo es el del pedido.
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm2 sunmi-text-muted">
                <span className="tabular-nums sunmi-text-strong font-semibold">
                  {resumen.revisadas} / {filas.length}
                </span>{" "}
                revisados
              </span>
              <span
                className={`text-sm2 ${
                  resumen.pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"
                }`}
              >
                {resumen.pendientes > 0 ? `${resumen.pendientes} sin revisar` : "Todo revisado"}
              </span>
            </div>
          </>
        ) : (
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
            {/* ── "FACTURA" ES LO QUE FACTURA EL PAPEL, SIEMPRE ──────────
                Decía $294.249,80 sobre un papel de $348.711,61, y ese número no
                estaba impreso en ninguna parte: era la suma de los renglones
                COMPARABLES —7 de 9— valuados al precio final, con IVA y
                percepción adentro. Quien lee "Factura" busca ese número en el
                papel y no lo encuentra, porque no puede estar. */}
            <RenglonDeImporte
              rotulo="Factura"
              valor={totalDelPapel != null ? totalDelPapel : cuenta.facturado}
            />

            {/* ── Y LA GANANCIA DICE SOBRE CUÁNTOS SE CALCULÓ ────────────
                Un renglón sin producto vinculado no tiene contra qué compararse,
                así que la ganancia siempre es de un subconjunto. Antes eso
                estaba en una línea chica abajo y los tres importes se leían como
                si hablaran del papel entero. Ahora el rótulo lo dice. */}
            <RenglonDeImporte
              rotulo={`Ganancia sobre ${cuenta.enLaCuenta} de ${cuenta.total} productos`}
              valor={cuenta.ganancia}
              porcentaje={cuenta.porcentaje}
              fuerte
            />
            <span className="text-xs2 sunmi-text-muted break-words tabular-nums">
              {`Factura de esos ${cuenta.enLaCuenta}: ${formatearMoneda(cuenta.facturado)} · A tus precios: ${formatearMoneda(cuenta.interno)}`}
            </span>
            {/* CUÁNTAS LÍNEAS RESPALDAN EL NÚMERO. Sin esto, una factura con la
                mitad de las líneas sin vincular muestra una ganancia a media
                asta que se lee como el total. */}
            <span className="text-xs2 sunmi-text-muted break-words">{textoDeLaCuenta(cuenta)}</span>
          </div>
        </>
        )
      }
      filtros={
        <SunmiFiltroEstado
          opciones={opciones}
          valor={filtro}
          onCambiar={setFiltro}
          ariaLabel={sinPapel ? "Filtrar productos del pedido" : "Filtrar productos de la factura"}
        />
      }
      lista={
        <>
          {visibles.length === 0 && (
            <p className="text-center py-6 sunmi-text-muted text-sm2">
              No hay productos que coincidan con este filtro.
            </p>
          )}
          {visibles.map((f) => (
            <TarjetaLineaFactura
              sinPedidoPrevio={sinPedidoPrevio}
              key={claveDeFila(f)}
              fila={f}
              revisada={yaRevisada(f)}
              onCorregir={onCorregir}
              onCoincide={onCoincide}
            />
          ))}
          {envases.length > 0 && (
            <>
              <SunmiSeparator label="Envases" />
              {envases.map((f) => (
                <RenglonDeImporte
                  key={claveDeFila(f)}
                  rotulo={`${f.textoCrudo ?? "Envase"} · ${f.cantidad ?? "—"}`}
                  valor={f.subtotal}
                />
              ))}
            </>
          )}
        </>
      }
      // ── EN EL PIE QUEDA LA ACCIÓN, SOLA ─────────────────────────────────
      //
      // Un pie pegajoso tapa lo que hay detrás mientras se scrollea, así que
      // todo lo que se meta ahí es alto que la lista pierde. Con los tres
      // importes adentro medía cuatro renglones y el botón se les montaba
      // encima. Ahora lleva una sola cosa y el alto es el del botón.
      despuesDeLista={despuesDeLista}
      pieDePantalla={accionDelPie}
    />
  );
}
