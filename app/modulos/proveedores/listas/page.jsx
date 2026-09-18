"use client";

// 1 · LISTAS DE PROVEEDOR — el historial, como una lista de trabajo.
//
// ── QUÉ CAMBIÓ Y POR QUÉ ────────────────────────────────────────────────────
//
// Antes era una tabla de trece columnas —filas, para aplicar, actualizados, sin
// cambios, sin vincular, bloqueadas, armado, errores— y cada fila obligaba a
// leerlas todas para saber si había algo que hacer. En un teléfono eso son trece
// cifras de once píxeles.
//
// Ahora cada importación dice UNA cosa: en qué situación está. "850 listos para
// aplicar" es accionable; "totalFilas 954 · listos 850 · sinCambios 0 · …" es un
// informe. Los trece números siguen estando en la pantalla de adentro, que es
// donde se usan.
//
// Y se separa lo que quedó a medias de lo terminado, porque son dos cosas
// distintas: una pide trabajo, la otra es historia.
//
// ── LOS NÚMEROS SON DEL SERVIDOR ────────────────────────────────────────────
//
// Los contadores de los chips y el total de productos actualizados se cuentan en
// la base, sobre TODO el historial y en productos sin duplicados. Contarlos acá
// sobre los veinte de la página diría "A medias 2" cuando hay cinco.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiChipsFiltro, { CLAVE_TODAS } from "@/components/sunmi/SunmiChipsFiltro";

