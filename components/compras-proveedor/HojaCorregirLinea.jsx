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
import { Pencil } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { BuscadorProducto } from "@/components/comprobantes/PiezasConciliacion";
import { formatearMoneda, formatearKgExacto } from "@/lib/moneda";
import {
  decisionDeCostoSugerida,
  textoDeLaDiferencia,
  MARCA,
  VARIACION_POR_DEFECTO,
} from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { aceptarEstaBloqueado } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { ORIGEN_VINCULO } from "@/lib/compras-proveedor/comprobante/vinculo";
import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  cantidadFueConvertida,
  costoPropioParaDecidir,
  difiereDeLoPedido,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  motivoSinComparacion,
  piezasContadasDeLaFila,
  piezasEstimadasDeLaFactura,
  porcentajeDelPrecio,
  unidadesFisicasEsperadas,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
// LA ESCALA SALE DE LA MISMA FUNCIÓN QUE USA LA TARJETA, no de una parecida.
import { quedoEnBultos } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import {
  laCantidadCuadraConElPrecio,
  textoDeLaEscalaQueNoCuadra,
} from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";
import { contenidoDelBulto, textoDelContenido } from "@/lib/compras-proveedor/contenidoDelBulto";
import { lecturaElegida } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import {
  DIRECCION_DIFERENCIA,
  MOTIVO_DIFERENCIA,
  motivoExigeDetalle,
  motivosParaDireccion,
} from "@/lib/stock/motivosDeDiferencia";
import {
  DECISION_DE_PRECIO,
  decisionVencida,
  decisionVigente,
  textoDeDecision,
  textoDeLoQueCambio,
} from "@/lib/compras-proveedor/decisionDePrecio";

/** Los MISMOS motivos que la recepción de una transferencia, con sus valores
 *  canónicos: un reporte por motivo no puede ver dos vocabularios.
 *
 *  Los valores salen de `lib/stock/motivosDeDiferencia.js`; lo único propio de
 *  compras es el texto corto de los botones. Y compras ofrece SIEMPRE los de
 *  una disminución, también cuando llegó de más: es la regla que ya tenía, y
 *  compartir el vocabulario no la cambia. */
const TEXTO_BOTON_MOTIVO = Object.freeze({
  [MOTIVO_DIFERENCIA.FALTANTE]: "Faltante",
  [MOTIVO_DIFERENCIA.PRODUCTO_DANADO]: "Dañado",
  [MOTIVO_DIFERENCIA.OTRO]: "Otro",
});

