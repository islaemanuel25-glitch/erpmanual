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

function IdentificacionDeLaCara() {
  return (
    <CajaDeLaCara
      data-cara-identificacion
      className="items-center justify-end text-[11.5px] font-medium sunmi-text-muted"
    >
      IDENTIFICACIÓN
    </CajaDeLaCara>
  );
}

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

export function MarcaDeLaCara({ cara, regla = null, muestraCosto = true }) {
  const costo = muestraCosto ? cara?.costo ?? null : null;
  if (costo === null && !regla) return null;

  return (
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
  );
}

export function CuerpoDeLaCara({
  caras,
  mirandoDorso = false,
  hayReferencia,
  hayIdentificacion,
  manejadoresDeGesto = {},
  onVoltear = null,
}) {
  const { frente, dorso } = caras;
  const hayDorso = hayReferencia || hayIdentificacion;
  const cara = mirandoDorso ? dorso : frente;
  const dorsoSoloIdentificacion = mirandoDorso && !hayReferencia;

  return (
    <span
      data-tarjeta-cara={mirandoDorso ? "dorso" : "frente"}
      className="flex min-w-0 flex-col items-end"
      style={{ touchAction: "pan-y" }}
      {...manejadoresDeGesto}
    >
      {dorsoSoloIdentificacion ? (
        <IdentificacionDeLaCara />
      ) : cara?.importe === null && cara?.detalle ? (
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

  const hayReferencia = !!caras.dorso;
  const hayIdentificacion = !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
  const hayDorso = hayReferencia || hayIdentificacion;
  const mirandoDorso = hayDorso && enDorso;
  const caraActual = mirandoDorso && hayReferencia ? caras.dorso : caras.frente;

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
          muestraCosto={muestraCosto && (!mirandoDorso || hayReferencia)}
        />
      }
      valor={
        <CuerpoDeLaCara
          caras={caras}
          mirandoDorso={mirandoDorso}
          hayReferencia={hayReferencia}
          hayIdentificacion={hayIdentificacion}
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