import { Paginacion, Vacio, ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
// LA MISMA confirmación que usa el resultado. Escribir acá una parecida dejaría
// dos versiones de lo que pasa con los costos aplicados, y el día que una se
// corrija la otra miente.
import ModalCancelarImportacion from "@/components/proveedores/listas/ModalCancelarImportacion";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { fechaHora } from "@/lib/proveedores/listas/presentacion";
import { ESTADOS_A_MEDIAS } from "@/lib/proveedores/listas/persistencia";

const PAGE_SIZE = 20;

/**
 * LA LÍNEA DE ESTADO DE UNA TARJETA, que es todo lo que la tarjeta afirma.
 *
 * Vive acá y no adentro del JSX para poder ejercerla en un candado sin montar
 * React: lo que se afirma es que cada estado dice algo distinto y que ninguno
 * miente sobre si ya se escribieron costos.
 */
export function lineaDeEstado(i) {
  const listos = Number(i?.productosListos ?? 0);
  const actualizados = Number(i?.productosActualizados ?? 0);

  if (i?.estado === "CANCELADA") {
    return { texto: "Cancelada", tono: "sunmi-text-muted" };
  }
  if (i?.estado === "TERMINADA") {
    return {
      texto: `Terminada · ${actualizados} ${actualizados === 1 ? "actualizado" : "actualizados"}`,
      tono: "sunmi-text-muted",
    };
  }
  // YA SE APLICÓ ALGO PERO QUEDA TRABAJO. Es el caso que la versión anterior no
  // sabía decir: mostraba "listos para aplicar" sobre una lista que ya había
  // escrito 279 costos, así que parecía que no se había hecho nada.
  if (actualizados > 0 && listos > 0) {
    return { texto: `Aplicada · ${listos} para revisar`, tono: "sunmi-text-warning" };
  }
  if (actualizados > 0) {
    return { texto: `Aplicada · ${actualizados} actualizados`, tono: "sunmi-text-warning" };
  }
  if (listos > 0) {
    return {
      texto: `${listos} ${listos === 1 ? "listo" : "listos"} para aplicar`,
      tono: "sunmi-text-success",
    };
  }
  return { texto: "Sin nada para aplicar", tono: "sunmi-text-muted" };
}

/** ¿Esta importación pide trabajo? */
export function quedoAMedias(i) {
  return ESTADOS_A_MEDIAS.includes(i?.estado);
}

const FILTROS = [
  { clave: "A_MEDIAS", texto: "A medias" },
  { clave: "TERMINADAS", texto: "Terminadas" },
  { clave: "CANCELADAS", texto: "Canceladas" },
];

export default function HistorialListasPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [conteo, setConteo] = useState({ aMedias: 0, terminadas: 0, canceladas: 0 });
  const [filtro, setFiltro] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [buscado, setBuscado] = useState("");
  const [pag, setPag] = useState({ page: 1, paginas: 1, total: 0 });
  const [page, setPage] = useState(1);
  /** La lista que se está por cancelar, o null. El objeto entero, no el id: el
   *  modal necesita el nombre del archivo y cuántos costos ya aplicó. */
  const [aCancelar, setACancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorAlCancelar, setErrorAlCancelar] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  // ── ACÁ SÍ MANDA EL TÍTULO DEL MENÚ ─────────────────────────────────────
  //
  // Esta pantalla NO registra título: "Listas de proveedores" es correcto y es
  // el único lugar donde lo es. Adentro de una lista cada pantalla registra el
  // suyo, que es de lo que se trata el cambio.
  //
  // La salida sí va al slot del shell, como en las otras cinco: la misma pieza,
  // el mismo alto de toque y la misma fila que nunca scrollea.
  useAccionDePagina(
    () => <SunmiBackButton href="/modulos/compras" texto="Compras" className="min-h-toque" />,
    []
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (filtro) qs.set("filtro", filtro);
      if (buscado) qs.set("buscar", buscado);
      const r = await fetch(`/api/proveedores/listas?${qs}`, { credentials: "include", cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar el historial.");
        return;
      }
      setItems(json.items ?? []);
      setConteo(json.conteo ?? { aMedias: 0, terminadas: 0, canceladas: 0 });
      setPag(json.paginacion ?? { page: 1, paginas: 1, total: 0 });
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [page, filtro, buscado]);

  /**
   * Cancela la lista que el modal tiene abierta.
   *
   * Al volver se RECARGA el listado: la cancelada sale de "Quedaron a medias" y
   * pasa a las cerradas. Sin recargar, la tarjeta se quedaría entre las
   * pendientes con la lista ya cancelada en la base, que es exactamente la clase
   * de pantalla que hace dudar de si el botón hizo algo.
   */
  const cancelarLista = async () => {
    if (!aCancelar) return;
    setCancelando(true);
    setErrorAlCancelar(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${aCancelar.id}/cancelar`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErrorAlCancelar(j?.error || `No se pudo cancelar la lista (error ${r.status}).`);
        return;
      }
      setACancelar(null);
      await cargar();
    } catch {
      setErrorAlCancelar("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCancelando(false);
    }
  };

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  // EL BUSCADOR ESPERA A QUE DEJEN DE ESCRIBIR. Sin esto, escribir "arcor" son
  // cinco consultas y las cinco corren contra la base del negocio.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscado(buscar.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [buscar]);

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">
            Seleccioná un contexto operativo para ver las listas.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  const aMedias = items.filter(quedoAMedias);
  const cerradas = items.filter((i) => !quedoAMedias(i));

  const opciones = FILTROS.map((f) => ({
    ...f,
    texto:
      f.clave === "A_MEDIAS" && conteo.aMedias > 0 ? `A medias ${conteo.aMedias}` : f.texto,
  }));

  return (
    <Marco>
      <SunmiButton
        color="cyan"
        onClick={() => router.push("/modulos/proveedores/listas/nueva")}
        className="w-full min-h-toque text-base font-semibold"
      >
        + Subir una lista
      </SunmiButton>

      <SunmiInput
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar proveedor"
        aria-label="Buscar proveedor"
        className="min-h-toque"
      />

      <SunmiChipsFiltro
        opciones={opciones}
        valor={filtro}
        onCambiar={(v) => {
          setFiltro(v === CLAVE_TODAS ? null : v);
          setPage(1);
        }}
        textoTodas="Todas"
      />

      {cargando && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && error && <ErrorRecuperable mensaje={error} onReintentar={cargar} />}

      {!cargando && !error && items.length === 0 && (
        <Vacio
          titulo={buscado ? "No hay listas de ese proveedor" : "Todavía no subiste ninguna lista"}
          detalle={
            buscado
              ? "Probá con otro nombre, o sacá el filtro."
              : "Subí el archivo de un proveedor para ver qué costos propone. Leerlo no cambia ningún precio."
          }
          accion={
            <SunmiButton
              color="cyan"
              onClick={() => router.push("/modulos/proveedores/listas/nueva")}
              className="min-h-toque"
            >
              Subir una lista
            </SunmiButton>
          }
        />
      )}

      {!cargando && !error && aMedias.length > 0 && (
        <Grupo titulo="Quedaron a medias">
          {aMedias.map((i) => (
            <TarjetaLista key={i.id} item={i} router={router} onCancelar={setACancelar} />
          ))}
        </Grupo>
      )}

      {!cargando && !error && cerradas.length > 0 && (
        <Grupo titulo={filtro === "CANCELADAS" ? "Canceladas" : "Terminadas hace poco"}>
          {cerradas.map((i) => (
            <TarjetaLista key={i.id} item={i} router={router} onCancelar={setACancelar} />
          ))}
        </Grupo>
      )}

      {/* El mismo modal que usa el resultado, con el mismo texto. Escribir acá
          una confirmación parecida dejaría dos versiones de lo que pasa con los
          costos aplicados, y el día que una se corrija la otra miente. */}
      <ModalCancelarImportacion
        abierto={aCancelar !== null}
        archivo={aCancelar?.archivoNombre}
        aplicados={aCancelar?.productosActualizados ?? 0}
        trabajando={cancelando}
        onCerrar={() => {
          setACancelar(null);
          setErrorAlCancelar(null);
        }}
        onCancelar={cancelarLista}
      />

      {errorAlCancelar && <ErrorRecuperable mensaje={errorAlCancelar} onReintentar={cargar} />}

      {!cargando && !error && items.length > 0 && (
        <Paginacion
          page={pag.page}
          paginas={pag.paginas}
          total={pag.total}
          cargando={cargando}
          onPage={setPage}
        />
      )}
    </Marco>
  );
}

function Grupo({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm2 font-semibold sunmi-text-muted">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Una importación.
 *
 * El botón "Seguir" solo aparece en las que quedaron a medias: en una terminada
 * no hay nada que seguir, y ofrecerlo igual convierte la pantalla en una lista de
 * botones que no hacen lo que dicen. Para verla igual, la tarjeta entera lleva.
 */
function TarjetaLista({ item, router, onCancelar }) {
  const linea = lineaDeEstado(item);
  const ir = () => router.push(`/modulos/proveedores/listas/${item.id}`);
  const aMedias = quedoAMedias(item);

  return (
    <SunmiCard className="p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold sunmi-text-strong truncate">
            {item.proveedor?.nombre ?? "—"}
          </div>
          <div className="text-xs2 sunmi-text-muted truncate" title={item.archivoNombre}>
            {fechaHora(item.createdAt)} · {item.archivoNombre}
          </div>
          <div className={`text-sm2 font-semibold ${linea.tono}`}>{linea.texto}</div>
        </div>
        {aMedias ? (
          <SunmiButton color="cyan" onClick={ir} className="min-h-toque min-w-toque shrink-0 text-sm2">
            Seguir
          </SunmiButton>
        ) : (
          <SunmiButton color="ghost" onClick={ir} className="min-h-toque min-w-toque shrink-0 text-sm2 sunmi-text-link">
            Ver
          </SunmiButton>
        )}
      </div>

      {/* ── CANCELAR, DESDE ACÁ Y SOLO EN LAS QUE QUEDARON A MEDIAS ───────
          Es la pantalla donde se ve el problema: la sección "Quedaron a medias"
          junta las listas que nadie cerró, y hasta ahora la única forma de sacar
          una de ahí era entrar, no encontrar cómo cancelarla, y terminarla —con lo
          que quedaba en el historial como trabajo terminado.
          Va en su propio renglón y no al lado de "Seguir": son dos acciones de
          peso muy distinto y a 360 px un toque de más al costado del pulgar es
          justamente el que no se quiere. */}
      {aMedias && (
        <div className="mt-2 flex justify-end">
          <SunmiButton
            color="ghost"
            onClick={() => onCancelar(item)}
            className="min-h-toque text-sm2 sunmi-text-muted"
          >
            Cancelar esta lista
          </SunmiButton>
        </div>
      )}
    </SunmiCard>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
