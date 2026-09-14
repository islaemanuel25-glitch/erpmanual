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

import ChipsDePeriodo, { CLAVE_OTRO } from "./ChipsDePeriodo";
import CuentaDelPeriodoCerrado from "./CuentaDelPeriodoCerrado";
import DiaDeTransferencias from "./DiaDeTransferencias";
import NavegadorDePeriodo from "./NavegadorDePeriodo";
import { diasDeTransferencias } from "@/lib/transferencias/diasDeTransferencias";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";

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
}) {
  const [numero, setNumero] = useState("");

  const periodo = datos?.periodo;
  const delPeriodo = periodo?.transferencias || [];

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
          <CuentaDelPeriodoCerrado
            periodo={periodo}
            money={money}
            // El atajo al corte SOLO con el chip en Semana: es donde la pregunta
            // surge, porque el rango de una semana depende del corte y el del
            // mes no. Y solo a quien puede usarlo.
            puedeConfigurarCorte={puedeConfigurarCorte && unidad === UNIDADES.SEMANA}
            onConfigurarCorte={onConfigurarCorte}
          />

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
            ? buscado && (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  Ninguna transferencia de este período tiene ese número.
                </div>
              )
            : diasDeTransferencias(visibles).map((dia) => (
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
