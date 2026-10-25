"use client";

// components/transferencias/DetalleRecibidoMovil.jsx
//
// EL DETALLE DE UNA TRANSFERENCIA YA RECIBIDA, EN EL TELÉFONO.
//
// Diseño V45 / V45b (Figma `EVJ2KvVCrY0oVSowfboymQ`, nodos 452:483 y 452:587):
// un resumen, cuatro filtros en 2 × 2 y una tarjeta por línea. Antes era la
// lista en el orden del remito con las corregidas mezcladas: no se veía cuáles
// habían cambiado.
//
// Solo lectura y solo debajo de `md`: la página lo monta en `md:hidden` y el
// escritorio sigue con `TablaDetalleTransferencia`. Qué le pasó a cada línea, en
// qué filtro cae y en qué orden va lo decide `lib/transferencias/detalleRecibido.js`;
// acá se dibuja.
//
// ── TODAS LAS TARJETAS MIDEN LO MISMO, Y POR CONSTRUCCIÓN ─────────────────
//
// Cuatro renglones de alto FIJO, cada uno de una sola línea que se corta con
// "…" si no entra. No hay renglón que aparezca o desaparezca según el caso:
// la etiqueta y el "antes" se dejan de dibujar adentro de un renglón que existe
// igual, y el cuarto es el recuadro del motivo o el de "✓ Sin diferencia", los
// dos con el mismo alto y el mismo borde de 1 px. Así, cambiar de filtro no
// mueve nada de lo que está arriba de la lista, y recorrerla no salta.

import { useState } from "react";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { formatearMoneda } from "@/lib/moneda";
import {
  FILTRO_DETALLE,
  SUCESO_LINEA,
  TEXTO_FILTRO_DETALLE,
  armarDetalleRecibido,
  estadoDelResumen,
  filtroInicialDetalle,
  pasaFiltroDetalle,
  rotuloDelResumen,
  textoDelMotivo,
} from "@/lib/transferencias/detalleRecibido";
import { BasePildora, cantidadOGuion, fmtCantidad, presentacionDeLinea } from "./detallePresentacion";

function textoDelSuceso({ suceso, cantidad }) {
  if (suceso === SUCESO_LINEA.AGREGADO) return "Agregado";
  if (suceso === SUCESO_LINEA.NO_VINO) return "No vino";
  if (suceso === SUCESO_LINEA.FALTAN) return `Faltan ${fmtCantidad(cantidad)}`;
  if (suceso === SUCESO_LINEA.SOBRAN) return `Sobran ${fmtCantidad(cantidad)}`;
  return null;
}

// ── EL CHIP DE PRESENTACIÓN DE ESTA PANTALLA ─────────────────────────────
//
// Usaba `BadgePresentacion`, que pinta "Bulto" con fondo y borde de éxito y el
// resto con un fondo suave SIN borde. En el celular eso se leyó como "Bulto y
// Unidad con su recuadro, Fiambre como texto suelto": sin borde, el chip
// depende de que el fondo suave contraste contra la tarjeta, y no alcanza.
//
// Acá todas las presentaciones llevan el MISMO chip con recuadro —1 px del
// borde del tema, igual que el de "Bulto"— y "Fiambre" se dice "Por kg", que
// es como lo lee quien recibe. Es solo el texto de esta pantalla: la
// clasificación sale igual de `presentacionDeLinea` y ninguna otra pantalla
// cambia. `BadgePresentacion` sigue igual para la tabla de escritorio.
const TEXTO_DEL_CHIP = Object.freeze({ Fiambre: "Por kg" });

export function textoDelChipDePresentacion(d) {
  const label = presentacionDeLinea(d);
  return TEXTO_DEL_CHIP[label] ?? label;
}

function ChipPresentacion({ d }) {
  const label = presentacionDeLinea(d);
  return (
    <BasePildora
      tono={label === "Bulto" ? "sunmi-state-success sunmi-text-success" : "sunmi-border sunmi-surface-soft sunmi-text-link"}
    >
      {textoDelChipDePresentacion(d)}
    </BasePildora>
  );
}

// El alto de cada renglón, en un solo lugar: es lo que hace que todas las
// tarjetas midan lo mismo.
const RENGLON = "h-7 flex items-center gap-2 min-w-0";

