"use client";

// CORRECCIONES HISTÓRICAS DE CAJA.
//
// Una acción administrativa excepcional, no un módulo: lista los manifiestos que
// hay en el repo, permite ENSAYAR cada uno en seco contra la base real y, solo
// si el manifiesto está AUTORIZADO, APLICARLO con confirmación escrita.
//
// La pantalla no calcula nada: todo el plan —valores antes y después, filas
// tocadas y no tocadas, invariantes, huella— lo arma el motor en el servidor
// (`lib/caja/correcciones/motor.js`), el mismo para ensayar y para aplicar.

import { useCallback, useEffect, useState } from "react";
import { TriangleAlert, FlaskConical } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";

import { PERMISO_CORREGIR_HISTORICO, ESTADO_MANIFIESTO } from "@/lib/caja/correcciones/permisos";

const valor = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function CorreccionesCajaPage() {
  const { perfil, cargando: cargandoUsuario } = useUser() || {};
  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puede = permisos.includes("*") || permisos.includes(PERMISO_CORREGIR_HISTORICO);

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [informes, setInformes] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [aplicando, setAplicando] = useState(null);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/caja/correcciones", { credentials: "include", cache: "no-store" }).then((x) => x.json());
      if (!r?.ok) {
        setError(r?.error || "No se pudieron leer las correcciones.");
        return;
      }
      setItems(r.items || []);
    } catch {
      setError("Error de conexión.");
    }
  }, []);

  useEffect(() => {
    if (!cargandoUsuario && puede) cargar();
  }, [cargandoUsuario, puede, cargar]);

  const ensayar = async (codigo) => {
    setOcupado(codigo);
    try {
      const r = await fetch("/api/caja/correcciones/ensayo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ codigo }),
      }).then((x) => x.json());
      setInformes((prev) => ({ ...prev, [codigo]: r?.informe ?? { errores: [r?.error || "No se pudo ensayar."] } }));
    } catch {
      setInformes((prev) => ({ ...prev, [codigo]: { errores: ["Error de conexión."] } }));
    } finally {
      setOcupado(null);
    }
  };

  const aplicar = async (codigo, confirmacion) => {
    setOcupado(codigo);
    try {
      const r = await fetch("/api/caja/correcciones/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ codigo, confirmacion }),
      }).then((x) => x.json());
      setInformes((prev) => ({ ...prev, [codigo]: r?.informe ?? { errores: [r?.error || "No se pudo aplicar."] } }));
      setAplicando(null);
      await cargar();
    } catch {
      setInformes((prev) => ({ ...prev, [codigo]: { errores: ["Error de conexión."] } }));
    } finally {
      setOcupado(null);
    }
  };

  if (cargandoUsuario) return null;
  if (!puede) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-6xl mx-auto">
      <SunmiCard className="p-3">
        <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">Correcciones históricas de caja</h1>
        <p className="text-sm2 sunmi-text-muted leading-snug mt-0.5">
          Incidentes de caja ya diagnosticados, con su valor corregido escrito en el repo.
        </p>
      </SunmiCard>

      <SunmiAviso icon={TriangleAlert} tono="warning" titulo="Primero el ensayo en seco">
        El ensayo calcula todo lo que cambiaría, lo escribe y lo deshace: no deja nada. Aplicar solo existe para un
        manifiesto AUTORIZADO con la huella exacta de un ensayo revisado.
      </SunmiAviso>

      {error && <SunmiAviso tono="danger">{error}</SunmiAviso>}
      {items === null && !error && <SunmiLoader />}
      {items && items.length === 0 && <SunmiAviso>No hay ningún manifiesto de corrección en el repo.</SunmiAviso>}

      {(items || []).map((m) => (
        <TarjetaManifiesto
          key={m.codigo}
          m={m}
          informe={informes[m.codigo]}
          ocupado={ocupado === m.codigo}
          onEnsayar={() => ensayar(m.codigo)}
          onAplicar={() => setAplicando(m.codigo)}
        />
      ))}

      {aplicando && (
        <ModalAplicar
          codigo={aplicando}
          confirmando={ocupado === aplicando}
          onCancelar={() => setAplicando(null)}
          onConfirmar={(texto) => aplicar(aplicando, texto)}
        />
      )}
    </div>
  );
}

