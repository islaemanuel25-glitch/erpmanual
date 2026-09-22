"use client";

// LA HOJA DE CORREGIR UNA LÍNEA DE LA FACTURA.
//
// ── LA HOJA SE VE IGUAL SIEMPRE, Y ESO ES EL DISEÑO ───────────────────────
//
// Antes cambiaba de forma según el caso: el bloque de precio aparecía solo si
// el precio había cambiado, el de motivo solo si la cantidad no coincidía, y
// abajo se apilaban hasta tres botones —"Desmarcar" tapando a "Cancelar"—. Con
// 197 líneas eso es una pantalla distinta cada vez, y no se aprende ninguna.
//
// Ahora el orden es fijo —producto, cantidad, precio— y el bloque de precio
// ESTÁ SIEMPRE: con la pregunta, con lo que ya se decidió, o diciendo que el
// precio es el mismo. Un bloque que desaparece obliga a buscar; uno que dice
// "no hay nada que decidir" se lee de un vistazo y se pasa de largo.
//
// El único que sigue siendo condicional es el MOTIVO, y no por estilo: solo
// existe cuando la cantidad no coincide, y preguntar por qué difiere algo que
// no difiere no tiene respuesta posible.
//
// ── DE DÓNDE SALE CADA MEDIDA ─────────────────────────────────────────────
//
// De `components/transferencias/FichaProductoRecepcion.jsx`, que hace el mismo
// trabajo del otro lado del depósito y ya está resuelta. Se copian:
//
//   · los DOS CAMPOS AL 35 % con el hueco vacío en el medio —`w-35p` y
//     `justify-between`—, cada uno con su rótulo arriba diciendo en qué escala
//     está el número de abajo;
//   · `SunmiCampoCantidad`, la pieza del kit con − y +. Acá había un stepper
//     escrito a mano, con su propio ancho de rótulo y su propio ancho de tecla;
//   · el pie con UN botón principal ancho que dice qué pasa después.
//
// No se eligió ningún tamaño en este archivo. La separación entre bloques es
// `renglon`, el token que ya existe para separar bloques en este módulo.
//
// ── Y UN DEFECTO MEDIDO QUE EXPLICA "TODO AMONTONADO" ─────────────────────
//
// El cuerpo usaba `gap-hoja` y los bloques `pt-hoja`. **Ninguna de las dos
// clases existe**: no están en `tailwind.config.js` y no aparecen en la hoja de
// estilos que sirve producción —comprobado con `grep` sobre el CSS del
// contenedor: cero apariciones de `.gap-hoja{` y `.pt-hoja{`, contra una de
// `.gap-renglon{`—. O sea que entre los bloques no había NADA de separación, y
// no por falta de criterio: por dos nombres que no existían y que nadie podía
// ver que no existían.
//
// ── LO QUE PINTA Y LO QUE NO ──────────────────────────────────────────────
//
// La hoja no pinta ningún fondo propio: los bloques se separan con espacio y
// una línea fina. El color queda donde dibuja algo — las teclas del campo de
// cantidad, los botones, y la franja de "Entra al stock", que es un resultado y
// no un bloque. Una caja de color por bloque convierte tres secciones en tres
// cajas, y ahí hay que leer los bordes antes que el contenido.
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
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { BuscadorProducto } from "@/components/comprobantes/PiezasConciliacion";
import { formatearMoneda } from "@/lib/moneda";
import { aceptarEstaBloqueado } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { ORIGEN_VINCULO } from "@/lib/compras-proveedor/comprobante/vinculo";
import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  cantidadFueConvertida,
  estadoDeLinea,
  motivoSinComparacion,
  porcentajeDelPrecio,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
// LA ESCALA SALE DE LA MISMA FUNCIÓN QUE USA LA TARJETA, no de una parecida.
import { quedoEnBultos } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import {
  laCantidadCuadraConElPrecio,
  textoDeLaEscalaQueNoCuadra,
} from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";
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

