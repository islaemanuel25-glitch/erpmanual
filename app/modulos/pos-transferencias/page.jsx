"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  SelectoresAdmin,
  SelectoresDeposito,
  useTransferenciaSinPedido,
} from "@/components/pos-transferencias/TransferenciaSinPedido";
import EntradaDepositoCelular from "@/components/pos-transferencias/EntradaDepositoCelular";
import { useEsEscritorio } from "@/lib/layout/useEsEscritorio";

// ── UNA PÁGINA, DOS PANTALLAS ─────────────────────────────────────────────
//
// Por debajo de 1024 px, el depósito y el admin ven "Pedidos de locales"
// (`components/pos-transferencias/EntradaDepositoCelular.jsx`, 2026-10-22). Desde
// 1024 px, y para un LOCAL en cualquier ancho, la pantalla de siempre, más
// abajo. Se monta UNA, la del ancho real, como en Pedidos (`useEsEscritorio`);
// mientras no se sabe, el mismo "Cargando opciones...".
export default function PaginaPosTransferencias() {
  const esEscritorio = useEsEscritorio();
  if (esEscritorio === null) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando opciones...</span>
      </div>
    );
  }
  return esEscritorio ? (
    <PosTransferenciasHomePage />
  ) : (
    <EntradaDepositoCelular PantallaDeSiempre={PosTransferenciasHomePage} />
  );
}

