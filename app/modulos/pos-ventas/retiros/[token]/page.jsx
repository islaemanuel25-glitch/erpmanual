"use client";

// RETIRO DE RECAUDACIÓN — contar el dinero retirado, con el corte ya tomado.
//
// SE CUENTA UNA SOLA PILA
//
// El cambio se separó, se contó y se congeló ANTES del corte. Acá se muestra
// como solo lectura —para poder verificarlo— y lo único que se cuenta es el
// dinero que se retira.
//
// LOS NÚMEROS NO SE VUELVEN A LEER. El esperado y el retiro esperado quedaron
// congelados al cortar, y todo lo monetario sale de RetiroPreparacion.
//
// LA CAJA SIGUE VENDIENDO, Y ESO NO CAMBIA NADA ACÁ
//
// A diferencia del cierre, este turno NO se congela: el POS opera con normalidad
// mientras se cuenta. Si entraron ventas o movimientos, se muestra un aviso
// informativo y nada más. La versión anterior hacía lo contrario —detectaba el
// movimiento y adoptaba un esperado nuevo, pidiendo reconfirmar—, y eso es
// exactamente lo que producía el faltante falso.

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
  PanelConteoRetiro,
  PanelCambioSeparado,
  PanelResumenCorte,
  PanelMovimientos,
  ResumenCabeceraCorte,
} from "@/components/caja/PanelesRetiro";
import { AvisoCorteHecho, hora } from "@/components/caja/PanelesCierre";

import { totalDesglose, desgloseVacio } from "@/lib/caja/conteoBilletes";
import { calcularDiferencia } from "@/lib/caja/efectivoEsperado";
import { TITULO_RETIRO, AVISO_CONTAR_SOLO_RETIRO, AVISO_ACTIVIDAD_POSTERIOR } from "@/lib/caja/retiroRelevo";
import {
  armarBorrador,
  guardarBorrador,
  leerBorrador,
  descartarBorrador,
  limpiarBorradoresVencidos,
  sanearDesglose,
} from "@/lib/caja/borradorRetiro";

