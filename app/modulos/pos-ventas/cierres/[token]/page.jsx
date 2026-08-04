"use client";

// CIERRE DE CAJA — contar el RETIRO y confirmar, con el corte ya tomado.
//
// SE CUENTA UNA SOLA PILA
//
// El cambio se separó, se contó y se congeló ANTES del corte, y su sobre ya está
// publicado: el operador que releva puede haberlo tomado y estar vendiendo con
// él en este momento. Acá no se vuelve a preguntar por el cambio —se muestra
// como solo lectura, para poder verificarlo— y lo único que se cuenta es el
// dinero que se retira.
//
// LOS NÚMEROS NO SE VUELVEN A LEER. El esperado y el retiro esperado quedaron
// CONGELADOS al cortar. Mientras el cajero cuenta, el relevo está vendiendo, y
// releer el resumen le imputaría a este cierre plata que nunca tuvo en la mano.
// Todo lo monetario sale de CierrePreparacion.
//
// LA IDENTIDAD SALE DEL TOKEN, no del operador activo. La cookie del operario es
// del NAVEGADOR ENTERO: cuando el relevo hace login en la pestaña del POS, esta
// pestaña pasaría a ver al operador nuevo. Acá no se lee esa cookie en ningún
// momento; el operador que figura es el que el servidor grabó al tomar el corte.
//
// COMPATIBILIDAD: un corte tomado con el orden anterior —cambio elegido al
// final— no tiene `efectivoRetiradoEsperado` y se sigue contando como antes:
// todo el cajón y después el cambio. Se detecta por `cambioSeparadoEnCorte`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { Cifra, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import {
  Aviso,
  PanelConteo,
  PanelConteoRetiro,
  PanelCambio,
  PanelCambioSeparado,
  PanelResumen,
  PanelResumenCorte,
  PanelMovimientos,
  ResumenCabecera,
  ResumenCabeceraCorte,
} from "@/components/caja/PanelesRetiro";
import {
  AvisoCorteHecho,
  FilasResumenCierre,
  TITULO_CIERRE,
  AVISO_CONTAR_SOLO_RETIRO_CIERRE,
  hora,
} from "@/components/caja/PanelesCierre";

import {
  totalDesglose,
  desgloseVacio,
  validarCambioQueQueda,
  limitarCambioAlConteo,
  calcularRetiroDesdeCambio,
} from "@/lib/caja/conteoBilletes";
import { calcularDiferencia } from "@/lib/caja/efectivoEsperado";
import {
  armarBorradorCierre,
  armarBorradorCierreLegado,
  borradorCompatible,
  guardarBorradorCierre,
  leerBorradorCierre,
  descartarBorradorCierre,
  limpiarBorradoresCierreViejos,
  sanearDesglose,
  AVISO_BORRADOR_INCOMPATIBLE,
} from "@/lib/caja/borradorCierre";

const AYUDA_CAMBIO_LEGADO =
  "Elegí los billetes y monedas que quedan disponibles para el siguiente operador. Todo lo demás se retira.";

/** Nota al pie del bloque de cambio, según lo que el relevo ya haya hecho. */
function notaSobre(cambioPendiente) {
  if (!cambioPendiente) return null;
  if (cambioPendiente.turnoDestinoId || cambioPendiente.estado === "RECIBIDO") {
    return "El siguiente operador ya recibió este cambio y abrió su turno con él.";
  }
  if (cambioPendiente.estado === "RESERVADO") {
    return "El siguiente operador ya lo tomó y lo está contando.";
  }
  return "Está disponible para que lo tome el siguiente operador.";
}

