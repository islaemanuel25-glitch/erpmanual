// app/modulos/transferencias/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

// Componentes nuevos
import TransferenciaHeader from "@/components/transferencias/TransferenciaHeader";
import TablaDetalleTransferencia from "@/components/transferencias/TablaDetalleTransferencia";
import AccionesRecepcion from "@/components/transferencias/AccionesRecepcion";

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

  // Cargar usuario
  const cargarUsuario = async () => {
    const res = await fetch("/api/me");
    const json = await res.json();
    if (json.ok) setMe(json.user);
  };

  // Cargar transferencia
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

      // Items editables
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

  useEffect(() => { cargarUsuario(); }, []);
  useEffect(() => { if (id) cargar(); }, [id]);

  if (!me) return <div className="p-4 text-slate-300">Cargando usuario...</div>;

  // Permisos
  const localId = me.localId || null;
  const esAdmin = me.esAdmin || me.permisos?.includes("*");

  let puedeRecibir = false;

  if (item) {
    const esDestino = localId && item.destino?.id === localId;
    const estadoValido = item.estado === "Enviada" || item.estado === "Recibiendo";
    puedeRecibir = estadoValido && (esAdmin || esDestino);
  }

  const inputsHabilitados = puedeRecibir;

  // Guardar recepción
  const guardarCambios = async () => {
    try {
      setGuardando(true);

      for (const it of editItems) {
        const enviado = num(it.enviado);
        const recibido = num(it.recibido);

        if (recibido !== enviado) {
          if (!it.motivoPrincipal) {
            alert("Falta motivo.");
            setGuardando(false);
            return;
          }

          if (it.motivoPrincipal === "Otro" &&
              (!it.motivoDetalle || it.motivoDetalle.trim() === "")) {
            alert("Debés detallar motivo (Otro).");
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
      if (!json.ok) throw new Error(json.error);

      await cargar();
    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Confirmar recepción
  const confirmarRecepcion = async () => {
    try {
      setConfirmando(true);

      const res = await fetch("/api/transferencias/confirmar-recepcion", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();
    } catch (err) {
      alert("Error confirmando: " + err.message);
    } finally {
      setConfirmando(false);
    }
  };

  // Total
  const totalTransferencia = item
    ? item.items.reduce((acc, d) => acc + num(d.subtotal), 0)
    : 0;

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

        {loading && <div className="text-slate-300 text-sm px-2">Cargando...</div>}
        {error && <div className="text-red-400 px-2">{error}</div>}

        {!loading && !error && item && (
          <>
            {/* HEADER (los botones PDF ya están ahí) */}
            <TransferenciaHeader item={item} id={id} />

            <SunmiSeparator label="Detalle y recepción" color="amber" />

            <TablaDetalleTransferencia
              item={item}
              editItems={editItems}
              setEditItems={setEditItems}
              inputsHabilitados={inputsHabilitados}
            />

            <SunmiCard className="mx-1 mb-3 bg-slate-950/60 border border-slate-700">
              <div className="px-3 py-2 text-sm flex justify-between text-slate-300">
                <span className="font-semibold">Total de la transferencia:</span>
                <span className="text-amber-300 font-bold">
                  ${totalTransferencia.toFixed(2)}
                </span>
              </div>
            </SunmiCard>

            <AccionesRecepcion
              puedeRecibir={puedeRecibir}
              guardando={guardando}
              guardarCambios={guardarCambios}
              confirmando={confirmando}
              confirmarRecepcion={confirmarRecepcion}
            />
          </>
        )}
      </SunmiCard>
    </div>
  );
}
