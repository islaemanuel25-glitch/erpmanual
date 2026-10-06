"use client";

// VINCULAR AZUL CHAT: LA PERSONA, DESDE SU SESIÓN, GENERA SU CÓDIGO DE CANJE.
//
// Llama a `/api/integraciones/azul-chat/vinculo/autorizar` con la sesión del
// ERP y muestra el código UNA vez. El código vale 10 minutos y un canje; Azul
// Chat lo cambia por su propia credencial. Ver DEC-0013.
//
// ── EL CÓDIGO VIVE SOLO EN LA MEMORIA DE ESTE COMPONENTE ───────────────────
//
// No va a la URL, ni a localStorage, ni a sessionStorage, ni a la consola, ni a
// ninguna analítica. Al cerrar el modal se borra del estado; al recargar la
// página no hay de dónde recuperarlo, y está bien: se genera otro. Por eso el
// componente no tiene ningún efecto que corra al montarse — nada se pide solo.
// Lo comprueba `components/integraciones/vincularAzulChat.test.mjs`.
//
// `destructivo`, POR PASO: en el paso "codigo" tocar el velo no cierra, porque
// cerrar sin querer pierde un código que no se vuelve a mostrar y obliga a
// generar otro. En "inicio" no hay nada que perder y el velo cierra. El censo
// de `components/sunmi/SunmiModalLayout.test.mjs` registra esta política.

import { useState } from "react";
import { createPortal } from "react-dom";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { horaAR } from "@/lib/fechas/formatearFechaHora";

const RUTA_AUTORIZAR = "/api/integraciones/azul-chat/vinculo/autorizar";
const RUTA_REVOCAR = "/api/integraciones/azul-chat/vinculo/revocar";

/** El texto de un rechazo: el que mandó el ERP, o uno que diga qué pasó y con qué estado. */
async function textoDeError(res, accion) {
  const data = await res.json().catch(() => null);
  return data?.error || `No se pudo ${accion} (error ${res.status}).`;
}

export default function ModalVincularAzulChat({ abierto = false, onCerrar }) {
  // "inicio" | "codigo": en qué paso está el modal. Decide solo el velo.
  const [estado, setEstado] = useState("inicio");
  const [codigo, setCodigo] = useState(null);
  const [venceEn, setVenceEn] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  if (!abierto) return null;

  const cerrar = () => {
    // Lo primero que se hace al cerrar es olvidar el código.
    setCodigo(null);
    setEstado("inicio");
    setVenceEn(null);
    setCopiado(false);
    setError("");
    setAviso("");
    onCerrar?.();
  };

  const generar = async () => {
    setTrabajando(true);
    setError("");
    setAviso("");
    setCopiado(false);
    try {
      const res = await fetch(RUTA_AUTORIZAR, { method: "POST", credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError(await textoDeError(res, "generar el código"));
        return;
      }
      const data = await res.json();
      setCodigo(data.codigoCanje);
      setVenceEn(data.venceEn);
      setEstado("codigo");
    } catch {
      setError("No se pudo generar el código: no hubo respuesta del servidor.");
    } finally {
      setTrabajando(false);
    }
  };

  const desvincular = async () => {
    setTrabajando(true);
    setError("");
    setAviso("");
    try {
      const res = await fetch(RUTA_REVOCAR, { method: "POST", credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError(await textoDeError(res, "desvincular Azul Chat"));
        return;
      }
      const data = await res.json();
      setCodigo(null);
      setVenceEn(null);
      setEstado("inicio");
      setAviso(data.revocado ? "Azul Chat quedó desvinculado. Ya no puede consultar el ERP en tu nombre." : "No había un vínculo vigente con Azul Chat.");
    } catch {
      setError("No se pudo desvincular: no hubo respuesta del servidor.");
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setError("No se pudo copiar. Seleccioná el código y copialo a mano.");
    }
  };

  const contenido = (
    <SunmiModalLayout
      open
      title="Vincular Azul Chat"
      subtitle="Azul Chat consulta el ERP en tu nombre, con tus permisos de siempre."
      color="cyan"
      onClose={trabajando ? undefined : cerrar}
      maxWidth="max-w-lg"
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
      z={NIVEL_MODAL_GLOBAL}
      destructivo={estado === "codigo"}
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="red" onClick={desvincular} disabled={trabajando} className="py-2 text-xs">
            Desvincular Azul Chat
          </SunmiButton>
          {codigo ? (
            <SunmiButton color="primary" onClick={cerrar} disabled={trabajando} className="py-2 font-bold text-xs">
              Listo
            </SunmiButton>
          ) : (
            <SunmiButton color="primary" onClick={generar} disabled={trabajando} className="py-2 font-bold text-xs">
              {trabajando ? "Un momento…" : "Generar código"}
            </SunmiButton>
          )}
        </div>
      }
    >
      {codigo ? (
        <>
          <p className="text-sm2 sunmi-text-strong font-semibold">Pegá este código en Azul Chat</p>
          <SunmiInput value={codigo} readOnly aria-label="Código para Azul Chat" className="font-mono" onFocus={(e) => e.target.select()} />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm2 sunmi-text-muted leading-snug">
              Vence a las {horaAR(venceEn)} (en 10 minutos) y sirve una sola vez. El ERP no lo puede volver a mostrar.
            </p>
            <SunmiButton color="slate" onClick={copiar} className="py-2 text-xs">
              {copiado ? "Copiado" : "Copiar"}
            </SunmiButton>
          </div>
        </>
      ) : (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Generá un código y pegalo en Azul Chat. Vence en 10 minutos y sirve una sola vez. Si ya tenías Azul Chat
          vinculado, generar un código nuevo corta el vínculo anterior.
        </p>
      )}

      {aviso && <p className="text-sm2 sunmi-text-strong leading-snug">{aviso}</p>}
      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
