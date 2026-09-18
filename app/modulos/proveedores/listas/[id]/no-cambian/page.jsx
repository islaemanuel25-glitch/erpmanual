"use client";

// 7 · TUS PRODUCTOS QUE NO CAMBIAN.
//
// ── LA PREGUNTA ES DE EMANUEL Y NO ESTABA EN NINGÚN LADO ────────────────────
//
// Todo el módulo mira el ARCHIVO: qué trajo el proveedor y qué hacer con cada
// renglón. Lo que él necesita saber antes de aplicar es lo contrario: de MIS
// productos de M Y F, ¿cuáles van a quedar con el costo viejo?
//
// La respuesta estaba repartida en tres tarjetas del resultado que no se
// hablaban —80 para revisar, 1 dejado, 36 que no vinieron— y no había forma de
// verlas juntas ni de saber cuáles eran. Tres números y ninguna lista.
//
// ── QUÉ SE HACE CON CADA UNO, QUE ES POR QUÉ LOS MOTIVOS NO SE MEZCLAN ─────
//
//   Para revisar   hay una decisión pendiente. Tocarlo abre su revisión.
//   Lo dejaste     fue una decisión tuya, y es reversible: tocarlo lo vuelve a
//                  incluir en esta lista.
//   No vino        NO se encontró con el código que tiene guardado. Lo primero
//                  que se ofrece es buscarlo en la lista, porque el renglón casi
//                  siempre está con otro nombre.
//
// ── POR QUÉ «NO VINO» DEJÓ DE SER UN CALLEJÓN SIN SALIDA (2026-09-18) ──────
//
// La hoja decía "el proveedor no lo informó en esta lista" y ofrecía dos salidas:
// ver la ficha, o cerrar. Las dos terminan en nada.
//
// El caso real: "ala 800 lavado total con bica", costo $60.120,00, caja de 24. En
// la lista de M Y F estaba, con otro nombre y otro código —"ALA PVO LAV MANO C
// BICARBONATO 24X800"—. La afirmación de la hoja era FALSA, y era la más costosa
// de las dos cosas que estaban mal: le decía a Emanuel que no había nada que
// hacer justo en el caso donde sí lo había, y el producto se quedaba con el costo
// viejo lista tras lista sin que nadie entendiera por qué.
//
// Que no aparezca casi nunca significa que el proveedor lo dejó de traer.
// Significa que el código guardado está mal o falta. Por eso la hoja ahora dice
// eso —no se encontró con el código guardado— y ofrece buscarlo.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiChipsFiltro, { CLAVE_TODAS } from "@/components/sunmi/SunmiChipsFiltro";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import BotonReporte from "@/components/proveedores/listas/BotonReporte";
import {
  AvisoCostoRedondo,
  Chevron,
  money,
} from "@/components/proveedores/listas/PiezasPantallas";
import {
  GRUPO_NO_CAMBIA,
  ORDEN_NO_CAMBIAN,
  TEXTO_GRUPO_NO_CAMBIA,
  TONO_GRUPO_NO_CAMBIA,
} from "@/lib/proveedores/listas/losQueNoCambian";
import { fechaHora } from "@/lib/proveedores/listas/presentacion";
// El link a la ficha sale de la lista blanca de orígenes, que es la que sabe
// volver acá con el filtro puesto. Armar la ruta a mano es lo que dejó el botón
// apuntando a la pantalla equivocada durante toda la vida de esta pantalla.
import { linkEditarProducto, ORIGENES } from "@/lib/compras-proveedor/retornoPedido";

/** Lo que dice cada chip. El conteo se le pega al armar. */
const ETIQUETA_CHIP = {
  NO_VINO: "No vinieron",
  PARA_REVISAR: "Para revisar",
  DEJADO: "Los dejaste",
};

