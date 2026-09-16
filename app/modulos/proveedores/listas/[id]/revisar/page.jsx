"use client";

// 5 · PARA REVISAR — lo que el sistema NO se anima a decidir solo.
//
// ── POR QUÉ SE AGRUPA POR MOTIVO Y NO POR PRODUCTO ──────────────────────────
//
// Porque lo que decide qué hacer con una fila es POR QUÉ está acá, y dentro de un
// motivo la decisión se repite igual cien veces. Mezcladas, cada tarjeta obliga a
// releer de qué se trata; agrupadas, se entiende una vez y después se resuelve en
// serie —o de una sola vez, con el botón del grupo—.
//
// Son cuatro motivos y cada uno pide algo distinto:
//
//   aumentan distinto   mirar el porcentaje y decidir si corresponde
//   sin costo cargado   decidir a ciegas, y por eso se pregunta aparte
//   no están            vincularlos con un producto, o ignorarlos
//   repetidos           elegir cuál de los dos precios rige
//
// ── LO QUE SE DECIDE ACÁ NO SE APLICA ACÁ ───────────────────────────────────
//
// Confirmar una fila la deja lista; excluirla la saca. Los costos se escriben
// recién al tocar Aplicar, en la pantalla de resultado, y todo se puede deshacer.
// Es la misma regla que el resto del módulo y por eso esta pantalla no tiene
// ningún botón que escriba un costo.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  Encabezado,
  FilaMotivo,
  TresCifras,
  AccionesDeFila,
  Aviso,
  money,
} from "@/components/proveedores/listas/PiezasPantallas";
import PanelVincular from "@/components/proveedores/listas/PanelVincular";
import {
  MOTIVO_REVISION,
  TEXTO_MOTIVO_REVISION,
  ORDEN_MOTIVOS,
} from "@/lib/proveedores/listas/resultadoDeLaLista";