export const MOTIVOS = Object.freeze(
  motivosParaDireccion(DIRECCION_DIFERENCIA.DISMINUCION).map((valor) => ({
    valor,
    texto: TEXTO_BOTON_MOTIVO[valor],
  }))
);

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
  /** Cuánto se le mueve el precio a ESTE proveedor sin que sea raro, en %. */
  variacionNormalPct = VARIACION_POR_DEFECTO,
  /**
   * ── EL LÁPIZ A EDITAR PRODUCTO ─────────────────────────────────────────
   *
   * Solo sin papel. Sin factura no hay precio contra el cual decidir, así que
   * el costo que está mal no se corrige en esta hoja: se corrige en el
   * PRODUCTO, que es el único lugar donde se cambia un costo del catálogo
   * —ninguna ruta de pedido lo escribe desde `ed52991`—, y se vuelve acá.
   *
   * Null cuando quien recibe no tiene permiso de editar productos: el botón no
   * aparece, en vez de aparecer y rebotar.
   */
  onEditarProducto = null,
}) {
  // La fila la armó `filaSinPapel`: es una línea del pedido que llegó sin
  // factura. Lo que habla del papel —lo que dice, el vínculo, la decisión de
  // precio— no tiene de qué hablar.
  const sinPapel = fila?.sinPapel === true;
  // La diferencia de siempre —papel contra línea del pedido— o la del catálogo
  // que se movió después del pedido. En la segunda, "tu precio" es el costo
  // maestro de hoy, que es contra el que compara el cierre.
  const cambio = hayDiferenciaDePrecio(fila);
  const tuPrecio = costoPropioParaDecidir(fila);
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

  // ── LA REGLA DEL PROVEEDOR, SOBRE LOS DOS PRECIOS DE ESTE RENGLÓN ─────
  //
  // Los dos ya vienen en la unidad del depósito, que es como los compara la
  // tarjeta. Acá no se convierte nada: convertir sería el segundo criterio de
  // escala de siempre.
  const sugerida = useMemo(
    () =>
      decisionDeCostoSugerida({
        papel: fila?.costoFactura,
        tuyo: tuPrecio,
        variacionPct: variacionNormalPct,
        factorPack: fila?.factorPack,
      }),
    [fila?.costoFactura, tuPrecio, fila?.factorPack, variacionNormalPct]
  );
  const avisoDeLaDiferencia = textoDeLaDiferencia(sugerida, {
    proveedor: proveedorNombre || "Este proveedor",
    moneda: formatearMoneda,
    papel: fila?.costoFactura,
    tuyo: tuPrecio,
  });
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
  // ── QUÉ VIENE MARCADO, Y CUÁNDO NO VIENE NADA ────────────────────────
  //
  // `null` significa "todavía no eligió nadie", y es distinto de las dos
  // opciones: cuando la diferencia no es normal para este proveedor no viene
  // marcada ninguna y guardar no avanza hasta que la persona elija. Hasta esta
  // tanda arrancaba en `true` —"aceptar el precio nuevo"— siempre, así que
  // sobre las papas del 242, con el papel 14 % MÁS BARATO, el que tocaba
  // "Revisado y seguir" sin mirar se bajaba el costo solo.
  const [aceptaPrecio, setAceptaPrecio] = useState(null);
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
  // ── LOS KILOS, PARA LOS PRODUCTOS QUE EL DEPÓSITO CUENTA POR PESO ──────
  //
  // El papel de Paty los trae impresos —el salamín picado son 3 piezas y 2,100
  // kg— y la hoja no los pedía ni los mostraba: ofrecía "3 unidades" y el
  // cierre terminaba calculando 3 × el peso de referencia, 1,65 kg, en vez de
  // los 2,100 que el proveedor facturó.
  const [kilos, setKilos] = useState("");

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
  // Cómo se dice lo que trae el papel. En el fiambre de peso variable que se
  // factura por kilo —Das #255, "10,94 × 9.375,87"— son KILOS, con su
  // estimación de piezas al lado para cotejar contra lo pedido; nunca "10.94".
  const piezasEstimadas = piezasEstimadasDeLaFactura(fila);
  const loQueDiceLaFactura =
    fila?.cantidadEnKilos === true
      ? `${formatearKgExacto(fila.peso)}${piezasEstimadas !== null ? ` (≈ ${limpio(Math.round(piezasEstimadas * 10) / 10)} piezas)` : ""}`
      : limpio(cantidadDeLaFactura);
  const convertida = cantidadFueConvertida(fila);
  // ── CUANDO EL PROVEEDOR FACTURA UN PACK DEL BULTO ─────────────────────
  //
  // La lectura y su frase salen de la deducción —`explicarVeredicto`—, no se
  // arman acá: "Dyssa lo trae por pack de 6: 8 packs = 2 bultos de 24". Y si
  // la deducción no pudo decidir entre packs, la frase dice cada resultado.
  const viaPack = fila?.unidad?.unidad === "POR_PRESENTACION" ? lecturaElegida(fila.unidad) : null;
  const explicacionDeLaUnidad = fila?.unidad?.explicacion ?? null;
  const fraseDeLaUnidad =
    viaPack || fila?.unidad?.requiereDecision ? explicacionDeLaUnidad?.frase ?? null : null;

  useEffect(() => {
    if (!abierta || !fila) return;
    // El fiambre de peso variable que viene en kilos: el papel no dice cuántas
    // piezas llegaron, así que el campo arranca VACÍO —no contado— y no con los
    // kilos puestos como si fueran piezas. Lo que sí se ofrece son los kilos,
    // abajo, que es lo que entra al stock.
    const contadasDelFiambre =
      fila.cantidadEnKilos === true ? piezasContadasDeLaFila(fila) : null;
    setBultos(
      fila.cantidadEnKilos === true
        ? contadasDelFiambre != null
          ? String(contadasDelFiambre)
          : ""
        : fila.cantidadRecibida != null
          ? String(fila.cantidadRecibida)
          : String(cantidadEnEscalaDelPedido(fila) ?? "")
    );
    setSueltas(fila.unidadesSueltas != null ? String(fila.unidadesSueltas) : "");
    // Lo pesado antes si lo hubo; si no, LO QUE DICE EL PAPEL. Nunca el peso de
    // referencia del producto: ése es una estimación y el papel es un dato.
    setKilos(
      fila.kgRecibidos != null
        ? String(fila.kgRecibidos)
        : fila.peso != null
          ? String(fila.peso)
          : ""
    );
    setMotivo(fila.motivoPrincipal ?? null);
    setDetalleMotivo(fila.motivoDetalle ?? "");
    // La opción marcada arranca en lo que se decidió la vez pasada, si sigue
    // valiendo. Sin esto, "Cambiar" mostraría "Aceptar el precio nuevo"
    // seleccionado sobre una línea donde se había dicho lo contrario, y un
    // toque en Guardar daría vuelta la decisión sin que nadie lo pidiera.
    // ── Y SI NO SE DECIDIÓ NUNCA, LO DECIDE LA REGLA DEL PROVEEDOR ────
    //
    // Antes venía marcado "aceptar el precio nuevo" SIEMPRE. Sobre las papas
    // del 242, con el papel 14 % más barato que tu costo, eso significaba que
    // el que tocaba "Revisado y seguir" sin mirar se bajaba el costo solo.
    //
    // Ahora: dentro de la variación normal del proveedor viene marcado EL MÁS
    // ALTO de los dos; fuera de ella, o si la diferencia es el factor del
    // bulto, NO VIENE MARCADO NADA y guardar no avanza hasta que alguien
    // elija.
    const decidida = decisionVigente(fila);
    const bloqueada = aceptarEstaBloqueado(fila?.precio?.decision);
    const porLaRegla =
      sugerida.marcado === MARCA.ACEPTA ? true : sugerida.marcado === MARCA.DEJA ? false : null;
    setAceptaPrecio(
      bloqueada
        ? false
        : decidida
          ? decidida.decision === DECISION_DE_PRECIO.ACEPTA_FACTURA
          : porLaRegla
    );
    setCambiandoPrecio(false);
    setError("");
    setCambiandoProducto(false);
  }, [abierta, fila, sugerida.marcado]);

  // ── ¿ESTE PRODUCTO ENTRA AL STOCK EN KILOS? ───────────────────────────
  //
  // Lo dice el DEPÓSITO, con el mismo predicado que usan la tarjeta y el costo.
  // El salamín picado y el danbo van por peso; las papas, por pieza, aunque el
  // papel imprima su peso.
  const entraEnKilos = fila?.porKilo === true;

  // Las PIEZAS contadas, siempre. Es lo que se coteja contra el pedido, y no
  // cambia porque el stock de este producto se lleve en kilos.
  const unidadesContadas = useMemo(() => {
    const b = Number(bultos) || 0;
    const s = Number(sueltas) || 0;
    const factor = vaPorPack ? Number(fila?.factorPack) || 1 : 1;
    return b * factor + s;
  }, [bultos, sueltas, vaPorPack, fila?.factorPack]);

  // Y lo que entra al stock: kilos si el depósito lo cuenta por peso, y las
  // piezas si no. Son dos preguntas distintas sobre el mismo renglón.
  const entraAlStock = useMemo(
    () => (entraEnKilos ? Number(kilos) || 0 : unidadesContadas),
    [entraEnKilos, kilos, unidadesContadas]
  );

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
      // ── EL MISMO FACTOR QUE USA EL CIERRE ──────────────────────────────
      //
      // Sin esto, la hoja valuaba lo que entra al stock al precio del BULTO y
      // acusaba un renglón perfecto. El caso: MOGUL MORAS del pedido 245, bolsa
      // de 83. Entran 996 unidades y el papel cobra $5.759,12 la BOLSA, así que
      // la hoja calculaba 996 × 5.759,12 = **$5.736.083,52** contra los
      // $69.109,44 impresos — cuando 12 bolsas × $5.759,12 da exactamente eso.
      //
      // El arreglo del cierre —66cc426e, mirar la igualdad en las DOS escalas
      // posibles— ya estaba; lo que faltaba era que la hoja le pasara el factor.
      // Es la misma función para las dos, que es el punto: una sola respuesta a
      // "¿la escala cuadra?".
      factorPack: fila?.factorPack,
    });
  }, [cantidadDeLaFactura, vaPorPack, fila?.factorPack, fila?.subtotal, fila?.cantidad, fila?.porKilo]);

  const avisoDeEscala = textoDeLaEscalaQueNoCuadra(escalaOfrecida, { moneda: formatearMoneda });

  // ── ¿EL PAPEL Y EL PRODUCTO DICEN LO MISMO DEL BULTO? ──────────────────
  //
  // La descripción impresa suele traer el contenido —"(83u)", "12X30G"— y
  // cuando no coincide con el `factor_pack` cargado, uno de los dos está mal.
  // Se dice en una línea y NO se cambia nada solo: el stock y el costo siguen
  // saliendo del factor del producto, que es el dato que alguien cargó mirando
  // la mercadería. Corregirlo es una decisión sobre el producto y va por
  // editar producto.
  //
  // Medido sobre el pedido 245: de sus veinte renglones, doce traen el
  // contenido y dos no coinciden.
  const avisoDelContenido = textoDelContenido(
    contenidoDelBulto({ texto: fila?.textoCrudo, factorPack: fila?.factorPack })
  );

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
    //
    // ── Y LO ESPERADO SALE DEL MISMO LUGAR QUE LA TARJETA ────────────────
    //
    // Acá había una cuenta propia —lo pedido por el factor del pedido— y sobre
    // la #253 de DYSSA, un pedido que nació de la factura, comparaba las 8
    // UNIDADES con que se sembró el Gancia contra las 48 que entran: pedía el
    // motivo de una diferencia que no existe. `unidadesFisicasEsperadas` pasa
    // por la misma conversión de pack que lo que entra.
    // El fiambre que viene en kilos se compara con la MISMA función que la
    // tarjeta: con piezas contadas, exacto; sin contar, la estimación de piezas
    // con la tolerancia del proveedor. Una diferencia chica no pide motivo.
    if (fila?.cantidadEnKilos === true) {
      const contadas = bultos === "" || !Number.isFinite(Number(bultos)) ? null : unidadesContadas;
      return difiereDeLoPedido(fila, { piezasContadas: contadas }).difiere;
    }
    const esperadas = unidadesFisicasEsperadas(fila);
    if (esperadas === null) return false;
    if (bultos === "" || !Number.isFinite(Number(bultos))) return false;
    // Contra las PIEZAS contadas, no contra lo que entra al stock: en un
    // producto por peso eso son kilos, y comparar kilos contra piezas pediría
    // el motivo de una diferencia que no existe en cada fiambre.
    return esperadas !== unidadesContadas;
  }, [fila, bultos, unidadesContadas]);

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
    if (cantidadDifiere && motivoExigeDetalle(motivo) && !detalleMotivo.trim()) {
      setError("Contá qué pasó.");
      return;
    }
    // ── SIN ELEGIR EL PRECIO NO SE AVANZA ──────────────────────────────
    //
    // Solo cuando la regla del proveedor dice que hay que mirar: una
    // diferencia fuera de lo normal, o una que es el factor del bulto. Adentro
    // de la variación viene marcado el más alto y esto no molesta a nadie.
    if (cambio && sugerida.exigeElegir && aceptaPrecio === null) {
      setError(avisoDeLaDiferencia || "Elegí qué precio queda antes de seguir.");
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
      // El texto impreso viaja con el id: el id de un renglón muere cuando el
      // papel se vuelve a leer, y el texto no.
      textoCrudo: fila.textoCrudo ?? null,
      pedidoDetalleId: fila.pedidoDetalleId,
      // Sin papel no hay renglón que marcar: la página marca la línea del
      // pedido en su eco en vez de pedírselo al servidor.
      sinPapel,
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
      // Los kilos, cuando el depósito cuenta por peso. Es lo que la franja
      // mostró y lo que el cierre va a escribir al stock.
      kgRecibidos: entraEnKilos && kilos !== "" ? Number(kilos) : null,
      motivoPrincipal: cantidadDifiere ? motivo : null,
      motivoDetalle: cantidadDifiere && motivoExigeDetalle(motivo) ? detalleMotivo.trim() : null,
      // ── EL PACK INTERMEDIO QUE ESTA HOJA MOSTRÓ, CONFIRMADO AL GUARDAR ──
      //
      // "Dyssa lo trae por pack de 6: 8 packs = 2 bultos de 24" estaba arriba
      // con su cuenta. Guardar es decir que sí, y queda en el vínculo del
      // proveedor para que la próxima boleta no lo vuelva a preguntar.
      unidadesPorFacturada: viaPack ? viaPack.unidadesPorFacturada : null,
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
      Tenías {formatearMoneda(tuPrecio)} · la factura trae{" "}
      {formatearMoneda(fila.costoFactura)}
      {viaPack ? ` por bulto de ${limpio(fila.factorPack)}` : ""}
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
              juntos.

              SIN PAPEL no hay elección: el producto es el de la línea del
              pedido. Lo que se ofrece al lado es el lápiz, que lleva a
              corregir el producto y vuelve. */}
          {sinPapel ? (
          <div className="flex items-center justify-between gap-renglon">
            <span className="min-w-0">
              <span className="block text-sm3 sunmi-text-muted">Producto del pedido</span>
              <span className="block text-sm3 font-medium sunmi-text-strong truncate">
                {fila.producto || "Sin producto"}
              </span>
            </span>
            {onEditarProducto && (
              <SunmiButton
                color="slate"
                type="button"
                disabled={guardando}
                aria-label={`Editar ${fila.producto || "el producto"}`}
                onClick={() => onEditarProducto(fila)}
                className="shrink-0 min-h-toque rounded-control px-4 text-sm3"
              >
                <Pencil size={14} aria-hidden="true" />
                Editar producto
              </SunmiButton>
            )}
          </div>
          ) : (
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
          )}

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
            {/* Sin papel queda solo lo pedido: lo contado está en el campo de
                abajo, y no hay un tercer número que decir. */}
            <span className="text-sm3 sunmi-text-muted">
              {sinPapel
                ? `Pediste ${limpio(fila.cantidadPedida)}`
                : sinPedidoPrevio
                  ? `La factura dice ${loQueDiceLaFactura}`
                  : `Pediste ${limpio(fila.cantidadPedida)} · la factura dice ${loQueDiceLaFactura}`}
              {fraseDeLaUnidad
                ? ` · ${fraseDeLaUnidad}${explicacionDeLaUnidad?.avisoDivision ? `. ${explicacionDeLaUnidad.avisoDivision}` : ""}`
                : convertida
                  ? ` · el papel dice ${limpio(fila.cantidad)} u`
                  : ""}
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

            {/* ── LOS KILOS DEL PAPEL, YA CARGADOS Y EDITABLES ────────────
                Para un producto que el depósito cuenta por peso, lo que entra
                al stock son KILOS. El papel los trae impresos y se ofrecen
                puestos: si al pesar da distinto, se corrige acá, que es para lo
                que esta hoja existe.

                El peso de referencia del producto NO se usa para llenarlo: es
                una estimación, y el papel es un dato. Sin este campo el cierre
                calculaba 3 piezas × 0,55 kg = 1,65 kg sobre un renglón que el
                proveedor facturó por 2,100. */}
            {entraEnKilos && (
              <div className="w-full">
                <div className="text-sm2 sunmi-text-muted truncate">
                  Kilos{fila?.peso != null ? ` · el papel dice ${formatearKgExacto(fila.peso)}` : ""}
                </div>
                <SunmiCampoCantidad
                  valor={kilos}
                  onCambiar={setKilos}
                  etiqueta="Kilos"
                  minimo={0}
                  paso={0.1}
                  decimales={3}
                  tipo="number"
                  claseMarco="flex-1"
                  claseInput="text-lg"
                />
              </div>
            )}

            {/* ── SI LA ESCALA NO CUADRA CON EL PRECIO, SE DICE ACÁ ───────
                Justo arriba del número que va a entrar al stock, que es el que
                estaría mal. Con los dos importes a la vista para poder
                comprobarlo contra el papel que se tiene en la mano. */}
            {avisoDelContenido && (
              <p className="text-sm2 sunmi-text-muted break-words" aria-live="polite">
                {avisoDelContenido}
              </p>
            )}

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
                {entraEnKilos ? (
                  formatearKgExacto(entraAlStock)
                ) : (
                  <>
                    {limpio(entraAlStock)}{" "}
                    {entraAlStock === 1 ? "unidad" : "unidades"}
                  </>
                )}
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
              {motivoExigeDetalle(motivo) && (
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
              la hoja. Lo único que cambia es el título y qué se ofrece.

              SIN PAPEL el bloque sigue estando, en el mismo lugar, y dice el
              costo del pedido y nada que elegir: no hay factura que traiga
              otro precio, así que no se ofrece aceptar ningún aumento. */}
          {sinPapel ? (
            <Bloque titulo="Costo del pedido">
              <span className="text-sm3 sunmi-text-strong tabular-nums">
                {formatearMoneda(fila.costoCatalogo)}
              </span>
              {/* Nombra el botón solo si el botón está: sin permiso de editar
                  productos, mandar a "Editar producto" es mandar a ningún lado. */}
              <span className="text-sm3 sunmi-text-muted break-words">
                {onEditarProducto
                  ? "Sin factura no hay precio para comparar: entra con el costo del pedido y el costo del producto no se toca. Si está mal, corregilo en Editar producto."
                  : "Sin factura no hay precio para comparar: entra con el costo del pedido y el costo del producto no se toca."}
              </span>
            </Bloque>
          ) : (
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
                    ? tuPrecio
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

                {/* ── CUANDO LA DIFERENCIA NO ES NORMAL PARA ESTE PROVEEDOR ──
                    No viene marcado nada y guardar no avanza: el que mira el
                    papel decide, y si decide se respeta. */}
                {avisoDeLaDiferencia && (
                  <p className="text-sm3 sunmi-text-warning break-words" aria-live="polite">
                    {avisoDeLaDiferencia}
                  </p>
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
          )}

          {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}
        </>
      )}
    </SunmiModalLayout>
  );
}
