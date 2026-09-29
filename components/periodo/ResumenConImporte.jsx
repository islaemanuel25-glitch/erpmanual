"use client";

// components/periodo/ResumenConImporte.jsx
//
// EL BLOQUE DE ARRIBA DE UNA CUENTA POR PERÍODO: un rótulo chico, el importe
// grande, de qué período habla, y abajo —si hace falta— un aviso con su acción.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/transferencias/CuentaDelPeriodoCerrado.jsx`, tal cual estaba:
// el mismo marco, las mismas clases y los mismos nodos. Se sacó cuando Pagos a
// proveedores necesitó el mismo bloque para "cuánto vence en el período". Lo
// que se quedó allá es lo que sabe de transferencias —de dónde sale el rótulo,
// el aviso de "sin recibir" y el atajo al corte de semana—; acá queda el dibujo.
//
// ── EL BORDE DE AVISO SIGUE AL AVISO ─────────────────────────────────────
//
// Se enciende cuando hay un aviso, y por nada más: el marco y la frase no pueden
// discrepar. Es la regla que tenía la pieza original.
//
// ── POR QUÉ ACÁ Y NO EN EL KIT ────────────────────────────────────────────
//
// Por lo mismo que `DiaConBanda`, su vecino: es un bloque de cuentas por
// período, y está hecho solo de tokens del tema.

/**
 * @param {object} props
 * @param {React.ReactNode} props.rotulo     "Para cobrar", "Vence en el período".
 * @param {React.ReactNode} props.importe    YA FORMATEADO: la plata la escribe la pantalla.
 * @param {React.ReactNode} props.subtitulo  de qué período habla.
 * @param {React.ReactNode} [props.nota]     una frase suelta debajo, p. ej. el período vacío.
 * @param {React.ReactNode} [props.detalle]  un bloque entre la cifra y el aviso, con su
 *                                           divisoria arriba: las columnas de Stock Diario.
 *                                           Sin él no se dibuja nada, ni la divisoria.
 * @param {React.ReactNode} [props.aviso]    la frase en tono de aviso; enciende el borde.
 * @param {React.ReactNode} [props.accion]   a la derecha del aviso.
 */
export default function ResumenConImporte({ rotulo, importe, subtitulo, nota = null, detalle = null, aviso = null, accion = null }) {
  return (
    <section
      className={`sunmi-bg-card rounded-xl2 p-4 space-y-3 ${
        aviso ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
      }`}
    >
      <div>
        <div className="text-xs sunmi-text-muted">{rotulo}</div>
        <div className="text-xl2 font-semibold sunmi-text-strong tabular-nums">{importe}</div>
        <div className="text-sm2 sunmi-text-muted">{subtitulo}</div>
      </div>

      {nota && <div className="text-sm2 sunmi-text-muted">{nota}</div>}

      {detalle && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          {detalle}
        </>
      )}

      {(aviso || accion) && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm2 font-medium sunmi-text-warning">{aviso}</div>
            {accion && <div className="shrink-0">{accion}</div>}
          </div>
        </>
      )}
    </section>
  );
}