function PosTransferenciasHomePage() {
  const router = useRouter();
  const { perfil: perfilCtx, cargando: cargandoCtx } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [modo, setModo] = useState(null);

  // DEPÓSITO y ADMIN: los selectores de una transferencia sin pedido, que
  // comparte con la entrada del celular (`TransferenciaSinPedido`).
  const sinPedido = useTransferenciaSinPedido();

  // LOCAL
  const [localInfo, setLocalInfo] = useState(null);
  const [depositoInfo, setDepositoInfo] = useState(null);

  // SOLICITADOS
  const [solicitados, setSolicitados] = useState([]);
  const [loadingSolicitados, setLoadingSolicitados] = useState(false);

  // ========================================================
  // CARGAR DATOS
  // ========================================================
  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        setError("");

        // 1. Usuario actual
        const resMe = await fetch("/api/me", { cache: "no-store" });
        const jsonMe = await resMe.json();

        if (!jsonMe.ok || !jsonMe.user) {
          setError("No se pudo obtener el usuario actual");
          setLoading(false);
          return;
        }

        setMe(jsonMe.user);

        // 2. Opciones de POS
        const resOpt = await fetch("/api/pos-transferencias/opciones", {
          cache: "no-store",
        });
        const jsonOpt = await resOpt.json();

        if (!jsonOpt.ok) {
          setError(jsonOpt.error || "No se pudieron cargar las opciones");
          setLoading(false);
          return;
        }

        setModo(jsonOpt.modo);

        // MODO DEPÓSITO y MODO ADMIN
        sinPedido.cargarOpciones(jsonOpt);

        // -------------------------
        // MODO LOCAL (G1)
        // -------------------------
        if (jsonOpt.modo === "local") {
          setLocalInfo(jsonOpt.local || null);
          setDepositoInfo(jsonOpt.deposito || null);
        }

        setLoading(false);

        // 3. Cargar solicitados (para todos los modos)
        cargarSolicitados();
      } catch (err) {
        console.error("Error cargando POS:", err);
        setError("Error cargando opciones");
        setLoading(false);
      }
    };

    cargar();
  }, []);

  // ========================================================
  // CARGAR SOLICITADOS
  // ========================================================
  const cargarSolicitados = async () => {
    setLoadingSolicitados(true);
    try {
      const res = await fetch("/api/pos-transferencias/solicitados", {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) {
        setSolicitados(json.items || []);
      }
    } catch (err) {
      console.error("Error cargando solicitados:", err);
    }
    setLoadingSolicitados(false);
  };

  // ========================================================
  // INICIAR TRANSFERENCIA (la lógica vive en `TransferenciaSinPedido`)
  // ========================================================
  const iniciarTransferencia = () => sinPedido.iniciarTransferencia(modo, setError);

  // ========================================================
  // ESTADOS SIMPLES
  // ========================================================
  if (cargandoCtx || loading) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando opciones...</span>
      </div>
    );
  }

  const permisosPt = perfilCtx?.permisos || [];
  const esAdminPt = Array.isArray(permisosPt) && permisosPt.includes("*");
  if (!esAdminPt && !permisosPt.includes("pos_transferencias.ver")) return <SinPermisos />;

  if (!me) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-danger">
          No se encontró usuario actual.
        </span>
      </div>
    );
  }

  // ========================================================
  // FORMATEAR FECHA
  // ========================================================
  const formatFecha = (iso) => {
    // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
    return fechaHoraAR(iso, { vacio: "-" });
  };

  // ========================================================
  // UI SUNMI V2
  // ========================================================
  return (
    <div className="min-h-screen sunmi-bg">
      <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
        {/* VOLVER */}
        <button
          type="button"
          onClick={() => router.back()}
          className="
            text-xs sunmi-link
            flex items-center gap-1
            transition
          "
        >
          ← Volver
        </button>

        <SunmiCard>
          <SunmiHeader
            title="POS · Transferencias"
            color="amber"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] mt-1">
              <div className="text-slate-900/80">
                Usuario:{" "}
                <span className="font-semibold">
                  {me?.nombre || "-"}
                </span>
              </div>
              <div className="text-slate-900/70 mt-1 sm:mt-0">
                Modo:{" "}
                <span className="font-semibold">
                  {modo === "deposito"
                    ? "Depósito"
                    : modo === "admin"
                    ? "Admin"
                    : modo === "local"
                    ? "Local"
                    : "-"}
                </span>
              </div>
            </div>
          </SunmiHeader>

          {/* ERROR DENTRO DE LA CARD */}
          {error && (
            <div className="mb-3 text-[11px] sunmi-text-danger sunmi-state-danger rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* =============================
              MODO LOCAL (G1)
          ============================= */}
          {modo === "local" && localInfo && depositoInfo && (
            <>
              <SunmiSeparator label="Pedir mercadería al Depósito" />

              <div className="space-y-4 text-[13px]">
                <div
                  className="
                    sunmi-surface
                    border sunmi-border
                    rounded-2xl
                    px-4 py-3
                    flex flex-col sm:flex-row sm:items-center sm:justify-between
                    gap-2
                  "
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-wide sunmi-text-muted">
                      Tu local
                    </div>
                    <div className="text-[14px] font-semibold">
                      {localInfo.nombre}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide sunmi-text-muted">
                      Depósito
                    </div>
                    <div className="text-[14px] font-semibold">
                      {depositoInfo.nombre}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <SunmiButton
                    color="cyan"
                    onClick={() =>
                      router.push("/modulos/pos-transferencias/nueva?modo=manual")
                    }
                  >
                    Crear pedido manual
                  </SunmiButton>
                </div>
              </div>
            </>
          )}

          {/* =============================
              MODO DEPÓSITO
          ============================= */}
          {modo === "deposito" && sinPedido.origenDeposito && (
            <>
              <SunmiSeparator label="Preparar transferencia desde Depósito" />

              <SelectoresDeposito s={sinPedido} onIniciar={iniciarTransferencia} />
            </>
          )}

          {/* =============================
              MODO ADMIN
          ============================= */}
          {modo === "admin" && (
            <>
              <SunmiSeparator label="Preparar transferencia como Admin" />

              <SelectoresAdmin s={sinPedido} onIniciar={iniciarTransferencia} />
            </>
          )}

          {/* SI NO HAY MODO DEFINIDO */}
          {!modo && (
            <div className="text-[12px] sunmi-text-muted">
              No se configuró el modo de POS para este usuario.
            </div>
          )}

          {/* =============================
              PEDIDOS SOLICITADOS (G2/G3)
          ============================= */}
          {solicitados.length > 0 && (
            <>
              <SunmiSeparator
                label={
                  modo === "local"
                    ? "Mis pedidos solicitados"
                    : "Pedidos solicitados por locales"
                }
              />

              <div className="space-y-2">
                {solicitados.map((s) => (
                  <div
                    key={s.id}
                    onClick={() =>
                      router.push(
                        `/modulos/pos-transferencias/nueva?posId=${s.id}`
                      )
                    }
                    className="
                      sunmi-btn-accent-soft
                      rounded-xl
                      px-4 py-3
                      cursor-pointer
                      transition
                    "
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="
                            px-2 py-0.5
                            text-[9px] font-semibold
                            rounded-full
                            sunmi-btn-accent-soft
                          "
                        >
                          Solicitado
                        </span>
                        <span className="text-[13px] font-medium">
                          {modo === "local"
                            ? `→ ${s.origenNombre}`
                            : `${s.destinoNombre} →`}
                        </span>
                      </div>

                      <div className="text-[11px] sunmi-text-muted">
                        {s.itemCount} {s.itemCount === 1 ? "producto" : "productos"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[11px] sunmi-text-muted">
                      <span>
                        Solicitado por {s.solicitadoPorNombre}
                      </span>
                      <span>
                        {formatFecha(s.solicitadoAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loadingSolicitados && solicitados.length === 0 && modo !== "local" && modo && (
            <div className="text-[11px] sunmi-text-muted mt-2">
              No hay pedidos solicitados pendientes.
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
