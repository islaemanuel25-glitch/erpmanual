"use client";

// components/transferencias/CuentaDeUnLocal.jsx
//
// LA CUENTA DE UN LOCAL. **UNA SOLA PANTALLA, PARA LOS DOS QUE LA MIRAN.**
//
// ── EL DEFECTO QUE CIERRA, Y ES DE LOS QUE SE DESCUBREN TARDE ────────────
//
// Hasta la V40 había DOS pantallas para la misma pregunta:
//
//   · el DEPÓSITO entraba por la lista de locales y veía el período cerrado,
//     los días agrupados y el buscador;
//   · el LOCAL, al mirar su propia cuenta, veía otra cosa —chips arriba, el
//     período EN CURSO, y dos secciones "PARA RECIBIR" / "YA RECIBIDAS"—.
//
// O sea que el defecto que abrió toda esta línea de trabajo —mostrar el período
// abierto en la pantalla que dice cuánto se cobra— **seguía intacto del lado del
// local**, que es justamente el que cobra.
//
// No eran dos pantallas parecidas por diseño: eran dos implementaciones del
// mismo hecho, escritas en momentos distintos, y una se quedó atrás. Es lo que
// la regla 1 del proyecto prohíbe, y el precio se pagó acá.
//
// ── LO ÚNICO QUE LOS SEPARA ES CÓMO SE LLEGA ─────────────────────────────
//
// El depósito pasa por la lista de locales y entra a la de cada uno; el local
// entra directo a la suya, sin esa lista. Eso vive en el RUTEO —la página de
// `[localId]` para uno, `TableroMovil` para el otro— y no en esta pieza, que
// recibe la cuenta ya resuelta y no sabe quién la está mirando.
//
// ── LAS SECCIONES "PARA RECIBIR" / "YA RECIBIDAS" NO ESTÁN ───────────────
//
// Partían el período en dos listas y rompían el orden cronológico, que es el que
// se usa para trabajar. Adentro de cada día conviven, y cada fila dice su estado
// en palabras.

import { useState } from "react";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import ResumenConImporte from "@/components/periodo/ResumenConImporte";

