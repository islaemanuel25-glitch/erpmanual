"use client";

import { useRef, useState } from "react";
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
} from "@/components/sunmi/SunmiProductoCard";
import { nombreCortoDe, nombreDelDorso } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

const UMBRAL_GESTO = 45;
const SIN_PRECIO_FIJO = "Importe variable";
const PUNTO_DEL_INDICADOR =
  "color-mix(in srgb, var(--pos-accent) 88%, var(--app-fg))";
const OCULTO = (valor) => valor === false;

function PrecioDeLaCara({
  importe,
  presentacion,
  esCombo = false,
  atenuado = false,
}) {
  return (
    <span className="flex flex-col items-end leading-none">
      {presentacion && (
        <span
          data-cara-presentacion
          className="mb-1 text-[11.5px] font-medium sunmi-text-muted whitespace-nowrap"
        >
          {presentacion}
          {esCombo && " · COMBO"}
        </span>
      )}
      <span
        data-cara-importe
        className={`text-[30px] font-bold whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em] ${
          atenuado ? "sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {importe === null || importe === undefined
          ? SIN_PRECIO_FIJO
          : formatearMoneda(importe)}
      </span>
    </span>
  );
}

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

function IndicadorDeCara({ mirandoDorso }) {
  return (
    <span
      data-tarjeta-indicador
      className="flex items-center gap-1.5"
      aria-hidden="true"
    >
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
  );
}

export function MarcaDeLaCara({
  cara,
  regla = null,
  muestraCosto = true,
}) {
  const costo = muestraCosto ? cara?.costo ?? null : null;
  if (costo === null && !regla) return null;

  return (
    <span className="min-w-0 flex flex-col items-start leading-tight">
      {costo !== null && (
        <span
          data-cara-costo
          className="text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap sunmi-text-muted"
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
        <span
          data-cara-identificacion
          className="text-sm font-semibold sunmi-text-muted"
        >
          IDENTIFICACIÓN
        </span>
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
        <span className="mt-1.5 flex w-full items-center justify-between gap-2">
          <IndicadorDeCara mirandoDorso={mirandoDorso} />
          <button
            type="button"
            data-tarjeta-voltear
            onClick={onVoltear ?? undefined}
            aria-pressed={mirandoDorso}
            className="inline-flex items-center gap-1 text-xs font-medium sunmi-text-strong"
          >
            {mirandoDorso && (
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            Ver{" "}
            {mirandoDorso
              ? nombreCortoDe(frente.presentacion)
              : nombreDelDorso(hayReferencia ? dorso : null)}
            {!mirandoDorso && (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
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
  const hayIdentificacion =
    !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
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

  const claseCard =
    hayIdentificacion && !mirandoDorso
      ? "[&_[data-pie-codigos]]:invisible"
      : "";

  return (
    <SunmiProductoCard
      nombre={nombre}
      empresa={empresa}
      codigoBarra={hayIdentificacion ? codigoBarra : false}
      codigoInterno={hayIdentificacion ? codigoInterno : false}
      className={claseCard}
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

export {
  UMBRAL_GESTO,
  SIN_PRECIO_FIJO,
  PUNTO_DEL_INDICADOR,
};