export default function RetiroPorTokenPage() {
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

  const [desgloseRetiro, setDesgloseRetiro] = useState({});
  const [observacion, setObservacion] = useState("");
  const [conteoIniciadoEn, setConteoIniciadoEn] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const storage = typeof window !== "undefined" ? window.localStorage : null;

  // ── Carga: UNA sola vez, desde el corte congelado ────────────────────────
  //
  // No hay polling ni revalidación de importes. El aviso de actividad posterior
  // llega en esta misma respuesta y es informativo: volver a consultar sólo
  // abriría la puerta a mostrar un número distinto del que se va a registrar.
  useEffect(() => {
    if (cargandoUser || !puedeUsar || !token) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos-ventas/retiros/${encodeURIComponent(token)}`, {
          credentials: "include",
          cache: "no-store",
        }).then((x) => x.json());

        if (!vivo) return;
        if (!r?.ok) {
          setErrorFatal(r?.error || "No se encontró este retiro.");
          return;
        }
        setDatos(r);

        if (r.retiro?.estado === "CONFIRMADO") {
          setResultado({
            totalRetiroContado: r.retiro.totalRetiroContado,
            totalCambio: r.retiro.totalCambio,
            diferencia: r.retiro.diferencia,
            turnoId: r.retiro.turnoId,
          });
          return;
        }
        if (r.retiro?.estado === "CANCELADO") {
          setErrorFatal("Este retiro fue cancelado.");
          return;
        }

        // El borrador va por TOKEN: quien recupere este retiro encuentra lo
        // contado aunque no sea quien lo empezó.
        limpiarBorradoresVencidos(storage);
        const b = leerBorrador(storage, token);
        if (b) {
          setDesgloseRetiro(sanearDesglose(b.desgloseRetiroContado));
          setObservacion(b.observacion || "");
          setConteoIniciadoEn(b.conteoIniciadoEn || null);
          setAviso("Recuperamos lo que habías contado en este retiro.");
        }
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el retiro.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token, cargandoUser, puedeUsar, storage]);

  // ── Derivados: todo contra los dos números congelados ────────────────────
  const retiro = datos?.retiro;
  const esperado = retiro?.efectivoEsperadoCorte ?? null;
  const cambioSeparado = retiro?.totalCambio ?? 0;
  const retiroEsperado = retiro?.efectivoRetiradoEsperado ?? null;

  const retiroContado = totalDesglose(desgloseRetiro);
  const hayContado = !desgloseVacio(desgloseRetiro);
  const diferencia = useMemo(
    () => calcularDiferencia(retiroContado, retiroEsperado ?? 0),
    [retiroContado, retiroEsperado]
  );

  const puedeConfirmar = hayContado && !guardando;

  const actualizarConteo = (nuevo) => {
    setDesgloseRetiro(nuevo);
    if (!conteoIniciadoEn) setConteoIniciadoEn(new Date().toISOString());
  };

  // ── Borrador ─────────────────────────────────────────────────────────────
  const persistir = useCallback(() => {
    if (!token) return false;
    return guardarBorrador(
      storage,
      armarBorrador({
        token,
        desgloseRetiroContado: desgloseRetiro,
        observacion,
        conteoIniciadoEn,
      })
    );
  }, [token, storage, desgloseRetiro, observacion, conteoIniciadoEn]);

  const guardarSolo = () => {
    persistir();
    setAviso("Conteo guardado. Podés volver cuando quieras.");
  };

  const salir = () => {
    persistir();
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push("/modulos/pos-ventas");
  };

  // ── Confirmar ────────────────────────────────────────────────────────────
  const confirmar = async () => {
    if (!puedeConfirmar || guardando || !token) return;
    setError("");
    setGuardando(true);
    try {
      const res = await fetch(`/api/pos-ventas/retiros/${encodeURIComponent(token)}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose. Los totales los calcula el servidor.
        body: JSON.stringify({
          desgloseRetiroContado: desgloseRetiro,
          observacion: observacion.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo registrar el retiro.");
        return;
      }
      descartarBorrador(storage, token);
      setResultado({
        totalRetiroContado: json.cuentas?.totalRetiroContado ?? retiroContado,
        totalCambio: json.cuentas?.totalCambio ?? cambioSeparado,
        diferencia: json.cuentas?.diferencia ?? diferencia,
        turnoId: json.retiro?.turnoId ?? retiro?.turnoId ?? null,
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
            onClick={() => router.push("/modulos/pos-ventas")}
            className="w-full py-3"
          >
            Volver al POS
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
              <div className="text-base font-bold sunmi-text-success">Retiro registrado</div>
              <div className="text-[12px] sunmi-text-muted">
                El descuento ya está aplicado. La caja sigue con el cambio separado más lo
                vendido después del corte.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cifra
              label="Se retiró"
              valor={resultado.totalRetiroContado}
              clase="sunmi-text-accent"
              destacado
            />
            <Cifra label="Quedó de cambio" valor={resultado.totalCambio} />
            <Cifra
              label="Diferencia al contar"
              valor={resultado.diferencia}
              clase={tonoDiferencia(resultado.diferencia)}
            />
          </div>
          <SunmiButton color="amber" onClick={salir} className="w-full py-3 font-bold">
            {enPestanaNueva ? "Cerrar esta pestaña" : "Volver al POS"}
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  const hayPosterior = datos?.actividadPosterior?.hay === true;

  return (
    <Marco>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_RETIRO}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Turno #{retiro?.turnoId} ·{" "}
              <span className="sunmi-text-success font-semibold">abierto</span> ·{" "}
              {datos?.local?.nombre || "—"}
            </p>
            <p className="text-[11px] sunmi-text-muted leading-tight">
              Retira {datos?.operadorRetiro?.nombre || datos?.turno?.cajeroNombre || "—"}
            </p>
            {enPestanaNueva && (
              <p className="text-[11px] sunmi-text-accent leading-tight mt-0.5">
                Podés seguir vendiendo desde la pestaña del POS.
              </p>
            )}
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

      <AvisoCorteHecho corteEn={retiro?.corteEn} />

      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      <ResumenCabeceraCorte
        esperado={esperado}
        cambioSeparado={cambioSeparado}
        retiroEsperado={retiroEsperado}
        retiroContado={retiroContado}
        hayContado={hayContado}
        diferencia={diferencia}
      />

      {/* En MÓVIL los movimientos van arriba, antes de contar: explican por qué
          el esperado no es lo que se vendió. */}
      <div className="xl:hidden">
        <PanelMovimientos movimientos={datos?.movimientos} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <PanelConteoRetiro
          desglose={desgloseRetiro}
          onDesglose={actualizarConteo}
          horaConteo={conteoIniciadoEn ? hora(conteoIniciadoEn) : null}
          aviso={AVISO_CONTAR_SOLO_RETIRO}
        />

        <PanelCambioSeparado
          desglose={retiro?.desgloseCambio ?? {}}
          total={cambioSeparado}
          nota="Sigue en la caja: con ese dinero el POS puede seguir dando vuelto."
        />

        <PanelResumenCorte
          esperado={esperado}
          cambioSeparado={cambioSeparado}
          retiroEsperado={retiroEsperado}
          retiroContado={retiroContado}
          hayContado={hayContado}
          diferencia={diferencia}
          observacion={observacion}
          onObservacion={setObservacion}
          avisoPosterior={hayPosterior ? AVISO_ACTIVIDAD_POSTERIOR : null}
          error={error}
          guardando={guardando}
          puedeConfirmar={puedeConfirmar}
          enPestanaNueva={enPestanaNueva}
          onGuardar={guardarSolo}
          onVolver={salir}
          onConfirmar={confirmar}
          textoConfirmar="Confirmar retiro"
          textoConfirmando="Registrando…"
          textoGuardar="Guardar borrador"
          textoCerrarPestana="Cerrar esta pestaña"
          textoVolver="Guardar y volver al POS"
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
