"use client";

// CIERRE DE CAJA — contar y confirmar, con el corte ya tomado.
//
// Es la pantalla de retiro con dos diferencias, y las dos importan:
//
//   1. EL ESPERADO NO SE VUELVE A LEER. El retiro consulta el resumen vivo y
//      revalida contra el servidor antes de confirmar, porque su número cambia
//      con cada venta. Acá el número quedó CONGELADO al cortar y no se toca:
//      mientras el cajero cuenta, el operador que lo relevó está vendiendo, y
//      releer el resumen le imputaría a este cierre plata que nunca tuvo en la
//      mano. Todo lo monetario sale de CierrePreparacion.
//
//   2. LA IDENTIDAD SALE DEL TOKEN, no del operador activo. La cookie del
//      operario es del NAVEGADOR ENTERO: cuando el relevo hace login en la
//      pestaña del POS, esta pestaña —que revalida al recuperar el foco— pasaría
//      a ver al operador nuevo. Acá no se lee esa cookie en ningún momento; el
//      operador que figura es el que el servidor grabó al tomar el corte.
//
// Todo lo demás —contar por denominación, elegir el cambio, ver los movimientos,
// el resumen— es exactamente el mismo componente que usa el retiro.

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
  PanelCambio,
  PanelResumen,
  PanelMovimientos,
  ResumenCabecera,
} from "@/components/caja/PanelesRetiro";
import {
  AvisoCorteHecho,
  FilasResumenCierre,
  TITULO_CIERRE,
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
  guardarBorradorCierre,
  leerBorradorCierre,
  descartarBorradorCierre,
  limpiarBorradoresCierreViejos,
  sanearDesglose,
} from "@/lib/caja/borradorCierre";

const AYUDA_CAMBIO =
  "Elegí los billetes y monedas que quedan disponibles para el siguiente operador. Todo lo demás se retira.";

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

  const [desgloseContado, setDesgloseContado] = useState({});
  const [desgloseCambio, setDesgloseCambio] = useState({});
  const [observacion, setObservacion] = useState("");
  const [conteoIniciadoEn, setConteoIniciadoEn] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const storage = typeof window !== "undefined" ? window.localStorage : null;

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
            diferencia: calcularDiferencia(r.cierre.totalContado ?? 0, r.cierre.efectivoEsperadoCorte),
            turnoId: r.cierre.turnoId,
          });
          return;
        }

        // El borrador va por TOKEN: quien recupere este cierre encuentra lo
        // contado aunque no sea quien lo empezó.
        limpiarBorradoresCierreViejos(storage);
        const b = leerBorradorCierre(storage, token);
        if (b) {
          setDesgloseContado(sanearDesglose(b.desgloseContado));
          setDesgloseCambio(sanearDesglose(b.desgloseCambio));
          setObservacion(b.observacion || "");
          setConteoIniciadoEn(b.conteoIniciadoEn || null);
          setAviso("Recuperamos lo que habías contado en esta caja.");
        }
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

  // ── Derivados: todo contra el esperado CONGELADO ─────────────────────────
  const esperado = datos?.cierre?.efectivoEsperadoCorte ?? null;
  const totalContado = totalDesglose(desgloseContado);
  const hayContado = !desgloseVacio(desgloseContado);
  const totalCambio = totalDesglose(desgloseCambio);

  const totalRetiro = useMemo(
    () => calcularRetiroDesdeCambio({ efectivoContado: totalContado, cambioQueQueda: totalCambio }),
    [totalContado, totalCambio]
  );
  const diferencia = useMemo(
    () => calcularDiferencia(totalContado, esperado ?? 0),
    [totalContado, esperado]
  );

  const validacionCambio = validarCambioQueQueda({
    desgloseContado,
    desgloseCambio,
    totalContado,
  });

  // Se puede cerrar con retiro $0 —todo el efectivo queda como cambio—, que en un
  // cierre es un caso legítimo: el turno siguiente se lleva el cajón entero. Por
  // eso no se exige recaudación, a diferencia del retiro.
  const puedeConfirmar = hayContado && validacionCambio.valido && !guardando;

  const actualizarConteo = (nuevo) => {
    setDesgloseContado(nuevo);
    setDesgloseCambio((c) => limitarCambioAlConteo(c, nuevo));
    if (!conteoIniciadoEn) setConteoIniciadoEn(new Date().toISOString());
  };

  // ── Borrador ─────────────────────────────────────────────────────────────
  const persistir = useCallback(() => {
    if (!token) return false;
    return guardarBorradorCierre(
      storage,
      armarBorradorCierre({
        token,
        desgloseContado,
        desgloseCambio,
        observacion,
        conteoIniciadoEn,
      })
    );
  }, [token, storage, desgloseContado, desgloseCambio, observacion, conteoIniciadoEn]);

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
      const res = await fetch(`/api/pos-ventas/cierres/${encodeURIComponent(token)}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose. Los totales los calcula el servidor: mandarlos sería
        // ofrecerle al backend un número que no tiene por qué creer.
        body: JSON.stringify({
          desgloseContado,
          desgloseCambio,
          observacion: observacion.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo confirmar el cierre.");
        return;
      }
      descartarBorradorCierre(storage, token);
      setResultado({
        totalContado: json.cuentas?.totalContado ?? totalContado,
        totalCambio: json.cuentas?.totalCambio ?? totalCambio,
        retiroFinal: json.cuentas?.retiroFinal ?? totalRetiro,
        diferencia: json.cuentas?.diferencia ?? diferencia,
        turnoId: json.cierre?.turnoId ?? datos?.cierre?.turnoId ?? null,
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
                El cambio quedó disponible para el siguiente operador.
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

  const cierre = datos?.cierre;

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

      <ResumenCabecera
        esperado={esperado}
        totalContado={totalContado}
        hayContado={hayContado}
        diferencia={diferencia}
        totalCambio={totalCambio}
        totalRetiro={totalRetiro}
        etiquetaEsperado="Efectivo esperado al corte"
      />

      {/* Misma disposición que el retiro: en móvil los movimientos van arriba,
          antes de contar, porque explican por qué el esperado no es lo vendido. */}
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
          ayuda={AYUDA_CAMBIO}
        />

        <PanelResumen
          esperado={esperado}
          totalContado={totalContado}
          hayContado={hayContado}
          totalCambio={totalCambio}
          totalRetiro={totalRetiro}
          diferencia={diferencia}
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
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1400px] mx-auto">{children}</div>;
}