import ChipsDePeriodo, { CLAVE_OTRO } from "./ChipsDePeriodo";
import CuentaDelPeriodoCerrado from "./CuentaDelPeriodoCerrado";
import DiaDeTransferencias from "./DiaDeTransferencias";
import NavegadorDePeriodo from "./NavegadorDePeriodo";
import {
  CRITERIO_CUENTA,
  fechaDeRecepcion,
  NOTA_PENDIENTES,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";
import { diasDeTransferencias } from "@/lib/transferencias/diasDeTransferencias";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { VISTA_PENDIENTES } from "@/lib/transferencias/contextoDelTablero";

export default function CuentaDeUnLocal({
  datos,
  cargando = false,
  error = "",
  unidad,
  onCambiarUnidad,
  onAtras,
  onAdelante,
  puedeConfigurarCorte = false,
  onConfigurarCorte,
  money,
  onAbrirTransferencia,
  // "pendientes" lista SOLO las que salieron hasta el cierre y hoy siguen sin
  // confirmar —lo que abre el "Ver pendientes" de Finanzas—; "cuenta" (default)
  // es la lista de siempre. Las dos salen de la misma cuenta por recepción.
  vista = "cuenta",
}) {
  const [numero, setNumero] = useState("");

  const periodo = datos?.periodo;
  // El bloque de pendientes solo existe en la cuenta por recepción; en la de
  // envío `vista=pendientes` no tiene qué mostrar y cae a la lista de siempre.
  const esPendientes =
    vista === VISTA_PENDIENTES && periodo?.criterio === CRITERIO_CUENTA.RECEPCION;
  const delPeriodo = esPendientes
    ? periodo?.pendientes?.transferencias || []
    : periodo?.transferencias || [];

  // Filtra sobre lo que YA se trajo, sin volver a consultar: el período completo
  // está en memoria y una transferencia de otro período no se encontraría igual.
  // Sin `useMemo` a propósito: es un filtro sobre una lista de decenas, y
  // memorizarlo obligaría a memorizar antes `delPeriodo` —que es un `||` y cambia
  // de identidad en cada render— para que la dependencia signifique algo.
  const buscado = numero.trim().replace(/^#/, "");
  const visibles = buscado
    ? delPeriodo.filter((t) => String(t.id).includes(buscado))
    : delPeriodo;

  return (
    <>
      <ChipsDePeriodo valor={unidad} onCambiar={onCambiarUnidad} />

      {/* ── CON "OTRO" NO HAY NAVEGACIÓN ──────────────────────────────────
          El rango lo eligió una persona a mano, así que no hay un período
          anterior que calcular: ¿el anterior a un rango arbitrario de nueve
          días cuál sería? Las flechas ahí no tendrían un significado que se
          pueda defender, y una flecha que hace algo impredecible es peor que
          no tenerla. */}
      {unidad !== CLAVE_OTRO && periodo?.descripcion && (
        <NavegadorDePeriodo
          titulo={periodo.descripcion.titulo}
          subtitulo={periodo.descripcion.subtitulo}
          puedeAvanzar={Boolean(datos?.puedeAvanzar)}
          puedeRetroceder={Boolean(datos?.puedeRetroceder)}
          onAtras={onAtras}
          onAdelante={onAdelante}
        />
      )}

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {!cargando && !error && periodo && (
        <>
          {esPendientes ? (
            // La vista de solo pendientes: el mismo número informativo que ya
            // mostraba la cuenta, ahora como encabezado de su propia lista. No
            // es plata que salió —se informa y no se descuenta—, así que no
            // lleva el peso del "Para cobrar".
            <ResumenConImporte
              rotulo={ROTULO_PENDIENTE_DE_RECEPCION}
              importe={money ? money(periodo?.pendientes?.importe) : periodo?.pendientes?.importe}
              subtitulo={
                Number(periodo?.pendientes?.cantidad || 0) > 0
                  ? `${rotuloDeTransferencias(periodo?.pendientes?.cantidad)}${
                      periodo?.descripcion?.titulo ? ` · ${periodo.descripcion.titulo}` : ""
                    }`
                  : periodo?.descripcion?.titulo || ""
              }
              nota={Number(periodo?.pendientes?.cantidad || 0) > 0 ? NOTA_PENDIENTES : null}
            />
          ) : (
            <CuentaDelPeriodoCerrado
              periodo={periodo}
              money={money}
              // El atajo al corte SOLO con el chip en Semana: es donde la pregunta
              // surge, porque el rango de una semana depende del corte y el del
              // mes no. Y solo a quien puede usarlo.
              puedeConfigurarCorte={puedeConfigurarCorte && unidad === UNIDADES.SEMANA}
              onConfigurarCorte={onConfigurarCorte}
            />
          )}

          {/* El buscador no se dibuja si no hay filas: un campo para buscar en
              una lista vacía no puede encontrar nada, y el vacío ya lo dice la
              tarjeta de arriba. */}
          {delPeriodo.length > 0 && (
            <SunmiInput
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Buscar transferencia por número"
              inputMode="numeric"
              aria-label="Buscar transferencia por número"
              className="w-full rounded-xl text-sm3"
            />
          )}

          {visibles.length === 0
            ? buscado
              ? (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  Ninguna transferencia de este período tiene ese número.
                </div>
              )
              : esPendientes && (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  No hay transferencias sin confirmar en este período.
                </div>
              )
            : // En la cuenta por recepción los días son los de la confirmación.
              // Las pendientes no se confirmaron: se agrupan por el día en que
              // SALIERON —la fecha de envío, el default de `diasDeTransferencias`—.
              diasDeTransferencias(
                visibles,
                !esPendientes && periodo?.criterio === CRITERIO_CUENTA.RECEPCION
                  ? { fechaDe: fechaDeRecepcion }
                  : undefined
              ).map((dia) => (
                <DiaDeTransferencias
                  key={dia.clave}
                  dia={dia}
                  onRecibir={onAbrirTransferencia}
                  onVer={onAbrirTransferencia}
                  money={money}
                />
              ))}
        </>
      )}
    </>
  );
}
