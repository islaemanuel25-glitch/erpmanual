// app/modulos/transferencias/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import useContextoActivo from "@/hooks/useContextoActivo";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import SinPermisos from "@/components/auth/SinPermisos";
import TransferenciaHeader from "@/components/transferencias/TransferenciaHeader";
import TablaDetalleTransferencia from "@/components/transferencias/TablaDetalleTransferencia";
import AccionesRecepcion from "@/components/transferencias/AccionesRecepcion";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export default function TransferenciaDetallePage() {
  const { id } = useParams();
  const { contexto } = useContextoActivo();

  const [item, setItem] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const [me, setMe] = useState(null);

  // Detecta cambios sin guardar
  const [dirty, setDirty] = useState(false);

  // Wrapper para marcar cambios como dirty
  const setEditItemsDirty = (fn) => {
    setDirty(true);
    setEditItems(fn);
  };

  // ===============================
  // Usuario
  // ===============================
  const cargarUsuario = async () => {
    const res = await fetch("/api/me");
    const json = await res.json();
    if (json.ok) setMe(json.user);
  };

  // ===============================
  // Cargar transferencia
  // ===============================
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

      // Al cargar, no hay cambios pendientes
      setDirty(false);

    } catch (e) {
      console.error("Error cargando transferencia:", e);
      setError("Error al cargar transferencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarUsuario(); }, []);
  useEffect(() => { if (id) cargar(); }, [id]);

  if (!me) return <div className="p-4 sunmi-text-muted">Cargando usuario...</div>;

  // ===============================
  // Guard de acceso a pantalla
  // ===============================
  const permisos = me?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  // ===============================
  // Permisos — solo el local destino puede editar/recibir
  // ===============================
  const localIdActivo = contexto?.localId || me.localId || null;

  let puedeRecibir = false;

  if (item && localIdActivo) {
    const esDestino = item.destino?.id === localIdActivo;
    const estadoValido =
      item.estado === "Enviada" || item.estado === "Recibiendo";
    puedeRecibir = estadoValido && esDestino;
  }

  const inputsHabilitados = puedeRecibir;

  // Cancelar: solo estado "Enviada" + permiso transferencias.cancelar
  const puedeCancelar =
    item?.estado === "Enviada" &&
    (esAdmin || permisos.includes("transferencias.cancelar"));

  // ===============================
  // Guardar cambios
  // ===============================
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

          if (
            it.motivoPrincipal === "Otro" &&
            (!it.motivoDetalle || it.motivoDetalle.trim() === "")
          ) {
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

      // Cambios guardados → dirty false
      setDirty(false);

    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // ===============================
  // Confirmar recepción
  // ===============================
  const confirmarRecepcion = async () => {

    // BLOQUEAR si hay cambios sin guardar
    if (dirty) {
      alert("Tenés cambios sin guardar. Guardalos antes de confirmar.");
      return;
    }

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

  // ===============================
  // Cancelar transferencia
  // ===============================
  const cancelarTransferencia = async () => {
    if (!confirm("¿Estás seguro de cancelar esta transferencia? Se revertirá el stock en tránsito al origen.")) {
      return;
    }

    try {
      setCancelando(true);

      const res = await fetch("/api/transferencias/cancelar", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();

    } catch (err) {
      alert("Error cancelando: " + err.message);
    } finally {
      setCancelando(false);
    }
  };

  // ===============================
  // Total transferencia
  // ===============================
  const totalTransferencia = item
    ? item.items.reduce((acc, d) => acc + num(d.subtotal), 0)
    : 0;

  // ===============================
  // Render
  // ===============================
  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto space-y-3">

      <div className="flex justify-end">
        <SunmiBackButton href="/modulos/transferencias" />
      </div>

      <SunmiCard>
        {loading && (
          <SunmiLoader />
        )}
        {error && <div className="sunmi-text-danger px-2">{error}</div>}

        {!loading && !error && item && (
          <>
            <TransferenciaHeader item={item} id={id} />

            <SunmiSeparator label="Detalle y recepción" />

            <TablaDetalleTransferencia
              item={item}
              editItems={editItems}
              setEditItems={setEditItemsDirty}
              inputsHabilitados={inputsHabilitados}
            />

            <SunmiCard className="mx-1 mb-3">
              <div className="px-3 py-2 text-sm flex justify-between sunmi-text-muted">
                <span className="font-semibold">Total de la transferencia:</span>
                <span className="sunmi-text-accent font-bold">
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
              puedeCancelar={puedeCancelar}
              cancelando={cancelando}
              cancelarTransferencia={cancelarTransferencia}
            />
          </>
        )}
      </SunmiCard>
    </div>
  );
}