export default function CierrePorTokenPage() {
  const router = useRouter();
  const ruta = useParams();
  const params = useSearchParams();
  const token = typeof ruta?.token === "string" ? ruta.token : null;
  const enPestanaNueva = params?.get("pestana") === "nueva";

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;

  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(null);
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  // Orden nuevo: se cuenta sólo el retiro.
  const [desgloseRetiro, setDesgloseRetiro] = useState({});
  // Orden anterior (compatibilidad): se cuenta el cajón y se elige el cambio.
  const [desgloseContado, setDesgloseContado] = useState({});
  const [desgloseCambio, setDesgloseCambio] = useState({});

  const [observacion, setObservacion] = useState("");
  const [conteoIniciadoEn, setConteoIniciadoEn] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const storage = typeof window !== "undefined" ? window.localStorage : null;

  const cierre = datos?.cierre;
  const conCorteNuevo = cierre?.cambioSeparadoEnCorte === true;

  // ── Carga: UNA sola vez, desde el corte congelado ────────────────────────
  //
  // No hay polling ni revalidación. El dato no puede cambiar: si el turno
  // vendiera algo más, no entraría en este cierre. Volver a consultar solo
  // abriría la puerta a mostrar un número distinto del que se va a registrar.
  useEffect(() => {
    if (cargandoUser || !puedeUsar || !token) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos-ventas/cierres/${encodeURIComponent(token)}`, {
          credentials: "include",
          cache: "no-store",
        }).then((x) => x.json());

        if (!vivo) return;
        if (!r?.ok) {
          setErrorFatal(r?.error || "No se encontró este cierre.");
          return;
        }
        setDatos(r);

        if (r.cierre?.estado === "CONFIRMADO") {
          setResultado({
            totalContado: r.cierre.totalContado,
            totalCambio: r.cierre.totalCambio,
            retiroFinal: r.cierre.retiroFinal,
            diferencia:
              r.cierre.diferencia ??
              calcularDiferencia(r.cierre.totalContado ?? 0, r.cierre.efectivoEsperadoCorte),
            turnoId: r.cierre.turnoId,
          });
          return;
        }

        // El borrador va por TOKEN: quien recupere este cierre encuentra lo
        // contado aunque no sea quien lo empezó.
        limpiarBorradoresCierreViejos(storage);
        const b = leerBorradorCierre(storage, token);
        if (!b) return;

        // Un borrador del otro orden no se traduce: se descarta y se avisa. Ver
        // `borradorCompatible`.
        if (!borradorCompatible(b, { cambioSeparadoEnCorte: r.cierre?.cambioSeparadoEnCorte })) {
          descartarBorradorCierre(storage, token);
          setAviso(AVISO_BORRADOR_INCOMPATIBLE);
          return;
        }

        if (r.cierre?.cambioSeparadoEnCorte) {
          setDesgloseRetiro(sanearDesglose(b.desgloseRetiroContado));
        } else {
          setDesgloseContado(sanearDesglose(b.desgloseContado));
          setDesgloseCambio(sanearDesglose(b.desgloseCambio));
        }
        setObservacion(b.observacion || "");
        setConteoIniciadoEn(b.conteoIniciadoEn || null);
        setAviso("Recuperamos lo que habías contado en esta caja.");
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el cierre.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token, cargandoUser, puedeUsar, storage]);

  // ── Derivados del ORDEN NUEVO: todo contra los dos números congelados ─────
  const esperado = cierre?.efectivoEsperadoCorte ?? null;
  const cambioSeparado = cierre?.totalCambio ?? 0;
  const retiroEsperado = cierre?.efectivoRetiradoEsperado ?? null;

  const retiroContado = totalDesglose(desgloseRetiro);
  const hayRetiroContado = !desgloseVacio(desgloseRetiro);
  const diferenciaRetiro = useMemo(
    () => calcularDiferencia(retiroContado, retiroEsperado ?? 0),
    [retiroContado, retiroEsperado]
  );

  // ── Derivados del ORDEN ANTERIOR (compatibilidad) ────────────────────────
  const totalContado = totalDesglose(desgloseContado);
  const hayContado = !desgloseVacio(desgloseContado);
  const totalCambio = totalDesglose(desgloseCambio);
  const totalRetiroLegado = useMemo(
    () => calcularRetiroDesdeCambio({ efectivoContado: totalContado, cambioQueQueda: totalCambio }),
    [totalContado, totalCambio]
  );
  const diferenciaLegado = useMemo(
    () => calcularDiferencia(totalContado, esperado ?? 0),
    [totalContado, esperado]
  );
  const validacionCambio = validarCambioQueQueda({
    desgloseContado,
    desgloseCambio,
    totalContado,
  });

  // Se puede cerrar con retiro $0 —todo el efectivo quedó como cambio—, que en un
  // cierre es un caso legítimo: el turno siguiente se lleva el cajón entero.
  const puedeConfirmar = conCorteNuevo
    ? hayRetiroContado && !guardando
    : hayContado && validacionCambio.valido && !guardando;

  const marcarInicioConteo = () => {
    if (!conteoIniciadoEn) setConteoIniciadoEn(new Date().toISOString());
  };

  const actualizarRetiro = (nuevo) => {
    setDesgloseRetiro(nuevo);
    marcarInicioConteo();
  };

  const actualizarConteo = (nuevo) => {
    setDesgloseContado(nuevo);
    setDesgloseCambio((c) => limitarCambioAlConteo(c, nuevo));
    marcarInicioConteo();
  };

  // ── Borrador ─────────────────────────────────────────────────────────────
  const persistir = useCallback(() => {
    if (!token) return false;
    const borrador = conCorteNuevo
      ? armarBorradorCierre({
          token,
          desgloseRetiroContado: desgloseRetiro,
          observacion,
          conteoIniciadoEn,
        })
      : armarBorradorCierreLegado({
          token,
          desgloseContado,
          desgloseCambio,
          observacion,
          conteoIniciadoEn,
        });
    return guardarBorradorCierre(storage, borrador);
  }, [
    token,
    storage,
    conCorteNuevo,
    desgloseRetiro,
    desgloseContado,
    desgloseCambio,
    observacion,
    conteoIniciadoEn,
  ]);

  const guardarSolo = () => {
    persistir();
    setAviso("Conteo guardado. Podés volver a este cierre cuando quieras.");
  };

  const salir = () => {
    persistir();
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    // NO se vuelve al POS del operador anterior: esa pestaña ya fue liberada al
    // cortar y ahora le pertenece a quien esté operando.
    router.push("/modulos/pos-ventas/cierres");
  };

  // ── Confirmar ────────────────────────────────────────────────────────────
  const confirmar = async () => {
    if (!puedeConfirmar || guardando || !token) return;
    setError("");
    setGuardando(true);
    try {
      // Solo el desglose. Los totales los calcula el servidor: mandarlos sería
      // ofrecerle al backend un número que no tiene por qué creer.
      const cuerpo = conCorteNuevo
        ? { desgloseRetiroContado: desgloseRetiro, observacion: observacion.trim() || null }
        : { desgloseContado, desgloseCambio, observacion: observacion.trim() || null };

      const res = await fetch(`/api/pos-ventas/cierres/${encodeURIComponent(token)}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo confirmar el cierre.");
        return;
      }
      descartarBorradorCierre(storage, token);
      setResultado({
        totalContado: json.cuentas?.totalContado ?? null,
        totalCambio: json.cuentas?.totalCambio ?? cambioSeparado,
        retiroFinal: json.cuentas?.retiroFinal ?? retiroContado,
        diferencia: json.cuentas?.diferencia ?? (conCorteNuevo ? diferenciaRetiro : diferenciaLegado),
        turnoId: json.cierre?.turnoId ?? cierre?.turnoId ?? null,
        repetido: json.repetido === true,
      });
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (cargandoUser) return null;
  if (!puedeUsar) return <SinPermisos />;

  if (errorFatal) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <p className="text-sm text-center py-4 sunmi-text-danger">{errorFatal}</p>
          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/pos-ventas/cierres")}
            className="w-full py-3"
          >
            Ver cierres pendientes
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando) {
    return (
      <Marco>
        <SunmiLoader />
      </Marco>
    );
  }

  if (resultado) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <div className="sunmi-state-success sunmi-border rounded-xl p-3 flex items-center gap-3">
            <Check size={26} className="shrink-0 sunmi-text-success" />
            <div className="min-w-0">
              <div className="text-base font-bold sunmi-text-success">Caja cerrada</div>
              <div className="text-[12px] sunmi-text-muted">
                El cambio ya estaba disponible para el siguiente operador desde el corte.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cifra label="Se retiró" valor={resultado.retiroFinal} clase="sunmi-text-accent" destacado />
            <Cifra label="Quedó de cambio" valor={resultado.totalCambio} />
            <Cifra
              label="Diferencia al contar"
              valor={resultado.diferencia}
              clase={tonoDiferencia(resultado.diferencia)}
            />
          </div>
          <div className="space-y-2">
            {resultado.turnoId && (
              <SunmiButton
                color="amber"
                onClick={() => router.push(`/modulos/turnos/${resultado.turnoId}`)}
                className="w-full py-3 font-bold"
              >
                Ver el detalle del turno
              </SunmiButton>
            )}
            {/* No hay "volver al POS": esa pestaña ya es del operador que releva. */}
            <SunmiButton color="slate" onClick={salir} className="w-full py-2 !text-xs">
              {enPestanaNueva ? "Cerrar esta pestaña" : "Ver cierres pendientes"}
            </SunmiButton>
          </div>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_CIERRE}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Turno #{cierre?.turnoId} ·{" "}
              <span className="sunmi-text-warning font-semibold">cortado</span> ·{" "}
              {datos?.local?.nombre || "—"}
            </p>
            <p className="text-[11px] sunmi-text-muted leading-tight">
              Cierra {datos?.operadorCierre?.nombre || datos?.turno?.cajeroNombre || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={salir}
            className="shrink-0 text-[11px] sunmi-text-muted inline-flex items-center gap-1"
          >
            {enPestanaNueva ? <X size={14} /> : <ArrowLeft size={14} />}
            {enPestanaNueva ? "Cerrar" : "Salir"}
          </button>
        </div>
      </SunmiCard>

      <AvisoCorteHecho corteEn={cierre?.corteEn} atrasado={cierre?.atrasado} />

      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      {conCorteNuevo ? (
        <>
          <ResumenCabeceraCorte
            esperado={esperado}
            cambioSeparado={cambioSeparado}
            retiroEsperado={retiroEsperado}
            retiroContado={retiroContado}
            hayContado={hayRetiroContado}
            diferencia={diferenciaRetiro}
          />

          {/* En MÓVIL los movimientos van arriba, antes de contar: explican por
              qué el esperado no es lo que se vendió. */}
          <div className="xl:hidden">
            <PanelMovimientos movimientos={datos?.movimientos} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
            <PanelConteoRetiro
              desglose={desgloseRetiro}
              onDesglose={actualizarRetiro}
              horaConteo={conteoIniciadoEn ? hora(conteoIniciadoEn) : null}
              aviso={AVISO_CONTAR_SOLO_RETIRO_CIERRE}
            />

            <PanelCambioSeparado
              desglose={cierre?.desgloseCambio ?? {}}
              total={cambioSeparado}
              nota={notaSobre(datos?.cambioPendiente)}
            />

            <PanelResumenCorte
              esperado={esperado}
              cambioSeparado={cambioSeparado}
              retiroEsperado={retiroEsperado}
              retiroContado={retiroContado}
              hayContado={hayRetiroContado}
              diferencia={diferenciaRetiro}
              observacion={observacion}
              onObservacion={setObservacion}
              error={error}
              guardando={guardando}
              puedeConfirmar={puedeConfirmar}
              enPestanaNueva={enPestanaNueva}
              onGuardar={guardarSolo}
              onVolver={salir}
              onConfirmar={confirmar}
              filasExtra={
                <FilasResumenCierre
                  corteEn={cierre?.corteEn}
                  operadorNombre={datos?.operadorCierre?.nombre}
                />
              }
              textoConfirmar="Confirmar cierre"
              textoConfirmando="Cerrando…"
              textoGuardar="Guardar y continuar después"
              textoCerrarPestana="Cerrar esta pestaña"
              textoVolver="Guardar y continuar después"
            />

            <PanelMovimientos
              movimientos={datos?.movimientos}
              className="hidden xl:block xl:col-start-3"
            />
          </div>
        </>
      ) : (
        <>
          {/* ORDEN ANTERIOR. Sólo para cortes tomados antes del cambio de flujo:
              se cuenta todo el cajón y el cambio se elige al final. */}
          <ResumenCabecera
            esperado={esperado}
            totalContado={totalContado}
            hayContado={hayContado}
            diferencia={diferenciaLegado}
            totalCambio={totalCambio}
            totalRetiro={totalRetiroLegado}
            etiquetaEsperado="Efectivo esperado al corte"
          />

          <div className="xl:hidden">
            <PanelMovimientos movimientos={datos?.movimientos} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
            <PanelConteo
              desglose={desgloseContado}
              onDesglose={actualizarConteo}
              horaConteo={conteoIniciadoEn ? hora(conteoIniciadoEn) : null}
            />

            <PanelCambio
              desgloseContado={desgloseContado}
              desgloseCambio={desgloseCambio}
              onDesgloseCambio={setDesgloseCambio}
              totalCambio={totalCambio}
              error={validacionCambio.valido ? null : validacionCambio.error}
              ayuda={AYUDA_CAMBIO_LEGADO}
            />

            <PanelResumen
              esperado={esperado}
              totalContado={totalContado}
              hayContado={hayContado}
              totalCambio={totalCambio}
              totalRetiro={totalRetiroLegado}
              diferencia={diferenciaLegado}
              observacion={observacion}
              onObservacion={setObservacion}
              error={error}
              guardando={guardando}
              puedeConfirmar={puedeConfirmar}
              enPestanaNueva={enPestanaNueva}
              onGuardar={guardarSolo}
              onVolver={salir}
              onConfirmar={confirmar}
              etiquetaEsperado="Efectivo esperado al corte"
              filasExtra={
                <FilasResumenCierre
                  corteEn={cierre?.corteEn}
                  operadorNombre={datos?.operadorCierre?.nombre}
                />
              }
              textoConfirmar="Confirmar cierre"
              textoConfirmando="Cerrando…"
              textoGuardar="Guardar y continuar después"
              textoCerrarPestana="Cerrar esta pestaña"
              textoVolver="Guardar y continuar después"
            />

            <PanelMovimientos
              movimientos={datos?.movimientos}
              className="hidden xl:block xl:col-start-3"
            />
          </div>
        </>
      )}
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1400px] mx-auto">{children}</div>;
}
