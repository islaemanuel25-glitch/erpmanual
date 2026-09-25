"use client";

// components/transferencias/EntradaDeLocales.jsx
//
// LA ENTRADA DEL DEPÓSITO: la lista de locales y NADA MÁS.
//
// ── POR QUÉ LA PANTALLA SE PARTIÓ EN DOS ─────────────────────────────────
//
// Hasta acá el tablero mostraba todo junto —chips de período, importes por local
// y transferencias— y eso tenía un defecto que se vio el domingo 2026-09-13: con
// corte domingo, la semana en curso arrancaba ESE día, así que la pantalla
// mostraba cuatro transferencias que todavía no se cobran y escondía la semana
// que sí hay que cobrar.
//
// Y el problema de fondo es peor que ese domingo: **cada local corta su semana
// el día que acordó**, así que "Semana" no significa lo mismo para todos. Un
// chip arriba de la pantalla tiene que elegir UN período para todos, y
// cualquiera que elija es el equivocado para alguien.
//
// La salida es que el período no exista hasta saber de qué local se habla. Por
// eso acá no hay chips, ni importes, ni transferencias, ni buscador: hay locales.
//
// ── Y POR QUÉ TAMPOCO HAY IMPORTE AL LADO DEL NOMBRE ─────────────────────
//
// Porque un importe es siempre el importe DE UN PERÍODO, y acá no hay ninguno
// elegido. Mostrar uno obligaría a elegirlo en silencio, que es justamente lo
// que esta pantalla vino a dejar de hacer.

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { TriangleAlert } from "lucide-react";

import TarjetaDeLocal from "./TarjetaDeLocal";

/**
 * ── `textoVacio` y `rotulo` ──────────────────────────────────────────────
 *
 * Los dos textos que eran de Transferencias y estaban escritos adentro. Los
 * defaults son EXACTAMENTE los de siempre, así que la pantalla de
 * transferencias —que ahora los pasa explícitos— dibuja lo mismo que dibujaba.
 *
 * Existen porque Finanzas muestra la misma lista y las dos frases serían
 * falsas ahí: su lista no son "los locales que operan por transferencia con
 * este depósito" —incluye al depósito, que no se transfiere a sí mismo— y su
 * vacío no significa lo mismo. Un texto de dominio escrito adentro de una pieza
 * compartida es lo que hace que la segunda pantalla tenga que mentir o copiar
 * el componente.
 *
 * El aviso de la semana NO se parametrizó: se dibuja solo cuando llegan
 * `localesSinSemana`, y Finanzas no los manda. Queda apagado sin tocar nada.
 *
 * ── `localesSinSemana`: SOLO INFORMA ─────────────────────────────────────
 *
 * Los nombres de los locales que todavía no tienen su semana operativa. El aviso
 * dice cuáles son y NO ofrece configurarlos: la semana se configura en
 * Configuración → Semana operativa, sobre la ubicación en la que se opera, así
 * que un botón desde el depósito llevaría a cambiar la semana del depósito
 * creyendo que se cambia la de un local. Cada local configura la suya.
 */
export default function EntradaDeLocales({
  locales = [],
  cargando = false,
  error = "",
  localesSinSemana = [],
  onEntrar,
  rotulo = "LOCALES",
  textoVacio = "Ningún local opera por transferencia con este depósito.",
  // Qué insignia le toca a cada local, si alguna. Por defecto ninguna, así que
  // transferencias dibuja exactamente lo de siempre. La usa Finanzas, cuya lista
  // incluye al depósito y a los locales dados de baja. Es una FUNCIÓN y no un
  // campo de la fila para que la pieza no tenga que conocer los nombres de los
  // campos de cada consumidor.
  insigniaDe = null,
}) {
  return (
    <div className="space-y-3.5">
      {localesSinSemana.length > 0 && (
        <SunmiAviso tono="warning" icon={TriangleAlert} titulo="Semana sin configurar">
          {localesSinSemana.length === 1
            ? `${localesSinSemana[0]} no tiene su semana configurada: se le está aplicando el domingo.`
            : `${localesSinSemana.join(", ")} no tienen su semana configurada: se les está aplicando el domingo.`}{" "}
          Cada local la configura desde su ubicación, en Configuración → Semana operativa.
        </SunmiAviso>
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

      {!cargando && !error && locales.length === 0 && (
        <div className="text-center py-12 sunmi-text-muted text-xs">{textoVacio}</div>
      )}

      {/* ── EL RÓTULO DE LA LISTA ──────────────────────────────────────────
          Faltaba, y sin él la primera tarjeta arranca pegada al aviso sin que
          nada diga de qué es la lista.

          Las clases son las MISMAS que los dos rótulos de sección que el módulo
          ya tenía —`text-xs2 font-semibold sunmi-text-muted tracking-wider`— y
          no una combinación nueva al lado. El diseño pide 10 SemiBold en
          text/secondary con letter-spacing 0,6: los tres primeros dan exacto
          (`xs2` es 10 px y `sunmi-text-muted` es el token secundario), y el
          cuarto queda en 0,5 px, que es lo que `tracking-wider` —0,05em— vale a
          10 px. Escribir `tracking-[0.6px]` sería hardcodeo en la pantalla, y
          sumar una entrada a la escala del proyecto para ganar una décima de
          píxel dejaría este rótulo distinto de sus dos hermanos por algo que no
          se ve. Queda anotado, no decidido en silencio.

          No se dibuja si la lista está vacía: un rótulo arriba de nada es un
          encabezado que promete contenido que no está. */}
      {!cargando && !error && locales.length > 0 && (
        <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">{rotulo}</h2>
      )}

      {!cargando &&
        !error &&
        locales.map((l) => (
          <TarjetaDeLocal
            key={l.localId}
            local={l}
            onEntrar={onEntrar}
            insignia={insigniaDe ? insigniaDe(l) : null}
          />
        ))}
    </div>
  );
}
