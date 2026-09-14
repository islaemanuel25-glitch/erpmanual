"use client";

// components/transferencias/TableroMovil.jsx
//
// LO QUE SE VE AL ABRIR TRANSFERENCIAS EN EL TELÉFONO.
//
// ── QUÉ CAMBIA RESPECTO DE LO QUE HABÍA ───────────────────────────────────
//
// Había un formulario de reporte: dos fechas, un estado y "Generar reporte",
// arrancando con Desde y Hasta en el mismo día — así que para ver qué hay que
// recibir primero había que corregir las fechas. Lo que hace falta al abrir no
// es un reporte: es la lista de trabajo. El reporte sigue entero, detrás de su
// botón.
//
// ── DOS VISTAS, Y LA ELIGE UN DATO QUE YA EXISTE ──────────────────────────
//
// El depósito ve una cuenta por local; el local ve la suya. La decide
// `Local.es_deposito` en el servidor —no el `modo` de `resolveVistaOperativa`,
// que dice el ALCANCE y no quién sos— y acá llega resuelta en `vista`.
//
// ── EL PERÍODO SE RECALCULA EN EL SERVIDOR ────────────────────────────────
//
// Tocar un chip vuelve a pedir. Podría calcularse acá si el teléfono tuviera
// las líneas, y no las tiene a propósito: el importe a pagar se valoriza línea
// por línea y esa cuenta vive en un solo lado. Ver `/api/transferencias/tablero`.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";

import AccionDePantalla, { CLASE_ACCION_DE_PANTALLA } from "./AccionDePantalla";
import ChipsDePeriodo, { CLAVE_OTRO } from "./ChipsDePeriodo";
import EntradaDeLocales from "./EntradaDeLocales";
import CabeceraDeCuenta from "./CabeceraDeCuenta";
import FilaTransferenciaLocal from "./FilaTransferenciaLocal";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { RUTA_CORTE_DE_SEMANA, puedeConfigurarElCorte } from "./corteDeSemana";

