"use client";

// EL RESUMEN DE ARRIBA. CADA CARD ES UN FILTRO, NO UN ADORNO.
//
// ── POR QUÉ LOS NÚMEROS Y EL FILTRO SON LO MISMO ──────────────────────────
//
// La card dice "7 faltantes" y al tocarla tienen que aparecer exactamente esos
// 7. Con dos cálculos separados, el día que uno cambie el otro queda atrás y no
// hay forma de saber cuál miente. Por eso el número sale de `resumenDeRecepcion`
// y el listado de `productosVisibles`, y las dos derivan del MISMO
// `estadoDeProducto`. Hay un candado que compara métrica contra filtro, una por
// una.
//
// ── SE DICE "PRODUCTOS", NO "LÍNEAS" ──────────────────────────────────────
//
// El operador está contando mercadería, no leyendo un documento. "149 de 150
// productos revisados" es lo que tiene sentido con las cajas en la mano.
// "Línea" sigue existiendo adentro del código y de la base, donde corresponde.
//
// ── EL NO DECLARADO VA APARTE, Y SE VE QUE VA APARTE ──────────────────────
//
// No entra en el denominador: si entrara, agregar un producto haría que
// "149 / 150" pasara a "149 / 151" y aparecería un pendiente que no existe. Se
// dibuja separado por una línea para que no se lea como una quinta parte de la
// suma.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import { FILTRO } from "@/lib/transferencias/controlFisico";

/**
 * Una métrica que además filtra.
 *
 * El estado seleccionado se expone con `aria-pressed` y no solo con el color: un
 * filtro que únicamente cambia de tono no se puede usar sin ver bien, y acá se
 * trabaja en un depósito con la luz que haya.
 */
function Metrica({ rotulo, valor, detalle, tono, activo, onClick }) {
  return (
    <SunmiActionCard
      onClick={onClick}
      aria-pressed={activo}
      className={activo ? "sunmi-state-success" : ""}
    >
      <span className="text-sm2 sunmi-text-muted leading-tight">{rotulo}</span>
      <span className={`text-base font-bold font-mono tabular-nums leading-tight ${tono}`}>
        {valor}
      </span>
      {detalle && <span className="text-sm2 sunmi-text-muted leading-tight">{detalle}</span>}
    </SunmiActionCard>
  );
}

export default function ResumenControlFisico({ resumen, filtro, onFiltrar }) {
  if (!resumen) return null;

  const {
    totalRemito, revisados, pendientes, correctos, faltantes, sobrantes, diferencias, noDeclarados,
  } = resumen;

  // Tocar la card que ya está activa la apaga: es la forma de volver a "todos"
  // sin tener que buscar otro control.
  const alternar = (f) => () => onFiltrar?.(filtro === f ? FILTRO.TODOS : f);

  const plural = (n, singular, p) => `${n} ${n === 1 ? singular : p}`;

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <Metrica
          rotulo="Productos revisados"
          valor={`${revisados} / ${totalRemito}`}
          detalle={pendientes > 0 ? plural(pendientes, "pendiente", "pendientes") : "Sin pendientes"}
          tono={pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"}
          activo={filtro === FILTRO.PENDIENTES}
          onClick={alternar(FILTRO.PENDIENTES)}
        />
        <Metrica
          rotulo="Correctos"
          valor={correctos}
          detalle="Coinciden con el remito"
          tono="sunmi-text-success"
          activo={filtro === FILTRO.CORRECTOS}
          onClick={alternar(FILTRO.CORRECTOS)}
        />
        <Metrica
          rotulo="Faltantes"
          valor={faltantes}
          detalle="Llegó menos"
          tono={faltantes > 0 ? "sunmi-text-danger" : "sunmi-text-muted"}
          activo={filtro === FILTRO.FALTANTES}
          onClick={alternar(FILTRO.FALTANTES)}
        />
        <Metrica
          rotulo="Sobrantes"
          valor={sobrantes}
          detalle="Llegó de más"
          tono={sobrantes > 0 ? "sunmi-text-warning" : "sunmi-text-muted"}
          activo={filtro === FILTRO.SOBRANTES}
          onClick={alternar(FILTRO.SOBRANTES)}
        />
        {/* Separado del resto: no pertenece al remito y no suma a las
            diferencias. La línea de arriba en pantallas anchas y el borde
            marcado en angostas dicen que es otra cosa. */}
        <Metrica
          rotulo="No declarados"
          valor={noDeclarados}
          detalle="No estaban en el remito"
          tono={noDeclarados > 0 ? "sunmi-text-link" : "sunmi-text-muted"}
          activo={filtro === FILTRO.NO_DECLARADOS}
          onClick={alternar(FILTRO.NO_DECLARADOS)}
        />
      </div>

      {/* La cuenta escrita, para que se pueda verificar sin confiar. Es la misma
          suma que el candado afirma: correctos + faltantes + sobrantes =
          revisados, y el no declarado aparte. */}
      <SunmiCard className="p-2">
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {correctos} correctos + {faltantes} {faltantes === 1 ? "faltante" : "faltantes"} +{" "}
          {sobrantes} {sobrantes === 1 ? "sobrante" : "sobrantes"} = {revisados} revisados de{" "}
          {totalRemito}. {diferencias === 1 ? "1 diferencia" : `${diferencias} diferencias`}.
          {noDeclarados > 0 && (
            <>
              {" "}
              {plural(noDeclarados, "producto no declarado", "productos no declarados")}, aparte del
              remito.
            </>
          )}
        </p>
      </SunmiCard>
    </section>
  );
}
