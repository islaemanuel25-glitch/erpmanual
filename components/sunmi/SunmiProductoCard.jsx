"use client";

// LA TARJETA DE PRODUCTO, con su fila de acciones al pie.
//
// ── POR QUÉ NACE EN EL KIT Y NO ADENTRO DE LA PANTALLA DE PRODUCTOS ────────
//
// Porque no es del catálogo: es la tarjeta de producto del ERP. El mismo núcleo
// —nombre, empresa, cuerpo y pie de códigos— se repite en stock y en
// pedido, y lo único que cambia es QUÉ muestra en grande y QUÉ se puede tocar.
// Escrita adentro de `productos/page.jsx`, la próxima pantalla la copia, y ahí
// ya son dos que se rompen el día que una cambie.
//
// ── LA CAPA QUE SE SUPERPONÍA SE FUE, Y CON ELLA TRES PROBLEMAS ───────────
//
// Antes los botones vivían en una capa translúcida que aparecía al tocar la
// tarjeta. Se sacó por decisión de diseño —si los botones están a la vista, no
// hay nada que abrir— y de paso se llevó puesto lo que esa capa costaba:
//
//   · un toque de más para llegar a cualquier acción;
//   · el estado de "cuál está abierta", que vivía en la pantalla;
//   · y el defecto del doble disparo, que la mantenía abierta para siempre
//     porque el clic de la capa burbujeaba al contenedor.
//
// No queda `abierta` ni `onToggle`: la tarjeta no tiene estado.
//
// ── LAS DOS RANURAS ───────────────────────────────────────────────────────
//
// `valor`    — lo que esa pantalla muestra en grande. Catálogo: el precio.
//              Stock: existencia y mínimo. Pedido: el subtotal.
// `acciones` — la fila fija del pie. Catálogo: Ver y Editar. Pedido: el
//              selector y la cantidad.
//
// El núcleo NO es ranura a propósito: si cada pantalla pudiera reordenarlo,
// dejaría de reconocerse como la misma tarjeta.
//
// ── LOS ÍCONOS SON PARTE DEL NÚCLEO ───────────────────────────────────────
//
// Van fijos y no como prop: el ícono de producto, el de etiqueta en la línea de
// escala y el de código de barras en el pie identifican QUÉ ES cada renglón, y
// en una lista de veinticinco tarjetas iguales eso es lo que deja recorrerla sin
// leer. Si cada pantalla eligiera los suyos, dos listas del mismo ERP marcarían
// el mismo dato con dibujos distintos.
//
// ── NEGOCIA, COMO EL RESTO DEL KIT ────────────────────────────────────────
//
// Acepta `className` y cede por eje: si la pantalla declara tamaño de letra,
// color, padding, fondo o borde, la pieza no pone el suyo. Los valores de acá
// son el DEFAULT, no una imposición — dos clases de la misma familia tienen la
// misma especificidad y ganaría cualquiera.
//
// ── LOS COLORES SON TOKENS, NO LOS HEX DEL PROTOTIPO ──────────────────────
//
// El handoff da `#7C3AED`, `#FAF7FF`, `#E7DDF7`, `#1E1B2E`, `#6B6478`… y son,
// uno por uno, los valores que `violetaSaas` ya tiene en sus tokens. Escribirlos
// fijos haría dos daños: la tarjeta se vería igual en los catorce temas —o sea,
// mal en trece— y cada uno subiría el contador de hardcodeo. Así que se usan los
// tokens; en `violetaSaas` dan exactamente los colores del prototipo.
//
// ── LA DIFERENCIA DE CUATRO PUNTOS YA NO APLICA ───────────────────────────
//
// Acá estaba anotado que el bloque de equivalencia usaba `--hover-bg` en vez del
// `#F5F0FF` del prototipo, y por qué se dejó así. Ese bloque se fue con la
// franja: la presentación pasó a viajar pegada al precio. La nota se conserva
// como historia y no como pendiente — no hay nada que medir contra el prototipo
// en ese punto, porque el punto no existe.

// `Package` se fue con el ícono del nombre: era el mismo cubo para el 93,9 % del
// catálogo. Quedan los dos que SÍ marcan qué es cada renglón.
// `Tag` se fue con la franja de equivalencia: era el ícono que la marcaba como
// "esto es la escala del precio". La escala ahora viaja pegada al número.
import { Barcode, TriangleAlert } from "lucide-react";

