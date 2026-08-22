"use client";

// LA TARJETA DEL CATÁLOGO EN EL CELULAR, con sus dos caras.
//
// ── QUÉ ES CADA CARA ───────────────────────────────────────────────────────
//
//   FRENTE — VENTA CONFIGURADA. Cómo está decidido vender ese producto en la
//            ubicación activa: la presentación arriba y el número debajo.
//            "PACK X 24 / $24.500,00" en el depósito.
//
//   DORSO  — REFERENCIA e IDENTIFICACIÓN. La otra escala para consultar, y los
//            códigos con los que se busca el producto. Dice, con todas las
//            letras, cuál sigue siendo la venta configurada.
//
// **Dar vuelta la tarjeta no cambia nada.** No toca el producto, ni `modo_envio`,
// ni el precio, ni la configuración, ni pide nada al servidor.
//
// ── ESTE ARCHIVO TIENE DOS PIEZAS, Y ESTÁN SEPARADAS A PROPÓSITO ──────────
//
//   `CuerpoDeLaCara`        — dibuja UNA cara. No tiene estado: recibe cuál.
//   `TarjetaProductoMovil`  — tiene el estado, el gesto y el botón, y monta la
//                             pieza del kit con el cuerpo adentro.
//
// La separación no es prolijidad: es lo único que hace probable el dorso.
// `renderToStaticMarkup` dibuja el estado inicial y la tarjeta abre SIEMPRE en el
// frente, así que todos los candados de la suite miraban una sola cara — y ahí
// vivía un defecto que ninguno vio, el dorso de un producto por kilo diciendo
// "Importe variable". Con el cuerpo aparte, la otra cara se dibuja sin navegador.
//
// No son dos tarjetas: es la misma, partida entre la mitad que decide y la que
// dibuja.
//
// ── LA NAVEGACIÓN VIVE ADENTRO DEL CUERPO ─────────────────────────────────
//
// El botón de dar vuelta estaba en la fila de acciones, al lado de Editar, y eso
// los ponía al mismo nivel: dos acciones hermanas, una que edita el producto y
// otra que cambia lo que se está mirando. No son lo mismo.
//
// Ahora vive DENTRO del carrusel, en la misma fila que el indicador ● ○. Editar
// queda solo, ancho completo, debajo y afuera.
//
// ── CUÁNDO HAY DORSO ──────────────────────────────────────────────────────
//
// El dorso existe si aporta REFERENCIA o IDENTIFICACIÓN:
//
//   · referencia    — hay conversión pack ↔ unidad, o la línea de kilo/pieza.
//                     Eso lo decide `carasDeTarjeta`, con las funciones del POS.
//   · identificación — el usuario tiene prendido alguno de los dos códigos.
//
// Un suelto con los códigos prendidos SÍ tiene dorso. Y una tarjeta sin
// referencia y con los dos códigos apagados es de una sola cara, y tiene que
// funcionar así.
//
// La decisión se parte en dos: `carasDeTarjeta` es puro y no sabe nada de
// "Personalizar card", así que la parte de identificación se resuelve acá.
//
// ── LAS DOS CARAS TIENEN QUE MEDIR LO MISMO ───────────────────────────────
//
// La lista usa `auto-rows-fr`, que le da a todas las filas el alto de la más
// alta. Si el dorso fuera más alto, dar vuelta UNA tarjeta estiraría TODAS las
// filas: el catálogo entero saltaría.
//
// Por eso el cuerpo tiene ranuras fijas y el frente RESERVA el lugar de lo que
// solo el dorso muestra, con `invisible` —oculta el contenido, conserva la caja y
// lo saca del árbol de accesibilidad—. Que los dos altos coincidan no se deduce:
// lo mide la sonda del navegador.
//
// ── EL GESTO NO PUEDE PELEARSE CON EL SCROLL ───────────────────────────────
//
// La lista se recorre deslizando el dedo hacia arriba. Si la tarjeta capturara
// cualquier movimiento, recorrer el catálogo daría vuelta tarjetas sin querer.
//
// Dos cosas lo evitan, y las dos hacen falta:
//
//   · `touch-action: pan-y` — le dice al NAVEGADOR que el desplazamiento
//     vertical sigue siendo suyo;
//   · se compara el desplazamiento horizontal contra el vertical antes de
//     decidir. Un gesto que se movió más en vertical NO da vuelta nada.
//
// El umbral son 45 px. Sin librería: es un eje y un umbral, y una dependencia de
// carrusel son decenas de KB que además traen su propio scroll.