/**
 * UN BLOQUE DE LA HOJA: línea fina arriba, título, y su contenido.
 *
 * Los tres se dibujan con esta misma pieza para que se vean iguales. Escritos a
 * mano uno por uno, el día que uno cambie de separación los otros dos se
 * quedan — que es exactamente cómo la hoja llegó a verse distinta en cada caso.
 *
 * `accion` es la ranura de la derecha del título, para el "Cambiar" del precio
 * ya decidido. Vacía no reserva espacio.
 */
function Bloque({ titulo, accion = null, children }) {
  return (
    <section className="border-t sunmi-divider pt-renglon flex flex-col gap-renglon">
      <div className="flex items-center justify-between gap-renglon">
        <span className="text-sm3 font-medium sunmi-text-strong">{titulo}</span>
        {accion}
      </div>
      {children}
    </section>
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
function ElegirProducto({ fila, onVincular, onCerrar, guardando, proveedorId, proveedorNombre }) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  // ── LOS CANDIDATOS DE AFUERA DEL UNIVERSO NO SE OFRECEN SOLOS ──────────
  //
  // La cascada busca en tres lugares y devuelve el primero que encuentra: el
  // pedido, lo que se le compra al proveedor, y el ERP entero. Ese tercer
  // escalón es una red para no quedarse sin nada, pero ofrecido como si fuera
  // igual que los otros dos convierte "no hay ninguno de este proveedor" en una
  // lista de productos ajenos con el botón puesto al lado.
  //
  // Medido con la factura de Paty: su universo son 26 productos y el catálogo
  // 2.711. Los candidatos que se veían salían de los 2.711.
  //
  // No se pierden: se llega a ellos por "Buscar en todo el catálogo", que es
  // explícito y dice dónde está buscando.
  const deTodoElErp = fila?.origen === ORIGEN_VINCULO.ERP_COMPLETO;
  const candidatos = deTodoElErp ? [] : fila?.candidatos ?? [];

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
          proveedorId={proveedorId}
          proveedorNombre={proveedorNombre}
          onElegir={(p) => elegir(p.baseId ?? p.productoBaseId ?? p.id)}
          onCancelar={() => setBuscando(false)}
        />
      ) : (
        <>
          {candidatos.length === 0 && (
            <span className="text-sm3 sunmi-text-muted">
              {deTodoElErp
                ? `No hay ninguno parecido entre lo que se le compra a ${
                    proveedorNombre || "este proveedor"
                  }. Buscalo a mano, y si es la primera vez que lo trae, usá "todo el catálogo".`
                : "El motor no encontró ninguno parecido. Buscalo a mano."}
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
        className="w-full min-h-toque justify-center text-sm3"
      >
        Cancelar
      </SunmiButton>
    </div>
  );
}

export default function HojaCorregirLinea({
  // El pedido nació de esta factura: no hubo pedido contra el cual comparar,
  // así que la frase de "Pediste X · la factura dice Y" no se dibuja.
  sinPedidoPrevio = false,
  // A quién se le compra: define en qué universo se buscan los productos.
  proveedorId = null,
  proveedorNombre = null,
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
  // ── LA ESCALA SALE DEL MISMO LUGAR QUE LA DE LA TARJETA ───────────────
  //
  // Acá se preguntaba por `unidadPedido` y la tarjeta pregunta por
  // `quedoEnBultos`, que mira el veredicto de la factura —el que convirtió el
  // número—. Sobre una línea donde los dos no coinciden, la hoja contradecía a
  // la tarjeta que la abrió.
  //
  // Pasó con la Hamburguesa Paty del pedido 242: la tarjeta decía "3 PACK x30 ·
  // el papel dice 90 u" y la hoja decía "Unidades 3 · Entra al stock 3
  // unidades". Tres hamburguesas en vez de noventa. Medido sobre los pedidos
  // abiertos, es el único renglón en esa situación de los once que hay.
  const vaPorPack = quedoEnBultos(fila) && Number(fila?.factorPack) > 1;

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
  // ── EL CAMPO ABRE EN LA ESCALA DEL PEDIDO ──────────────────────────────
  //
  // Abría en `fila.cantidad`, que es lo CRUDO del papel: con la planilla de
  // Mauro eso son 80 unidades, así que el campo de Bultos decía 80 y la barra
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

  // ── EL PRECIO DELATA LA ESCALA ────────────────────────────────────────
  //
  // Se mira sobre lo que la hoja OFRECE —la cantidad de la factura, ya
  // convertida— y no sobre lo que la persona cuenta: que lleguen 2 cajones en
  // vez de 3 es justo lo que esta hoja registra, y ahí no tiene que dar el
  // subtotal del papel.
  //
  // Si lo ofrecido no cuadra, la escala está mal y la hoja lo dice en vez de
  // ofrecer el número como bueno.
  const escalaOfrecida = useMemo(() => {
    const factor = vaPorPack ? Number(fila?.factorPack) || 1 : 1;
    const ofrecidas = (Number(cantidadDeLaFactura) || 0) * factor;
    return laCantidadCuadraConElPrecio({
      subtotal: fila?.subtotal,
      cantidad: fila?.cantidad,
      fisicas: ofrecidas,
      porKilo: fila?.porKilo === true,
    });
  }, [cantidadDeLaFactura, vaPorPack, fila?.factorPack, fila?.subtotal, fila?.cantidad, fila?.porKilo]);

  const avisoDeEscala = textoDeLaEscalaQueNoCuadra(escalaOfrecida, { moneda: formatearMoneda });

  const cantidadDifiere = useMemo(() => {
    // ── LAS DOS EN UNIDADES FÍSICAS ──────────────────────────────────────
    //
    // Acá se comparaba `cantidadPedida` contra el número del campo dando por
    // hecho que las dos estaban en bultos, y no siempre lo están: en la
    // Hamburguesa Paty del pedido 242 la línea del pedido son 90 UNIDADES y el
    // campo muestra 3 BULTOS de 30. Noventa contra tres da "difiere", así que
    // la hoja pedía el motivo de una diferencia que no existe.
    //
    // En físicas la pregunta tiene una sola respuesta: 90 pedidas contra 90 que
    // entran es lo mismo, se hayan escrito como 3 bultos o como 90 sueltas.
    const pedida = Number(fila?.cantidadPedida);
    if (!Number.isFinite(pedida)) return false;
    const factorDelPedido =
      (fila?.unidadPedido ?? "BULTO") === "BULTO" ? Number(fila?.factorPack) || 1 : 1;
    const pedidaFisica = pedida * factorDelPedido;
    if (bultos === "" || !Number.isFinite(Number(bultos))) return false;
    return pedidaFisica !== entraAlStock;
  }, [fila?.cantidadPedida, fila?.unidadPedido, fila?.factorPack, bultos, entraAlStock]);

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
  const eligiendoProducto = sinProducto || cambiandoProducto;

  /** El rótulo del campo dice en qué escala está el número: no es opcional. */
  const rotuloDeCompletos = vaPorPack
    ? `Bultos de ${limpio(fila.factorPack)}`
    : quedoEnBultos(fila)
      ? "Bultos"
      : "Unidades";

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
      // El renglón del papel, para marcarlo controlado, y la línea del pedido,
      // que es donde van la cantidad y el motivo. Son dos cosas distintas: dos
      // renglones pueden apuntar a la misma línea del pedido.
      lineaId: fila.lineaId,
      pedidoDetalleId: fila.pedidoDetalleId,
      cantidadRecibida: bultos === "" ? null : Number(bultos),
      unidadesSueltas: vaPorPack && sueltas !== "" ? Number(sueltas) : null,
      // ── CUÁNTAS UNIDADES ENTRAN AL STOCK, DICHO Y NO DEDUCIDO ─────────
      //
      // Es el número que la franja de arriba muestra, el mismo que la persona
      // acaba de leer antes de guardar. Viaja explícito porque el servidor
      // deducía la escala por su cuenta —`det.unidad`, un TERCER lugar además
      // de la tarjeta y de esta hoja— y sobre la Hamburguesa del pedido 242 los
      // tres no coincidían: la hoja iba a mandar 3 bultos y el servidor los
      // iba a entrar como 3 unidades.
      //
      // Lo que se ve es lo que entra. Y el servidor lo comprueba contra el
      // precio del papel antes de escribirlo.
      unidadesFisicas: bultos === "" ? null : entraAlStock,
      motivoPrincipal: cantidadDifiere ? motivo : null,
      motivoDetalle: cantidadDifiere && motivo === "Otro" ? detalleMotivo.trim() : null,
    });
  };

  // ── EL TÍTULO DEL BLOQUE DE PRECIO DICE EN CUÁL DE LOS CUATRO CASOS ESTÁ ──
  const tituloDelPrecio = sinComparacion
    ? "El precio no se puede comparar"
    : yaDecidido && !cambiandoPrecio
      ? "Ya decidiste este precio"
      : cambio
        ? `El precio ${porcentaje != null && porcentaje < 0 ? "bajó" : "subió"} ${
            porcentaje != null ? `${Math.abs(porcentaje).toFixed(1).replace(".", ",")} %` : ""
          }`.trim()
        : "El precio es el mismo";

  /** Los dos números, en una línea. Es lo que se compara, en los cuatro casos. */
  const losDosPrecios = (
    <span className="text-sm3 sunmi-text-muted">
      Tenías {formatearMoneda(fila.costoCatalogo)} · la factura trae{" "}
      {formatearMoneda(fila.costoFactura)}
    </span>
  );

  return (
    <SunmiModalLayout
      open={!!abierta}
      title={fila.producto || fila.textoCrudo || "Producto"}
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja"
      destructivo
      // `renglon` y no `hoja`: ese token no existe. Ver el encabezado.
      espacioCuerpo="gap-renglon"
      footer={
        eligiendoProducto ? null : (
          // ── UN SOLO BOTÓN PRINCIPAL, Y DESMARCAR DEBAJO ────────────────
          //
          // Eran tres en una fila que envolvía, así que "Desmarcar" terminaba
          // tapando a "Cancelar". Cancelar se fue —"Cerrar" del encabezado hace
          // lo mismo y está donde está en todos los modales del ERP— y lo que
          // queda es la acción de cierre, ancha, con "Desmarcar este producto"
          // abajo y solo cuando hay algo que desmarcar.
          //
          // El texto y el color NO cambian según el caso, a diferencia de
          // transferencias: la hoja tiene que verse igual siempre, y un botón
          // que cambia de color es lo primero que se nota.
          <div className="w-full flex flex-col gap-renglon">
            <SunmiButton
              color="primary"
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="w-full min-h-toque justify-center text-sm3"
            >
              {guardando ? "Guardando…" : "✓ Revisado y seguir"}
            </SunmiButton>

            {revisada && (
              <SunmiButton
                color="slate"
                type="button"
                disabled={guardando}
                onClick={() => onDesmarcar?.(fila)}
                className="w-full min-h-toque justify-center text-sm3"
              >
                Desmarcar este producto
              </SunmiButton>
            )}
          </div>
        )
      }
    >
      {eligiendoProducto ? (
        // EL MISMO selector, no un segundo camino. Lo único que cambia es a
        // dónde vuelve Cancelar: sin producto, cierra la hoja; cambiándolo,
        // vuelve a la hoja con el producto que ya tenía.
        <ElegirProducto
          proveedorId={proveedorId}
          proveedorNombre={proveedorNombre}
          fila={fila}
          onVincular={onVincular}
          onCerrar={cambiandoProducto ? () => setCambiandoProducto(false) : onCerrar}
          guardando={guardando}
        />
      ) : (
        <>
          {/* ── 1 · EL PRODUCTO ───────────────────────────────────────────
              Va primero y sin línea arriba: es el primer bloque de la hoja.
              El título del modal ya dice el nombre del producto, pero eso no
              dice que sea una ELECCIÓN que se puede cambiar. Acá se dice, y al
              lado está cómo — el papel dice una cosa y el producto del ERP es
              otra, y la única forma de notar un vínculo equivocado es verlos
              juntos. */}
          <div className="flex flex-col gap-dato">
            <span className="text-sm3 sunmi-text-muted break-words">
              El papel dice “{fila.textoCrudo || "—"}”.
            </span>
            <div className="flex items-center justify-between gap-renglon">
              <span className="min-w-0">
                <span className="block text-sm3 sunmi-text-muted">Va a este producto</span>
                <span className="block text-sm3 font-medium sunmi-text-strong truncate">
                  {fila.producto || "Sin producto"}
                </span>
              </span>
              {/* "Cambiar el producto de esta línea" no se podía traducir
                  palabra por palabra: "el producto de este producto" no dice
                  nada. La acción es la misma y se nombra por lo que hace. */}
              <SunmiButton
                color="slate"
                type="button"
                disabled={guardando}
                aria-label="Elegir otro producto"
                onClick={() => setCambiandoProducto(true)}
                className="shrink-0 min-h-toque rounded-control px-4 text-sm3"
              >
                Cambiar
              </SunmiButton>
            </div>
          </div>

          {/* ── 2 · CUÁNTO ENTRÓ ─────────────────────────────────────────── */}
          <Bloque titulo="Cuánto entró">
            {/* UNA SOLA LÍNEA DE CONTEXTO, y las escalas no se mezclan en la
                misma frase. Decía "Pediste 8 · la factura dice 80": los dos
                números están en escalas distintas y la frase no lo dice, así
                que se leen como una diferencia de 72. Ahora los dos van en la
                unidad del pedido y lo que dice el papel va al final, nombrado
                como lo que es. El tamaño del bulto no está acá: está arriba del
                campo, que es donde se usa. */}
            {/* Sin pedido previo no hay "Pediste": el pedido nació de esta
                misma factura, y comparar contra él sería comparar el papel
                consigo mismo. Queda lo único que hay: lo que dice la factura. */}
            <span className="text-sm3 sunmi-text-muted">
              {sinPedidoPrevio
                ? `La factura dice ${limpio(cantidadDeLaFactura)}`
                : `Pediste ${limpio(fila.cantidadPedida)} · la factura dice ${limpio(cantidadDeLaFactura)}`}
              {convertida ? ` · el papel dice ${limpio(fila.cantidad)} u` : ""}
            </span>

            {/* ── LOS DOS CAMPOS, AL 35 % Y CON UN HUECO EN EL MEDIO ──────
                Copiado de la ficha de transferencias, hueco incluido: lo que
                separa dos cantidades que se leen de un vistazo es el vacío del
                medio, no una columna que haya que llenar. */}
            <div className="flex justify-between gap-2">
              <div className="w-35p">
                <div className="text-sm2 sunmi-text-muted truncate">{rotuloDeCompletos}</div>
                <SunmiCampoCantidad
                  valor={bultos}
                  onCambiar={setBultos}
                  etiqueta={rotuloDeCompletos}
                  difiere={cantidadDifiere}
                  // `minimo` 0 y no 1: "no llegó nada" es una respuesta válida
                  // en una recepción. Sin `normalizaAlSalir`, porque el vacío
                  // se guarda como `null` —no contado— y un 0 como 0.
                  minimo={0}
                  tipo="number"
                  claseMarco="flex-1"
                  claseInput="text-lg"
                />
              </div>

              {/* Las sueltas solo donde significan algo: sin pack, el bulto ES
                  la unidad y un desglose se sumaría encima de sí mismo. */}
              {vaPorPack && (
                <div className="w-35p">
                  <div className="text-sm2 sunmi-text-muted truncate">Sueltas</div>
                  <SunmiCampoCantidad
                    valor={sueltas}
                    onCambiar={setSueltas}
                    etiqueta="Sueltas"
                    difiere={cantidadDifiere}
                    minimo={0}
                    tipo="number"
                    claseMarco="flex-1"
                    claseInput="text-lg"
                  />
                </div>
              )}
            </div>

            {/* ── SI LA ESCALA NO CUADRA CON EL PRECIO, SE DICE ACÁ ───────
                Justo arriba del número que va a entrar al stock, que es el que
                estaría mal. Con los dos importes a la vista para poder
                comprobarlo contra el papel que se tiene en la mano. */}
            {avisoDeEscala && (
              <p className="text-sm2 sunmi-text-warning break-words" aria-live="polite">
                {avisoDeEscala}
              </p>
            )}

            {/* La franja SÍ lleva fondo: es el resultado de los dos campos de
                arriba, no un bloque. */}
            <div className="min-h-barraStock sunmi-control rounded-control px-filtro py-entreFiltros flex items-center justify-between gap-renglon">
              <span className="text-sm3 sunmi-text-muted">Entra al stock</span>
              <span className="text-sm3 font-bold tabular-nums">
                {limpio(entraAlStock)} {entraAlStock === 1 ? "unidad" : "unidades"}
              </span>
            </div>
          </Bloque>

          {/* ── 3 · EL MOTIVO, SOLO SI LA CANTIDAD NO COINCIDE ─────────────
              El único bloque condicional que queda, y no por estilo: sin
              diferencia no hay por qué preguntar por qué difiere. */}
          {cantidadDifiere && (
            <Bloque titulo="Motivo de la diferencia">
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
            </Bloque>
          )}

          {/* ── 4 · EL PRECIO, SIEMPRE ────────────────────────────────────
              Los cuatro casos viven en el mismo bloque y en el mismo lugar de
              la hoja. Lo único que cambia es el título y qué se ofrece. */}
          <Bloque
            titulo={tituloDelPrecio}
            accion={
              yaDecidido && !cambiandoPrecio ? (
                <SunmiButton
                  color="slate"
                  type="button"
                  disabled={guardando}
                  aria-label="Cambiar la decisión de precio"
                  onClick={() => setCambiandoPrecio(true)}
                  className="shrink-0 min-h-toque rounded-control px-4 text-sm3"
                >
                  Cambiar
                </SunmiButton>
              ) : null
            }
          >
            {sinComparacion ? (
              // Sin uno de los dos precios no hay decisión posible: se dice cuál
              // falta y qué pasa igual. Nada que elegir.
              <>
                <span className="text-sm3 sunmi-text-muted break-words">{sinComparacion}</span>
                <span className="text-sm3 sunmi-text-muted break-words">
                  La mercadería entra igual y tu costo no se toca.
                </span>
              </>
            ) : yaDecidido && !cambiandoPrecio ? (
              // Ya contestada: se dice qué quedó. Volver a mostrar las dos
              // opciones sobre algo ya contestado es la pregunta otra vez,
              // aunque venga con la respuesta marcada.
              <span className="text-sm3 sunmi-text-muted break-words">
                {textoDeDecision(yaDecidido.decision)} ·{" "}
                {formatearMoneda(
                  yaDecidido.decision === DECISION_DE_PRECIO.DEJA_EL_MIO
                    ? fila.costoCatalogo
                    : fila.costoFactura
                )}
              </span>
            ) : cambio ? (
              <>
                {losDosPrecios}

                {/* ── LO QUE SE HABÍA DECIDIDO, CUANDO YA NO APLICA ───────
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

                {/* Lo que ya está decidido por regla no se ofrece: el servidor
                    rechaza una baja y un salto brusco, así que el botón sería
                    un error seguro. Se dice el porqué con el texto que esa
                    regla ya tiene escrito. */}
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
            ) : (
              // Los dos números son el mismo: se muestran igual, y no hay nada
              // que decidir. El bloque está para que la hoja no cambie de forma.
              losDosPrecios
            )}
          </Bloque>

          {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}
        </>
      )}
    </SunmiModalLayout>
  );
}