export function TarjetaLineaRecibida({ d, s }) {
  const etiqueta = textoDelSuceso(s);
  return (
    <div
      data-tarjeta-recibida
      className={`sunmi-bg-card rounded-xl2 p-4 flex flex-col gap-2 border-1.5 ${
        s.conDiferencia ? "sunmi-border-warning" : "sunmi-border-base"
      }`}
    >
      <div className={RENGLON}>
        <span className="flex-1 min-w-0 truncate text-base2 font-semibold sunmi-text-strong">{d.nombre}</span>
        {etiqueta && (
          <span className="shrink-0">
            <BasePildora tono="sunmi-state-warning-soft sunmi-text-warning">{etiqueta}</BasePildora>
          </span>
        )}
      </div>

      <div className={RENGLON}>
        <span className="shrink-0" data-chip-presentacion>
          <ChipPresentacion d={d} />
        </span>
        <span className="flex-1 min-w-0 truncate text-sm2 sunmi-text-muted tabular-nums">
          {d.codigoBarra || "Sin código"}
        </span>
        <span className="shrink-0 whitespace-nowrap text-md2 font-bold sunmi-text-strong tabular-nums">
          {formatearMoneda(s.importe)}
        </span>
      </div>

      <div className={RENGLON}>
        <span className="flex-1 min-w-0 truncate text-base font-medium sunmi-text-strong tabular-nums">
          {s.suceso === SUCESO_LINEA.AGREGADO ? "No venía" : `Enviada ${cantidadOGuion(s.enviada)}`}
          {" → "}
          {`Recibida ${cantidadOGuion(s.recibida)}`}
        </span>
        {s.importeAnterior != null && (
          <span className="shrink-0 whitespace-nowrap text-sm2 sunmi-text-muted line-through tabular-nums">
            antes {formatearMoneda(s.importeAnterior)}
          </span>
        )}
      </div>

      {s.conDiferencia ? (
        <div className="h-8 flex items-center gap-1 min-w-0 rounded-lg px-2.5 sunmi-state-warning text-sm3">
          <span className="shrink-0 font-semibold sunmi-text-muted">Motivo:</span>
          <span className="flex-1 min-w-0 truncate sunmi-text-strong">{textoDelMotivo(d)}</span>
        </div>
      ) : (
        <div className="h-8 flex items-center gap-1 min-w-0 rounded-lg px-2.5 sunmi-state-success text-sm3">
          <span className="truncate font-semibold sunmi-text-success">✓ Sin diferencia</span>
        </div>
      )}
    </div>
  );
}

export default function DetalleRecibidoMovil({ item, importeTotal, fecha }) {
  const { lineas, conteos, enviados, agregados } = armarDetalleRecibido(item?.items);
  const [filtro, setFiltro] = useState(() => filtroInicialDetalle(conteos));

  const visibles = lineas.filter(({ s }) => pasaFiltroDetalle(filtro, s));
  const conDiferencia = conteos[FILTRO_DETALLE.CON_DIFERENCIA];

  return (
    <div className="space-y-3" data-detalle-recibido>
      <ResumenConImporte
        rotulo={rotuloDelResumen({ fecha, enviados, agregados })}
        importe={formatearMoneda(importeTotal)}
        subtitulo={
          <span className={`font-semibold ${conDiferencia > 0 ? "sunmi-text-warning" : "sunmi-text-success"}`}>
            {estadoDelResumen(conDiferencia)}
          </span>
        }
      />

      <SunmiFiltroEstado
        opciones={Object.values(FILTRO_DETALLE).map((clave) => ({
          clave,
          texto: TEXTO_FILTRO_DETALLE[clave],
          cantidad: conteos[clave],
        }))}
        valor={filtro}
        onCambiar={setFiltro}
        ariaLabel="Qué productos ver"
      />

      <div className="space-y-2">
        {visibles.map(({ d, s }) => (
          <TarjetaLineaRecibida key={d.id} d={d} s={s} />
        ))}
        {visibles.length === 0 && (
          <p className="py-6 text-center text-sm2 sunmi-text-muted">Ningún producto en este filtro.</p>
        )}
      </div>
    </div>
  );
}
