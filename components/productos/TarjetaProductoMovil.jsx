"use client";

import { useRef, useState } from "react";
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react";

import SunmiProductoCard, { AccionTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { hayEquivalenciaDeBulto, nombreCortoDe } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

const UMBRAL_GESTO = 45;
const SIN_PRECIO_FIJO = "Importe variable";
const ACENTO_CARD = "color-mix(in srgb, var(--pos-accent) 88%, var(--app-fg))";
const OCULTO = (valor) => valor === false;

// LAS TRES CARAS SON LA MISMA CAJA, Y POR ESO SE ESCRIBE UNA SOLA VEZ.
//
// Voltear una tarjeta no puede mover la grilla: la lista usa `auto-rows-fr`, así
// que un pixel de diferencia entre el frente y el dorso estira TODAS las filas,
// no solo la que se dio vuelta.
//
// Antes eran tres spans con las mismas clases escritas tres veces y dos alturas
// distintas: el precio daba 51,5 px por su contenido y los otros dos llevaban un
// `min-h-[54px]` puesto a mano. Esos 2,5 px son los que la sonda midió moviendo
// la lista entera.
//
// El alto es el que YA TENÍA EL FRENTE, para que la cara que se ve por defecto
// no se mueva ni un pixel: 7 + 9 + 3,5 + 25 + 7. Acá 1 rem son 14 px, así que
// `py-2` da 7 y `mb-1` da 3,5.
const ALTO_CARA = "min-h-[51.5px]";

function CajaDeLaCara({ className = "", children, ...resto }) {
  return (
    <span
      data-cara-precio
      className={`flex w-[202px] max-w-full rounded-xl px-2.5 py-2 [background:var(--hover-bg)] ${ALTO_CARA} ${className}`}
      {...resto}
    >
      {children}
    </span>
  );
}

function PrecioDeLaCara({ importe, presentacion, esCombo = false, atenuado = false }) {
  return (
    <CajaDeLaCara className="flex-col items-end leading-none">
      {presentacion && (
        <span
          data-cara-presentacion
          className="mb-1 text-[9px] font-bold whitespace-nowrap"
          style={{ color: ACENTO_CARD }}
        >
          {presentacion}
          {esCombo && " · COMBO"}
        </span>
      )}
      <span
        data-cara-importe
        className={`text-[25px] font-semibold whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em] ${
          atenuado ? "sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {importe === null || importe === undefined ? SIN_PRECIO_FIJO : formatearMoneda(importe)}
      </span>
    </CajaDeLaCara>
  );
}

// ── ACÁ VIVÍAN LAS OTRAS DOS CARAS, Y LAS DOS SE FUERON ───────────────────
//
// "IDENTIFICACIÓN" era la cara de atrás de un producto sin equivalencia: un
// bloque con esa palabra y nada más, porque los códigos estaban abajo, en el
// pie. Dejó de tener sentido cuando los códigos pasaron al frente.
//
// `ReferenciaDeLaCara` era la de kilo y pieza fija: una línea de texto —"1 pieza
// = 6 kg · $1.000,00 por kilo"— que la franja de equivalencia había dejado sin
// casa y que se había mudado al dorso.
//
// Las dos se van con el dorso. La tarjeta pasa a ser UNA sola, fija, y lo único
// que puede cambiar es el bloque sombreado del precio, alternando entre las dos
// escalas de una conversión unidad ↔ pack. Kilo y pieza no tienen esa
// conversión, así que no alternan y su línea de referencia ya no se dibuja.

/** Los dos puntos: cuál de las dos escalas se está mostrando. */
function IndicadorDeEscala({ enLaOtraEscala }) {
  return (
    <span data-tarjeta-indicador className="flex items-center gap-1.5" aria-hidden="true">
      {[false, true].map((esLaOtra) => (
        <span
          key={String(esLaOtra)}
          className="block w-1.5 h-1.5 rounded-full transition-opacity"
          style={{ background: ACENTO_CARD, opacity: enLaOtraEscala === esLaOtra ? 1 : 0.3 }}
        />
      ))}
    </span>
  );
}

// LA MINIATURA DEL PRODUCTO.
//
// ── DÓNDE ENTRA SIN MOVER NADA ────────────────────────────────────────────
//
// En el hueco que ya existe a la izquierda del precio. Esa fila mide lo que mide
// el bloque del precio —51,5 px— así que un cuadrado de 44 entra adentro sin
// empujar: la fila no crece, el precio no se corre, y el pie de códigos, el
// proveedor y Editar quedan donde estaban.
//
// `contain` y no `cover`: las fotos de producto vienen con proporciones
// cualquiera, y recortar una etiqueta para llenar un cuadrado esconde justo lo
// que se está mirando.
const LADO_MINIATURA = "w-[44px] h-[44px]";

function MiniaturaDelProducto({ url }) {
  // ── UNA FOTO ROTA NO DEJA UN HUECO ──────────────────────────────────────
  //
  // Las urls vienen de una columna que nadie valida, así que algunas no cargan.
  // Sin esto, el navegador dibuja el ícono de imagen rota adentro de la tarjeta
  // — un cuadrado gris que parece un defecto de la pantalla y no un dato que
  // falta. Se esconde entera, que es lo mismo que hace la tarjeta cuando no hay
  // foto: no reservar lugar.
  const [fallo, setFallo] = useState(false);

  // ── Y `onError` SOLO NO ALCANZA, QUE ES LO QUE LA SONDA ENCONTRÓ ────────
  //
  // El manejador se engancha cuando React hidrata. Si el pedido de la imagen ya
  // falló para entonces —y falla antes, porque el navegador la pide apenas
  // parsea la etiqueta— ese evento ya pasó y no vuelve: la foto rota se queda
  // dibujada para siempre. Con la sonda esperando diez segundos seguía en rojo,
  // así que no era una carrera del arnés.
  //
  // `complete` con `naturalWidth` en cero es cómo se pregunta por un error que
  // ya ocurrió, y hay que preguntarlo apenas el nodo existe.
  //
  // ── POR QUÉ EN EL CALLBACK DEL REF Y NO EN UN `useEffect` ──────────────
  //
  // Por dos razones que apuntan al mismo lado. G13 prohíbe `useEffect` en este
  // archivo, para que dar vuelta la tarjeta no se vuelva un efecto; y el lint
  // marca como error llamar a `setState` sincrónicamente adentro de uno. El
  // callback del ref corre exactamente cuando el nodo se monta, que es cuando
  // hay que mirar, y no es ninguna de las dos cosas.
  //
  // No cicla: en cuanto `fallo` queda en true la imagen no se dibuja más, así
  // que el callback no vuelve a recibir un nodo.
  const alMontarLaImagen = (img) => {
    if (img && img.complete && img.naturalWidth === 0) setFallo(true);
  };

  if (fallo) return null;

  return (
    <img
      ref={alMontarLaImagen}
      data-tarjeta-foto
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFallo(true)}
      className={`${LADO_MINIATURA} shrink-0 rounded-lg object-contain`}
    />
  );
}

export function MarcaDeLaCara({ cara, regla = null, muestraCosto = true, imagenUrl = null }) {
  const costo = muestraCosto ? cara?.costo ?? null : null;
  const hayTexto = costo !== null || !!regla;
  if (!hayTexto && !imagenUrl) return null;

  // ── EL COSTO ENVUELVE, Y ESO LO DESTAPÓ LA FOTO ─────────────────────────
  //
  // Tenía `whitespace-nowrap`, que estaba bien mientras el renglón era el costo
  // y el precio: entraba en una línea siempre.
  //
  // Con la miniatura al lado ya no entra. La foto se lleva 44 px y el bloque del
  // precio son 202 fijos, así que al costo le quedan poco más de 90 — y un texto
  // que no envuelve no se achica: se DESBORDA. La sonda lo midió montándose 23,4
  // px sobre el precio, y como la tarjeta recorta lo que sobra, "$20.000,00" se
  // leía "$20.000,0". Un número de dinero cortado no se lee como un error: se
  // lee como otro número.
  //
  // Envolviendo entra en dos renglones de 10 px, que caben de sobra en los 51,5
  // que el bloque del precio ya ocupa: la tarjeta no crece. Y donde no hay foto
  // sigue entrando en una línea, así que esas tarjetas no se mueven.
  //
  // El comentario va ACÁ y no adentro del `&&`: puesto ahí, el operando derecho
  // pasa a tener dos hijos sin fragmento y el build muere con "Expected '</',
  // got 'data'". Es la tercera vez que este repo se come ese error.
  const texto = hayTexto ? (
    <span className="min-w-0 flex flex-col items-start gap-1 leading-tight">
      {costo !== null && (
        <span
          data-cara-costo
          className="text-[10px] [font-variant-numeric:tabular-nums] sunmi-text-muted"
        >
          Costo {nombreCortoDe(cara.presentacion)} · {formatearMoneda(costo)}
        </span>
      )}
      {regla}
    </span>
  ) : null;

  // SIN FOTO SE DEVUELVE EXACTAMENTE LO DE ANTES, sin envoltorio de más.
  // No es una optimización: un span extra alrededor del texto puede correrlo, y
  // la mayoría del catálogo no tiene imagen. Que esas tarjetas queden idénticas
  // no depende de que el envoltorio "no debería" mover nada.
  if (!imagenUrl) return texto;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <MiniaturaDelProducto url={imagenUrl} />
      {texto}
    </span>
  );
}

/**
 * ── LA TARJETA ES UNA SOLA, Y LO ÚNICO QUE ALTERNA ES EL PRECIO ───────────
 *
 * Antes esto dibujaba DOS CARAS: el frente y un dorso al que se llegaba dando
 * vuelta la tarjeta entera. Al dorso viajaban también el costo y la marca, así
 * que un gesto cambiaba media tarjeta.
 *
 * Ahora cambia UN bloque: el sombreado del precio, que alterna entre las dos
 * escalas de una conversión unidad ↔ pack. El nombre, el proveedor, la foto, el
 * costo, los códigos y Editar se quedan donde están y con lo que tienen. Por eso
 * el costo ya no viaja: lo elige el envoltorio una sola vez, con la escala de
 * venta, y no depende de qué se esté mirando.
 *
 * Qué cuenta como alternancia lo contesta `hayEquivalenciaDeBulto`, que vive en
 * `carasDeTarjeta` —la pieza que arma las caras— y no acá: la sonda necesita el
 * mismo predicado y no puede importar un componente de React.
 */
export function CuerpoDeLaCara({
  caras,
  enLaOtraEscala = false,
  manejadoresDeGesto = {},
  onAlternar = null,
}) {
  const { frente, dorso } = caras;
  const alterna = hayEquivalenciaDeBulto(caras);
  const mostrado = alterna && enLaOtraEscala ? dorso : frente;

  return (
    <span
      // El valor dice QUÉ ESCALA se está mostrando, no qué cara: ya no hay
      // caras. "venta" es la escala configurada, la que cobra el POS.
      data-tarjeta-cara={enLaOtraEscala && alterna ? "equivalente" : "venta"}
      className="flex min-w-0 flex-col items-end"
      style={{ touchAction: "pan-y" }}
      {...manejadoresDeGesto}
    >
      <PrecioDeLaCara
        importe={mostrado?.importe ?? null}
        presentacion={mostrado?.presentacion}
        // El combo se dice una sola vez y es del producto, no de la escala: no
        // se apaga al alternar.
        esCombo={frente.esCombo}
        // Y NO SE ATENÚA. Atenuar era del dorso: decía "esto es de consulta, no
        // es lo que se cobra". Las dos escalas de una conversión son igual de
        // reales —el POS cobra las dos, según cómo se venda— así que atenuar una
        // afirmaría algo falso.
        atenuado={false}
      />

      {alterna && (
        <span className="mt-1 flex w-[202px] max-w-full items-center justify-between gap-2">
          <IndicadorDeEscala enLaOtraEscala={enLaOtraEscala} />
          {/* EL ÁREA TÁCTIL LLEGA A 44 PX SIN QUE LA TARJETA CREZCA.
              Escribir el alto mínimo en el propio botón —como estaba antes de
              esta card— sube este renglón de 14 a 44 y estira las 25 tarjetas
              de la lista, que es justamente lo que la card restaurada vino a
              deshacer. La capa invisible del pseudo-elemento recibe el toque y
              no ocupa lugar: no participa del flujo, así que no mueve un pixel.
              Crece 22 hacia arriba, contra el bloque del precio que no es
              tocable, y solo 8 hacia abajo, para no comerle el borde a Editar.
              14 + 22 + 8 = 44, el mínimo de WCAG 2.5.5. */}
          <button
            type="button"
            data-tarjeta-voltear
            onClick={onAlternar ?? undefined}
            aria-pressed={enLaOtraEscala}
            className="relative inline-flex items-center gap-1 text-xs font-medium sunmi-text-strong after:absolute after:inset-x-0 after:-top-[22px] after:-bottom-[8px] after:content-['']"
          >
            {enLaOtraEscala && <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            Ver{" "}
            {/* Nombra la escala A LA QUE LLEVA, y las dos salen del mismo rótulo
                que dibuja el bloque del precio: si alguien reescribe uno de los
                dos, el botón y el número se separan. Acá solo se llega habiendo
                conversión, así que `dorso` existe y tiene presentación. */}
            {enLaOtraEscala
              ? nombreCortoDe(frente.presentacion)
              : nombreCortoDe(dorso.presentacion)}
            {!enLaOtraEscala && <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
          </button>
        </span>
      )}
    </span>
  );
}

export default function TarjetaProductoMovil({
  nombre,
  empresa = null,
  codigoBarra = null,
  codigoInterno = null,
  caras,
  regla = null,
  muestraCosto = true,
  imagenUrl = null,
  onEditar,
}) {
  const [enLaOtraEscala, setEnLaOtraEscala] = useState(false);
  const gesto = useRef(null);

  // ── TRES PREGUNTAS SEPARADAS, Y NINGUNA DEPENDE DE LAS OTRAS ────────────
  //
  // `alterna` decide si el bloque del precio puede cambiar de escala.
  // `hayIdentificacion` decide si el pie del kit lleva datos.
  // Y el resto de la tarjeta —nombre, proveedor, foto, costo, Editar— no
  // depende de ninguna de las dos: se dibuja una vez y se queda.
  //
  // Antes eran una sola pregunta encadenada, y por eso un gesto cambiaba media
  // tarjeta.
  const alterna = hayEquivalenciaDeBulto(caras);
  const hayIdentificacion = !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
  const alternando = alterna && enLaOtraEscala;

  const alSoltar = (e) => {
    const inicio = gesto.current;
    gesto.current = null;
    if (!inicio || !alterna) return;
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
    if (Math.abs(dx) < UMBRAL_GESTO || Math.abs(dx) <= Math.abs(dy)) return;
    setEnLaOtraEscala(dx < 0);
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

  // ── LOS CÓDIGOS SE VEN EN EL FRENTE ───────────────────────────────────────
  //
  // Hasta acá el pie del kit venía puesto pero escondido con una clase mientras
  // se miraba el frente: el lugar quedaba reservado, para que dar vuelta no
  // moviera la grilla, y el dato solo aparecía en el dorso.
  //
  // Ya no. El código de barras y el del proveedor son lo que se mira para
  // reponer y para conciliar una factura, y hacerlos costar un gesto los volvía
  // invisibles en la práctica.
  //
  // Se sacó SOLO la clase que los ocultaba, y eso importa: el pie sigue siendo
  // el del kit, en el mismo lugar y con el mismo alto ya reservado, así que la
  // card no se mueve ni un pixel. Lo único que cambia es que el texto que ya
  // estaba dibujado ahora se lee.
  return (
    <SunmiProductoCard
      nombre={nombre}
      empresa={empresa}
      codigoBarra={hayIdentificacion ? codigoBarra : false}
      codigoInterno={hayIdentificacion ? codigoInterno : false}
      // ── LA MARCA YA NO ALTERNA, Y ES LA MITAD DEL CAMBIO ──────────────
      //
      // Recibía `caraActual`, así que el costo cambiaba de escala junto con el
      // precio y la foto se apagaba al dar vuelta. Ahora recibe SIEMPRE el
      // frente: el costo es el de la escala de venta —la que el POS cobra— y
      // se queda ahí, alterne o no el bloque de al lado.
      //
      // Queda dicho lo que eso implica y no se tapa: mientras el precio muestra
      // la otra escala, al lado sigue el costo de la escala de venta. No es
      // ambiguo —cada uno lleva su rótulo, "Costo unidad" contra "PACK X 24"—
      // pero son dos escalas a la vista al mismo tiempo, y eso es nuevo.
      marca={
        <MarcaDeLaCara
          cara={caras.frente}
          regla={regla}
          muestraCosto={muestraCosto}
          imagenUrl={imagenUrl}
        />
      }
      valor={
        <CuerpoDeLaCara
          caras={caras}
          enLaOtraEscala={alternando}
          manejadoresDeGesto={manejadoresDeGesto}
          onAlternar={() => setEnLaOtraEscala((v) => !v)}
        />
      }
      aviso={null}
      acciones={
        <AccionTarjeta icono={Pencil} onClick={onEditar}>
          Editar
        </AccionTarjeta>
      }
    />
  );
}

export { UMBRAL_GESTO, SIN_PRECIO_FIJO, ACENTO_CARD };
