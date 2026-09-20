"use client";

// LA HOJA DE CORREGIR UNA LÍNEA DE LA FACTURA.
//
// ── NUNCA SE MUESTRA UNA DECISIÓN QUE NO HAY QUE TOMAR ────────────────────
//
// Es la regla que ordena toda la hoja. Las tres secciones son condicionales:
// el precio solo si cambió, el motivo solo si la cantidad no coincide, y la
// fila de sueltas solo si el producto va por pack. Cuando todo coincide, la
// hoja queda en una sección y dos botones.
//
// Lo contrario —mostrar las tres siempre, deshabilitadas o vacías— convierte
// cada línea en un formulario de once campos, y con 197 líneas eso es la
// pantalla que esta tanda vino a sacar.
//
// ── LA HOJA ES LA DEL KIT ─────────────────────────────────────────────────
//
// `SunmiModalLayout forma="hoja"`, la misma que usa la recepción de una
// transferencia para corregir un producto: trae la capa, el velo, el `Escape`,
// la pila de modales y el portal. Lo que se dibuja adentro es de acá.
//
// ── QUÉ GUARDA Y DÓNDE ────────────────────────────────────────────────────
//
// Cantidad, sueltas y motivo van al estado de la pantalla, que ya los persiste
// en el navegador y los escribe todos juntos al recibir. El precio es la
// excepción: se escribe en el momento con `aceptar-precio`, porque cambiar el
// costo de una línea es una decisión propia y no parte del conteo — y porque
// esa ruta ya existe y ya valida todo lo que hay que validar.
//
// Y la DECISIÓN de precio se guarda siempre, sea cual sea: la misma ruta con
// `decision: "DEJA_EL_MIO"` no escribe ningún costo y solo registra que sobre
// estos dos precios ya se contestó. Por eso una línea ya decidida no vuelve a
// mostrar las dos opciones: dice qué se decidió y ofrece cambiarlo, igual que
// el producto vinculado.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { BuscadorProducto } from "@/components/comprobantes/PiezasConciliacion";
import { formatearMoneda } from "@/lib/moneda";
import { aceptarEstaBloqueado } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  cantidadFueConvertida,
  diferenciaDeCantidad,
  estadoDeLinea,
  motivoSinComparacion,
  porcentajeDelPrecio,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  DECISION_DE_PRECIO,
  decisionVencida,
  decisionVigente,
  textoDeDecision,
  textoDeLoQueCambio,
} from "@/lib/compras-proveedor/decisionDePrecio";

/** Los MISMOS motivos que la recepción de una transferencia, con sus valores
 *  canónicos: un reporte por motivo no puede ver dos vocabularios. */
export const MOTIVOS = Object.freeze([
  { valor: "Faltante", texto: "Faltante" },
  { valor: "Producto dañado", texto: "Dañado" },
  { valor: "Otro", texto: "Otro" },
]);

const limpio = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

/** Un stepper de una fila: rótulo de ancho fijo y los tres controles. */
function FilaStepper({ rotulo, valor, onCambiar }) {
  const n = Number(valor) || 0;
  return (
    <div className="min-h-botonFoto flex items-center gap-renglon">
      <span className="w-rotuloStepper shrink-0 text-sm3 sunmi-text-muted">{rotulo}</span>
      <div className="flex-1 flex items-center gap-renglon">
        <SunmiButton
          color="slate"
          type="button"
          aria-label={`Restar ${rotulo.toLowerCase()}`}
          onClick={() => onCambiar(Math.max(0, n - 1))}
          className="w-cajaStepper min-h-botonFoto shrink-0 justify-center rounded-control text-lg2"
        >
          −
        </SunmiButton>
        <SunmiInput
          type="text"
          inputMode="numeric"
          aria-label={rotulo}
          value={valor === "" || valor == null ? "" : String(valor)}
          placeholder="0"
          onChange={(e) => onCambiar(e.target.value.replace(/[^\d]/g, ""))}
          className="flex-1 min-h-botonFoto text-center text-lg2 font-bold tabular-nums"
        />
        <SunmiButton
          color="slate"
          type="button"
          aria-label={`Sumar ${rotulo.toLowerCase()}`}
          onClick={() => onCambiar(n + 1)}
          className="w-cajaStepper min-h-botonFoto shrink-0 justify-center rounded-control text-lg2"
        >
          +
        </SunmiButton>
      </div>
    </div>
  );
}

