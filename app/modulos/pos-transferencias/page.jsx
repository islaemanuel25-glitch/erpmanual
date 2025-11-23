"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
          return setLoading(false);
        }

        setMe(jsonMe.user);

        // 2. Opciones de POS
        const resOpt = await fetch("/api/pos-transferencias/opciones", {
          cache: "no-store",
        });
        const jsonOpt = await resOpt.json();

        if (!jsonOpt.ok) {
          setError(jsonOpt.error || "No se pudieron cargar las opciones");
          return setLoading(false);
        }

        setModo(jsonOpt.modo);

        // -------------------------
        // MODO DEPÓSITO
        // -------------------------
        if (jsonOpt.modo === "deposito") {
          const origen = jsonOpt.origen || null; // 🔥 FIX
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
  // UI
  // ========================================================
  if (loading) return <div className="p-4">Cargando opciones...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  if (!me) return <div>No se encontró usuario</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">POS Transferencias</h1>

      <div className="text-sm text-gray-600 mb-4">
        Usuario: <strong>{me.nombre}</strong>
      </div>

      {/* =============================
          DEPÓSITO
      ============================= */}
      {modo === "deposito" && origenDeposito && (
        <div className="space-y-4 border rounded-lg p-4 bg-white shadow-sm">
          <div>
            <div className="text-xs text-gray-500 uppercase mb-1">
              Depósito origen
            </div>
            <div className="text-sm font-medium">
              {origenDeposito.nombre}
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block text-gray-500">
              Local destino
            </label>
            <select
              className="border rounded px-2 py-1 text-sm w-full max-w-xs"
              value={destinoIdDeposito}
              onChange={(e) => setDestinoIdDeposito(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {destinosDeposito.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>

          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded"
            disabled={!destinoIdDeposito}
            onClick={iniciarTransferencia}
          >
            Iniciar transferencia
          </button>
        </div>
      )}

      {/* =============================
          ADMIN
      ============================= */}
      {modo === "admin" && (
        <div className="space-y-4 border rounded-lg p-4 bg-white shadow-sm">
          <div>
            <label className="text-xs mb-1 block text-gray-500">Grupo</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full max-w-xs"
              value={grupoIdSel}
              onChange={(e) => handleChangeGrupo(e.target.value)}
            >
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1 block text-gray-500">
                Depósito origen
              </label>
              <select
                className="border rounded px-2 py-1 text-sm w-full"
                value={origenIdAdmin}
                onChange={(e) => setOrigenIdAdmin(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {depositosGrupo.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs mb-1 block text-gray-500">
                Local destino
              </label>
              <select
                className="border rounded px-2 py-1 text-sm w-full"
                value={destinoIdAdmin}
                onChange={(e) => setDestinoIdAdmin(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {localesGrupo.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded"
            disabled={!origenIdAdmin || !destinoIdAdmin}
            onClick={iniciarTransferencia}
          >
            Iniciar transferencia
          </button>
        </div>
      )}
    </div>
  );
}
