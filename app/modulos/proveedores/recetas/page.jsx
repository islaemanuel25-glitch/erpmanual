"use client";

// RECETAS DE PROVEEDOR — cómo viene el papel de cada uno.
//
// Desde la lectura interpretada (#165) lo que el lector usa es la EXPLICACIÓN
// del papel, escrita en castellano y probada contra una foto real. Y desde el
// caso CCU (factura A y factura B del mismo proveedor) hay una POR TIPO de
// comprobante: esta lista dice, por proveedor, qué tipos tiene explicados y
// cuáles esperan que alguien confirme lo que propuso el lector grande.
//
// El formulario de impuestos que vivía acá se borró con el resto del código de
// formato: ya no decide ningún costo. De la receta vieja quedan dos cosas, las
// dos porque una regla de negocio las necesita: la variación normal de precio
// —se edita en la pantalla de la explicación— y cómo cobra la cantidad, por
// unidad o por bulto, que la usa el importador de pedidos desde archivo y se
// contesta acá.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

/** La única pregunta que queda de la receta estructurada. */
const PREGUNTA_FACTURA_POR = Object.freeze({
  titulo: "¿Cómo cobra la cantidad?",
  ayuda:
    "Si el pedido dice «12» y son 12 paquetes sueltos, es por unidad. Si dice «12» y son 12 " +
    "cajones, es por bulto. Ante la duda dejalo en unidad: el importador igual lo deduce " +
    "comparando el precio contra el costo que ya tenés.",
  opciones: [
    { valor: "UNIDAD", texto: "Por unidad suelta" },
    { valor: "BULTO", texto: "Por bulto o cajón" },
  ],
});

export default function RecetasPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [abierto, setAbierto] = useState(null); // proveedorId con "cómo cobra" abierto
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");
  const puedeEditar = esAdmin || permisos.includes("compras.recibir");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/compras-proveedor/recetas/listar", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudieron cargar las recetas.");
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, needsContexto]);

  async function guardarFacturaPor(proveedorId, facturaPor) {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/recetas/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId, respuestas: { facturaPor } }),
      });
      const json = await r.json();
      if (!json?.ok) {
        setMensaje({ tipo: "error", texto: json?.error || "No se pudo guardar." });
        return;
      }
      setMensaje({ tipo: "ok", texto: json.queHacer });
      await cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoUser || cargandoCtx) return null;
  // El backend es la autoridad; esto solo evita mostrar una pantalla que va a
  // rebotar con 403 en cada llamada.
  if (!puedeEditar) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 w-full max-w-[1600px] mx-auto">
      <button
        type="button"
        onClick={() => router.push("/modulos/compras")}
        className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver a Compras
      </button>

      <SunmiCard>
        <h1 className="text-sm font-bold sunmi-text-strong">Cómo viene el papel de cada proveedor</h1>
        <p className="text-sm2 sunmi-text-muted mt-1 leading-snug">
          Cada tipo de papel —factura A, factura B, sin factura— tiene su propia explicación. El
          primer papel de un tipo sin explicación lo lee el lector grande y deja una propuesta para
          confirmar; la de los otros tipos no se toca.
        </p>
      </SunmiCard>

      {mensaje && (
        <p className={`text-xs ${mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"}`}>
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <SunmiLoader />
      ) : error ? (
        <p className="text-xs sunmi-text-danger">{error}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <SunmiCard key={p.proveedorId}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold sunmi-text-strong">{p.nombre}</p>
                  <p
                    className={`text-sm2 leading-snug ${
                      p.pendientes?.length > 0 ? "sunmi-text-warning" : "sunmi-text-muted"
                    }`}
                  >
                    {p.resumen}
                  </p>
                  {p.comprobantesSinConfirmar > 0 && (
                    <p className="text-sm2 sunmi-text-muted">
                      Tiene {p.comprobantesSinConfirmar}{" "}
                      {p.comprobantesSinConfirmar === 1 ? "comprobante" : "comprobantes"} sin
                      confirmar.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-dato shrink-0">
                  <SunmiButton
                    color={p.pendientes?.length > 0 ? "cyan" : "slate"}
                    type="button"
                    onClick={() => router.push(`/modulos/proveedores/recetas/${p.proveedorId}`)}
                  >
                    Explicar el papel
                  </SunmiButton>
                  <SunmiButton
                    color="slate"
                    type="button"
                    onClick={() => setAbierto(abierto === p.proveedorId ? null : p.proveedorId)}
                  >
                    {abierto === p.proveedorId ? "Cerrar" : "Cómo cobra"}
                  </SunmiButton>
                </div>
              </div>

              {abierto === p.proveedorId && (
                <div className="mt-3 border-t sunmi-border pt-3">
                  <p className="text-xs font-bold sunmi-text-strong">{PREGUNTA_FACTURA_POR.titulo}</p>
                  <p className="text-sm2 sunmi-text-muted leading-snug mt-0.5">{PREGUNTA_FACTURA_POR.ayuda}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {PREGUNTA_FACTURA_POR.opciones.map((o) => {
                      const elegida = p.facturaPor === o.valor;
                      return (
                        <SunmiButton
                          key={o.valor}
                          color={elegida ? "cyan" : "slate"}
                          type="button"
                          disabled={guardando}
                          className="justify-start text-left"
                          onClick={() => guardarFacturaPor(p.proveedorId, o.valor)}
                        >
                          <span className="flex items-start gap-2">
                            {/* La elegida se marca con un signo además del color: dos
                                botones que solo se distinguen por tono se confunden
                                con el sol de frente. */}
                            <span className="shrink-0 pt-0.5">
                              {elegida ? <Check size={14} aria-hidden="true" /> : <span className="inline-block w-[14px]" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block">{o.texto}</span>
                            </span>
                          </span>
                        </SunmiButton>
                      );
                    })}
                  </div>
                </div>
              )}
            </SunmiCard>
          ))}
        </div>
      )}
    </div>
  );
}