/** Una de las dos opciones de precio. Excluyentes, la elegida con borde 2. */
function OpcionDePrecio({ elegida, titulo, detalle, onElegir }) {
  return (
    <SunmiButton
      color="ghost"
      type="button"
      aria-pressed={elegida}
      onClick={onElegir}
      className={`w-full min-h-0 flex-col items-start text-left rounded-lg px-filtro py-renglon gap-0.5 ${
        elegida ? "border-2 sunmi-border-accent" : "border sunmi-divider"
      }`}
    >
      <span className="text-sm3 font-medium sunmi-text-strong">{titulo}</span>
      <span className="text-sm3 sunmi-text-muted">{detalle}</span>
    </SunmiButton>
  );
}

/**
 * ELEGIR QUÉ PRODUCTO ES, CUANDO LA LÍNEA NO ESTÁ VINCULADA.
 *
 * ── EL ORDEN DE LOS CANDIDATOS NO SE DECIDE ACÁ ───────────────────────────
 *
 * Llegan rankeados por el motor: primero lo que está en el pedido, después el
 * universo del proveedor, al final el ERP entero. Esta pieza no reordena nada
 * — si ordenara, habría dos criterios de qué es "el más probable" y un día
 * dirían distinto.
 *
 * ── Y SIEMPRE HAY SALIDA A MANO ───────────────────────────────────────────
 *
 * El motor puede no tener ningún candidato, o tenerlos todos mal. `Buscar` abre
 * el buscador del catálogo, que es la misma pieza que usa la conciliación de
 * escritorio: no se escribe un segundo buscador.
 */
function ElegirProducto({ fila, onVincular, onCerrar, guardando }) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const candidatos = fila?.candidatos ?? [];

  const elegir = async (productoBaseId) => {
    setError("");
    const r = await onVincular?.(fila, productoBaseId);
    if (r && r.ok === false) setError(r.error || "No se pudo vincular.");
  };

  return (
    <div className="flex flex-col gap-renglon">
      <span className="text-sm3 font-medium sunmi-text-strong">Qué producto es</span>
      <span className="text-sm3 sunmi-text-muted break-words">
        El papel dice “{fila?.textoCrudo || "—"}”.
      </span>

      {buscando ? (
        <BuscadorProducto
          onElegir={(p) => elegir(p.baseId ?? p.productoBaseId ?? p.id)}
          onCancelar={() => setBuscando(false)}
        />
      ) : (
        <>
          {candidatos.length === 0 && (
            <span className="text-sm3 sunmi-text-muted">
              El motor no encontró ninguno parecido. Buscalo a mano.
            </span>
          )}

          {candidatos.map((c) => (
            <SunmiButton
              key={c.productoBaseId}
              color="slate"
              type="button"
              disabled={guardando}
              onClick={() => elegir(c.productoBaseId)}
              className="w-full min-h-toque justify-start text-left text-sm3"
            >
              {c.nombre}
            </SunmiButton>
          ))}

          <SunmiButton
            color="ghost"
            type="button"
            onClick={() => setBuscando(true)}
            className="w-full min-h-toque justify-center text-sm3 sunmi-text-accent"
          >
            {candidatos.length > 0 ? "Buscar otro…" : "Buscar"}
          </SunmiButton>
        </>
      )}

      {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}

      <SunmiButton
        color="slate"
        type="button"
        onClick={onCerrar}
        className="w-full min-h-botonFoto justify-center text-sm3"
      >
        Cancelar
      </SunmiButton>
    </div>
  );
}

