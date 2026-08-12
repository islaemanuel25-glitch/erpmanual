"use client";

// RECETAS DE PROVEEDOR — cómo viene armada la factura de cada uno.
//
// La receta es lo que el lector usa para saber qué buscar y lo que la
// verificación usa para saber si la cuenta cierra. Sin ella se lee con la
// genérica —21 % al pie— y todo proveedor que no sea así queda mal leído.
//
// ── ESTA PANTALLA SE USA DESDE EL CELULAR, CON LA FACTURA EN LA OTRA MANO ──
//
// Por eso ninguna opción se llama como el campo de la base. "El IVA viene en
// cada renglón" es algo que se puede mirar y contestar; "IVA por línea" obliga
// a traducir primero. Y donde ayuda va el ejemplo real —DYSSA lo trae por
// renglón, DAS al pie, Mauro ya adentro del precio—, porque la respuesta más
// rápida es "como el de DYSSA" y no un razonamiento sobre alícuotas.
//
// Los textos viven en lib/.../recetaEnCriollo.js con sus candados, uno de los
// cuales comprueba justamente que ninguna opción se llame como el campo.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { preguntasVisibles } from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";

export default function RecetasPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [abierto, setAbierto] = useState(null); // proveedorId en edición
  const [respuestas, setRespuestas] = useState(null);
  const [proveedor, setProveedor] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [relectura, setRelectura] = useState(null);
  const [releyendo, setReleyendo] = useState(null); // { hechas, total }

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

  async function abrir(proveedorId) {
    setMensaje(null);
    setRelectura(null);
    setAbierto(proveedorId);
    setRespuestas(null);
    try {
      const r = await fetch(`/api/compras-proveedor/recetas/obtener?proveedorId=${proveedorId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!json?.ok) {
        setMensaje({ tipo: "error", texto: json?.error || "No se pudo abrir la receta." });
        return;
      }
      setProveedor(json.proveedor);
      setRespuestas(json.respuestas);
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión." });
    }
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    setRelectura(null);
    try {
      const r = await fetch("/api/compras-proveedor/recetas/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId: abierto, respuestas }),
      });
      const json = await r.json();
      if (!json?.ok) {
        setMensaje({ tipo: "error", texto: json?.error || "No se pudo guardar." });
        return;
      }
      setMensaje({ tipo: "ok", texto: json.queHacer });
      // El costo en lecturas llega con la respuesta del guardado, así que el
      // aviso está a la vista ANTES de que apriete releer.
      if (json.relectura?.hayQueOfrecer) setRelectura(json.relectura);
      await cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión." });
    } finally {
      setGuardando(false);
    }
  }

  // Releer usa la MISMA ruta de lectura que el botón de un comprobante suelto,
  // de a uno. Una ruta nueva que leyera en tanda sería un segundo camino de
  // lectura, y el día que uno cambie el otro queda viejo.
  async function releer() {
    const ids = (relectura?.ids ?? []).slice(0, relectura.entran);
    setReleyendo({ hechas: 0, total: ids.length });
    let bien = 0;
    let cortado = null;
    for (const [i, id] of ids.entries()) {
      try {
        const r = await fetch(`/api/compras-proveedor/comprobantes/leer/${id}`, {
          method: "POST",
          credentials: "include",
        });
        const json = await r.json().catch(() => ({}));
        if (json?.ok) bien++;
        // Si se acabó la cuota en el medio, se frena: seguir gasta llamadas que
        // van a fallar todas y demora el aviso.
        else if (json?.motivo === "CUOTA_AGOTADA") { cortado = json?.error; break; }
      } catch {
        cortado = "Se cortó la conexión.";
        break;
      }
      setReleyendo({ hechas: i + 1, total: ids.length });
    }
    setReleyendo(null);
    setRelectura(null);
    setMensaje({
      tipo: cortado ? "aviso" : "ok",
      texto: cortado
        ? `Se releyeron ${bien} de ${ids.length}. ${cortado}`
        : `Se releyeron ${bien} de ${ids.length}. Miralos en la recepción de cada pedido.`,
    });
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
        <h1 className="text-sm font-bold sunmi-text-strong">Cómo viene la factura de cada proveedor</h1>
        <p className="text-sm2 sunmi-text-muted mt-1 leading-snug">
          Esto es lo que el sistema usa para leer una factura y comprobar que la cuenta cierre. Al
          que no tiene nada cargado se le lee con lo más común —IVA 21 % al final— y si su factura
          no es así, va a decir que no se pudo leer bien.
        </p>
      </SunmiCard>

      {mensaje && (
        <p
          className={`text-xs ${
            mensaje.tipo === "error"
              ? "sunmi-text-danger"
              : mensaje.tipo === "aviso"
                ? "sunmi-text-warning"
                : "sunmi-text-success"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* EL COSTO EN LECTURAS, ANTES DEL BOTÓN Y NO DESPUÉS. */}
      {relectura && (
        <SunmiCard>
          <p className="text-xs font-bold sunmi-text-warning">{relectura.texto}</p>
          <p className="text-sm2 sunmi-text-muted mt-1 leading-snug">{relectura.aviso}</p>
          {relectura.sePuedeAhora && (
            <div className="mt-2 flex flex-wrap gap-2">
              <SunmiButton color="cyan" type="button" disabled={!!releyendo} onClick={releer}>
                {releyendo
                  ? `Releyendo ${releyendo.hechas} de ${releyendo.total}…`
                  : `Releer ${relectura.entran}`}
              </SunmiButton>
              <SunmiButton color="slate" type="button" disabled={!!releyendo} onClick={() => setRelectura(null)}>
                Ahora no
              </SunmiButton>
            </div>
          )}
        </SunmiCard>
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
                      p.tieneReceta ? "sunmi-text-muted" : "sunmi-text-warning"
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
                <SunmiButton
                  color={p.tieneReceta ? "slate" : "cyan"}
                  type="button"
                  onClick={() => (abierto === p.proveedorId ? setAbierto(null) : abrir(p.proveedorId))}
                >
                  {abierto === p.proveedorId ? "Cerrar" : p.tieneReceta ? "Cambiar" : "Cargar"}
                </SunmiButton>
              </div>

              {abierto === p.proveedorId && (
                <div className="mt-3 border-t sunmi-border pt-3">
                  {!respuestas ? (
                    <SunmiLoader />
                  ) : (
                    <Formulario
                      respuestas={respuestas}
                      onCambio={setRespuestas}
                      onGuardar={guardar}
                      guardando={guardando}
                      nombre={proveedor?.nombre ?? p.nombre}
                    />
                  )}
                </div>
              )}
            </SunmiCard>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El formulario, armado desde las preguntas.
 *
 * Se dibuja recorriendo `preguntasVisibles`, no escribiendo cada campo a mano:
 * agregar una pregunta es agregarla al módulo, y las condiciones de cuándo
 * mostrar cada una viven ahí con sus candados.
 */
function Formulario({ respuestas, onCambio, onGuardar, guardando, nombre }) {
  const set = (campo, valor) => onCambio({ ...respuestas, [campo]: valor });
  const visibles = preguntasVisibles(respuestas);

  return (
    <div className="flex flex-col gap-4">
      {visibles.map((p) => (
        <div key={p.campo}>
          <p className="text-xs font-bold sunmi-text-strong">{p.titulo}</p>
          <p className="text-sm2 sunmi-text-muted leading-snug mt-0.5">{p.ayuda}</p>

          {p.opciones && (
            <div className="mt-2 flex flex-col gap-1">
              {p.opciones.map((o) => {
                const elegida = respuestas[p.campo] === o.valor;
                return (
                  <SunmiButton
                    key={String(o.valor)}
                    color={elegida ? "cyan" : "slate"}
                    type="button"
                    className="justify-start text-left"
                    onClick={() => set(p.campo, o.valor)}
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
                        {(o.detalle || o.ejemplo) && (
                          <span className="block text-sm2 opacity-80 leading-snug">
                            {o.detalle} {o.ejemplo}
                          </span>
                        )}
                      </span>
                    </span>
                  </SunmiButton>
                );
              })}
            </div>
          )}

          {p.tipo === "numero" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SunmiInput
                type="number"
                inputMode="decimal"
                value={respuestas[p.campo] ?? ""}
                onChange={(e) => set(p.campo, e.target.value === "" ? "" : Number(e.target.value))}
                className="w-28"
              />
              {(p.sugerencias ?? []).map((s) => (
                <SunmiButton key={s} color="slate" type="button" onClick={() => set(p.campo, s)}>
                  {s} %
                </SunmiButton>
              ))}
            </div>
          )}

          {p.tipo === "lista" && (
            <ListaPercepciones
              valor={respuestas[p.campo] ?? []}
              onCambio={(v) => set(p.campo, v)}
            />
          )}
        </div>
      ))}

      <div>
        <SunmiButton color="cyan" type="button" disabled={guardando} onClick={onGuardar}>
          {guardando ? "Guardando…" : `Guardar la receta de ${nombre}`}
        </SunmiButton>
        <p className="text-sm2 sunmi-text-muted mt-1 leading-snug">
          Los comprobantes que ya se leyeron no cambian: cada uno guardó la receta con la que se
          leyó. Después de guardar se ofrece releer los que todavía no confirmaste.
        </p>
      </div>
    </div>
  );
}

/** Las percepciones: nombre y porcentaje, tantas como diga el papel. */
function ListaPercepciones({ valor, onCambio }) {
  const lista = Array.isArray(valor) ? valor : [];
  const cambiar = (i, campo, v) =>
    onCambio(lista.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  return (
    <div className="mt-2 flex flex-col gap-1">
      {lista.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <SunmiInput
            value={p.nombre ?? ""}
            placeholder="IIBB, IVA…"
            onChange={(e) => cambiar(i, "nombre", e.target.value)}
            className="flex-1 min-w-[8rem]"
          />
          <SunmiInput
            type="number"
            inputMode="decimal"
            value={p.pct ?? ""}
            placeholder="%"
            onChange={(e) => cambiar(i, "pct", e.target.value === "" ? "" : Number(e.target.value))}
            className="w-20"
          />
          <SunmiButton
            color="slate"
            type="button"
            onClick={() => onCambio(lista.filter((_, j) => j !== i))}
          >
            <Trash2 size={14} aria-hidden="true" />
          </SunmiButton>
        </div>
      ))}
      <div>
        <SunmiButton
          color="slate"
          type="button"
          onClick={() => onCambio([...lista, { nombre: "", pct: "" }])}
        >
          <span className="inline-flex items-center gap-1">
            <Plus size={14} aria-hidden="true" />
            Agregar una percepción
          </span>
        </SunmiButton>
      </div>
    </div>
  );
}
