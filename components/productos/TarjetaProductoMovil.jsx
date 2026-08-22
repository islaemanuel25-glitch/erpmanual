"use client";

import { useRef, useState } from "react";
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react";

import SunmiProductoCard, { AccionTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { nombreCortoDe, nombreDelDorso } from "@/lib/productos/carasDeTarjeta";
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

function ReferenciaDeLaCara({ detalle }) {
  return (
    <CajaDeLaCara className="items-center justify-end">
      <span
        data-cara-referencia
        className="block text-sm sunmi-text-strong text-right leading-snug [font-variant-numeric:tabular-nums]"
      >
        {detalle}
      </span>
    </CajaDeLaCara>
  );
}

// ── ACÁ VIVÍA "IDENTIFICACIÓN", Y SE FUE CON EL DORSO QUE LA CONTENÍA ─────
//
// Era la cara de atrás de un producto sin equivalencia: un bloque que decía
// IDENTIFICACIÓN y nada más, porque los códigos estaban abajo, en el pie.
//
// Dejó de tener sentido cuando los códigos pasaron al frente. Un producto sin
// referencia ya no tiene NADA para mostrar atrás, así que no tiene dorso: sin
// indicador, sin "Ver códigos" y sin botón. Prometer una cara vacía cuesta un
// gesto y no devuelve ningún dato.

function IndicadorDeCara({ mirandoDorso }) {
  return (
    <span data-tarjeta-indicador className="flex items-center gap-1.5" aria-hidden="true">
      {[false, true].map((esDorso) => (
        <span
          key={String(esDorso)}
          className="block w-1.5 h-1.5 rounded-full transition-opacity"
          style={{ background: ACENTO_CARD, opacity: mirandoDorso === esDorso ? 1 : 0.3 }}
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

  const texto = hayTexto ? (
    <span className="min-w-0 flex flex-col items-start gap-1 leading-tight">
      {costo !== null && (
        <span
          data-cara-costo
          className="text-[10px] [font-variant-numeric:tabular-nums] whitespace-nowrap sunmi-text-muted"
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

export function CuerpoDeLaCara({
  caras,
  mirandoDorso = false,
  hayReferencia,
  manejadoresDeGesto = {},
  onVoltear = null,
}) {
  const { frente, dorso } = caras;
  // ── EL DORSO LO CREA LA REFERENCIA, Y SOLO ELLA ─────────────────────────
  //
  // Antes también lo creaba tener códigos —`hayReferencia || hayIdentificacion`—
  // porque la identificación era el contenido de atrás. Los códigos se ven en el
  // frente desde la tanda anterior, así que esa mitad quedó prometiendo una cara
  // sin nada adentro.
  //
  // Ahora la pregunta es una sola: ¿hay una equivalencia real que mostrar? Si no
  // la hay, la tarjeta tiene UNA cara y no hay gesto que descubrir.
  const hayDorso = hayReferencia;
  const cara = mirandoDorso ? dorso : frente;

  return (
    <span
      data-tarjeta-cara={mirandoDorso ? "dorso" : "frente"}
      className="flex min-w-0 flex-col items-end"
      style={{ touchAction: "pan-y" }}
      {...manejadoresDeGesto}
    >
      {cara?.importe === null && cara?.detalle ? (
        <ReferenciaDeLaCara detalle={cara.detalle} />
      ) : (
        <PrecioDeLaCara
          importe={cara?.importe ?? null}
          presentacion={cara?.presentacion}
          esCombo={!mirandoDorso && frente.esCombo}
          atenuado={mirandoDorso}
        />
      )}

      {hayDorso && (
        <span className="mt-1 flex w-[202px] max-w-full items-center justify-between gap-2">
          <IndicadorDeCara mirandoDorso={mirandoDorso} />
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
            onClick={onVoltear ?? undefined}
            aria-pressed={mirandoDorso}
            className="relative inline-flex items-center gap-1 text-xs font-medium sunmi-text-strong after:absolute after:inset-x-0 after:-top-[22px] after:-bottom-[8px] after:content-['']"
          >
            {mirandoDorso && <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            Ver{" "}
            {/* Sin el ternario: acá solo se llega habiendo referencia, así que
                `dorso` existe siempre y "Ver códigos" —lo que devolvía este
                nombre con `null`— ya no es un destino posible. */}
            {mirandoDorso ? nombreCortoDe(frente.presentacion) : nombreDelDorso(dorso)}
            {!mirandoDorso && <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
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
  const [enDorso, setEnDorso] = useState(false);
  const gesto = useRef(null);

  // ── DOS PREGUNTAS QUE ANTES ERAN UNA ────────────────────────────────────
  //
  // `hayDorso` era `hayReferencia || hayIdentificacion`: tener códigos alcanzaba
  // para crear una cara de atrás, porque la identificación vivía ahí. Desde que
  // los códigos se ven en el frente, esa mitad prometía una cara vacía.
  //
  // Ahora son dos cosas separadas y cada una decide lo suyo: la referencia
  // decide si hay dorso, y la identificación decide si el pie del kit lleva
  // datos. Un producto puede tener códigos y una sola cara, que es el caso
  // normal del catálogo.
  const hayReferencia = !!caras.dorso;
  const hayIdentificacion = !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
  const hayDorso = hayReferencia;
  const mirandoDorso = hayDorso && enDorso;
  const caraActual = mirandoDorso ? caras.dorso : caras.frente;

  const alSoltar = (e) => {
    const inicio = gesto.current;
    gesto.current = null;
    if (!inicio || !hayDorso) return;
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
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
      marca={
        <MarcaDeLaCara
          cara={caraActual}
          regla={regla}
          // Sin la salvedad de antes: al dorso solo se llega habiendo
          // referencia, así que `!mirandoDorso || hayReferencia` era siempre
          // verdadero y solo tapaba la lectura.
          muestraCosto={muestraCosto}
          // LA FOTO ES DEL FRENTE Y NADA MÁS. El dorso es la equivalencia, y
          // repetir la miniatura ahí solo diría de nuevo qué producto es.
          imagenUrl={mirandoDorso ? null : imagenUrl}
        />
      }
      valor={
        <CuerpoDeLaCara
          caras={caras}
          mirandoDorso={mirandoDorso}
          hayReferencia={hayReferencia}
          manejadoresDeGesto={manejadoresDeGesto}
          onVoltear={() => setEnDorso((v) => !v)}
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