export default function HojaCorregirLinea({
  fila,
  abierta,
  onCerrar,
  onGuardar,
  onAceptarPrecio,
  /** Guarda "dejo el mío" para que no se vuelva a preguntar. No escribe costo. */
  onDejarMiPrecio,
  /** Vincula la línea a un producto. Devuelve `{ ok, error? }`. */
  onVincular,
  /** Devuelve la línea a pendiente. Solo se ofrece si ya está revisada. */
  onDesmarcar,
  revisada = false,
  guardando = false,
}) {
  const cambio = precioCambio(fila);
  const porcentaje = porcentajeDelPrecio(fila);
  // Lo que ya se contestó sobre estos dos precios, y lo que se había contestado
  // cuando eran otros. La segunda no decide nada: se muestra, para que volver a
  // preguntar no se lea como que el sistema se olvidó.
  const yaDecidido = decisionVigente(fila);
  const decisionVieja = decisionVencida(fila);
  // ── LO QUE NO SE PUEDE COMPARAR NO SE PREGUNTA ─────────────────────────
  //
  // Si falta uno de los dos precios no hay nada que decidir, y la hoja lo dice
  // en vez de ofrecer dos opciones que el servidor va a rechazar. Es la misma
  // función que usa la ruta, así que no pueden contestar distinto: eso es lo
  // que producía una comparación hecha arriba y un "no hay con qué comparar" en
  // rojo abajo.
  const sinComparacion = motivoSinComparacion(fila);
  // Y lo que ya está decidido por regla tampoco se ofrece: una baja no se
  // aplica sola y un salto brusco no es un precio nuevo. La respuesta que queda
  // es dejar el propio, que es la única que corresponde.
  const noSePuedeAceptar = aceptarEstaBloqueado(fila?.precio?.decision);
  // Va por pack cuando el pedido se hizo en bultos y el bulto trae más de uno.
  const vaPorPack = (fila?.unidadPedido ?? "BULTO") === "BULTO" && Number(fila?.factorPack) > 1;

  const [bultos, setBultos] = useState("");
  const [sueltas, setSueltas] = useState("");
  const [motivo, setMotivo] = useState(null);
  const [detalleMotivo, setDetalleMotivo] = useState("");
  const [aceptaPrecio, setAceptaPrecio] = useState(true);
  // Con una decisión vigente la hoja no pregunta: dice qué se decidió y ofrece
  // cambiarlo. Esto es el toque de "Cambiar", no una segunda decisión.
  const [cambiandoPrecio, setCambiandoPrecio] = useState(false);
  const [error, setError] = useState("");
  // ── CAMBIAR EL PRODUCTO DE UNA LÍNEA YA VINCULADA ──────────────────────
  //
  // Una vez vinculada, no había forma de corregirla: la hoja dejaba de ofrecer
  // el selector porque "ya tiene producto". Y equivocarse ahí no se queda en
  // esa línea — vincular ESCRIBE UN ALIAS, así que la próxima factura de ese
  // proveedor machea sola contra el producto equivocado, y el error no se ve
  // porque el producto que queda al lado es plausible.
  const [cambiandoProducto, setCambiandoProducto] = useState(false);

  // Al abrir se arranca de lo que ya hay: lo contado antes si lo hubo, y si no
  // lo que dice la factura, que es la propuesta razonable —el papel ya afirma
  // cuánto mandó—. Nunca de lo PEDIDO: eso daría por contado algo que nadie
  // contó, que es el defecto que ya arreglamos en el stepper del pedido.
  // ── EL STEPPER ABRE EN LA ESCALA DEL PEDIDO ────────────────────────────
  //
  // Abría en `fila.cantidad`, que es lo CRUDO del papel: con la planilla de
  // Mauro eso son 80 unidades, así que el stepper de Bultos decía 80 y la barra
  // de abajo calculaba 800 al stock. Un factor de diez en lo que entra.
  //
  // Se usa el MISMO número convertido que muestra la tarjeta —no se recalcula
  // acá—, que sale de la lectura que `deducirUnidad` ya eligió.
  const cantidadDeLaFactura = cantidadEnEscalaDelPedido(fila);
  const convertida = cantidadFueConvertida(fila);

  useEffect(() => {
    if (!abierta || !fila) return;
    setBultos(
      fila.cantidadRecibida != null
        ? String(fila.cantidadRecibida)
        : String(cantidadEnEscalaDelPedido(fila) ?? "")
    );
    setSueltas(fila.unidadesSueltas != null ? String(fila.unidadesSueltas) : "");
    setMotivo(fila.motivoPrincipal ?? null);
    setDetalleMotivo(fila.motivoDetalle ?? "");
    // La opción marcada arranca en lo que se decidió la vez pasada, si sigue
    // valiendo. Sin esto, "Cambiar" mostraría "Aceptar el precio nuevo"
    // seleccionado sobre una línea donde se había dicho lo contrario, y un
    // toque en Guardar daría vuelta la decisión sin que nadie lo pidiera.
    const decidida = decisionVigente(fila);
    const bloqueada = aceptarEstaBloqueado(fila?.precio?.decision);
    setAceptaPrecio(
      bloqueada ? false : decidida ? decidida.decision === DECISION_DE_PRECIO.ACEPTA_FACTURA : true
    );
    setCambiandoPrecio(false);
    setError("");
    setCambiandoProducto(false);
  }, [abierta, fila]);

  const entraAlStock = useMemo(() => {
    const b = Number(bultos) || 0;
    const s = Number(sueltas) || 0;
    const factor = vaPorPack ? Number(fila?.factorPack) || 1 : 1;
    return b * factor + s;
  }, [bultos, sueltas, vaPorPack, fila?.factorPack]);

  const cantidadDifiere = useMemo(() => {
    // Las dos en bultos: `cantidadPedida` ya lo está y `bultos` es lo que el
    // stepper muestra, que ahora arranca convertido.
    const pedida = Number(fila?.cantidadPedida);
    const contada = Number(bultos);
    if (!Number.isFinite(pedida) || !Number.isFinite(contada)) return false;
    return pedida !== contada;
  }, [fila?.cantidadPedida, bultos]);

  if (!fila) return null;

  // ── SIN PRODUCTO NO HAY NADA QUE DECIDIR ───────────────────────────────
  //
  // La tarjeta mandaba a Corregir para elegir el producto y adentro no había
  // ningún buscador: cantidad y motivo sobre una línea de la que no se sabe
  // qué es. Once de las quince líneas de la planilla de Mauro estaban así, o
  // sea inutilizables.
  //
  // Con la línea sin vincular la hoja arranca —y termina— por elegir el
  // producto. No se pide cuánto entró de algo que todavía no se sabe qué es:
  // preguntarlo invita a contestar cualquier cosa para poder seguir.
  // EL MISMO PREDICADO QUE LA TARJETA, y no uno parecido. Medido: hay líneas
  // con `productoLocalId` en nulo que SÍ tienen su línea de pedido resuelta
  // —el motor las sugirió y dedujo a cuál corresponden—. Preguntando solo por
  // `productoLocalId`, esas cuatro abrían el selector de producto mientras la
  // tarjeta las mostraba comparadas y listas para contar. Dos criterios para la
  // misma pregunta, y la hoja contradiciendo a la tarjeta que la abrió.
  const sinProducto = estadoDeLinea(fila) === ESTADO_LINEA.SIN_VINCULAR;

  const guardar = async () => {
    setError("");
    if (cantidadDifiere && !motivo) {
      setError("Elegí por qué la cantidad no coincide.");
      return;
    }
    if (cantidadDifiere && motivo === "Otro" && !detalleMotivo.trim()) {
      setError("Contá qué pasó.");
      return;
    }
    // El precio primero: si falla, no se guarda un conteo que la persona iba a
    // acompañar con una decisión de costo que no ocurrió.
    //
    // ── LAS DOS RESPUESTAS SE GUARDAN, Y LAS DOS SE VUELVEN A APLICAR ────
    //
    // "Dejo el mío" también se guarda: es una decisión, y si no se guardara
    // sería la única que volvería a preguntar en cada factura. Y la ya decidida
    // se vuelve a mandar aunque nadie la haya tocado, porque una decisión sobre
    // ESTE precio todavía tiene que aplicarse a ESTA línea del pedido — si no,
    // la mercadería entraría al costo viejo en silencio. Las dos rutas son
    // idempotentes sobre los mismos números.
    if (cambio) {
      const r = aceptaPrecio ? await onAceptarPrecio?.(fila) : await onDejarMiPrecio?.(fila);
      if (r && r.ok === false) {
        setError(r.error || "No se pudo guardar la decisión de precio.");
        return;
      }
    }
    onGuardar?.({
      pedidoDetalleId: fila.pedidoDetalleId,
      cantidadRecibida: bultos === "" ? null : Number(bultos),
      unidadesSueltas: vaPorPack && sueltas !== "" ? Number(sueltas) : null,
      motivoPrincipal: cantidadDifiere ? motivo : null,
      motivoDetalle: cantidadDifiere && motivo === "Otro" ? detalleMotivo.trim() : null,
    });
  };

  return (
    <SunmiModalLayout
      open={!!abierta}
      title={fila.producto || fila.textoCrudo || "Producto"}
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja"
      destructivo
      espacioCuerpo="gap-hoja"
    >
      {/* ── 0 · QUÉ PRODUCTO ES, CUANDO NO SE SABE ──────────────────────── */}
      {sinProducto || cambiandoProducto ? (
        // EL MISMO selector, no un segundo camino. Lo único que cambia es a
        // dónde vuelve Cancelar: sin producto, cierra la hoja; cambiándolo,
        // vuelve a la hoja con el producto que ya tenía.
        <ElegirProducto
          fila={fila}
          onVincular={onVincular}
          onCerrar={cambiandoProducto ? () => setCambiandoProducto(false) : onCerrar}
          guardando={guardando}
        />
      ) : (
      <>
      {/* ── 0.bis · A QUÉ PRODUCTO ESTÁ VINCULADA ────────────────────────
          El título de la hoja es el nombre del producto, pero eso no dice que
          sea una ELECCIÓN que se puede cambiar. Acá se dice, y al lado está
          cómo: el papel dice una cosa y el producto del ERP es otra, y la
          única forma de notar un vínculo equivocado es verlos juntos. */}
      <div className="flex flex-col gap-dato">
        <span className="text-sm3 sunmi-text-muted break-words">
          El papel dice “{fila.textoCrudo || "—"}”.
        </span>
        <div className="flex items-center justify-between gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong truncate">
            {fila.producto || "Sin producto"}
          </span>
          <SunmiButton
            color="slate"
            type="button"
            disabled={guardando}
            onClick={() => setCambiandoProducto(true)}
            className="shrink-0 min-h-toque rounded-control px-4 text-sm3"
          >
            Cambiar
          </SunmiButton>
        </div>
      </div>

      {/* ── 1 · CUÁNTO ENTRÓ ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-renglon">
        <span className="text-sm3 font-medium sunmi-text-strong">Cuánto entró</span>
        {/* ── LAS DOS ESCALAS NO SE MEZCLAN EN LA MISMA FRASE ───────────
            Decía "Pediste 8 · la factura dice 80 · 1 bulto = 10 u": los dos
            primeros números están en escalas distintas y la frase no lo dice,
            así que se leen como una diferencia de 72. Ahora los dos van en
            bultos, que es la unidad del pedido, y lo que dice el papel va
            aparte — igual que en la tarjeta. */}
        <span className="text-sm3 sunmi-text-muted">
          Pediste {limpio(fila.cantidadPedida)} · la factura dice{" "}
          {limpio(cantidadDeLaFactura)}
          {vaPorPack ? ` · 1 bulto = ${limpio(fila.factorPack)} u` : ""}
        </span>
        {convertida && (
          <span className="text-sm3 sunmi-text-muted">
            El papel dice {limpio(fila.cantidad)} unidades.
          </span>
        )}

        <FilaStepper rotulo="Bultos" valor={bultos} onCambiar={setBultos} />
        {/* Sin pack no hay sueltas que contar: el bulto ES la unidad. */}
        {vaPorPack && <FilaStepper rotulo="Sueltas" valor={sueltas} onCambiar={setSueltas} />}

        <div className="min-h-barraStock sunmi-control rounded-control px-filtro py-entreFiltros flex items-center justify-between gap-renglon">
          <span className="text-sm3 sunmi-text-muted">Entra al stock</span>
          <span className="text-sm3 font-bold tabular-nums">
            {limpio(entraAlStock)} {entraAlStock === 1 ? "unidad" : "unidades"}
          </span>
        </div>
      </div>

      {/* ── 2.a · CUANDO NO HAY CON QUÉ COMPARAR, SE DICE Y NO SE PREGUNTA ──
          Sin uno de los dos precios no hay decisión posible, así que no se
          ofrecen opciones: entra la mercadería y el costo no se toca, que es lo
          único que se puede hacer sin comparación. Y se dice CUÁL falta, porque
          "no hay con qué comparar" a secas manda a buscar el problema a
          cualquier lado. */}
      {sinComparacion && (
        <div className="border-t sunmi-divider pt-hoja flex flex-col gap-dato">
          <span className="text-sm3 font-medium sunmi-text-strong">El precio no se puede comparar</span>
          <span className="text-sm3 sunmi-text-muted break-words">{sinComparacion}</span>
          <span className="text-sm3 sunmi-text-muted break-words">
            La mercadería entra igual y tu costo no se toca.
          </span>
        </div>
      )}

      {/* ── 2.b · EL PRECIO, SOLO SI CAMBIÓ ──────────────────────────────── */}
      {cambio && (
        <div className="border-t sunmi-divider pt-hoja flex flex-col gap-renglon">
          {yaDecidido && !cambiandoPrecio ? (
            // ── YA CONTESTADA: SE DICE, NO SE PREGUNTA ──────────────────
            //
            // Mismo trato que el producto vinculado, tres bloques más arriba:
            // qué se decidió, y un botón para cambiarlo. Volver a mostrar las
            // dos opciones sobre algo ya contestado es la pregunta otra vez,
            // aunque venga con la respuesta marcada.
            <>
              <span className="text-sm3 font-medium sunmi-text-strong">
                Ya decidiste este precio
              </span>
              <div className="flex items-center justify-between gap-renglon">
                <span className="min-w-0 text-sm3 sunmi-text-muted break-words">
                  {textoDeDecision(yaDecidido.decision)} ·{" "}
                  {formatearMoneda(
                    yaDecidido.decision === DECISION_DE_PRECIO.DEJA_EL_MIO
                      ? fila.costoCatalogo
                      : fila.costoFactura
                  )}
                </span>
                <SunmiButton
                  color="slate"
                  type="button"
                  disabled={guardando}
                  onClick={() => setCambiandoPrecio(true)}
                  className="shrink-0 min-h-toque rounded-control px-4 text-sm3"
                >
                  Cambiar
                </SunmiButton>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm3 font-medium sunmi-text-strong">
                El precio {porcentaje != null && porcentaje < 0 ? "bajó" : "subió"}{" "}
                {porcentaje != null ? `${Math.abs(porcentaje).toFixed(1).replace(".", ",")} %` : ""}
              </span>
              <span className="text-sm3 sunmi-text-muted">
                Tenías {formatearMoneda(fila.costoCatalogo)} · la factura trae{" "}
                {formatearMoneda(fila.costoFactura)}
              </span>

              {/* ── LO QUE SE HABÍA DECIDIDO, CUANDO YA NO APLICA ────────
                  Preguntar de cero sobre algo que ya se contestó una vez se
                  lee como que el sistema se olvidó. Se dice qué se había
                  decidido, sobre qué números, y cuál de los dos se movió. */}
              {decisionVieja && (
                <span className="text-sm3 sunmi-text-muted break-words">
                  Antes decidiste: {textoDeDecision(decisionVieja.decision).toLowerCase()}, cuando
                  la factura traía {formatearMoneda(decisionVieja.precioFacturado)} contra tu{" "}
                  {formatearMoneda(decisionVieja.precioPropio)}. {textoDeLoQueCambio(fila)}
                </span>
              )}

              {/* ── LO QUE YA ESTÁ DECIDIDO POR REGLA NO SE OFRECE ────────
                  Una baja no se aplica sola y un salto brusco no es un precio
                  nuevo: el servidor rechaza las dos, así que ofrecer el botón
                  es ofrecer un error. Se dice el porqué, con el texto que esa
                  regla ya tiene escrito, y queda la respuesta que sí
                  corresponde. */}
              {noSePuedeAceptar && fila?.precio?.decision?.detalle && (
                <span className="text-sm3 sunmi-text-muted break-words">
                  {fila.precio.decision.detalle}
                </span>
              )}

              <div className="flex flex-col gap-0.5">
                {!noSePuedeAceptar && (
                  <OpcionDePrecio
                    elegida={aceptaPrecio}
                    titulo="Aceptar el precio nuevo"
                    detalle="Pasa a ser tu costo. El margen se recalcula."
                    onElegir={() => setAceptaPrecio(true)}
                  />
                )}
                <OpcionDePrecio
                  elegida={!aceptaPrecio}
                  titulo="Dejar el que tenía"
                  detalle="Entra la mercadería sin tocar el costo."
                  onElegir={() => setAceptaPrecio(false)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 3 · EL MOTIVO, SOLO SI LA CANTIDAD NO COINCIDE ───────────────── */}
      {cantidadDifiere && (
        <div className="border-t sunmi-divider pt-hoja flex flex-col gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">Motivo de la diferencia</span>
          <div className="flex flex-wrap gap-dentroFiltro">
            {MOTIVOS.map((m) => (
              <SunmiButton
                key={m.valor}
                color={motivo === m.valor ? "primary" : "slate"}
                type="button"
                aria-pressed={motivo === m.valor}
                onClick={() => setMotivo(m.valor)}
                className="flex-1 min-h-toque justify-center rounded-control text-sm3"
              >
                {m.texto}
              </SunmiButton>
            ))}
          </div>
          {motivo === "Otro" && (
            <SunmiInput
              type="text"
              aria-label="Qué pasó"
              placeholder="Contá qué pasó"
              value={detalleMotivo}
              onChange={(e) => setDetalleMotivo(e.target.value)}
              className="w-full min-h-toque px-4 text-sm3"
            />
          )}
        </div>
      )}

      {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}

      {/* ── DESMARCAR: SE PUEDE VOLVER ATRÁS ────────────────────────────
          Una línea marcada por error quedaba marcada para siempre. Es el mismo
          botón y el mismo lugar que en la ficha de recepción de una
          transferencia: devuelve la línea a pendiente y nada más. Solo se
          ofrece si está marcada — sobre una pendiente no tendría qué deshacer. */}
      {revisada && (
        <SunmiButton
          color="slate"
          type="button"
          disabled={guardando}
          onClick={() => onDesmarcar?.(fila)}
          className="w-full min-h-toque justify-center text-sm3"
        >
          Desmarcar
        </SunmiButton>
      )}

      <div className="flex gap-renglon">
        <SunmiButton
          color="slate"
          type="button"
          onClick={onCerrar}
          className="flex-1 min-h-botonFoto justify-center text-sm3"
        >
          Cancelar
        </SunmiButton>
        <SunmiButton
          color="primary"
          type="button"
          disabled={guardando}
          onClick={guardar}
          className="flex-1 min-h-botonFoto justify-center text-sm3"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </SunmiButton>
      </div>
      </>
      )}
    </SunmiModalLayout>
  );
}
