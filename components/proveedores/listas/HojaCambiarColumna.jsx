"use client";

// VOLVER A LEER LA LISTA CON OTRA COLUMNA DE PRECIO.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Porque una lista se puede leer con la columna equivocada y eso no se ve: el
// caso que originó esto leyó los precios sin IVA de un archivo de Arcor, un
// producto quedó 17 % abajo, y como el aumento resultante caía adentro del rango
// esperado se aplicó sin advertencia. La columna equivocada no da un disparate,
// da un aumento plausible.
//
// El defecto se arregló donde se elige la columna. Esta hoja es la otra mitad:
// qué hacer con una lista que YA se leyó mal. Antes la única salida era volver a
// subir el archivo — que está en el teléfono de quien lo recibió, dos semanas
// antes.
//
// ── POR QUÉ MUESTRA LOS NÚMEROS Y NO SOLO LOS NOMBRES ─────────────────────
//
// Porque elegir entre «S/IVA» y «C/IVA» por el nombre es exactamente lo que
// produjo el defecto. Lo único que permite decidir es cuántos de tus productos
// explica cada una, y ese número ya está medido: se muestra, ordenado de mejor a
// peor.
//
// ── ESTA HOJA NO ESCRIBE NINGÚN COSTO ──────────────────────────────────────
//
// Vuelve a conciliar la misma importación con el precio de otra columna y deja
// el resultado de siempre, con su botón de aplicar y su confirmación.

import { useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

/** "coincide en 4 de cada 9" — el respaldo de una columna, si está medido. */
function respaldo(o) {
  if (!o || !Number(o.comparables)) return null;
  return `coincide con tus costos en ${o.explicadas} de cada ${o.comparables}`;
}

export default function HojaCambiarColumna({
  lectura,
  trabajando = false,
  error = null,
  onCambiar,
  onVolver,
}) {
  // Las candidatas MEDIDAS, de mejor a peor. El orden en que vinieron es el de
  // los títulos y no dice nada sobre cuál es el precio.
  const opciones = (Array.isArray(lectura?.opciones) ? lectura.opciones : [])
    .filter((o) => !o.conDescuento)
    .slice()
    .sort((a, b) => (Number(b.explicadas) || 0) - (Number(a.explicadas) || 0));

  // Arranca SIN elegir, incluso habiendo una mejor que la actual. Quien abre
  // esta hoja viene de un aviso que dice que la columna puede estar mal:
  // preseleccionar otra sería volver a decidir por él, que es de donde salió
  // todo esto.
  const [columna, setColumna] = useState(null);
  const elegida = columna !== null;

  return (
    <SunmiModalLayout
      open
      title="Leer con otra columna"
      subtitle="Los precios se vuelven a calcular con la columna que elijas. No se cambia ningún costo."
      color="amber"
      onClose={trabajando ? undefined : onVolver}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      maxWidth="max-w-2xl"
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="cyan"
            onClick={() => onCambiar({ columna, conDescuento: lectura?.conDescuento === true })}
            disabled={!elegida || trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando ? "Leyendo…" : "Volver a leer con esta columna"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onVolver}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Volver
          </SunmiButton>
        </div>
      }
    >
      <p className="text-sm3 sunmi-text-strong leading-snug">
        Ahora se está leyendo con la columna «{lectura?.titulo}». Elegí cuál es el precio que te
        factura este proveedor.
      </p>

      <div className="space-y-2">
        {opciones.map((o) => {
          const esLaActual = o.columna === lectura?.columna;
          const seleccionada = columna === o.columna;
          return (
            <SunmiButton
              key={o.columna}
              color={seleccionada ? "cyan" : "slate"}
              onClick={() => setColumna(o.columna)}
              aria-pressed={seleccionada}
              className="w-full text-left min-h-toque rounded-lg px-3 block"
            >
              <span className="text-sm3 font-semibold">
                {o.titulo || `Columna ${o.columna + 1}`}
                {esLaActual ? " · la que se está usando" : ""}
              </span>
              {respaldo(o) && <span className="block text-xs2 opacity-80">{respaldo(o)}</span>}
            </SunmiButton>
          );
        })}
      </div>

      {opciones.length === 0 && (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          De esta lista no quedó guardado qué otras columnas parecían un precio, así que para
          cambiarla hay que volver a subir el archivo.
        </p>
      )}

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );
}
