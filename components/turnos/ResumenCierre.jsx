"use client";

// Las tres tarjetas de arriba del detalle de turno: qué pasó, cómo se calculó y
// qué plata NO está en el cajón.
//
// Por qué existen: la pantalla mostraba el esperado, el contado y la diferencia
// repartidos en cuatro tarjetas distintas (encabezado, X Report, Z Report y la de
// arqueos), con las 99 ventas renderizadas en el medio. El dato importante
// quedaba abajo de todo y había que compararlo consigo mismo. Ahora se dice una
// sola vez, arriba, y en palabras.
//
// Móvil: una columna, tres cifras grandes como máximo por tarjeta, sin scroll
// horizontal. Escritorio: la misma jerarquía, con las cifras en fila.

import SunmiCard from "@/components/sunmi/SunmiCard";
import { resultadoCierre, pistaFondoOmitido, CAJA_CORRECTA, CAJA_SOBRANTE } from "@/lib/caja/vistaTurno";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Cifra({ etiqueta, valor, clase = "", grande = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] sunmi-text-muted leading-tight">{etiqueta}</div>
      <div className={`font-bold tabular-nums ${grande ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"} ${clase}`}>
        ${fmt(valor)}
      </div>
    </div>
  );
}

/** 2 · Resultado del cierre. Primera tarjeta después del encabezado. */
export function ResultadoCierre({ turno }) {
  const esperado = turno?.montoEsperadoEfectivo;
  const contado = turno?.montoRealEfectivo;
  const r = resultadoCierre({ esperado, contado });

  if (!r.cerrado) {
    return (
      <SunmiCard>
        <h2 className="text-base font-bold mb-1">Resultado del cierre</h2>
        <p className="text-sm sunmi-text-muted">{r.explicacion}</p>
      </SunmiCard>
    );
  }

  const tono =
    r.estado === CAJA_CORRECTA
      ? "sunmi-text-success"
      : r.estado === CAJA_SOBRANTE
        ? "sunmi-text-warning"
        : "sunmi-text-danger";

  const pista = pistaFondoOmitido({ esperado, contado, montoInicial: turno?.montoInicial });

  return (
    <SunmiCard>
      <h2 className="text-base font-bold mb-3">Resultado del cierre</h2>

      <div className={`text-2xl sm:text-3xl font-bold mb-3 ${tono}`}>{r.titulo}</div>

      {/* Tres cifras, ni una más. En móvil se apilan de a dos por fila. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cifra etiqueta="Había que tener" valor={esperado} />
        <Cifra etiqueta="Se contó" valor={contado} />
        <Cifra
          etiqueta={r.estado === CAJA_CORRECTA ? "Diferencia" : r.estado === CAJA_SOBRANTE ? "Sobran" : "Faltan"}
          valor={r.estado === CAJA_CORRECTA ? 0 : r.monto}
          clase={tono}
          grande
        />
      </div>

      <p className="text-[12px] sunmi-text-muted mt-3 leading-snug">{r.explicacion}</p>

      {pista && (
        <p className="text-[12px] mt-2 rounded px-2 py-1.5 sunmi-state-warning sunmi-text-warning leading-snug">
          {pista}
        </p>
      )}
    </SunmiCard>
  );
}

/** Renglón de la cuenta. Fuera del componente: definirlo adentro lo recrearía en
 *  cada render y desmontaría el subárbol. */
function FilaCuenta({ signo, etiqueta, valor, clase = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b sunmi-divider last:border-0">
      <span className="text-sm sunmi-text-muted">
        {signo && <span className="inline-block w-4 font-bold">{signo}</span>}
        {etiqueta}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${clase}`}>${fmt(valor)}</span>
    </div>
  );
}

/** 3 · Cómo se calculó. Solo efectivo: nada de MP, débito, crédito ni fiado. */
export function ComoSeCalculo({ turno, resumen, ingresos = 0, retiros = 0 }) {
  const inicial = Number(turno?.montoInicial) || 0;
  const ventasEfectivo = Number(resumen?.totalEfectivo) || 0;
  const esperado =
    turno?.montoEsperadoEfectivo != null
      ? Number(turno.montoEsperadoEfectivo)
      : inicial + ventasEfectivo + ingresos - retiros;

  return (
    <SunmiCard>
      <h2 className="text-base font-bold mb-2">Cómo se calculó</h2>
      <FilaCuenta etiqueta="Fondo inicial" valor={inicial} />
      <FilaCuenta signo="+" etiqueta="Ventas en efectivo" valor={ventasEfectivo} clase="sunmi-text-success" />
      <FilaCuenta signo="+" etiqueta="Ingresos" valor={ingresos} clase={ingresos > 0 ? "sunmi-text-success" : ""} />
      <FilaCuenta signo="−" etiqueta="Retiros" valor={retiros} clase={retiros > 0 ? "sunmi-text-danger" : ""} />
      <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t sunmi-divider">
        <span className="text-sm font-bold">Efectivo esperado</span>
        <span className="text-lg font-bold tabular-nums sunmi-text-link">${fmt(esperado)}</span>
      </div>
    </SunmiCard>
  );
}

/** 4 · Pagos que no forman parte del efectivo. Secundaria a propósito. */
export function PagosNoEfectivo({ resumen }) {
  const d = resumen?.desglose || {};
  const filas = [
    ["Mercado Pago", Number(d.mercadopago) || 0],
    ["Débito", Number(d.debito) || 0],
    ["Crédito", Number(d.credito) || 0],
    ["Fiado", Number(d.fiado) || 0],
  ];
  const total = filas.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  return (
    <SunmiCard className="sunmi-surface-soft">
      <h2 className="text-sm font-bold mb-1">Pagos que no forman parte del efectivo</h2>
      <p className="text-[12px] sunmi-text-muted mb-2 leading-snug">
        Estos importes están incluidos en las ventas, pero no están físicamente en la caja.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {filas
          .filter(([, v]) => v > 0)
          .map(([etiqueta, valor]) => (
            <div key={etiqueta} className="min-w-0">
              <div className="text-[11px] sunmi-text-muted leading-tight truncate">{etiqueta}</div>
              <div className="text-sm font-semibold tabular-nums">${fmt(valor)}</div>
            </div>
          ))}
      </div>
    </SunmiCard>
  );
}
