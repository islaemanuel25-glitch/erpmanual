// app/modulos/configuracion/semana-operativa/page.jsx
//
// LA SEMANA OPERATIVA DE LA UBICACIÓN EN LA QUE SE OPERA.
//
// Una sola pregunta: "¿qué día empieza tu semana?". La pantalla trabaja sobre la
// ubicación que resuelve el servidor —la de la sesión, o el contexto activo del
// administrador— y nunca elige otra: no hay selector de local, a propósito. Un
// local configura la suya; el depósito, la suya.
//
// Diseño: Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 48:11, siete estados móviles.
//
// ── NADA DE CALENDARIO ACÁ ────────────────────────────────────────────────
//
// Lo que se muestra antes de confirmar —desde cuándo rige, la semana de
// transición, la semana que sigue— sale de `previsualizarCambio`, la misma
// función pura que decide el PUT en el servidor, alimentada con las vigencias y
// el `hoy` que devolvió el GET. Si la vista previa y el guardado usaran cuentas
// distintas, la confirmación prometería una fecha y se escribiría otra.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import TarjetaDeSemana from "@/components/configuracion/semanaOperativa/TarjetaDeSemana";
import { previsualizarCambio } from "@/lib/semanaOperativa/semanaOperativa";
import {
  OPCIONES_DE_DIA,
  confirmacionDeCancelar,
  confirmacionDelCambio,
  nombreDeLaSemana,
  textoDeEstaSemana,
  textoDelProgramado,
} from "@/lib/semanaOperativa/textos";
import { RUTA_CONFIGURACION, puedeConfigurarLaSemana } from "@/lib/semanaOperativa/rutas";

const URL_API = "/api/config/semana-operativa";

/** Las clases de los botones de ancho completo: alto táctil y letra del kit. */
const BOTON_PRINCIPAL = "w-full min-h-toque text-sm3 font-semibold";
const BOTON_SECUNDARIO = "w-full min-h-toque text-sm3";