export default function RevisarPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [motivo, setMotivo] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [vinculando, setVinculando] = useState(null);
  // La fila cuyo "Usar $X" pide una confirmación aparte, por no tener costo.
  const [confirmandoACiegas, setConfirmandoACiegas] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargar = useCallback(async (m) => {
    setCargando(true);
    setError("");
    try {
      const qs = m ? `?motivo=${m}&pageSize=25` : "";
      const r = await fetch(`/api/proveedores/listas/${id}/resultado${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar la cola de revisión.");
        return;
      }
      setDatos(json);
      // EL PRIMER MOTIVO CON ALGO ADENTRO. Abrir en uno vacío haría que la
      // pantalla se vea sin trabajo cuando hay 106 filas esperando.
      if (!m) {
        const primero = ORDEN_MOTIVOS.find((x) => (json.conteo.porMotivo?.[x] ?? 0) > 0);
        if (primero) {
          setMotivo(primero);
          return;
        }
      }
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    cargar(motivo);
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, motivo]);

  /** Dejar como está: la fila se excluye y no se aplica. */
  const dejarComoEsta = async (ids) => {
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "EXCLUIR", ids }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo marcar." });
        return;
      }
      setAviso({
        tono: "success",
        texto: `${ids.length} ${ids.length === 1 ? "producto queda" : "productos quedan"} con su costo de ahora.`,
      });
      await cargar(motivo);
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  /** Usar el costo de una lectura: la fila queda lista para aplicar. */
  const usarLectura = async (fila, lectura) => {
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/confirmar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: lectura.clave }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo usar ese precio." });
        return;
      }
      setConfirmandoACiegas(null);
      setAviso({ tono: "success", texto: `${fila.nombre}: queda en ${money(lectura.costoNuevo)}.` });
      await cargar(motivo);
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">
            Seleccioná un contexto operativo.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando && !datos) {
    return (
      <Marco><SunmiCard className="p-6"><SunmiLoader /></SunmiCard></Marco>
    );
  }

  if (error) {
    return <Marco><ErrorRecuperable mensaje={error} onReintentar={() => cargar(motivo)} /></Marco>;
  }

  const { conteo, cabecera, cola } = datos;
  const texto = motivo ? TEXTO_MOTIVO_REVISION[motivo] : null;

  return (
    <Marco>
      <Encabezado
        volverTexto="Resultado"
        onVolver={() => router.push(`/modulos/proveedores/listas/${id}`)}
        titulo={`Para revisar · ${conteo.paraRevisar}`}
        subtitulo="Ninguno de estos se cambia solo. Decidí vos."
      />

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <div className="space-y-2">
        {ORDEN_MOTIVOS.filter((m) => (conteo.porMotivo?.[m] ?? 0) > 0).map((m) => (
          <FilaMotivo
            key={m}
            titulo={TEXTO_MOTIVO_REVISION[m].titulo}
            cantidad={conteo.porMotivo[m]}
            elegido={motivo === m}
            // EL CARTEL SE VA AL CAMBIAR DE GRUPO. Si no, "TOSTEX: queda en
            // $2.826,83" —de una fila que se resolvió en «aumentan distinto»—
            // queda arriba de la lista de «sin costo cargado» y se lee como si
            // fuera la respuesta a lo que se acaba de tocar acá. Lo confundió
            // hasta el arnés de prueba, que lo tomó por el acuse de un botón
            // que en realidad todavía no había terminado.
            onClick={() => { setAviso(null); setMotivo(m); }}
          />
        ))}
      </div>

      {conteo.paraRevisar === 0 && (
        <SunmiCard className="p-5 text-center space-y-2">
          <p className="text-base font-semibold sunmi-text-success">No queda nada para revisar.</p>
          <SunmiButton
            color="cyan"
            onClick={() => router.push(`/modulos/proveedores/listas/${id}`)}
            className="min-h-toque"
          >
            Volver al resultado
          </SunmiButton>
        </SunmiCard>
      )}

      {motivo && texto && (
        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold sunmi-text-strong">{texto.titulo}</h2>
            <p className="text-sm2 sunmi-text-muted leading-snug">{texto.ayuda(cabecera.rango)}</p>
          </div>

          {cargando && <SunmiCard className="p-6"><SunmiLoader /></SunmiCard>}

          {!cargando && cola?.filas?.map((f) => (
            <TarjetaFila
              key={f.id}
              fila={f}
              motivo={motivo}
              trabajando={trabajando}
              onDejar={() => dejarComoEsta([f.id])}
              onUsar={(lectura) => {
                // SIN COSTO CARGADO SE PREGUNTA APARTE. Es la única situación en
                // la que el precio NO se pudo controlar contra nada: aceptarlo
                // con el mismo toque que los demás borraría la diferencia entre
                // un costo verificado y uno a ciegas.
                if (motivo === MOTIVO_REVISION.SIN_COSTO) {
                  setConfirmandoACiegas({ fila: f, lectura });
                  return;
                }
                usarLectura(f, lectura);
              }}
              onVincular={() => setVinculando(f)}
            />
          ))}

          {!cargando && cola?.ids?.length > 0 && motivo !== MOTIVO_REVISION.SIN_PRODUCTO && (
            <SunmiButton
              color="slate"
              onClick={() => dejarComoEsta(cola.ids)}
              disabled={trabajando}
              className="w-full min-h-toque text-sm3"
            >
              Dejar los {cola.total} como están
            </SunmiButton>
          )}

          {!cargando && cola && cola.total > cola.filas.length && (
            <p className="text-sm2 sunmi-text-muted text-center">
              Mostrando {cola.filas.length} de {cola.total}. Resolvé estos y seguí con los que quedan.
            </p>
          )}
        </section>
      )}

      {/* USAR UN PRECIO QUE NO SE PUDO CONTROLAR: segunda pregunta. */}
      {confirmandoACiegas && (
        <SunmiCard className="p-4 space-y-3 sunmi-state-warning">
          <p className="text-sm3 font-semibold leading-snug">
            {confirmandoACiegas.fila.nombre} no tiene costo cargado, así que este precio no se pudo
            controlar contra nada.
          </p>
          <p className="text-sm2 leading-snug">
            Si lo usás, el costo queda en {money(confirmandoACiegas.lectura.costoNuevo)} porque lo
            decidiste vos, no porque el sistema lo haya verificado.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton
              color="slate"
              onClick={() => setConfirmandoACiegas(null)}
              disabled={trabajando}
              className="min-h-toque text-sm2"
            >
              Mejor no
            </SunmiButton>
            <SunmiButton
              color="cyan"
              onClick={() => usarLectura(confirmandoACiegas.fila, confirmandoACiegas.lectura)}
              disabled={trabajando}
              className="min-h-toque text-sm2"
            >
              Usarlo igual
            </SunmiButton>
          </div>
        </SunmiCard>
      )}

      {vinculando && (
        <PanelVincular
          abierto
          importacionId={id}
          fila={{
            id: vinculando.id,
            codigoCrudo: vinculando.codigo,
            descripcionProveedor: vinculando.nombreEnElArchivo,
            sugerenciaProductoBaseId: vinculando.sugerencia?.productoBaseId ?? null,
            sugerenciaNombre: vinculando.sugerencia?.nombre ?? null,
          }}
          onCerrar={() => setVinculando(null)}
          onVinculado={async () => {
            setVinculando(null);
            setAviso({
              tono: "success",
              texto: "Vinculado. Las próximas listas de este proveedor lo van a reconocer solo.",
            });
            await cargar(motivo);
          }}
        />
      )}
    </Marco>
  );
}

/**
 * Una fila para revisar.
 *
 * Qué botones tiene depende del motivo, y no al revés: en "no está en tu
 * catálogo" no hay ningún precio que usar porque no hay producto, así que
 * ofrecer "Usar $X" sería ofrecer algo imposible.
 */
function TarjetaFila({ fila, motivo, trabajando, onDejar, onUsar, onVincular }) {
  const lecturas = fila.lecturas ?? [];
  // La que el motor recomendó, o la primera que no sea absurda, o la primera.
  const sugerida =
    lecturas.find((l) => l.recomendada) ?? lecturas.find((l) => !l.absurda) ?? lecturas[0] ?? null;

  return (
    <SunmiCard className="p-3 space-y-3">
      <div>
        <div className="text-sm3 font-semibold sunmi-text-strong leading-snug">{fila.nombre}</div>
        <div className="text-xs2 sunmi-text-muted">
          Código {fila.codigo}
          {fila.donde ? ` · ${fila.donde}` : ""}
          {fila.factorPack ? ` · Caja de ${fila.factorPack}` : ""}
        </div>
      </div>

      {motivo === MOTIVO_REVISION.SIN_PRODUCTO ? (
        <>
          <p className="text-sm2 sunmi-text-muted">
            Dice la lista: <span className="sunmi-text-strong tabular-nums">{money(fila.diceLaLista)}</span>
          </p>
          {fila.sugerencia && (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              ¿Será <span className="sunmi-text-strong">{fila.sugerencia.nombre}</span>?
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onDejar} disabled={trabajando} className="min-h-toque text-sm2">
              Ignorar
            </SunmiButton>
            <SunmiButton color="cyan" onClick={onVincular} disabled={trabajando} className="min-h-toque text-sm2">
              Vincular
            </SunmiButton>
          </div>
        </>
      ) : (
        <>
          <TresCifras
            costoAnterior={fila.costoAnterior}
            diceLaLista={fila.diceLaLista}
            variacionPct={sugerida?.variacionPct ?? fila.variacionPct}
          />

          {/* LAS DOS LECTURAS, cuando hay dos. Es el caso del bulto: el mismo
              precio puede ser el de la caja o el de la unidad, y cuál es se ve
              comparando los dos porcentajes. */}
          {lecturas.length > 1 && (
            <div className="space-y-1">
              {lecturas.map((l) => (
                <SunmiButton
                  key={l.clave}
                  color="ghost"
                  onClick={() => onUsar(l)}
                  disabled={trabajando}
                  className="w-full text-left min-h-toque sunmi-surface-soft rounded-lg px-3 block"
                >
                  <span className="text-sm3 sunmi-text-strong tabular-nums">{money(l.costoNuevo)}</span>
                  <span className="block text-xs2 sunmi-text-muted leading-snug">{l.detalle}</span>
                </SunmiButton>
              ))}
              <SunmiButton
                color="slate"
                onClick={onDejar}
                disabled={trabajando}
                className="w-full min-h-toque text-sm2"
              >
                Dejar como está
              </SunmiButton>
            </div>
          )}

          {lecturas.length <= 1 && (
            <AccionesDeFila
              textoUsar={sugerida ? `Usar ${money(sugerida.costoNuevo)}` : "Sin precio"}
              onDejar={onDejar}
              onUsar={() => sugerida && onUsar(sugerida)}
              trabajando={trabajando}
              deshabilitarUsar={!sugerida}
            />
          )}
        </>
      )}
    </SunmiCard>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
