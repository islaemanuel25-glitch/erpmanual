"use client";

// NUEVA IMPORTACIÓN de una lista de precios.
//
// Elegir proveedor, subir el Excel, importar. Al terminar se va derecho a la
// conciliación: el número que importa no es "se subió", es qué propone.
//
// ── ACÁ SE CARGA LA CONFIGURACIÓN COMERCIAL, Y SIN ELLA NO SE CONCILIA ──────
//
// Hasta el 2026-09-16 esta pantalla MOSTRABA el recargo, el umbral y el rango, y
// al lado decía, con estas palabras: "Son los valores configurados para el
// proveedor y no se pueden cambiar después". Lo segundo era cierto y lo primero
// no — no existía ninguna configuración por proveedor: los tres números salían de
// constantes del código y valían lo mismo para todos.
//
// Ahora se cargan acá, precargados con lo que tenga el proveedor, y editables. Si
// el proveedor no tiene nada guardado la pantalla los pide y NO deja importar: no
// hay valores de fábrica, porque un default que decide costos es una respuesta
// inventada que se ve igual que una contestada.
//
// ── DOS BOTONES, DOS DECISIONES ─────────────────────────────────────────────
//
// "Importar y conciliar" usa estos valores SOLO PARA ESTA LISTA. "Guardar para
// las próximas" es un botón aparte que escribe la ficha del proveedor. Están
// separados porque un mes atípico no puede reescribir el criterio de todos los
// meses siguientes sin que nadie lo pida.
//
// El endpoint sigue siendo la autoridad y revalida todo con la misma función.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Upload } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  proveedorAdmiteImportacion,
  validarArchivoEnCliente,
  mensajeDeError,
  tamanoArchivo,
  fechaHora,
} from "@/lib/proveedores/listas/presentacion";
import { LIMITES } from "@/lib/proveedores/listas/persistencia";
// Qué le falta a un proveedor para poder importar. Se le pregunta a la MISMA
// función que usa el endpoint para rechazar: dos copias de esa regla terminarían
// ofreciendo un botón que el servidor después no acepta.
import { faltantesDeConfiguracion } from "@/lib/proveedores/listas/configuracionProveedor";