import { useRef, useState } from "react";
// `RefreshCw` se fue: era un ícono de sincronizar sobre un control que no
// actualiza nada. Las flechas dicen hacia dónde se va, que es lo que hace.
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
  PieDeCodigosTarjeta,
} from "@/components/sunmi/SunmiProductoCard";
import { nombreCortoDe, nombreDelDorso } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

/** Cuántos píxeles horizontales hacen falta para que el gesto cuente. */
const UMBRAL_GESTO = 45;

/** Lo que dice el número cuando el producto no tiene precio fijo. */
const SIN_PRECIO_FIJO = "Importe variable";

/** Cómo se nombra cada cara. Es la jerarquía que pide el diseño. */
const ROTULO_FRENTE = "VENTA CONFIGURADA";
const ROTULO_DORSO_REFERENCIA = "REFERENCIA";
const ROTULO_DORSO_IDENTIFICACION = "IDENTIFICACIÓN";

/** `false` es "esta pantalla no lo muestra"; `null` es "no hay dato". */
const OCULTO = (valor) => valor === false;

/**
 * El color de los puntos del indicador de cara.
 *
 * El acento MEZCLADO con el color de texto, igual que las cards de "Para
 * revisar" y la barra del riel, y por lo mismo: pelado daba 2,86 sobre el fondo
 * del cuerpo en `ambarCaja`, contra los 3,0 que necesita un objeto gráfico.
 *
 * Lo verifica `scripts/sonda-controles-tokens.mjs`, que mide ESTA expresión
 * sobre `--hover-bg` en los catorce temas.
 */
const PUNTO_DEL_INDICADOR = "color-mix(in srgb, var(--pos-accent) 88%, var(--app-fg))";

/**
 * El precio de una cara: la presentación y el número.
 *
 * Los dos juntos y no en dos bloques: "$31.200" sin la presentación no se puede
 * controlar, y la presentación sin el número no dice nada. Son un dato.
 *
 * ── LA PRESENTACIÓN VA ARRIBA ─────────────────────────────────────────────
 *
 * Estaban al revés: el número arriba y la presentación debajo. El orden importa
 * porque es el orden en que se leen — primero QUÉ se está mirando y después
 * cuánto sale. Con el número primero, el ojo lee "$31.200" sin saber todavía de
 * qué, que es exactamente la pregunta que la franja de equivalencia contestaba.
 */