import SunmiPanel from "@/components/sunmi/SunmiPanel";
import {
  componerClaseTexto,
  paddingQueSobrevive,
  declaraDisplay,
} from "@/lib/sunmi/claseNegociada";

/** El padding del cuerpo. Cede por eje si la pantalla declara el suyo. */
// `pt-3.5` y `pb-3` son 14 y 12 px en la escala de Tailwind: mismo píxel que el
// prototipo, sin clase arbitraria. Los 13 px del eje horizontal no tienen
// equivalente en la escala, así que ése sí va escrito.
const PADDING = "px-[13px] pt-3.5 pb-3";

/**
 * Lo que dice el pie cuando el producto no tiene código de barras.
 *
 * No es una raya ni un espacio: una raya se lee como "no sé" y un espacio se lee
 * como un error de dibujo. Esto se lee como lo que es, que además es la
 * respuesta a por qué ese producto no aparece al escanear.
 */
const SIN_CODIGO_BARRA = "sin código de barras";

/**
 * Y lo mismo cuando no hay proveedor cargado.
 *
 * El renglón NO desaparece: si desapareciera, esa tarjeta quedaría más baja que
 * las vecinas —el defecto que ya costó emparejar la lista entera— y además se
 * perdería el dato. Que un producto no tenga proveedor es información: es la
 * respuesta a por qué no aparece al conciliar una factura.
 */
const SIN_PROVEEDOR = "Sin proveedor";

/** El rótulo del código interno. Antes era `#2023`, que no dice de qué es. */
const PREFIJO_CODIGO_INTERNO = "Cod. prov.";

/**
 * Y lo mismo cuando no hay código interno por proveedor.
 *
 * ── POR QUÉ AHORA SE DICE Y ANTES NO ──────────────────────────────────────
 *
 * Antes el slot desaparecía si el valor venía vacío. Podía hacerlo porque lo que
 * mostraba era el **id del producto**, que existe siempre: el hueco no aparecía
 * nunca. Con el dato correcto —el código que le da el proveedor— faltar es el
 * caso normal, y un slot que se va deja la pregunta sin contestar.
 *
 * "Sin cód. prov." es la respuesta a por qué ese producto no machea contra una
 * lista de precios del proveedor, que es para lo que se mira este dato.
 */
const SIN_CODIGO_INTERNO = "Sin cód. prov.";

/**
 * UN BOTÓN DE LA FILA DE ACCIONES.
 *
 * ── POR QUÉ NO ES `SunmiButton` ───────────────────────────────────────────
 *
 * `SunmiButton` es un botón CON CUERPO: fondo de color, esquinas redondeadas y
 * su propio padding. Esta fila es lo contrario — segmentos planos que ocupan el
 * ancho entero del pie y se separan con una línea, sin fondo ni esquinas. Para
 * usar aquél habría que apagarle casi todo, y ya está medido que apagarle las
 * esquinas sale mal: `baseDeBoton.test.mjs` atrapó que pedirle `rounded-r-none`
 * le hace ceder LAS OCHO y reponer cuatro.
 *
 * No es un botón paralelo: es el mismo recurso que ya usan las acciones por fila
 * de `SunmiTablaProductos`, que también son `<button>` planos con su ícono.
 *
 * ── VIVE EN EL KIT, AL LADO DE LA TARJETA ────────────────────────────────
 *
 * Porque la fila es parte de la tarjeta. Si cada pantalla escribiera su botón,
 * la de stock y la de pedidos tendrían acciones de distinto alto en la misma
 * lista, y eso rompe justamente lo que costó emparejar.
 */
