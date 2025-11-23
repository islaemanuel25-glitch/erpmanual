// app/modulos/transferencias/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export default function TransferenciaDetallePage() {
  const { id } = useParams();

  const [item, setItem] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const [me, setMe] = useState(null);

  // cargar usuario
  const cargarUsuario = async () => {
    const res = await fetch("/api/me");
    const json = await res.json();
    if (json.ok) setMe(json.user);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      setError("");

      const url = new URL(
        "/api/transferencias/detalle",
        window.location.origin
      );
      url.searchParams.set("id", String(id));

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar");
        setItem(null);
        return;
      }

      setItem(json.item);

      // Inicializar items de edición
      setEditItems(
        json.item.items.map((d) => ({
          id: d.id,
          enviado: d.cantidadEnviada,
          recibido:
            d.cantidadRecibida && d.cantidadRecibida > 0
              ? d.cantidadRecibida
              : d.cantidadEnviada,

          motivoPrincipal: d.motivoPrincipal || "",
          motivoDetalle: d.motivoDetalle || "",
        }))
      );
    } catch (e) {
      console.error("Error cargando transferencia:", e);
      setError("Error al cargar transferencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUsuario();
  }, []);

  useEffect(() => {
    if (id) cargar();
  }, [id]);

  if (!me) {
    return <div className="p-4 text-slate-300">Cargando usuario...</div>;
  }

  // =========================================================
  // PERMISOS EN FRONTEND
  // =========================================================

  const localId = me.localId || null;
  const esAdmin = me.esAdmin || me.permisos?.includes("*");

  let puedeRecibir = false;

  if (item) {
    const esDestino =
      localId && item.destino && item.destino.id === localId;

    const estadoValido =
      item.estado === "Enviada" || item.estado === "Recibiendo";

    puedeRecibir = estadoValido && (esAdmin || esDestino);
  }

  const inputsHabilitados = puedeRecibir;

  // =========================================================
  // VALIDACIÓN + GUARDADO
  // =========================================================

  const guardarCambios = async () => {
    try {
      setGuardando(true);

      for (const it of editItems) {
        const enviado = num(it.enviado);
        const recibido = num(it.recibido);

        // Solo exigir motivo si hubo diferencia
        if (recibido !== enviado) {
          if (!it.motivoPrincipal) {
            alert("Debés seleccionar un motivo para todos los productos con diferencia.");
            setGuardando(false);
            return;
          }

          if (
            it.motivoPrincipal === "Otro" &&
            (!it.motivoDetalle || it.motivoDetalle.trim() === "")
          ) {
            alert("Debés detallar el motivo en los productos con motivo 'Otro'.");
            setGuardando(false);
            return;
          }
        }
      }

      const res = await fetch("/api/transferencias/guardar-recepcion", {
        method: "POST",
        body: JSON.stringify({
          transferenciaId: item.id,
          items: editItems,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error");

      await cargar();
    } catch (err) {
      alert("Error guardando cambios: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarRecepcion = async () => {
    try {
      setConfirmando(true);

      const res = await fetch("/api/transferencias/confirmar-recepcion", {
        method: "POST",
        body: JSON.stringify({
          transferenciaId: item.id,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error");

      await cargar();
    } catch (err) {
      alert("Error confirmando: " + err.message);
    } finally {
      setConfirmando(false);
    }
  };

  // =========================================================
  // TOTAL DE LA TRANSFERENCIA (AGREGADO)
  // =========================================================
  const totalTransferencia = item
    ? item.items.reduce((acc, d) => acc + num(d.subtotal), 0)
    : 0;

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto space-y-3">
      <div>
        <Link
          href="/modulos/transferencias"
          className="text-xs sm:text-sm text-amber-300 hover:underline"
        >
          ← Volver al listado
        </Link>
      </div>

      <SunmiCard>
        <SunmiHeader title={`Transferencia #${id}`} color="amber" />

        {loading && (
          <div className="text-slate-300 text-sm px-2">Cargando...</div>
        )}
        {error && <div className="text-red-400 px-2">{error}</div>}

        {!loading && !error && item && (
          <>
            <SunmiSeparator label="Datos generales" color="amber" />

            <div className="border border-slate-700 rounded-2xl p-3 grid gap-3 md:grid-cols-2 bg-slate-900/50 mx-1 text-sm">
              <div>
                <div className="font-semibold text-slate-100">Origen</div>
                <div className="text-slate-100">{item.origen.nombre}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-100">Destino</div>
                <div className="text-slate-100">{item.destino.nombre}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-100">Fechas</div>

                <div className="text-slate-100">
                  Creada:{" "}
                  {item.fechaCreada
                    ? new Date(item.fechaCreada).toLocaleString()
                    : "-"}
                </div>

                <div className="text-slate-100">
                  Envío:{" "}
                  {item.fechaEnvio
                    ? new Date(item.fechaEnvio).toLocaleString()
                    : "-"}
                </div>

                <div className="text-slate-100">
                  Recepción:{" "}
                  {item.fechaRecepcion
                    ? new Date(item.fechaRecepcion).toLocaleString()
                    : "-"}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-100">Estado</div>
                <div className="inline-flex px-2 py-1 rounded border border-slate-600 bg-slate-900/70 text-slate-100">
                  {item.estado}
                </div>
              </div>
            </div>

            <SunmiSeparator label="Detalle y recepción" color="amber" />

            <div className="overflow-auto rounded-2xl border border-slate-700 mx-1 mb-2">
              <SunmiTable>
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">Producto</th>
                    <th className="px-2 py-1 text-left">Código</th>
                    <th className="px-2 py-1 text-right">Enviada</th>
                    <th className="px-2 py-1 text-right">Recibida</th>
                    <th className="px-2 py-1 text-left">Motivo</th>
                    <th className="px-2 py-1 text-left">Detalle</th>
                    <th className="px-2 py-1 text-right">Costo</th>
                    <th className="px-2 py-1 text-right">Subtotal</th>
                  </tr>
                </thead>

                <tbody>
                  {item.items.map((d, idx) => {
                    const enviada = num(d.cantidadEnviada);
                    const edit = editItems[idx];
                    const recibido = num(edit.recibido);

                    const diff = recibido - enviada;

                    let bg = "bg-slate-900";
                    if (diff !== 0) bg = "bg-amber-800/40";
                    if (diff < 0) bg = "bg-red-800/40";
                    if (diff === 0) bg = "bg-emerald-800/30";

                    return (
                      <tr
                        key={d.id}
                        className={`border-t border-slate-800 ${bg}`}
                      >
                        <td className="px-2 py-1">{d.nombre}</td>
                        <td className="px-2 py-1">{d.codigoBarra || "-"}</td>

                        <td className="px-2 py-1 text-right">{enviada}</td>

                        {/* CANTIDAD RECIBIDA */}
                        <td className="px-2 py-1 text-right">
                          {inputsHabilitados ? (
                            <input
                              type="number"
                              value={edit.recibido}
                              onChange={(e) => {
                                const copia = [...editItems];
                                copia[idx].recibido = e.target.value;

                                // Si se modifica, limpiar motivos
                                if (num(e.target.value) === enviada) {
                                  copia[idx].motivoPrincipal = "";
                                  copia[idx].motivoDetalle = "";
                                }

                                setEditItems(copia);
                              }}
                              className="w-16 px-1 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 text-right"
                            />
                          ) : (
                            recibido
                          )}
                        </td>

                        {/* MOTIVO PRINCIPAL */}
                        <td className="px-2 py-1">
                          {inputsHabilitados ? (
                            num(edit.recibido) !== enviada ? (
                              <select
                                value={edit.motivoPrincipal}
                                onChange={(e) => {
                                  const copia = [...editItems];
                                  copia[idx].motivoPrincipal = e.target.value;

                                  if (e.target.value !== "Otro") {
                                    copia[idx].motivoDetalle = "";
                                  }

                                  setEditItems(copia);
                                }}
                                className="px-1 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 w-40 text-sm"
                              >
                                <option value="">Seleccionar…</option>
                                <option value="Faltante">Faltante</option>
                                <option value="Producto dañado">
                                  Producto dañado
                                </option>
                                <option value="Otro">Otro (especificar)</option>
                              </select>
                            ) : (
                              "-"
                            )
                          ) : (
                            d.motivoPrincipal || "-"
                          )}
                        </td>

                        {/* DETALLE SI ES OTRO */}
                        <td className="px-2 py-1">
                          {inputsHabilitados ? (
                            edit.motivoPrincipal === "Otro" &&
                            num(edit.recibido) !== enviada ? (
                              <input
                                type="text"
                                value={edit.motivoDetalle}
                                onChange={(e) => {
                                  const copia = [...editItems];
                                  copia[idx].motivoDetalle = e.target.value;
                                  setEditItems(copia);
                                }}
                                className="w-48 px-2 py-[2px] rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                                placeholder="Detalle..."
                              />
                            ) : (
                              "-"
                            )
                          ) : (
                            d.motivoDetalle || "-"
                          )}
                        </td>

                        <td className="px-2 py-1 text-right">
                          ${num(d.precioCosto).toFixed(2)}
                        </td>

                        <td className="px-2 py-1 text-right">
                          ${num(d.subtotal).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </SunmiTable>
            </div>

            {/* ========================================================= */}
            {/* 🔥 TOTAL DE LA TRANSFERENCIA (AGREGADO) */}
            {/* ========================================================= */}
            <SunmiCard className="mx-1 mb-3 bg-slate-950/60 border border-slate-700">
              <div className="px-3 py-2 text-sm flex justify-between text-slate-300">
                <span className="font-semibold">Total de la transferencia:</span>
                <span className="text-amber-300 font-bold">
                  ${totalTransferencia.toFixed(2)}
                </span>
              </div>
            </SunmiCard>

            {/* BOTONES */}
            {puedeRecibir && (
              <div className="flex justify-end gap-3 px-2 pb-3">
                <SunmiButton
                  variant="outline"
                  size="sm"
                  disabled={guardando}
                  onClick={guardarCambios}
                >
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </SunmiButton>

                <SunmiButton
                  size="sm"
                  disabled={confirmando}
                  onClick={confirmarRecepcion}
                >
                  {confirmando ? "Confirmando..." : "Confirmar recepción"}
                </SunmiButton>
              </div>
            )}
          </>
        )}
      </SunmiCard>
    </div>
  );
}