export default function NuevaImportacionPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const inputArchivo = useRef(null);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  // La importación sin terminar de este proveedor, si la hay. Se avisa, no se
  // bloquea: ver el cartel más abajo.
  const [abierta, setAbierta] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargarProveedores = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const r = await fetch("/api/proveedores/listas/proveedores", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErrorCarga(json?.error || "No se pudieron cargar los proveedores.");
        return;
      }
      setProveedores(json.items ?? []);
    } catch {
      setErrorCarga("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargarProveedores();
  }, [cargarProveedores, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  const proveedor = useMemo(
    () => proveedores.find((p) => String(p.id) === String(proveedorId)) ?? null,
    [proveedores, proveedorId]
  );
  const compat = proveedorAdmiteImportacion(proveedor);

  // ¿Este proveedor ya tiene una lista sin terminar? Se pregunta al mismo
  // endpoint del historial —que ya filtra por proveedor y esconde las
  // canceladas— en vez de inventar uno nuevo para la misma pregunta.
  useEffect(() => {
    if (!proveedorId) {
      setAbierta(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/proveedores/listas?proveedorId=${proveedorId}&pageSize=10`,
          { credentials: "include", cache: "no-store" }
        );
        const j = await r.json();
        if (!vivo || !j?.ok) return;
        const viva = (j.items ?? []).find(
          (i) => i.estado === "CONCILIADA" || i.estado === "PARCIALMENTE_APLICADA"
        );
        setAbierta(viva ?? null);
      } catch {
        // El aviso es de cortesía: si no se puede consultar, no se traba nada.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [proveedorId]);

  // ── LOS VALORES COMERCIALES DE ESTA LISTA ────────────────────────────────
  //
  // Viven como TEXTO mientras se editan. Un campo numérico controlado con un
  // número no deja escribir "0," ni borrar el contenido para escribir otra cosa:
  // el estado se guarda tal como se tipea y se convierte recién al mandar.
  const [minPct, setMinPct] = useState("");
  const [maxPct, setMaxPct] = useState("");
  const [recargoPct, setRecargoPct] = useState("");
  // `null` es "todavía no contestó", que NO es lo mismo que "no tiene". Sin esa
  // diferencia, un proveedor sin configurar arrancaría diciendo que no tiene
  // impuestos adicionales sin que nadie lo haya dicho.
  const [tieneImpuestos, setTieneImpuestos] = useState(null);
  const [impuestoPct, setImpuestoPct] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState("");

  // Al elegir un proveedor se precarga lo suyo. Lo que no tenga queda vacío y la
  // pantalla lo pide.
  useEffect(() => {
    const c = proveedor?.configuracion ?? null;
    const txt = (v) => (v === null || v === undefined ? "" : String(v));
    setMinPct(txt(c?.minPct));
    setMaxPct(txt(c?.maxPct));
    setRecargoPct(txt(c?.recargoPct));
    setTieneImpuestos(c?.impuestosDefinidos ? Number(c?.impuestoAdicionalPct) > 0 : null);
    setImpuestoPct(txt(c?.impuestoAdicionalPct));
    setAvisoGuardado("");
  }, [proveedor]);

  const configEditada = useMemo(() => ({
    minPct: minPct === "" ? null : Number(minPct),
    maxPct: maxPct === "" ? null : Number(maxPct),
    recargoPct: recargoPct === "" ? null : Number(recargoPct),
    impuestoAdicionalPct: tieneImpuestos === false ? 0 : (impuestoPct === "" ? null : Number(impuestoPct)),
    impuestosDefinidos: tieneImpuestos !== null,
  }), [minPct, maxPct, recargoPct, tieneImpuestos, impuestoPct]);

  const faltan = useMemo(() => faltantesDeConfiguracion(configEditada), [configEditada]);
  const configCompleta = faltan.length === 0;

  const guardarParaLasProximas = async () => {
    if (!proveedor || !configCompleta || guardando) return;
    setGuardando(true);
    setAvisoGuardado("");
    setErrorEnvio(null);
    try {
      const r = await fetch(
        `/api/proveedores/listas/proveedores/${proveedor.id}/configuracion`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aumentoEsperadoMinPct: configEditada.minPct,
            aumentoEsperadoMaxPct: configEditada.maxPct,
            recargoPct: configEditada.recargoPct,
            impuestosDefinidos: true,
            impuestoAdicionalPct: configEditada.impuestoAdicionalPct,
          }),
        }
      );
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAvisoGuardado(j?.error || "No se pudo guardar.");
        return;
      }
      // La lista de proveedores queda con lo guardado, así que volver a elegirlo
      // muestra lo nuevo y no lo viejo.
      setProveedores((ant) =>
        ant.map((p) => (p.id === proveedor.id ? { ...p, configuracion: j.configuracion, faltaConfigurar: [] } : p))
      );
      setAvisoGuardado(`Guardado. Las próximas listas de ${proveedor.nombre} arrancan con estos valores.`);
    } catch {
      setAvisoGuardado("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0] ?? null;
    setErrorEnvio(null);
    if (!f) {
      setArchivo(null);
      setErrorArchivo("");
      return;
    }
    const v = validarArchivoEnCliente(f, {
      tamanoMaxBytes: LIMITES.tamanoMaxBytes,
      extensiones: LIMITES.extensiones,
    });
    setArchivo(v.ok ? f : null);
    setErrorArchivo(v.ok ? "" : v.error);
    if (!v.ok && inputArchivo.current) inputArchivo.current.value = "";
  };

  const puedeEnviar =
    !!proveedor && compat.admite && !!archivo && !errorArchivo && !enviando && configCompleta;

  const importar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo, archivo.name);
      fd.append("proveedorId", String(proveedor.id));
      // Los valores de ESTA lista. El endpoint los revalida con la misma función
      // que usa la pantalla y rechaza si falta alguno.
      fd.append("aumentoEsperadoMinPct", String(configEditada.minPct));
      fd.append("aumentoEsperadoMaxPct", String(configEditada.maxPct));
      fd.append("recargoPct", String(configEditada.recargoPct));
      fd.append("impuestosDefinidos", "true");
      fd.append("impuestoAdicionalPct", String(configEditada.impuestoAdicionalPct));

      const r = await fetch("/api/proveedores/listas/importar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await r.json().catch(() => null);

      if (!r.ok || !json?.ok) {
        setErrorEnvio(mensajeDeError(json, r.status));
        return;
      }
      router.replace(`/modulos/proveedores/listas/${json.importacionId}`);
    } catch {
      setErrorEnvio({ mensaje: "Error de conexión.", duplicada: false });
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco router={router}>
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un contexto operativo para importar una lista.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco router={router}>
      <SunmiCard className="p-3">
        <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
          Nueva importación
        </h1>
        <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
          Se calcula qué costo propone la lista. No se modifica ningún precio todavía.
        </p>
      </SunmiCard>

      {cargando && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && errorCarga && (
        <ErrorRecuperable mensaje={errorCarga} onReintentar={cargarProveedores} />
      )}

      {!cargando && !errorCarga && (
        <SunmiCard className="p-3 space-y-4">
          {/* ── Proveedor ─────────────────────────────────────────────── */}
          <div className="space-y-1">
            <label htmlFor="proveedor" className="text-[12px] font-semibold sunmi-text-strong block">
              Proveedor
            </label>
            <SunmiSelectAdv
              id="proveedor"
              value={proveedorId}
              onChange={(v) => {
                setProveedorId(v);
                setErrorEnvio(null);
              }}
              placeholder="Elegí un proveedor"
              searchable
            >
              {/* Los que no admiten importación se listan igual, con la marca.
                  Esconderlos dejaría al usuario buscando un proveedor que está
                  ahí y que solo necesita que le configuren el formato. */}
              {proveedores.map((prov) => (
                <SunmiSelectOption key={prov.id} value={String(prov.id)}>
                  {prov.admiteImportacion
                    ? prov.nombre
                    : `${prov.nombre} — sin formato configurado`}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
            {proveedor && !compat.admite && (
              <p className="text-[11.5px] sunmi-text-danger leading-snug">{compat.motivo}</p>
            )}

            {/* AVISA, NO BLOQUEA. Importar una lista nueva teniendo otra abierta
                del mismo proveedor es legítimo —una lista corregida, una de otro
                mes— pero casi siempre es que quedó una sin terminar. Se dice, con
                el enlace para ir a verla, y se deja seguir: bloquear obligaría a
                cerrar algo sin haberlo mirado. */}
            {abierta && (
              <div className="rounded-lg border sunmi-border p-2 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 sunmi-text-warning" aria-hidden="true" />
                <div className="min-w-0 text-[11.5px] leading-snug">
                  <span className="sunmi-text-warning font-semibold">
                    Este proveedor ya tiene una importación sin terminar.
                  </span>{" "}
                  <span className="sunmi-text-muted">
                    {abierta.archivoNombre} · {fechaHora(abierta.createdAt)}. Podés importar igual;
                    las dos van a quedar abiertas.
                  </span>{" "}
                  <button
                    type="button"
                    onClick={() => router.push(`/modulos/proveedores/listas/${abierta.id}`)}
                    className="sunmi-text-accent hover:underline"
                  >
                    Ver la que está abierta
                  </button>
                </div>
              </div>
            )}
            {proveedores.length === 0 && (
              <p className="text-[11.5px] sunmi-text-muted">
                No hay proveedores visibles en este contexto.
              </p>
            )}
          </div>

          {/* ── Cómo se leen los precios de este proveedor ─────────────── */}
          {proveedor && compat.admite && (
            <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-3">
              <div>
                <h2 className="text-sm3 font-semibold sunmi-text-strong leading-tight">
                  Cómo se leen los precios de {proveedor.nombre}
                </h2>
                <p className="text-sm2 sunmi-text-muted leading-snug mt-0.5">
                  Con esto el sistema decide solo qué costo corresponde. Vale para esta
                  lista; para dejarlo fijo está el botón de abajo.
                </p>
              </div>

              {/* CUÁNTO SE ESPERA QUE AUMENTE. Es el dato del que cuelga todo:
                  el sistema calcula las lecturas posibles de cada precio y se
                  queda con la que cae acá adentro. */}
              <CampoConfig
                etiqueta="Cuánto suele aumentar este proveedor"
                ayuda="Un producto que quede fuera de este rango se marca para revisar y no se aplica solo."
              >
                <div className="flex items-center gap-2">
                  <SunmiInput
                    id="minPct"
                    type="number"
                    inputMode="decimal"
                    value={minPct}
                    onChange={(e) => setMinPct(e.target.value)}
                    placeholder="desde"
                    aria-label="Aumento mínimo esperado, en por ciento"
                    className="min-h-toque text-base w-full"
                  />
                  <span className="text-sm3 sunmi-text-muted shrink-0">% a</span>
                  <SunmiInput
                    id="maxPct"
                    type="number"
                    inputMode="decimal"
                    value={maxPct}
                    onChange={(e) => setMaxPct(e.target.value)}
                    placeholder="hasta"
                    aria-label="Aumento máximo esperado, en por ciento"
                    className="min-h-toque text-base w-full"
                  />
                  <span className="text-sm3 sunmi-text-muted shrink-0">%</span>
                </div>
              </CampoConfig>

              <CampoConfig
                etiqueta="Qué se le suma al precio de lista"
                ayuda="El recargo comercial que este proveedor cobra por encima de su lista."
              >
                <div className="flex items-center gap-2">
                  <SunmiInput
                    id="recargoPct"
                    type="number"
                    inputMode="decimal"
                    value={recargoPct}
                    onChange={(e) => setRecargoPct(e.target.value)}
                    placeholder="0"
                    aria-label="Recargo, en por ciento"
                    className="min-h-toque text-base w-full"
                  />
                  <span className="text-sm3 sunmi-text-muted shrink-0">%</span>
                </div>
              </CampoConfig>

              {/* SÍ O NO CON DOS BOTONES GRANDES, no con una casilla.
                  El kit no tiene casilla y las dos que hay en el módulo miden
                  14 × 14 px, que en un Sunmi es un blanco que se falla. Dos
                  botones de 44 se tocan con el pulgar y además muestran cuál
                  está elegido sin mirar de cerca.
                  Y arranca en NINGUNO elegido a propósito: "no contestó" y "no
                  tiene" son hechos distintos y la pantalla no puede contestar
                  por el usuario. */}
              <CampoConfig
                etiqueta="¿Suma algún impuesto aparte de los de la lista?"
                ayuda="Si la factura de este proveedor trae algún impuesto que la lista no incluye."
              >
                <div className="grid grid-cols-2 gap-2">
                  <SunmiButton
                    color={tieneImpuestos === false ? "cyan" : "slate"}
                    onClick={() => { setTieneImpuestos(false); setImpuestoPct("0"); }}
                    aria-pressed={tieneImpuestos === false}
                    className="min-h-toque text-sm3 font-semibold"
                  >
                    No suma nada
                  </SunmiButton>
                  <SunmiButton
                    color={tieneImpuestos === true ? "cyan" : "slate"}
                    onClick={() => setTieneImpuestos(true)}
                    aria-pressed={tieneImpuestos === true}
                    className="min-h-toque text-sm3 font-semibold"
                  >
                    Sí, suma
                  </SunmiButton>
                </div>
                {tieneImpuestos === true && (
                  <div className="flex items-center gap-2 mt-2">
                    <SunmiInput
                      id="impuestoPct"
                      type="number"
                      inputMode="decimal"
                      value={impuestoPct}
                      onChange={(e) => setImpuestoPct(e.target.value)}
                      placeholder="0"
                      aria-label="Impuesto adicional, en por ciento"
                      className="min-h-toque text-base w-full"
                    />
                    <span className="text-sm3 sunmi-text-muted shrink-0">%</span>
                  </div>
                )}
              </CampoConfig>

              {/* QUÉ FALTA, dicho en la pantalla y no descubierto al apretar.
                  El texto sale del mismo módulo que usa el servidor para
                  rechazar. */}
              {!configCompleta && (
                <p className="text-sm2 sunmi-text-warning leading-snug">
                  Falta completar esto para poder importar la lista.
                </p>
              )}

              <div className="pt-1">
                <SunmiButton
                  color="slate"
                  onClick={guardarParaLasProximas}
                  disabled={!configCompleta || guardando}
                  className="w-full min-h-toque text-sm3"
                >
                  {guardando ? "Guardando…" : `Guardar para las próximas de ${proveedor.nombre}`}
                </SunmiButton>
                {avisoGuardado && (
                  <p className="text-sm2 sunmi-text-muted leading-snug mt-1">{avisoGuardado}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Archivo ───────────────────────────────────────────────── */}
          <div className="space-y-1">
            <label htmlFor="archivo" className="text-[12px] font-semibold sunmi-text-strong block">
              Archivo de la lista ({LIMITES.extensiones.join(", ")})
            </label>
            <input
              ref={inputArchivo}
              id="archivo"
              name="archivo"
              type="file"
              accept=".xlsx"
              onChange={elegirArchivo}
              disabled={enviando}
              className="block w-full text-[12px] sunmi-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:sunmi-btn-base file:sunmi-btn-slate"
            />
            {archivo && (
              <p className="text-[11.5px] sunmi-text-success">
                {archivo.name} · {tamanoArchivo(archivo.size)}
              </p>
            )}
            {errorArchivo && <p className="text-[11.5px] sunmi-text-danger">{errorArchivo}</p>}
            <p className="text-[10.5px] sunmi-text-muted">
              Hasta {Math.round(LIMITES.tamanoMaxBytes / 1024 / 1024)} MB y {LIMITES.filasMax} filas.
            </p>
          </div>

          {/* ── El error del servidor ─────────────────────────────────── */}
          {errorEnvio && (
            <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
              <p className="text-[12px] sunmi-text-danger leading-snug">{errorEnvio.mensaje}</p>
              {errorEnvio.detalle && (
                <p className="text-[11.5px] sunmi-text-muted">{errorEnvio.detalle}</p>
              )}
              {errorEnvio.duplicada && errorEnvio.importacionId && (
                <SunmiButton
                  color="slate"
                  onClick={() =>
                    router.push(`/modulos/proveedores/listas/${errorEnvio.importacionId}`)
                  }
                  className="py-2 text-xs"
                >
                  Abrir la importación existente
                </SunmiButton>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 pt-1">
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos/proveedores/listas")}
              disabled={enviando}
              className="py-3 text-xs order-2 sm:order-1"
            >
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="cyan"
              onClick={importar}
              disabled={!puedeEnviar}
              className="py-3 font-bold text-xs order-1 sm:order-2 inline-flex items-center justify-center gap-1"
            >
              <Upload size={14} aria-hidden="true" />
              {enviando ? "Importando…" : "Importar y conciliar"}
            </SunmiButton>
          </div>
        </SunmiCard>
      )}
    </Marco>
  );
}

/**
 * Un campo de la configuración comercial: rótulo, control y una línea que dice
 * para qué sirve.
 *
 * La ayuda NO es decorativa y por eso va en la pieza y no como un `<p>` suelto
 * al lado de cada campo: el que carga esto no sabe qué es un "rango de aumento
 * esperado", y un rótulo solo lo dejaría adivinando. Está acá adentro para que
 * ningún campo pueda quedarse sin ella por olvido.
 */
function CampoConfig({ etiqueta, ayuda, children }) {
  return (
    <div className="space-y-1">
      <p className="text-sm3 font-semibold sunmi-text-strong leading-tight">{etiqueta}</p>
      {children}
      <p className="text-sm2 sunmi-text-muted leading-snug">{ayuda}</p>
    </div>
  );
}

function Marco({ children, router }) {
  return (
    <div className="p-2 lg:p-3 space-y-3 w-full max-w-[720px] mx-auto">
      <button
        type="button"
        onClick={() => router.push("/modulos/proveedores/listas")}
        className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver al historial
      </button>
      {children}
    </div>
  );
}
