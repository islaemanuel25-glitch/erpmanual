"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
  BloqueValorTarjeta,
  MiniaturaProductoTarjeta,
  NumeroBloqueValor,
  RotuloBloqueValor,
} from "@/components/sunmi/SunmiProductoCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { TEXTO_ULTIMO_EDITADO } from "@/lib/productos/estadoDeRetorno";
import { hayEquivalenciaDeBulto, nombreCortoDe } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

const SIN_PRECIO_FIJO = "Importe variable";
const ACENTO_CARD = "color-mix(in srgb, var(--pos-accent) 88%, var(--app-fg))";
const OCULTO = (valor) => valor === false;

function PrecioDeLaCara({
  importe,
  presentacion,
  esCombo = false,
  atenuado = false,
  esControl = false,
  alTocar = null,
  etiqueta = null,
  activo = false,
}) {
  return (
    <BloqueValorTarjeta
      className="flex-col items-end leading-none"
      esControl={esControl}
      alTocar={alTocar}
      etiqueta={etiqueta}
      activo={activo}
    >
      {presentacion && (
        <RotuloBloqueValor style={{ color: ACENTO_CARD }}>
          {presentacion}
          {esCombo && " · COMBO"}
        </RotuloBloqueValor>
      )}
      <NumeroBloqueValor atenuado={atenuado}>
        {importe === null || importe === undefined ? SIN_PRECIO_FIJO : formatearMoneda(importe)}
      </NumeroBloqueValor>
    </BloqueValorTarjeta>
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

// ── Y ACÁ VIVÍA EL RENGLÓN DEL CARRUSEL, QUE TAMBIÉN SE FUE ───────────────
//
// Eran cuatro elementos para decir una sola cosa: un botón "Ver pack", dos
// flechas y dos puntos. Todos anunciaban que el número de al lado se podía
// cambiar — y el número está justo ahí, así que ahora se toca el número.
//
// Con ellos se va el swipe. El gesto existía porque el control era chico y estaba
// abajo; con el bloque entero tocable no hay nada que descubrir deslizando, y
// `touch-action: pan-y` deja de hacer falta: no había otro motivo para escribirlo
// que devolverle el scroll vertical al navegador después de capturar el
// horizontal.

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
      <MiniaturaProductoTarjeta url={imagenUrl} />
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
export function CuerpoDeLaCara({ caras, enLaOtraEscala = false, onAlternar = null }) {
  const { frente, dorso } = caras;
  const alterna = hayEquivalenciaDeBulto(caras);
  const mostrado = alterna && enLaOtraEscala ? dorso : frente;

  // LO QUE EL BLOQUE HACE, DICHO CON PALABRAS. Sin el botón de antes, el único
  // texto del control es el rótulo de la escala —"PACK X 24"— y eso no explica
  // que se pueda tocar. Un lector de pantalla necesita la frase; la vista no,
  // porque el número está ahí.
  const laOtra = alterna ? nombreCortoDe((enLaOtraEscala ? frente : dorso).presentacion) : null;

  return (
    <span
      // El valor dice QUÉ ESCALA se está mostrando, no qué cara: ya no hay
      // caras. "venta" es la escala configurada, la que cobra el POS.
      data-tarjeta-cara={enLaOtraEscala && alterna ? "equivalente" : "venta"}
      className="flex min-w-0 flex-col items-end"
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
        esControl={alterna}
        alTocar={onAlternar}
        etiqueta={alterna ? `Ver el precio por ${laOtra}` : null}
        activo={enLaOtraEscala}
      />
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
  // ── LO QUE FALTABA PARA PODER VOLVER AL MISMO LUGAR ─────────────────────
  //
  // Esta tarjeta no recibía NINGUNA identidad. Por eso, al volver de editar, no
  // había forma de encontrarla en el DOM: ni para llevarle el scroll ni para
  // marcarla. Los dos síntomas del defecto salían de esta línea que no existía.
  //
  // `ancla` es la clave estable —`producto:12`, `combo:12`— que arma el dominio.
  // No es el id pelado a propósito: las dos numeraciones se pisan.
  ancla = null,
  ultimoEditado = false,
}) {
  const [enLaOtraEscala, setEnLaOtraEscala] = useState(false);

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

  // ── ACÁ ESTABA EL GESTO, Y SE FUE CON EL CARRUSEL ───────────────────────
  //
  // Eran tres manejadores de puntero, un umbral de 45 px y la comparación de dx
  // contra dy para no robarle el scroll vertical al navegador. Todo eso existía
  // para descubrir un control que estaba abajo y era chico.
  //
  // El bloque del precio es el control ahora, mide 202 × 51,5 y está a la vista:
  // no hay nada que descubrir deslizando. Sacar el gesto se lleva además el
  // riesgo que traía —un swipe que se confunde con un scroll—, que era la razón
  // de la mitad de esas líneas.

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
      ancla={ancla}
      // El rótulo sale de una constante compartida con la tabla de escritorio y
      // con la sonda: si mañana cambia, cambia en los tres a la vez. Escrito acá
      // a mano, la sonda seguiría buscando el viejo y pasaría en verde sobre una
      // pantalla que dice otra cosa.
      destacado={
        ultimoEditado ? <SunmiPill color="amber">{TEXTO_ULTIMO_EDITADO}</SunmiPill> : null
      }
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

export { SIN_PRECIO_FIJO, ACENTO_CARD };