function TarjetaManifiesto({ m, informe, ocupado, onEnsayar, onAplicar }) {
  const autorizado = m.estado === ESTADO_MANIFIESTO.AUTORIZADO;
  return (
    <SunmiCard className="p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold sunmi-text-strong font-mono">{m.codigo}</span>
        <SunmiPill color={autorizado ? "cyan" : "amber"}>{m.estado}</SunmiPill>
        {m.aplicada && <SunmiPill color="green">APLICADA</SunmiPill>}
      </div>
      <p className="text-sm3 sunmi-text-strong leading-snug">{m.motivo}</p>
      <p className="text-sm2 sunmi-text-muted leading-snug">{m.evidencia}</p>
      {m.dependeDe?.length > 0 && <p className="text-sm2 sunmi-text-muted">Depende de: {m.dependeDe.join(", ")}</p>}
      {m.aplicada && (
        <p className="text-sm2 sunmi-text-muted">
          Aplicada el {new Date(m.aplicada.ejecutadoEn).toLocaleString("es-AR")} · huella{" "}
          <span className="font-mono break-all">{m.aplicada.manifiestoHash}</span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SunmiButton color="slate" onClick={onEnsayar} disabled={ocupado}>
          {ocupado ? "Ensayando…" : "Ensayo en seco"}
        </SunmiButton>
        {/* Un PROPUESTO no tiene botón de aplicar: solo se ensaya. */}
        {autorizado && !m.aplicada && (
          <SunmiButton color="red" onClick={onAplicar} disabled={ocupado}>
            Aplicar corrección autorizada
          </SunmiButton>
        )}
      </div>

      {informe && <Informe informe={informe} />}
    </SunmiCard>
  );
}

function Informe({ informe }) {
  const errores = informe.errores || [];
  const esEnsayo = informe.resultado === "ENSAYO";
  const aplicada = informe.resultado === "APLICADA" || informe.resultado === "YA_APLICADA";
  const titulo = esEnsayo
    ? "ENSAYO EN SECO — no se escribió nada"
    : aplicada
      ? `CORRECCIÓN ${informe.resultado === "YA_APLICADA" ? "YA APLICADA" : "APLICADA"}`
      : "No se puede aplicar";

  return (
    <div className="space-y-2 border-t sunmi-border pt-2">
      <SunmiAviso icon={FlaskConical} tono={errores.length ? "danger" : aplicada ? "success" : "neutral"} titulo={titulo}>
        {errores.length ? errores.join(" ") : esEnsayo ? "Revisá el plan completo antes de autorizar su huella." : "Quedó registrada."}
      </SunmiAviso>

      {informe.hash && (
        <p className="text-sm2 sunmi-text-muted">
          Huella del plan: <span className="font-mono break-all sunmi-text-strong">{informe.hash}</span>
          {informe.hashAutorizado && (
            <span className={informe.hashCoincide ? "sunmi-text-success" : "sunmi-text-danger"}>
              {informe.hashCoincide ? " · coincide con la autorizada" : " · NO coincide con la autorizada"}
            </span>
          )}
        </p>
      )}

      {informe.cambios?.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm3 font-semibold sunmi-text-strong">Cambiaría ({informe.cambios.length} campos)</p>
          <ul className="space-y-1">
            {informe.cambios.map((c) => (
              <li key={`${c.entidad}-${c.id}-${c.campo}`} className="text-sm2 leading-snug break-words">
                <span className="sunmi-text-muted">{c.entidad} #{c.id} · {c.campo}: </span>
                <span className="font-mono sunmi-text-danger">{valor(c.antes)}</span>
                <span className="sunmi-text-muted"> → </span>
                <span className="font-mono sunmi-text-success">{valor(c.despues)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {informe.filasSinCambio?.length > 0 && (
        <p className="text-sm2 sunmi-text-muted break-words">
          Leídas y sin cambio: {informe.filasSinCambio.join(", ")}
        </p>
      )}

      {informe.invariantes?.length > 0 && (
        <ul className="space-y-0.5">
          {informe.invariantes.map((i) => (
            <li key={i.nombre} className={`text-sm2 ${i.ok ? "sunmi-text-muted" : "sunmi-text-danger"}`}>
              {i.ok ? "✓" : "✗"} {i.nombre}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Aplicar pide escribir el código: que sea una decisión, no un toque. */
function ModalAplicar({ codigo, confirmando, onCancelar, onConfirmar }) {
  const [texto, setTexto] = useState("");
  const coincide = texto.trim() === codigo;
  return (
    <SunmiModalLayout
      open
      title="Aplicar corrección autorizada"
      onClose={onCancelar}
      // Sin `destructivo`: es una confirmación, no un formulario. Lo único que se
      // pierde al cerrar sin querer es el código escrito, y cerrar sin aplicar
      // es justamente la salida segura.
      z={9999}
      espacioCuerpo="space-y-3"
      forma="hoja-o-centrado"
      footer={
        <>
          <SunmiButton color="slate" onClick={onCancelar} disabled={confirmando}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="red" onClick={() => onConfirmar(texto.trim())} disabled={!coincide || confirmando}>
            {confirmando ? "Aplicando…" : "Aplicar"}
          </SunmiButton>
        </>
      }
    >
      <SunmiAviso icon={TriangleAlert} tono="danger" titulo="Esto escribe en la base">
        Se aplica el plan autorizado de {codigo}, solo si hoy da exactamente la misma huella. Queda registrado con tu
        usuario y no se puede aplicar dos veces.
      </SunmiAviso>
      <label htmlFor="confirmar-codigo" className="block text-sm2 font-semibold sunmi-text-strong">
        Escribí {codigo} para confirmar
      </label>
      <SunmiInput id="confirmar-codigo" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
    </SunmiModalLayout>
  );
}
