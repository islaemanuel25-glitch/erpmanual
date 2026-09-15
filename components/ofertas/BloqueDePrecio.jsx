"use client";

// components/ofertas/BloqueDePrecio.jsx
//
// MARGEN Y PRECIO, SINCRONIZADOS, CON EL REDONDEO QUE MANDA SOBRE LOS DOS.
//
// ── EL CAMPO QUE SE TOCA NO SE REESCRIBE ─────────────────────────────────
//
// Cada campo guarda su propio texto y avisa cuál se está tocando. Reescribir el
// campo activo debajo del dedo es lo que hace que no se pueda tipear "12" sin
// que salte a "1" y vuelva con el cursor movido. La cuenta la hace
// `resolverBloque`; acá solo se dibuja.
//
// ── EL % QUE SE MUESTRA ES EL DE DESPUÉS DEL REDONDEO ────────────────────
//
// Si se tipeó 18 y el redondeo dejó un precio que da 16, el campo dice 16. Es un
// hecho, no una intención: el margen que va a quedar es el segundo.
//
// ── SIN COSTO NO SE DIBUJA EL CAMPO DE MARGEN ────────────────────────────
//
// No hay de qué calcularlo y dividir por cero daría infinito. Se dice por qué en
// vez de mostrar un campo que no puede funcionar.

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import {
  margenInvalido,
  textoDeRedondeo,
} from "@/lib/ofertas/precioConMargen";

/** Rótulo de campo: 11px peso 500, apagado. */
function Rotulo({ children }) {
  return <div className="text-sm2 font-medium sunmi-text-muted">{children}</div>;
}

/**
 * Un campo con su afijo adentro.
 *
 * El `%` y el `$` van DENTRO del campo y no como texto al lado: al lado se leen
 * como parte del rótulo y se pierde de vista cuál de los dos números se está
 * escribiendo. Son `pointer-events-none` para que tocar encima entre al campo.
 */
function CampoConAfijo({ prefijo, sufijo, ...props }) {
  return (
    <div className="relative">
      {prefijo && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg2 sunmi-text-muted pointer-events-none">
          {prefijo}
        </span>
      )}
      <SunmiInput
        {...props}
        inputMode="decimal"
        className={`w-full text-lg2 font-medium tabular-nums ${prefijo ? "!pl-7" : ""} ${
          sufijo ? "!pr-7" : ""
        }`}
      />
      {sufijo && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg2 sunmi-text-muted pointer-events-none">
          {sufijo}
        </span>
      )}
    </div>
  );
}

export default function BloqueDePrecio({
  costo,
  precioNormal,
  margen,
  precio,
  redondear,
  origen,
  bloque,
  onMargen,
  onPrecio,
  onRedondear,
  money,
  escala = "por unidad",
}) {
  const hayCosto = Number(costo) > 0;
  // El origen importa: un margen negativo TIPEADO es un error y frena, uno
  // DERIVADO de un precio bajo el costo es el líder de pérdida, que avisa abajo
  // y se puede publicar. Sin esta distinción el cartel rojo saldría sobre una
  // oferta legítima.
  const errorDeMargen = margenInvalido(margen, origen);
  const lineaRedondeo = textoDeRedondeo(bloque, money);

  // El resultado se pinta según cómo quedó el margen REAL, no según lo tipeado.
  const aPerdida = bloque?.margenReal != null && bloque.margenReal < 0;
  const tonoResultado = aPerdida ? "sunmi-text-danger" : "sunmi-text-success";

  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      {/* a · el costo, arriba de todo y con su escala */}
      <div className="text-sm3 sunmi-text-muted">
        Costo {money ? money(costo) : costo} {escala}
      </div>

      {/* b · los dos campos, mitad y mitad */}
      <div className="flex gap-3">
        {hayCosto && (
          <div className="flex-1 min-w-0 space-y-1">
            <Rotulo>Margen sobre el costo</Rotulo>
            <CampoConAfijo
              sufijo="%"
              value={margen ?? ""}
              onChange={(e) => onMargen?.(e.target.value)}
              aria-label="Margen sobre el costo"
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <Rotulo>Precio de oferta</Rotulo>
          <CampoConAfijo
            prefijo="$"
            value={precio ?? ""}
            onChange={(e) => onPrecio?.(e.target.value)}
            aria-label="Precio de oferta"
          />
        </div>
      </div>

      {/* SIN COSTO se dice por qué falta el campo, en vez de dejar un hueco. */}
      {!hayCosto && (
        <div className="text-xs sunmi-text-muted">
          Este producto no tiene costo cargado, así que no se puede calcular el margen. El
          precio de oferta se escribe directo.
        </div>
      )}

      {/* El margen negativo se frena EN EL CAMPO: es la única que bloquea. */}
      {errorDeMargen && <div className="text-xs sunmi-text-danger">{errorDeMargen}</div>}

      {/* c · el redondeo */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm3 font-medium sunmi-text-strong">Redondear a $ 100</span>
        <SunmiToggle value={redondear} onChange={onRedondear} />
      </div>

      {/* d · qué hizo el redondeo, solo si cambió algo */}
      {lineaRedondeo && <div className="text-xs sunmi-text-warning">{lineaRedondeo}</div>}

      {/* e · separador */}
      {bloque?.precioFinal != null && (
        <div className="border-t sunmi-divider" aria-hidden="true" />
      )}

      {/* f · el resultado */}
      {bloque?.precioFinal != null && (
        <div className={`text-sm3 font-medium ${tonoResultado}`}>
          {bloque.esOferta
            ? `De ${money(precioNormal)} a ${money(bloque.precioFinal)} · ${Math.abs(
                Math.round(((precioNormal - bloque.precioFinal) / precioNormal) * 100)
              )} % menos que el precio normal`
            : `${money(bloque.precioFinal)} no es menos que ${money(
                precioNormal
              )}: todavía no es una oferta.`}
          {/* CUÁNTO FALTA, EN PESOS, y no solo que falta. El bloque viejo lo
              decía en su segunda línea; al rediseñarlo en a–f esa línea
              desapareció y con ella el único número que dice de qué tamaño es la
              pérdida. Va acá, en la misma línea f y con el mismo token, para no
              agregar un renglón que el diseño no tiene. */}
          {aPerdida &&
            ` Estarías vendiendo a pérdida: te falta ${money(
              Number(costo) - bloque.precioFinal
            )} para cubrir el costo.`}
        </div>
      )}
    </section>
  );
}