export default function LosQueNoCambianPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  // El filtro viaja en la URL porque las tarjetas del resultado entran acá ya
  // filtradas: "los dejaste igual" abre en DEJADO y "tuyos que no vinieron" en
  // NO_VINO. Con el filtro en un estado, esas dos tarjetas necesitarían dos
  // pantallas o un parámetro igual pero inventado.
  const filtroInicial = useSearchParams().get("filtro");

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  // El `localId` hace falta para el link a la ficha: la pantalla de editar
  // producto lo pide para saber de qué local es el costo que muestra.
  const { loading: cargandoCtx, needsContexto, contexto } = useContextoActivo();
  const localId = contexto?.localId || 0;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState(
    ORDEN_NO_CAMBIAN.includes(filtroInicial) ? filtroInicial : null
  );
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  useTituloDePagina("No cambian");
  useAccionDePagina(
    () => <SunmiBackButton href={`/modulos/proveedores/listas/${id}`} texto="Resultado" className="min-h-toque" />,
    [id]
  );

  const cargar = useCallback(
    async ({ texto = "", grupo = null } = {}) => {
      setCargando(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (texto) qs.set("buscar", texto);
        if (grupo) qs.set("filtro", grupo);
        const r = await fetch(`/api/proveedores/listas/${id}/no-cambian?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await r.json().catch(() => null);
        if (!r.ok || !json?.ok) {
          setError(
            json?.error ||
              `No se pudieron leer tus productos de este proveedor (error ${r.status}).`
          );
          return;
        }
        setDatos(json);
      } catch {
        setError("No se pudo conectar con el servidor. Probá de nuevo.");
      } finally {
        setCargando(false);
      }
    },
    [id]
  );

  // El buscador filtra MIENTRAS SE ESCRIBE, con la misma espera de 300 ms que la
  // pantalla de los que se actualizan: es lo que tarda en notarse y evita una
  // consulta por letra.
  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    const t = setTimeout(() => cargar({ texto: buscar.trim(), grupo: filtro }), 300);
    return () => clearTimeout(t);
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, buscar, filtro]);

  /**
   * VOLVER A INCLUIR un producto que se había dejado igual.
   *
   * Es el mismo endpoint de selección, con la acción inversa. Que sea reversible
   * es lo que hace que "dejarlo como está" no dé miedo: si no se pudiera
   * deshacer, cada toque sería una decisión definitiva tomada en dos segundos.
   */
  const volverAIncluir = async (item) => {
    if (!item?.filaId) return;
    setTrabajando(true);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "INCLUIR", ids: [item.filaId] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error || "No se pudo volver a incluir ese producto.");
        return;
      }
      setAbierto(null);
      await cargar({ texto: buscar.trim(), grupo: filtro });
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  };

  /**
   * BUSCAR EL RENGLÓN DE ESTE PRODUCTO EN LA LISTA.
   *
   * Es la MISMA pantalla que «No es este producto» abre desde revisar de a uno,
   * entrando por la otra puerta: `?producto=` en vez de `?fila=`. Escribir una
   * segunda pantalla de elegir renglón sería la copia que el CLAUDE.md prohíbe, y
   * lo que se separaría el día que una cambie es cómo se ordenan las candidatas.
   *
   * El filtro viaja para que la vuelta caiga en el mismo chip.
   */
  const buscarEnLaLista = (item) => {
    if (!item?.productoBaseId) return;
    const qs = new URLSearchParams({ producto: String(item.productoBaseId) });
    if (filtro) qs.set("filtro", filtro);
    router.push(`/modulos/proveedores/listas/${id}/elegir-fila?${qs}`);
  };

  /**
   * LA FICHA DEL PRODUCTO QUE SE ESTÁ MIRANDO.
   *
   * ── EL DEFECTO QUE ESTO ARREGLA, Y POR QUÉ NADIE LO VIO ───────────────────
   *
   * Decía `/modulos/productos/editar/${id}`. Esa ruta EXISTE —así que no daba 404,
   * no había error en la consola y el botón no parecía roto— pero monta
   * `ModalProductoFinal`, que se titula según si le llegó `initialData`. Ahí llega
   * `null`, así que la pantalla se presentaba como «Nuevo producto» con el
   * formulario vacío: el que apretaba veía una ficha en blanco donde esperaba la
   * de su producto.
   *
   * La que sirve es `/modulos/productos/[id]/editar`, con `FormProducto`, y es la
   * que ya sabe volver por la lista blanca de orígenes. Por eso el link no se
   * arma acá: lo arma `linkEditarProducto`, que además valida que haya `localId`.
   */
  const verFicha = (item) => {
    const url = linkEditarProducto({
      baseId: item?.productoBaseId,
      localId,
      origen: ORIGENES.LISTA_NO_CAMBIAN,
      importacionId: id,
      filtro,
    });
    // Sin `localId` no hay ficha que mostrar —el costo es por local— y no se
    // adivina uno: se lo dice, que es mejor que abrir una pantalla en blanco.
    if (!url) {
      setError("Seleccioná un contexto operativo para ver la ficha del producto.");
      return;
    }
    router.push(url);
  };

  const tocar = (item) => {
    // Para revisar: se abre SU revisión, no la cola desde el principio. Llegar
    // hasta él pasando productos sería el trabajo que esta pantalla evita.
    if (item.grupo === GRUPO_NO_CAMBIA.PARA_REVISAR && item.filaId) {
      router.push(`/modulos/proveedores/listas/${id}/revisar?filaId=${item.filaId}&desde=no-cambian`);
      return;
    }
    // Los otros dos abren su hoja: uno para volver a incluirlo, el otro para
    // mirar la ficha y cuándo se le tocó el costo.
    setAbierto(item);
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">Seleccioná un contexto operativo.</p>
        </SunmiCard>
      </Marco>
    );
  }
  if (error) {
    return (
      <Marco>
        <ErrorRecuperable
          mensaje={error}
          onReintentar={() => cargar({ texto: buscar.trim(), grupo: filtro })}
        />
      </Marco>
    );
  }
  if (cargando && !datos) {
    return <Marco><SunmiCard className="p-6"><SunmiLoader /></SunmiCard></Marco>;
  }

  const items = datos?.items ?? [];
  const conteo = datos?.conteo ?? { porGrupo: {}, total: 0 };
  const proveedor = datos?.proveedor?.nombre ?? "este proveedor";

  // Los chips llevan su número, que es lo que permite elegir a cuál entrar sin
  // probarlos de a uno. El conteo viene del servidor y NO de contar `items`:
  // `items` ya está filtrado por lo que se está escribiendo.
  //
  // El chip "Todos" lo pone la pieza con `textoTodas` —no se escribe acá— que
  // es para lo que está: reescribirlo sería tener dos claves para "sin filtro"
  // y que la pieza no reconozca la nuestra.
  const opciones = ORDEN_NO_CAMBIAN.map((g) => ({
    clave: g,
    texto: `${ETIQUETA_CHIP[g]} ${conteo.porGrupo?.[g] ?? 0}`,
  }));

  return (
    <Marco>
      {/* El nombre de la pantalla ya está en la barra del shell, arriba: un
          `<h1>` que dijera "No cambian" otra vez sería la misma repetición que
          se sacó del resultado. Lo que el shell no puede decir es CUÁNTOS son y
          de qué proveedor, y eso es lo que queda. */}
      <p className="text-sm2 sunmi-text-muted leading-snug">
        <span className="sunmi-text-strong font-semibold">{conteo.total}</span> productos de{" "}
        {proveedor} que tenés cargados y esta lista no va a corregir.
      </p>

      <SunmiChipsFiltro
        opciones={opciones}
        valor={filtro}
        onCambiar={(v) => setFiltro(v === CLAVE_TODAS ? null : v)}
        textoTodas={`Todos ${conteo.total}`}
      />

      <SunmiInput
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar producto"
        aria-label="Buscar producto"
        className="w-full min-h-toque"
      />

      {items.length === 0 && !cargando && (
        <SunmiCard className="p-5">
          <p className="text-sm2 sunmi-text-muted text-center leading-snug">
            {buscar.trim()
              ? "Ningún producto coincide con eso."
              : conteo.total === 0
                ? `Esta lista corrige todos tus productos de ${proveedor}.`
                : "No hay productos en este grupo."}
          </p>
        </SunmiCard>
      )}

      {items.length > 0 && (
        <SunmiCard className="p-0 overflow-hidden divide-y sunmi-divide">
          {items.map((p) => (
            <SunmiButton
              key={p.productoBaseId}
              color="ghost"
              type="button"
              onClick={() => tocar(p)}
              aria-label={`${p.nombre}: ${TEXTO_GRUPO_NO_CAMBIA[p.grupo]}`}
              className="w-full block text-left p-3 min-h-toque"
            >
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                    {p.nombre}
                  </span>
                  <span className="block text-sm2 sunmi-text-muted tabular-nums">
                    Costo hoy {money(p.costoActual)}
                    {/* La fecha SOLO si se sabe. Un "actualizado —" ocupa el
                        mismo lugar y no dice nada; peor, se lee como que el dato
                        existe y está vacío. */}
                    {p.actualizadoEn ? ` · actualizado ${fechaHora(p.actualizadoEn)}` : ""}
                  </span>
                  <span className={`block text-xs2 ${TONO_GRUPO_NO_CAMBIA[p.grupo]}`}>
                    {TEXTO_GRUPO_NO_CAMBIA[p.grupo]}
                  </span>
                  {p.costoRedondo && <AvisoCostoRedondo costo={p.costoActual} />}
                </span>
                <Chevron />
              </span>
            </SunmiButton>
          ))}
        </SunmiCard>
      )}

      {/* EL REPORTE, que es lo que se baja para mirar en la computadora o
          mandarle al proveedor. Es el mismo generador del resultado: escribir
          otro acá sería un segundo PDF que se separa del primero. */}
      {conteo.total > 0 && (
        <BotonReporte
          importacionId={id}
          cabecera={{ id, proveedor: datos?.proveedor }}
          proveedor={datos?.proveedor}
          usuario={perfil}
        />
      )}

      {abierto && (
        <HojaDelQueNoCambia
          item={abierto}
          trabajando={trabajando}
          onCerrar={() => setAbierto(null)}
          onVolverAIncluir={() => volverAIncluir(abierto)}
          onVerFicha={() => verFicha(abierto)}
          onBuscarEnLaLista={() => buscarEnLaLista(abierto)}
        />
      )}
    </Marco>
  );
}

/**
 * LA HOJA DE UN PRODUCTO QUE NO CAMBIA.
 *
 * Los botones dependen del motivo, y es a propósito: ofrecer "volver a
 * incluirlo" sobre un producto que el proveedor no informó sería ofrecer algo
 * que no existe —no hay precio nuevo para incluir—.
 */
function HojaDelQueNoCambia({
  item,
  trabajando,
  onCerrar,
  onVolverAIncluir,
  onVerFicha,
  onBuscarEnLaLista,
}) {
  const esDejado = item.grupo === GRUPO_NO_CAMBIA.DEJADO;
  const esNoVino = item.grupo === GRUPO_NO_CAMBIA.NO_VINO;
  return (
    <SunmiModalLayout
      open
      title={item.nombre}
      color={esDejado ? "cyan" : "slate"}
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <div className="space-y-2 w-full">
          {esDejado && (
            <SunmiButton
              color="cyan"
              onClick={onVolverAIncluir}
              disabled={trabajando || !item.filaId}
              className="w-full min-h-toque text-base font-bold"
            >
              {trabajando ? "Guardando…" : "Volver a tenerlo en cuenta"}
            </SunmiButton>
          )}
          {/* ── EL BOTÓN YA NO DESHACE SOLO ESTA LISTA ────────────────────
              Decía "Volver a incluirlo en esta lista" y era verdad mientras "no
              lo cambio" valía para una lista sola. Ahora la decisión se recuerda
              para las próximas, así que deshacerla también: dejar el texto viejo
              prometería menos de lo que el botón hace, y alguien que quiere
              volver a considerar el producto para siempre no sabría que con
              esto alcanza. */}
          {esDejado && (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              Vuelve a esta lista y a las próximas de este proveedor.
            </p>
          )}
          {/* ── LA ACCIÓN PRINCIPAL DE UN «NO VINO» ES BUSCARLO ───────────
              Va primera y en cyan, como el «volver a tenerlo en cuenta» de un
              dejado, porque es lo que hay que hacer en casi todos los casos: el
              renglón está y el código guardado es el que está mal. Dejarla abajo
              y en gris, al lado de «Cerrar», la haría leer como una curiosidad. */}
          {esNoVino && (
            <SunmiButton
              color="cyan"
              onClick={onBuscarEnLaLista}
              disabled={trabajando}
              className="w-full min-h-toque text-base font-bold"
            >
              Buscarlo en la lista
            </SunmiButton>
          )}
          {esNoVino && (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              Si lo encontrás, queda atado para siempre y esta lista lo corrige.
            </p>
          )}
          <SunmiButton
            color="slate"
            onClick={onVerFicha}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Ver la ficha del producto
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Cerrar
          </SunmiButton>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm3 sunmi-text-strong leading-snug">
          Costo de hoy {money(item.costoActual)}
          {item.factorPack ? ` · caja de ${item.factorPack}` : ""}.
        </p>
        {/* ── LA HOJA YA NO AFIRMA QUE EL PROVEEDOR NO LO TRAE ──────────────
            Decía "el proveedor no lo informó en esta lista, así que no hay precio
            nuevo para él", y en el caso real era falso: el renglón estaba, con
            otro nombre y otro código. Lo único que el sistema SABE es con qué
            código buscó y que no dio; de ahí a que el proveedor lo dejó de traer
            hay un salto que la pantalla no puede dar, y que dado hacía que nadie
            fuera a buscarlo. */}
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {esDejado
            ? "Lo dejaste con el costo de ahora para esta lista. Se puede volver atrás."
            : "No lo encontré en esta lista con el código que tiene guardado. Casi siempre está, con otro nombre y otro código."}
        </p>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {item.actualizadoEn
            ? `La última vez que una lista le tocó el costo fue el ${fechaHora(item.actualizadoEn)}.`
            : "Ninguna lista le tocó el costo todavía: el que tiene salió de la carga del producto."}
        </p>
        {item.costoRedondo && <AvisoCostoRedondo costo={item.costoActual} />}
      </div>
    </SunmiModalLayout>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