export default function SemanaOperativaPage() {
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const puede = puedeConfigurarLaSemana(permisos);

  useTituloDePagina("Semana operativa");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_CONFIGURACION} />, []);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [sinUbicacion, setSinUbicacion] = useState(false);
  // "ver" o "elegir". La confirmación es una hoja encima, no un modo.
  const [modo, setModo] = useState("ver");
  const [dia, setDia] = useState(null);
  // null, "cambio" o "cancelar".
  const [hoja, setHoja] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(URL_API, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.needsContexto) {
        setSinUbicacion(true);
        setDatos(null);
        return;
      }
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo leer la semana de esta ubicación.");
      setSinUbicacion(false);
      setDatos(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (puede) cargar();
  }, [puede, cargar]);

  // La vista previa del día elegido: la MISMA cuenta que va a hacer el PUT.
  const previa = useMemo(() => {
    if (!datos || dia === null) return null;
    return previsualizarCambio({ vigencias: datos.vigencias, diaDeCorte: Number(dia), hoy: datos.hoy });
  }, [datos, dia]);

  const empezarAElegir = () => {
    setError("");
    setDia(String(datos?.programado?.diaDeCorte ?? datos?.semana?.diaDeCorte ?? 0));
    setModo("elegir");
  };

  const escribir = async (metodo, cuerpo) => {
    setTrabajando(true);
    setError("");
    try {
      const res = await fetch(URL_API, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        // Un doble toque que ya no encuentra nada que cancelar no es un error
        // para quien mira: se recarga y se ve cómo quedó.
        if (j?.codigo === "SIN_PENDIENTE") {
          await cargar();
          return;
        }
        throw new Error(j?.error || "No se pudo guardar la semana.");
      }
      setDatos(j);
      setModo("ver");
      setDia(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
      setHoja(null);
    }
  };

  if (cargandoUsuario) return null;
  if (!puede) return <SinPermisos />;

  const nombre = datos?.ubicacion?.nombre || "esta ubicación";
  const semana = datos?.semana || null;
  const programado = datos?.programado || null;
  const textoProgramado = textoDelProgramado(programado);
  const configurada = semana?.configurada === true;
  const confirmacion =
    hoja === "cambio"
      ? confirmacionDelCambio(previa, nombre, programado)
      : hoja === "cancelar"
        ? confirmacionDeCancelar(programado, semana)
        : null;

  return (
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {/* 07 · ADMINISTRADOR SIN UBICACIÓN. No hay a quién configurarle la semana
          hasta que elija dónde opera: la pantalla no elige por él. */}
      {!cargando && sinUbicacion && (
        <>
          <p className="text-sm3 font-semibold sunmi-text-strong">Sin ubicación seleccionada</p>
          <SunmiAviso tono="warning" titulo="Elegí una ubicación">
            Seleccioná tu contexto operativo para configurar su semana.
          </SunmiAviso>
        </>
      )}

      {error && (
        <SunmiAviso tono="danger" titulo="No se pudo completar">
          {error}
        </SunmiAviso>
      )}

      {!cargando && datos && (
        <>
          <p className="text-sm3 font-semibold sunmi-text-strong">{nombre}</p>

          {/* 02 · SIN CONFIGURAR. El domingo que resuelve el servidor mientras
              tanto NO se muestra como si alguien lo hubiera elegido. */}
          {!configurada && (
            <SunmiAviso tono="warning" titulo="Todavía no está configurada">
              Elegí el día en que empieza la semana de esta ubicación.
            </SunmiAviso>
          )}

          {/* 01 · CONFIGURADA. */}
          {configurada && (
            <TarjetaDeSemana
              rotulo="Semana actual"
              titulo={nombreDeLaSemana(semana.diaDeCorte)}
              detalle={modo === "ver" ? textoDeEstaSemana(semana) : null}
            />
          )}

          {/* 03 · CAMBIO PROGRAMADO. */}
          {textoProgramado && modo === "ver" && (
            <TarjetaDeSemana rotulo="Cambio programado" titulo={textoProgramado.titulo} detalle={textoProgramado.detalle} />
          )}

          {modo === "ver" && (
            <div className="space-y-2">
              {!configurada && (
                <SunmiButton color="primary" onClick={empezarAElegir} className={BOTON_PRINCIPAL}>
                  Configurar semana
                </SunmiButton>
              )}
              {configurada && !programado && (
                <SunmiButton color="primary" onClick={empezarAElegir} className={BOTON_PRINCIPAL}>
                  Cambiar día de inicio
                </SunmiButton>
              )}
              {configurada && programado && (
                <>
                  <SunmiButton color="primary" onClick={empezarAElegir} className={BOTON_PRINCIPAL}>
                    Cambiar el cambio programado
                  </SunmiButton>
                  <SunmiButton color="slate" onClick={() => setHoja("cancelar")} className={BOTON_SECUNDARIO}>
                    Cancelar cambio programado
                  </SunmiButton>
                </>
              )}
            </div>
          )}

          {/* 04 · ELEGIR DÍA. Con un cambio programado, el que se elige lo
              REEMPLAZA, y se dice acá y otra vez en la confirmación. */}
          {/* Sin tarjeta a propósito: adentro de una, a 360 px, las siete
              teclas no llegan a 44 px de área táctil ni aun cubriendo el gap
              (quedan 274 px para 308). En la columna de la página hay 304, y el
              paso de cada tecla da 44,2. */}
          {modo === "elegir" && (
            <div className="space-y-3">
              <p className="text-lg2 font-bold sunmi-text-strong">¿Qué día empieza tu semana?</p>
              <SunmiSelectorDeOpciones
                opciones={OPCIONES_DE_DIA}
                valor={dia}
                onCambiar={setDia}
                etiqueta="Día en que empieza la semana"
              />
              <p className="text-sm3 sunmi-text-strong">
                Tu semana iría de {nombreDeLaSemana(Number(dia)).toLowerCase()}
              </p>
              {programado && (
                <p className="text-sm2 sunmi-text-muted">
                  Ya hay un cambio programado ({textoProgramado.semana.toLowerCase()}, {textoProgramado.titulo.toLowerCase()}).
                  Si confirmás otro día, lo reemplaza.
                </p>
              )}
              {previa && !previa.ok && (
                <p className="text-sm2 sunmi-text-warning">
                  {previa.mensaje}
                  {programado && previa.codigo === "MISMO_CORTE"
                    ? " Para quedarte con tu semana de siempre, cancelá el cambio programado."
                    : ""}
                </p>
              )}
              <div className="space-y-2">
                <SunmiButton
                  color="primary"
                  onClick={() => setHoja("cambio")}
                  disabled={!previa?.ok}
                  className={BOTON_PRINCIPAL}
                >
                  Continuar
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={() => {
                    setModo("ver");
                    setDia(null);
                  }}
                  className={BOTON_SECUNDARIO}
                >
                  Cancelar
                </SunmiButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* 05 · CONFIRMAR, y la confirmación de cancelar el programado. */}
      {confirmacion && (
        <SunmiHojaDeConfirmacion
          titulo={confirmacion.titulo}
          puntos={confirmacion.puntos}
          colorConfirmar="primary"
          textoConfirmar={hoja === "cancelar" ? "Sí, cancelar el cambio" : "Confirmar cambio"}
          textoTrabajando={hoja === "cancelar" ? "Cancelando…" : "Guardando…"}
          trabajando={trabajando}
          onConfirmar={() =>
            hoja === "cancelar"
              ? escribir("DELETE")
              : escribir("PUT", { diaDeCorte: Number(dia), reemplazarPendiente: Boolean(programado) })
          }
          onVolver={() => setHoja(null)}
        />
      )}
    </div>
  );
}
