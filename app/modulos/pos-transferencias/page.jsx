"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

export default function PosTransferenciasHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [modo, setModo] = useState(null);

  // DEPÓSITO
  const [origenDeposito, setOrigenDeposito] = useState(null);
  const [destinosDeposito, setDestinosDeposito] = useState([]);
  const [destinoIdDeposito, setDestinoIdDeposito] = useState("");

  // ADMIN
  const [grupos, setGrupos] = useState([]);
  const [grupoIdSel, setGrupoIdSel] = useState("");

  const [depositosGrupo, setDepositosGrupo] = useState([]);
  const [localesGrupo, setLocalesGrupo] = useState([]);

  const [origenIdAdmin, setOrigenIdAdmin] = useState("");
  const [destinoIdAdmin, setDestinoIdAdmin] = useState("");

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

        // -------------------------
        // MODO DEPÓSITO
        // -------------------------
        if (jsonOpt.modo === "deposito") {
          const origen = jsonOpt.origen || null;
          const destinos = jsonOpt.destinos || [];

          setOrigenDeposito(origen);
          setDestinosDeposito(destinos);

          setDestinoIdDeposito(destinos[0]?.id ? String(destinos[0].id) : "");
        }

        // -------------------------
        // MODO ADMIN
        // -------------------------
        if (jsonOpt.modo === "admin") {
          const gruposData = jsonOpt.grupos || [];
          setGrupos(gruposData);

          if (gruposData.length > 0) {
            const g0 = gruposData[0];
            setGrupoIdSel(String(g0.id));

            const deps = g0.depositos || [];
            const locs = g0.locales || [];

            setDepositosGrupo(deps);
            setLocalesGrupo(locs);

            setOrigenIdAdmin(deps[0]?.id ? String(deps[0].id) : "");
            setDestinoIdAdmin(locs[0]?.id ? String(locs[0].id) : "");
          }
        }

        setLoading(false);
      } catch (err) {
        console.error("Error cargando POS:", err);
        setError("Error cargando opciones");
        setLoading(false);
      }
    };

    cargar();
  }, []);

  // ========================================================
  // CAMBIOS ADMIN
  // ========================================================
  const handleChangeGrupo = (grupoIdStr) => {
    setGrupoIdSel(grupoIdStr);

    const grupoId = Number(grupoIdStr);
    const g = grupos.find((x) => x.id === grupoId);

    if (!g) {
      setDepositosGrupo([]);
      setLocalesGrupo([]);
      setOrigenIdAdmin("");
      setDestinoIdAdmin("");
      return;
    }

    const deps = g.depositos || [];
    const locs = g.locales || [];

    setDepositosGrupo(deps);
    setLocalesGrupo(locs);

    setOrigenIdAdmin(deps[0]?.id ? String(deps[0].id) : "");
    setDestinoIdAdmin(locs[0]?.id ? String(locs[0].id) : "");
  };

  // ========================================================
  // INICIAR TRANSFERENCIA
  // ========================================================
  const iniciarTransferencia = () => {
    let origenId = null;
    let destinoId = null;

    if (modo === "deposito") {
      if (!origenDeposito || !destinoIdDeposito) {
        setError("Seleccioná un local destino");
        return;
      }
      origenId = origenDeposito.id;
      destinoId = Number(destinoIdDeposito);
    }

    if (modo === "admin") {
      if (!grupoIdSel || !origenIdAdmin || !destinoIdAdmin) {
        setError("Seleccioná grupo, depósito y local destino");
        return;
      }
      origenId = Number(origenIdAdmin);
      destinoId = Number(destinoIdAdmin);
    }

    if (!origenId || !destinoId || origenId === destinoId) {
      setError("Origen y destino deben ser distintos");
      return;
    }

    router.push(
      `/modulos/pos-transferencias/nueva?origenId=${origenId}&destinoId=${destinoId}`
    );
  };

  // ========================================================
  // ESTADOS SIMPLES
  // ========================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-slate-300">Cargando opciones...</span>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-red-400">
          No se encontró usuario actual.
        </span>
      </div>
    );
  }

  // ========================================================
  // UI SUNMI V2
  // ========================================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
        {/* VOLVER */}
        <button
          type="button"
          onClick={() => router.back()}
          className="
            text-xs text-cyan-400 
            hover:text-cyan-300 
            flex items-center gap-1
            transition
          "
        >
          ← Volver
        </button>

        <SunmiCard>
          {/* ERROR DENTRO DE LA CARD */}
          {error && (
            <div className="mb-3 text-[11px] text-red-400 bg-red-900/20 border border-red-500/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* =============================
              MODO DEPÓSITO
          ============================= */}
          {modo === "deposito" && origenDeposito && (
            <>
              <SunmiSeparator label="Preparar transferencia desde Depósito" />

              <div className="space-y-4 text-[13px]">
                {/* RESUMEN ORIGEN */}
                <div
                  className="
                    bg-slate-900/80 
                    border border-slate-700 
                    rounded-2xl 
                    px-4 py-3
                    flex flex-col sm:flex-row sm:items-center sm:justify-between
                    gap-2
                  "
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Depósito origen
                    </div>
                    <div className="text-[14px] font-semibold text-slate-100">
                      {origenDeposito.nombre}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Seleccioná el local destino y comenzá la sesión POS.
                  </div>
                </div>

                {/* SELECT DESTINO SUNMI */}
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    Local destino
                  </div>

                  <SunmiSelectAdv
                    value={destinoIdDeposito}
                    placeholder="Seleccionar local destino"
                    onChange={(value) => setDestinoIdDeposito(value)}
                  >
                    {destinosDeposito.map((l) => (
                      <div key={l.id} value={String(l.id)}>
                        {l.nombre}
                      </div>
                    ))}
                  </SunmiSelectAdv>
                </div>

                {/* BOTÓN INICIAR */}
                <div className="pt-2">
                  <SunmiButton
                    color="amber"
                    disabled={!destinoIdDeposito}
                    onClick={iniciarTransferencia}
                  >
                    Iniciar transferencia desde depósito
                  </SunmiButton>
                </div>
              </div>
            </>
          )}

          {/* =============================
              MODO ADMIN
          ============================= */}
          {modo === "admin" && (
            <>
              <SunmiSeparator label="Preparar transferencia como Admin" />

              <div className="space-y-4 text-[13px]">
                {/* GRUPO */}
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    Grupo
                  </div>

                  <SunmiSelectAdv
                    value={grupoIdSel}
                    placeholder="Seleccionar grupo"
                    onChange={(value) => handleChangeGrupo(value)}
                  >
                    {grupos.map((g) => (
                      <div key={g.id} value={String(g.id)}>
                        {g.nombre}
                      </div>
                    ))}
                  </SunmiSelectAdv>
                </div>

                {/* ORIGEN / DESTINO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* DEPÓSITO ORIGEN */}
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Depósito origen
                    </div>

                    <SunmiSelectAdv
                      value={origenIdAdmin}
                      placeholder="Seleccionar depósito"
                      onChange={(value) => setOrigenIdAdmin(value)}
                    >
                      {depositosGrupo.map((d) => (
                        <div key={d.id} value={String(d.id)}>
                          {d.nombre}
                        </div>
                      ))}
                    </SunmiSelectAdv>
                  </div>

                  {/* LOCAL DESTINO */}
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Local destino
                    </div>

                    <SunmiSelectAdv
                      value={destinoIdAdmin}
                      placeholder="Seleccionar local"
                      onChange={(value) => setDestinoIdAdmin(value)}
                    >
                      {localesGrupo.map((l) => (
                        <div key={l.id} value={String(l.id)}>
                          {l.nombre}
                        </div>
                      ))}
                    </SunmiSelectAdv>
                  </div>
                </div>

                {/* BOTÓN INICIAR */}
                <div className="pt-2">
                  <SunmiButton
                    color="cyan"
                    disabled={!origenIdAdmin || !destinoIdAdmin}
                    onClick={iniciarTransferencia}
                  >
                    Iniciar transferencia admin
                  </SunmiButton>
                </div>
              </div>
            </>
          )}

          {/* SI NO HAY MODO DEFINIDO */}
          {!modo && (
            <div className="text-[12px] text-slate-400">
              No se configuró el modo de POS para este usuario.
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