/** El mismo formato de importe que usa el reporte de al lado. */
function money(n) {
  return `$ ${Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TableroMovil({ onAbrirReporte }) {
  const router = useRouter();
  const { perfil } = useUser();
  // El atajo solo se ofrece a quien puede usarlo. Un "Configurar" que lleva a
  // una pantalla donde no se puede configurar nada es peor que no ofrecerlo: el
  // aviso igual explica por qué ese local está cayendo al domingo.
  const puedeConfigurar = puedeConfigurarElCorte(perfil?.permisos);

  const [unidad, setUnidad] = useState(UNIDADES.SEMANA);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [numero, setNumero] = useState("");

  // EL BOTÓN VIAJA EN EL RENGLÓN QUE YA EXISTE. El shell dibuja el título de la
  // pantalla y pone a su derecha lo que la pantalla registre acá, así que en un
  // teléfono "Reporte" no cuesta un renglón propio ni obliga a repetir la
  // palabra "Transferencias". El mismo nodo se reusa en el repuesto de abajo,
  // que es el que aparece de 768 px para arriba, donde el del shell se apaga.
  const botonDeReporte = useAccionDePagina(
    () => (
      <SunmiButton
        type="button"
        color="slate"
        onClick={onAbrirReporte}
        className={CLASE_ACCION_DE_PANTALLA}
      >
        Reporte
      </SunmiButton>
    ),
    [onAbrirReporte]
  );

  // Con "Otro" elegido y sin las dos fechas todavía, NO se consulta: un rango a
  // medias no es un rango, y pedirlo devolvería el período de la semana sin que
  // nadie lo haya pedido.
  const esperandoFechas = unidad === CLAVE_OTRO && !(desde && hasta);

  const cargar = useCallback(async () => {
    if (esperandoFechas) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError("");
    try {
      const url = new URL("/api/transferencias/tablero", window.location.origin);
      // Con "Otro" la unidad no significa nada —el rango lo eligió el usuario—
      // así que se manda la semana y mandan las dos fechas.
      url.searchParams.set("unidad", unidad === CLAVE_OTRO ? UNIDADES.SEMANA : unidad);
      // El depósito entra por la lista de locales; el servidor decide y, si es
      // depósito, contesta sin tocar `Transferencia`.
      url.searchParams.set("entrada", "1");
      if (unidad === CLAVE_OTRO) {
        url.searchParams.set("desde", desde);
        url.searchParams.set("hasta", hasta);
      }
      const res = await fetch(url.toString(), { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar la lista de trabajo.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [unidad, desde, hasta, esperandoFechas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternar = (localId) => {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(localId)) s.delete(localId);
      else s.add(localId);
      return s;
    });
  };

  // ── LOS DOS CAMINOS VAN A LA MISMA PANTALLA, Y ESO ES CORRECTO ─────────
  //
  // `/modulos/transferencias/[id]` ya decide qué mostrar según el estado: la
  // recepción si está para recibir, el documento si ya se recibió. Mandar la
  // recibida a otro lado habría sido inventar una segunda pantalla de detalle
  // al lado de la que existe.
  //
  // Se dejan como dos funciones con nombre porque son dos intenciones distintas
  // —"voy a contar" y "voy a mirar"— y el día que una de las dos necesite otra
  // cosa, el cambio es de una línea y no hay que descubrir cuál era cuál.
  const recibir = (t) => router.push(`/modulos/transferencias/${t.id}`);
  const ver = (t) => router.push(`/modulos/transferencias/${t.id}`);

  // ── EL BUSCADOR POR NÚMERO ────────────────────────────────────────────
  //
  // El "#N" salió de la lista porque no dice nada al mirar; sigue sirviendo
  // cuando ya se sabe cuál se busca —hablando por teléfono con el depósito—.
  // Por eso es un campo y no una columna.
  //
  // Filtra sobre lo que YA se trajo, sin volver a consultar: el período
  // completo está en memoria y una transferencia de otro período no se
  // encontraría igual. Si el número no está en la lista, se dice.
  const buscado = numero.trim().replace(/^#/, "");
  const filtrarPorNumero = (transferencias) =>
    buscado ? (transferencias || []).filter((t) => String(t.id).includes(buscado)) : transferencias;

  return (
    // Padding 14 a los lados y arriba —`p-4` en la escala del proyecto— y 12,25
    // entre bloques.
    <div className="w-full min-h-full px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{botonDeReporte}</AccionDePantalla>

      {/* ── NI CHIPS NI BUSCADOR EN LA ENTRADA ────────────────────────────
          El período no puede vivir arriba de la pantalla: cada local corta su
          semana el día que acordó, así que un chip global tendría que elegir UN
          período para todos y cualquiera que elija es el equivocado para
          alguien. Aparece adentro del local, con su corte.

          El buscador se fue al mismo lugar: el número sirve cuando ya se sabe
          cuál se busca, y eso pasa adentro de un local. */}
      {datos?.vista === "LOCAL" && <ChipsDePeriodo valor={unidad} onCambiar={setUnidad} />}

      {unidad === CLAVE_OTRO && (
        <SunmiDateRangePicker
          valueDesde={desde}
          valueHasta={hasta}
          onChangeDesde={setDesde}
          onChangeHasta={setHasta}
          onApply={cargar}
        />
      )}

      {esperandoFechas && (
        <div className="text-center py-12 sunmi-text-muted text-xs">
          Elegí las dos fechas del período.
        </div>
      )}

      {cargando && !esperandoFechas && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {/* `!esperandoFechas` no es redundante: con "Otro" recién elegido, `datos`
          todavía tiene el período anterior, y dibujarlo debajo de "Elegí las dos
          fechas" mostraría bloques que no son del rango que se está por pedir. */}
      {datos?.vista === "ENTRADA" && (
        <EntradaDeLocales
          locales={datos.locales || []}
          sinConfigurar={(datos.locales || []).filter((l) => l.sinConfigurar).length}
          puedeConfigurar={puedeConfigurar}
          onConfigurar={() => router.push(RUTA_CORTE_DE_SEMANA)}
          onEntrar={(l) => router.push(`/modulos/transferencias/local/${l.localId}`)}
        />
      )}

      {!cargando && !error && !esperandoFechas && datos?.vista === "LOCAL" && datos?.cuenta && (
        <>
          <CabeceraDeCuenta cuenta={datos.cuenta} unidad={unidad} money={money} />

          {datos.cuenta.paraRecibir.length > 0 && (
            <section className="space-y-3.5">
              <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">
                PARA RECIBIR
              </h2>
              {datos.cuenta.paraRecibir.map((t) => (
                <FilaTransferenciaLocal key={t.id} t={t} onRecibir={recibir} money={money} />
              ))}
            </section>
          )}

          {datos.cuenta.yaRecibidas.length > 0 && (
            <section className="space-y-3.5">
              <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">
                YA RECIBIDAS
              </h2>
              {datos.cuenta.yaRecibidas.map((t) => (
                <FilaTransferenciaLocal key={t.id} t={t} onVer={ver} money={money} />
              ))}
            </section>
          )}

          {datos.cuenta.paraRecibir.length === 0 && datos.cuenta.yaRecibidas.length === 0 && (
            <div className="text-center py-12 sunmi-text-muted text-xs">
              No hubo transferencias en este período.
            </div>
          )}
        </>
      )}
    </div>
  );
}