function PrecioDeLaCara({ importe, presentacion, esCombo = false, atenuado = false }) {
  return (
    <span className="flex flex-col items-end leading-none">
      {presentacion && (
        <span
          data-cara-presentacion
          className="mb-1 text-[11.5px] font-medium sunmi-text-muted whitespace-nowrap"
        >
          {presentacion}
          {/* EL COMBO SE SIGUE DICIENDO, Y ACÁ ES DONDE LE QUEDA LUGAR.
              Era lo único que distinguía un combo en toda la tarjeta y vivía en
              la franja de equivalencia, que se fue. */}
          {esCombo && " · COMBO"}
        </span>
      )}
      {/* 30 px: es el tamaño del prototipo. Va escrito porque la escala de
          Tailwind no lo tiene —`text-3xl` son 26,25 acá, con 1 rem = 14— y
          redondearlo al token más cercano cambiaría el número del diseño. */}
      <span
        data-cara-importe
        className={`text-[30px] font-bold whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em] ${
          atenuado ? "sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {importe === null || importe === undefined ? SIN_PRECIO_FIJO : formatearMoneda(importe)}
      </span>
    </span>
  );
}

/**
 * LA REFERENCIA DE KILO Y PIEZA. Una línea, y nada más.
 *
 * ── EL DEFECTO QUE ESTO ARREGLA ───────────────────────────────────────────
 *
 * Kilo y pieza fija no tienen una segunda ESCALA con su importe: tienen una
 * línea —"$130,00 cada 100 g", "1 pieza = 6 kg · $1.000,00 por kilo"— que sale
 * de `lineaDeEquivalencia`. Por eso `carasDeTarjeta` les devuelve el dorso con
 * `importe: null` y el texto en `detalle`.
 *
 * El envoltorio le pasaba ese `null` a `PrecioDeLaCara`, que lo interpreta como
 * "no hay precio fijo" y escribía **"Importe variable"** — y debajo, además, la
 * referencia. O sea: el dorso de un fiambre por kilo decía que su importe es
 * variable, que es falso y encima es el rótulo de OTRA cosa.
 *
 * "Importe variable" queda reservado a los servicios, que son los únicos que no
 * tienen precio. Un kilo lo tiene: está en el frente.
 */
function ReferenciaDeLaCara({ detalle }) {
  return (
    <span
      data-cara-referencia
      className="block text-sm sunmi-text-strong text-right leading-snug [font-variant-numeric:tabular-nums]"
    >
      {detalle}
    </span>
  );
}

/**
 * EL CUERPO DEL CARRUSEL, SIN ESTADO. Dibuja UNA cara.
 *
 * Recibe cuál con `mirandoDorso` en vez de decidirla, y por eso el dorso se puede
 * ejercer en un candado sin navegador. Ver el encabezado del archivo.
 */
export function CuerpoDeLaCara({
  caras,
  mirandoDorso = false,
  hayReferencia,
  hayIdentificacion,
  codigoBarra = null,
  codigoInterno = null,
  regla = null,
  muestraCosto = true,
  manejadoresDeGesto = {},
  onVoltear = null,
}) {
  const { frente, dorso } = caras;
  const hayDorso = hayReferencia || hayIdentificacion;

  // La cara cuyo precio se dibuja. Un dorso de solo identificación no tiene
  // precio propio: ahí el cuerpo lo ocupan los códigos.
  const caraConPrecio = mirandoDorso ? dorso : frente;
  const dorsoSoloIdentificacion = mirandoDorso && !hayReferencia;

  /** El rótulo de la cara, con la aclaración de qué se vende cuando hace falta. */
  const rotuloDeLaCara = () => {
    if (!mirandoDorso) return ROTULO_FRENTE;
    const base = hayReferencia ? ROTULO_DORSO_REFERENCIA : ROTULO_DORSO_IDENTIFICACION;
    // ── LA ACLARACIÓN VA ACÁ Y NO EN UN RENGLÓN PROPIO ────────────────────
    //
    // Es el requisito de que el dorso no deje duda de qué se vende. Va pegada al
    // rótulo por dos motivos: se lee junto con "REFERENCIA", que es donde nace la
    // pregunta, y no gasta un renglón — un renglón de más en el dorso rompe la
    // igualdad de altos y hace saltar la grilla entera.
    const venta =
      frente.importe === null
        ? frente.presentacion
        : `${frente.presentacion} · ${formatearMoneda(frente.importe)}`;
    return `${base} · se vende ${venta}`;
  };

  const costoDeLaCara = muestraCosto ? caraConPrecio?.costo ?? null : null;

  return (
    <span
      data-tarjeta-cara={mirandoDorso ? "dorso" : "frente"}
      // ── UNA SUPERFICIE PROPIA, PARA QUE SE LEA COMO LA ZONA QUE CAMBIA ──
      //
      // El cuerpo se veía continuo con el resto de la tarjeta, así que nada decía
      // cuál es la parte que se da vuelta: el nombre, el proveedor y Editar
      // quedan quietos y esto no. Con fondo, esquinas y padding propios, el
      // carrusel se lee como una zona y no como un par de renglones sueltos.
      //
      // ── EL FONDO ES `--hover-bg`, Y ESTÁ ELEGIDO ──────────────────────
      //
      // Es el token de superficie tenue del ERP —el que usaba la franja de
      // equivalencia— y existe en los CATORCE temas. El prototipo pide un violeta
      // claro, que en `violetaSaas` es exactamente esto; en los otros trece, el
      // equivalente de cada uno.
      //
      // No se inventa un token nuevo: elegir su valor en catorce temas, con su
      // medición de contraste, es una tanda propia. Y no se escriben los hex del
      // prototipo, que harían que la tarjeta se viera igual en los catorce —o
      // sea, mal en trece—.
      //
      // El contraste del texto sobre esta superficie está medido en los catorce:
      // ver `scripts/sonda-controles-tokens.mjs`.
      className="flex-1 min-w-0 self-stretch flex flex-col rounded-xl px-2.5 py-2 [background:var(--hover-bg)]"
      style={{ touchAction: "pan-y" }}
      {...manejadoresDeGesto}
    >
      {/* RANURA 1 · EL RÓTULO DE LA CARA. Una línea, siempre, en las dos caras:
          es lo que hace que no haya que adivinar cuál se está mirando.
          `truncate` porque en el dorso lleva además qué se vende.
          `text-xs2` son 10 px y está declarado en `tailwind.config.js`. */}
      <span
        data-cara-rotulo
        className="block text-xs2 font-semibold tracking-wide sunmi-text-muted truncate leading-none mb-1.5"
      >
        {rotuloDeLaCara()}
      </span>

      {/* RANURA 2 · EL CUERPO. El precio con su presentación y, a la izquierda,
          el costo en LA ESCALA DE ESTA CARA más la regla.
          En un dorso de sola identificación, acá van los códigos: sin eso
          quedaría un hueco del alto del precio. */}
      {dorsoSoloIdentificacion ? (
        // Sin `min-h` propio: la fila del valor de la pieza del kit ya reserva
        // 30 px, y escribirlo otra vez acá sería el mismo número en dos lugares.
        <span className="flex-1 flex items-center">
          <PieDeCodigosTarjeta
            codigoBarra={codigoBarra}
            codigoInterno={codigoInterno}
            className="w-full border-t-0 pt-0"
          />
        </span>
      ) : (
        <span className="flex justify-end items-center gap-1.5">
          {(costoDeLaCara !== null || regla) && (
            <span className="mr-auto min-w-0 flex flex-col items-start leading-tight">
              {costoDeLaCara !== null && (
                <span
                  data-cara-costo
                  className="text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap sunmi-text-muted"
                  title="Costo, en la misma escala que el precio de esta cara"
                >
                  {/* ── EL COSTO NOMBRA SU ESCALA ─────────────────────────
                      "Costo $24.000" no dice de qué: en el dorso ese número es
                      del pack y en el frente de la unidad, y son la misma
                      palabra. El nombre NO se recalcula — sale de la
                      presentación que la cara ya resolvió. */}
                  Costo {nombreCortoDe(caraConPrecio.presentacion)} ·{" "}
                  {formatearMoneda(costoDeLaCara)}
                </span>
              )}
              {regla}
            </span>
          )}
          {/* ── KILO Y PIEZA NO PASAN POR ACÁ ────────────────────────────
              Su dorso no tiene importe: tiene una LÍNEA de referencia. Pasarle
              ese `null` a `PrecioDeLaCara` hacía que escribiera "Importe
              variable" —que es el rótulo de los servicios— y además dibujara la
              referencia debajo. */}
          {caraConPrecio.importe === null && caraConPrecio.detalle ? (
            <ReferenciaDeLaCara detalle={caraConPrecio.detalle} />
          ) : (
            <PrecioDeLaCara
              importe={caraConPrecio.importe}
              presentacion={caraConPrecio.presentacion}
              esCombo={!mirandoDorso && frente.esCombo}
              // El dorso va atenuado: es una consulta, no lo que se cobra. Que
              // los dos números se vieran igual de fuertes es lo que haría dudar
              // de cuál manda.
              atenuado={mirandoDorso}
            />
          )}
        </span>
      )}

      {/* RANURA 3 · LA IDENTIFICACIÓN. Solo en el dorso.
          En el frente se RESERVA su lugar con `invisible`: oculta el contenido,
          conserva la caja y lo saca del árbol de accesibilidad. Sin la reserva,
          dar vuelta una tarjeta estiraría todas las filas de la grilla. */}
      {hayIdentificacion && !dorsoSoloIdentificacion && (
        <PieDeCodigosTarjeta
          codigoBarra={codigoBarra}
          codigoInterno={codigoInterno}
          className={`mt-2 ${mirandoDorso ? "" : "invisible"}`}
        />
      )}

      {/* RANURA 4 · LA NAVEGACIÓN, ADENTRO DEL CARRUSEL.
          El indicador dice en cuál de las dos caras se está; el botón nombra la
          cara a la que lleva, así que el mismo control explica cómo volver. Van
          juntos porque son lo mismo: moverse entre caras. */}
      {hayDorso && (
        <span className="mt-2 flex items-center justify-between gap-2">
          <span data-tarjeta-indicador className="flex items-center gap-1.5" aria-hidden="true">
            {[false, true].map((esDorso) => (
              <span
                key={String(esDorso)}
                className="block w-1.5 h-1.5 rounded-full transition-opacity"
                style={{
                  background: PUNTO_DEL_INDICADOR,
                  opacity: mirandoDorso === esDorso ? 1 : 0.3,
                }}
              />
            ))}
          </span>
          {/* ── LA FLECHA APUNTA A DÓNDE SE VA, Y NO ES UN REFRESH ────────
              Había un ícono de sincronizar, y semánticamente no se está
              actualizando nada: la tarjeta no vuelve a pedir el producto ni lo
              cambia. Es un movimiento entre dos caras, así que la flecha va en la
              dirección del movimiento y del lado que le corresponde.

              44 px de alto: el mínimo táctil de WCAG 2.5.5, escrito porque en
              esta aplicación 1 rem son 14 px y `h-11` daría 38,5. */}
          <button
            type="button"
            data-tarjeta-voltear
            onClick={onVoltear ?? undefined}
            aria-pressed={mirandoDorso}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mr-2 text-xs font-medium sunmi-text-strong"
          >
            {mirandoDorso && <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            Ver{" "}
            {mirandoDorso
              ? nombreCortoDe(frente.presentacion)
              : nombreDelDorso(hayReferencia ? dorso : null)}
            {!mirandoDorso && <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
          </button>
        </span>
      )}
    </span>
  );
}

/**
 * @param {object}   caras          de `carasDeTarjeta`: `{ frente, dorso }`
 * @param {node}     regla          el renglón de la regla de ganancia, o null
 * @param {bool}     muestraCosto   si "Personalizar card" lo tiene prendido
 * @param {function} onEditar
 *
 * `codigoBarra` y `codigoInterno` siguen la convención del kit: `false` es
 * "apagado en Personalizar card" y `null` es "no hay dato".
 */
export default function TarjetaProductoMovil({
  nombre,
  empresa = null,
  codigoBarra = null,
  codigoInterno = null,
  caras,
  regla = null,
  muestraCosto = true,
  onEditar,
}) {
  const [enDorso, setEnDorso] = useState(false);
  const gesto = useRef(null);

  // ── LAS DOS COSAS QUE PUEDEN JUSTIFICAR UN DORSO ───────────────────────
  const hayReferencia = !!caras.dorso;
  const hayIdentificacion = !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
  const hayDorso = hayReferencia || hayIdentificacion;
  const mirandoDorso = hayDorso && enDorso;

  const alSoltar = (e) => {
    const inicio = gesto.current;
    gesto.current = null;
    if (!inicio || !hayDorso) return;
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
    // El vertical manda: si el dedo se movió más hacia abajo que hacia el
    // costado, era scroll y no un gesto de la tarjeta.
    if (Math.abs(dx) < UMBRAL_GESTO || Math.abs(dx) <= Math.abs(dy)) return;
    setEnDorso(dx < 0);
  };

  const manejadoresDeGesto = {
    onPointerDown: (e) => {
      gesto.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: alSoltar,
    onPointerCancel: () => {
      gesto.current = null;
    },
  };

  return (
    <SunmiProductoCard
      nombre={nombre}
      empresa={empresa}
      // Los códigos NO van al pie del kit: pertenecen al dorso, y se dibujan
      // adentro del cuerpo del carrusel. Se le pasa `false` para que la pieza
      // deje su espaciador y las acciones sigan ancladas abajo.
      codigoBarra={false}
      codigoInterno={false}
      // El cuerpo ocupa la ranura `valor`, que es la única que la pieza del kit
      // deja libre.
      valor={
        <CuerpoDeLaCara
          caras={caras}
          mirandoDorso={mirandoDorso}
          hayReferencia={hayReferencia}
          hayIdentificacion={hayIdentificacion}
          codigoBarra={codigoBarra}
          codigoInterno={codigoInterno}
          regla={regla}
          muestraCosto={muestraCosto}
          manejadoresDeGesto={manejadoresDeGesto}
          onVoltear={() => setEnDorso((v) => !v)}
        />
      }
      aviso={null}
      // ── EDITAR, SOLO Y ANCHO COMPLETO ─────────────────────────────────────
      //
      // Es la única acción de la tarjeta. El botón de dar vuelta se fue de acá
      // adentro: no es una acción sobre el producto, es moverse entre caras, y
      // ponerlos hermanos los igualaba.
      acciones={
        <AccionTarjeta icono={Pencil} onClick={onEditar}>
          Editar
        </AccionTarjeta>
      }
    />
  );
}

export {
  UMBRAL_GESTO,
  SIN_PRECIO_FIJO,
  ROTULO_FRENTE,
  ROTULO_DORSO_REFERENCIA,
  PUNTO_DEL_INDICADOR,
};