export function AccionTarjeta({ icono: Icono, onClick, children, ...resto }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // ── 44 px ESCRITOS, Y NO `h-11` ─────────────────────────────────────
      //
      // Son el mínimo de área táctil de WCAG 2.5.5 y de las guías de Apple, y
      // van escritos a propósito: **en esta aplicación 1 rem son 14 px**, así
      // que `h-11` —2,75 rem— da 38,5 y no 44. Se midió: dos clases distintas
      // daban el mismo número hasta que se fue a mirar el `font-size` de la
      // raíz. Cualquiera que escriba `h-11` esperando 44 se equivoca.
      //
      // Medido después de ponerlo: la tarjeta pasa de 203,4 a 215,9 px y a
      // 390 px SIGUEN ENTRANDO TRES. No costó la tercera tarjeta.
      className="flex items-center justify-center gap-1.5 py-2.5 h-[44px] text-xs font-medium sunmi-text-strong sunmi-row-hover"
      {...resto}
    >
      {Icono && <Icono className="w-4 h-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ── `false` ES "ESTA PANTALLA NO LO MUESTRA"; `null` ES "NO HAY DATO" ──────
//
// Son dos cosas distintas y la tarjeta tiene que poder distinguirlas, porque las
// dibuja al revés: sin dato, el renglón SE QUEDA y dice qué falta —"sin código de
// barras" es la respuesta a por qué ese producto no aparece al escanear—; oculto,
// el renglón desaparece entero.
//
// Sin esta distinción, "Personalizar card" no podría apagar el proveedor: pasarle
// `null` mostraría "(proveedor no especificado)" en las 10.521 filas, que es
// exactamente lo contrario de lo que se pidió.
const OCULTO = (valor) => valor === false;

export default function SunmiProductoCard({
  nombre,
  empresa = null,
  codigoBarra = null,
  codigoInterno = null,
  valor = null,
  // ── LA MARCA: EL LADO IZQUIERDO DE LA FILA DEL VALOR ────────────────────
  //
  // La fila del valor está alineada a la derecha, así que su mitad izquierda
  // estaba vacía en las 10.521 filas. Ahí entra un dato corto SIN COSTAR UN
  // RENGLÓN, que es la única forma de agregarle algo a esta tarjeta: cualquier
  // bloque nuevo la hace crecer y a 390 px se pierde la tercera.
  //
  // Es una ranura y no una regla, por lo mismo que `aviso`: la pieza sabe dónde
  // va y qué tamaño tiene, no sabe qué significa. En el catálogo es la regla de
  // ganancia —"30 %", "falta %"—; en stock sería otra cosa.
  //
  // El COLOR lo trae quien la usa, dentro del nodo. Decidir acá cuál se pinta de
  // aviso obligaría a la tarjeta a conocer el negocio de cada pantalla.
  marca = null,
  // ── EL AVISO ES UNA RANURA, NO UNA REGLA DE LA PIEZA ────────────────────
  //
  // La tarjeta sabe DIBUJAR un aviso; no sabe CUÁNDO corresponde. Eso es del
  // dominio de cada pantalla —en el catálogo es "se vende sin ganancia", en
  // stock sería otra cosa— y meterlo acá haría que la pieza tuviera que conocer
  // el negocio de todas las pantallas que la usen.
  aviso = null,
  acciones = null,
  // ── EL ORDEN DEL PIE SE FUE CON EL REORDENAMIENTO ───────────────────────
  //
  // Había un `codigoInternoPrimero` que daba vuelta los dos slots, y lo decidía
  // la configuración del usuario. Personalizar card dejó de reordenar: la
  // posición de cada dato la define el diseño. El código de barras va primero
  // porque es el que crece —lleva ícono y valor largo— y el del proveedor va
  // segundo porque no encoge.
  className = "",
}) {
  const padding = paddingQueSobrevive(PADDING, className);
  const contenedor = [
    "relative overflow-hidden",
    declaraDisplay(className) ? "" : "flex flex-col",
    // `h-full` para que la tarjeta llene la fila cuando la lista las iguala. Sin
    // esto el panel crece pero el contenido queda flotando en una caja más alta.
    // ── EL RITMO VERTICAL VA BLOQUE POR BLOQUE, NO CON UN `gap` ÚNICO ──────
    //
    // Antes era `gap-[11px]` para todo, así que los cinco huecos medían lo mismo
    // y no se podía apretar uno sin apretar los otros cuatro. Ahora cada bloque
    // declara su propio margen de arriba y cada número tiene un motivo:
    // el nombre y el proveedor son el mismo dato leído en dos renglones y van
    // juntos; el precio necesita aire porque es el número grande.
    //
    // Y de paso se va una medida mágica: los márgenes salen de la escala.
    "h-full",
    padding,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // `elevado` no es adorno: sin él esta tarjeta no tiene límite visible. El
    // fondo del panel y el de la página son el mismo color en los catorce temas
    // —1,00 en `sunmiDark`—, así que veinticinco apiladas se leían como un bloque
    // continuo. Ver `--card-elevacion` en `app/globals.css`.
    <SunmiPanel
      noPadding
      elevado
      // `h-full` para que el panel llene su fila cuando la lista iguala alturas.
      // Va primero para que, si la pantalla declara su propio alto, el suyo mande.
      className={["h-full", className].filter(Boolean).join(" ")}
    >
      <div className={contenedor}>
        {/* 1 · NOMBRE. Envuelve, nunca se corta: los reales son largos y a veces
            en mayúsculas, y recortarlos esconde justo lo que distingue un
            producto de otro.
            ────────────────────────────────────────────────────────────────
            ACÁ HABÍA UN ÍCONO DE PRODUCTO Y SE SACÓ, con el número que lo
            decidió: era el MISMO cubo para el 93,9 % del catálogo —2.231 de
            2.377 activos—, así que no distinguía nada y se comía 24 px de ancho
            del nombre en todas las tarjetas. Las únicas distinciones reales del
            dato son combo (142) y servicio (4); las que sí parten el catálogo
            —bulto, kilo, unidad— ya están dichas CON PALABRAS dos renglones más
            abajo, en el rótulo de escala. Un dibujo que repite lo que ya dice el
            texto no agrega, ocupa. */}
        <div
          className={componerClaseTexto({
            base: "font-semibold leading-[1.3] [text-wrap:pretty] [overflow-wrap:anywhere]",
            tamano: "text-[15px]",
            color: "sunmi-text-strong",
            pedido: className,
          })}
        >
          {nombre}
        </div>

        {/* 2 · EMPRESA. Envuelve igual — es uno de los datos que se leen para
            decidir, así que no lleva ellipsis. Y si no hay, lo dice.
            Con `empresa={false}` el renglón no va: la pantalla lo apagó. */}
        {!OCULTO(empresa) && (
        <div
          className={componerClaseTexto({
            // `mt-1` y no el hueco general: el nombre y el proveedor son el
            // mismo dato leído en dos renglones, así que van juntos. Antes los
            // separaban 11 px, los mismos que separaban todo lo demás.
            base: "mt-1 leading-[1.35] [overflow-wrap:anywhere]",
            tamano: "text-[11.5px]",
            color: "sunmi-text-muted",
            pedido: className,
          })}
        >
          <span className={empresa ? "" : "italic opacity-70"}>
            {empresa || SIN_PROVEEDOR}
          </span>
        </div>
        )}

        {/* 3 · LA RANURA DEL VALOR. En el catálogo, el precio.
            La marca va PRIMERA y empuja el resto con `mr-auto`, así el valor
            sigue pegado a la derecha exactamente donde estaba: la fila no cambia
            de alto ni el precio de lugar cuando no hay marca. */}
        {(valor || marca) && (
          // `mt-1.5`: el precio necesita aire porque es el número grande, pero
          // no los 11 px que tenía — eran el hueco general, no una decisión.
          <div className="mt-1.5 flex justify-end items-baseline gap-1.5 min-h-[30px]">
            {/* `self-center` y no la línea base de la fila: cuando la marca trae
                DOS renglones —el costo y el porcentaje—, alinearla por la base
                deja el segundo colgando POR DEBAJO de la base del precio y la
                fila crece. Medido: la tarjeta pasaba de 235,2 a 244,2 px en el
                peor caso y perdía la tercera tarjeta a 390. Centrada, los dos
                renglones entran en los 30 px que la fila ya tenía. */}
            {marca && <span className="mr-auto min-w-0 self-center">{marca}</span>}
            {valor}
          </div>
        )}

        {/* ── ACÁ VIVÍA LA FRANJA DE EQUIVALENCIA, Y SE FUE ─────────────────
            Era un bloque tenue con fondo propio que decía la conversión —"1 pack
            = 24 un · $1.300,00 por unidad"— debajo del precio.

            Se sacó porque la presentación pasó a ser parte del precio: el número
            grande viene con su rótulo, "$31.200 · PACK X 24", y la otra escala
            vive en el DORSO de la tarjeta. Dejar además la franja repetía abajo
            lo que el rótulo ya dice arriba, y en las de bulto ponía dos importes
            a dos centímetros sin decir cuál manda.

            Lo que la franja mostraba para kilo y pieza fija —donde no hay
            conversión pack ↔ unidad— NO se perdió: `carasDeTarjeta` lo mueve al
            dorso llamando a la misma `lineaDeEquivalencia`. */}

        {/* 4-bis · EL AVISO. Va DEBAJO de la escala y no adentro: la franja
            contesta "qué estás comprando" y esto contesta otra cosa, "cómo te
            está yendo con esto". Mezclarlos haría que ninguna de las dos se lea.
            El color sale de `--pos-warning`, que ya está medido para contraste
            de texto en los catorce temas — no es un ámbar escrito acá. */}
        {aviso && (
          <div
            className={componerClaseTexto({
              base: "mt-1.5 flex items-center gap-1.5 [color:var(--pos-warning)]",
              // `text-xs` y no otra medida escrita: está en la escala y no suma
              // al contador de hardcodeo. En esta aplicación son 10,5 px reales,
              // porque 1 rem son 14 — ver el encabezado de `app/globals.css`.
              tamano: "text-xs",
              color: "",
              pedido: className,
            })}
          >
            <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{aviso}</span>
          </div>
        )}

        {/* 5 · EL PIE DE CÓDIGOS. Monoespaciada y con cifras tabulares: se
            comparan de un vistazo contra una etiqueta o un remito.
            ────────────────────────────────────────────────────────────────
            EL PIE VA SIEMPRE, aunque no haya código. Antes el bloque entero
            desaparecía y las tarjetas sin código de barras quedaban más bajas
            que las vecinas — en una lista de veinticinco eso se lee como una
            lista rota. Y no se resuelve con un hueco vacío: **que un producto no
            tenga código de barras es un dato**, y es de los que hacen falta
            cuando alguien está buscando por qué no lo encuentra escaneando.
            ────────────────────────────────────────────────────────────────
            `mt-auto` ancla el pie ABAJO. Cuando la lista iguala los altos, el
            sobrante va entre la equivalencia y el pie, así que los pies de todas
            las tarjetas quedan alineados entre sí.
            ────────────────────────────────────────────────────────────────
            CON LOS DOS CÓDIGOS APAGADOS EL PIE SE VA, PERO EL `mt-auto` NO.
            Queda un espaciador vacío en su lugar. Sin él, el `mt-auto` se
            perdería con el bloque y las acciones dejarían de estar ancladas
            abajo: en una lista con `auto-rows-fr` eso deja los botones flotando
            a media altura, cada tarjeta en un lugar distinto. */}
        {OCULTO(codigoBarra) && OCULTO(codigoInterno) ? (
          <div className="mt-auto" />
        ) : (
        <div
          className={componerClaseTexto({
            base: "mt-auto flex justify-between items-center gap-2 border-t sunmi-divider pt-[9px] font-mono [font-variant-numeric:tabular-nums]",
            tamano: "text-[10.5px]",
            color: "sunmi-text-muted",
            pedido: className,
          })}
        >
          {!OCULTO(codigoBarra) && (
            <span className="flex items-center gap-1.5 min-w-0">
              <Barcode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className={codigoBarra ? "" : "italic opacity-70"}>
                {codigoBarra || SIN_CODIGO_BARRA}
              </span>
            </span>
          )}
          {/* EL SLOT DEL CÓDIGO DEL PROVEEDOR SE QUEDA AUNQUE NO HAYA DATO.
              Antes desaparecía, y podía hacerlo porque lo que mostraba era el id
              del producto: nunca faltaba. Con el dato correcto faltar es lo
              habitual, y un slot que se va deja sin contestar por qué ese
              producto no machea contra la lista del proveedor. */}
          {!OCULTO(codigoInterno) && (
            <span className={`shrink-0 ${codigoInterno ? "" : "italic opacity-70"}`}>
              {codigoInterno ? `${PREFIJO_CODIGO_INTERNO} ${codigoInterno}` : SIN_CODIGO_INTERNO}
            </span>
          )}
        </div>
        )}

        {/* 6 · LA FILA DE ACCIONES, FIJA Y A LA VISTA.
            Los hijos se reparten el ancho por igual y el separador va entre
            ellos con `divide-x`, que dibuja el borde SOLO en los intermedios:
            escribirlo a mano en cada botón deja una línea colgando en el último.
            La regla del kit sigue valiendo — el separador sale de
            `sunmi-divider`, no de un gris escrito acá. */}
        {acciones && (
          <div className="flex items-stretch divide-x sunmi-divider border-t sunmi-divider -mx-[13px] -mb-3 mt-1 [&>*]:flex-1">
            {acciones}
          </div>
        )}
      </div>
    </SunmiPanel>
  );
}
