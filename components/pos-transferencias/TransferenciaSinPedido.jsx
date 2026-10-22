"use client";

// components/pos-transferencias/TransferenciaSinPedido.jsx
//
// ARRANCAR UNA TRANSFERENCIA QUE NADIE PIDIÓ: el depósito, o el admin eligiendo
// grupo y depósito, eligen el local de destino y van a la pantalla de preparar
// con los sugeridos por stock.
//
// Salió de `app/modulos/pos-transferencias/page.jsx` tal cual el 2026-10-22,
// cuando la entrada del depósito en el celular la necesitó detrás de su botón
// "Transferencia sin pedido". La computadora la sigue dibujando igual: lo
// compara contra el HTML de antes `entradaEscritorioIgual.test.mjs`.
//
// Con UNA diferencia de texto y ninguna de píxeles: los tamaños de letra
// escritos a mano (`text-[11px]`, `text-[13px]`, `text-[14px]`) pasaron a sus
// tokens (`text-sm2`, `text-sm3`, `text-base`), que en `tailwind.config.js`
// son exactamente 11, 13 y 14 px y nada más. Mudados tal cual habrían entrado
// al trinquete como hardcodeo nuevo en un archivo nuevo.
//
//   · `useTransferenciaSinPedido()`: el estado de los selectores, cómo se carga
//     de `/api/pos-transferencias/opciones` y cómo se inicia.
//   · `SelectoresDeposito` y `SelectoresAdmin`: lo que se dibuja en cada modo.

import { useState } from "react";
import { useRouter } from "next/navigation";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

export function useTransferenciaSinPedido() {
  const router = useRouter();

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

  /** Lo que trae `/api/pos-transferencias/opciones`, en los modos depósito y admin. */
  const cargarOpciones = (jsonOpt) => {
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
  };

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
  const iniciarTransferencia = (modo, setError) => {
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

  return {
    origenDeposito,
    destinosDeposito,
    destinoIdDeposito,
    setDestinoIdDeposito,
    grupos,
    grupoIdSel,
    depositosGrupo,
    localesGrupo,
    origenIdAdmin,
    setOrigenIdAdmin,
    destinoIdAdmin,
    setDestinoIdAdmin,
    cargarOpciones,
    handleChangeGrupo,
    iniciarTransferencia,
  };
}

/** El depósito: su nombre, el local de destino y el botón de iniciar. */
export function SelectoresDeposito({ s, onIniciar }) {
  return (
              <div className="space-y-4 text-sm3">
                {/* RESUMEN ORIGEN */}
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
                    <div className="text-sm2 uppercase tracking-wide sunmi-text-muted">
                      Depósito origen
                    </div>
                    <div className="text-base font-semibold">
                      {s.origenDeposito.nombre}
                    </div>
                  </div>

                  <div className="text-sm2 sunmi-text-muted">
                    Seleccioná el local destino y comenzá la sesión POS.
                  </div>
                </div>

                {/* SELECT DESTINO SUNMI */}
                <div className="space-y-1">
                  <div className="text-sm2 uppercase tracking-wide sunmi-text-muted">
                    Local destino
                  </div>

                  <SunmiSelectAdv
                    value={s.destinoIdDeposito}
                    placeholder="Seleccionar local destino"
                    onChange={(value) => s.setDestinoIdDeposito(value)}
                    className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
                  >
                    {s.destinosDeposito.map((l) => (
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
                    disabled={!s.destinoIdDeposito}
                    onClick={onIniciar}
                  >
                    Iniciar transferencia desde depósito
                  </SunmiButton>
                </div>
              </div>
  );
}

/** El admin: grupo, depósito de origen, local de destino y el botón de iniciar. */
export function SelectoresAdmin({ s, onIniciar }) {
  return (
              <div className="space-y-4 text-sm3">
                {/* GRUPO */}
                <div className="space-y-1">
                  <div className="text-sm2 uppercase tracking-wide sunmi-text-muted">
                    Grupo
                  </div>

                  <SunmiSelectAdv
                    value={s.grupoIdSel}
                    placeholder="Seleccionar grupo"
                    onChange={(value) => s.handleChangeGrupo(value)}
                    className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
                  >
                    {s.grupos.map((g) => (
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
                    <div className="text-sm2 uppercase tracking-wide sunmi-text-muted">
                      Depósito origen
                    </div>

                    <SunmiSelectAdv
                      value={s.origenIdAdmin}
                      placeholder="Seleccionar depósito"
                      onChange={(value) => s.setOrigenIdAdmin(value)}
                      className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
                    >
                      {s.depositosGrupo.map((d) => (
                        <div key={d.id} value={String(d.id)}>
                          {d.nombre}
                        </div>
                      ))}
                    </SunmiSelectAdv>
                  </div>

                  {/* LOCAL DESTINO */}
                  <div className="space-y-1">
                    <div className="text-sm2 uppercase tracking-wide sunmi-text-muted">
                      Local destino
                    </div>

                    <SunmiSelectAdv
                      value={s.destinoIdAdmin}
                      placeholder="Seleccionar local"
                      onChange={(value) => s.setDestinoIdAdmin(value)}
                      className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
                    >
                      {s.localesGrupo.map((l) => (
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
                    disabled={!s.origenIdAdmin || !s.destinoIdAdmin}
                    onClick={onIniciar}
                  >
                    Iniciar transferencia admin
                  </SunmiButton>
                </div>
              </div>
  );
}
