"use client";

// components/pos-transferencias/PrepararPedidoEscritorio.jsx
//
// PREPARAR UN PEDIDO DE LOCAL, EN LA COMPUTADORA (desde `md`, 768 px).
// Diseño de Emanuel del 2026-10-28. Por debajo de 768 px, el celular
// (`PrepararPedidoCelular.jsx`), que esta pantalla NO toca: ni por dentro, ni
// para compartir lógica, ni con una prop nueva. Lo afirma
// `prepararEscritorio.test.mjs` con la huella del archivo.
//
// ── EL MOLDE ──────────────────────────────────────────────────────────────
//
// El escritorio del pedido del local (`components/pedidos/PedidosEscritorio.jsx`,
// vista CATÁLOGO): la barra fija arriba, la lista de punta a punta con
// `SunmiTable` `table-fixed` y cada ancho en su encabezado, la fila con algo en
// el fondo tenue (`sunmi-surface`) y el pie "1 a 50 de N · Mostrar 25 / 50 /
// 100". Ese archivo tampoco se toca, por su propia regla (ver su encabezado):
// lo que vive adentro y no está exportado se COPIA acá, marcado, con el
// archivo de donde salió.
//
// ── LA LÓGICA ES LA DEL CELULAR ───────────────────────────────────────────
//
// Las mismas rutas —`detalle`, `detalle/editar` (va completo, corregido,
// pesado, "No hay", volver a pendiente), `agregarItem`, `buscarProductos`,
// `enviar`, `cancelar`— y las mismas reglas: `lib/pedidos/revisionDeLinea.js`,
// `lib/pedidos/preparacionDelPedido.js`, y lo que la fila del escritorio dice
// y escribe, `lib/pedidos/preparacionEscritorio.js`. Lo que vive adentro del
// celular sin exportar —leer, guardar, enviar, cancelar, agregar— se COPIA acá,
// marcado.
//
// ── NADA SE MUEVE AL RESOLVER ─────────────────────────────────────────────
//
// Pasar de pendiente a resuelto, o al revés, no cambia el alto de la fila ni
// el ancho de nada: las columnas tienen su ancho en el encabezado, las
// acciones son SIEMPRE dos lugares de botón iguales (en el primero, el botón o
// el estado en texto; en el segundo, "No hay" o "Volver a pendiente"), y
// "Lo preparó …" cuelga debajo del nombre sin ocupar lugar.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiAccionRapida from "@/components/sunmi/SunmiAccionRapida";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiBarraDeAvance from "@/components/sunmi/SunmiBarraDeAvance";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import { showSuccess, showWarning } from "@/components/sunmi/SunmiToast";
import { CantidadDestacada } from "@/components/revision/PiezasDeRevision";
import FilaCatalogoRecepcion from "@/components/transferencias/FilaCatalogoRecepcion";
import { TITULO_MAS_ACCIONES } from "@/components/transferencias/RecepcionMovil";
import {
  PLACEHOLDER_BUSCAR,
  TEXTO_AGREGAR,
  TEXTO_CANCELAR_PEDIDO,
  TEXTO_ENVIAR,
  TEXTO_LO_PREPARADO_NO_SE_ENVIA,
  TEXTO_VA_COMPLETO,
  TEXTO_VOLVER_A_PENDIENTE,
} from "@/components/pos-transferencias/PrepararPedidoCelular";
import { cuandoDelPedido } from "@/lib/pedidos/cuandoDelPedido";
import { NO_HAY, estaRevisada, vaCompleto } from "@/lib/pedidos/revisionDeLinea";
import {
  FILTRO_PREPARAR,
  TEXTO_NO_HAY,
  TEXTOS_FILTRO_PREPARAR,
  categoriaDe,
  categoriasDePreparacion,
  conteoDePreparacion,
  lineaPorCodigo,
  lineasVisibles,
  pidioEnUnidades,
  rotuloDeLoPedido,
  sePesa,
  textoLoPreparoOtro,
} from "@/lib/pedidos/preparacionDelPedido";
import { cuerpoDeVa, estadoEnTexto, vaCambio, valorInicialDeVa } from "@/lib/pedidos/preparacionEscritorio";
import { tamanoDePaginaCatalogo, TAMANOS_DE_PAGINA_CATALOGO } from "@/lib/pedidos/tamanoDePagina";

export const TEXTO_GUARDAR = "✓ Guardar";
export const TEXTO_GUARDAR_PESO = "✓ Guardar peso";

const ENTRADA = "/modulos/pos-transferencias";
/** COPIA de `MENSAJE_SE_CANCELO` de `PrepararPedidoCelular.jsx`. */
const MENSAJE_SE_CANCELO = "Este pedido se canceló.";
/** COPIA de `MENSAJE_YA_SE_ENVIO` de `PrepararPedidoCelular.jsx`. */
const MENSAJE_YA_SE_ENVIO = "Este pedido ya se envió.";

// Los anchos: cada columna menos PRODUCTO declara el suyo en el encabezado, que
// manda en todas las filas (`table-fixed`). La de acciones son dos lugares de
// botón iguales; VA, un lugar del mismo ancho para el − campo + y para los kilos.
const ANCHO = Object.freeze({ categoria: "w-44", pidio: "w-36", va: "w-40", acciones: "w-80" });
const ANCHO_DEL_CAMPO_VA = "w-32";

/** COPIA de `conEncabezado` de `PedidosEscritorio.jsx`. */
const conEncabezado = (columnas) =>
  columnas.map((c) => ({ ...c, thClassName: `sunmi-surface text-xs2 uppercase tracking-wider sunmi-text-muted ${c.thClassName ?? ""}`.trim() }));

/** COPIA de `PieDePaginas` de `PedidosEscritorio.jsx`: "1 a 50 de N", con ‹ › si hay más de una página. */
function PieDePaginas({ page, pageSize, total, totalPages, onPagina }) {
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center gap-2">
      {totalPages > 1 ? (
        <SunmiButton color="slate" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPagina(Math.max(1, page - 1))}>
          <ChevronLeft size={14} aria-hidden="true" />
        </SunmiButton>
      ) : null}
      <span className="text-sm2 sunmi-text-muted tabular-nums">{`${desde} a ${hasta} de ${total}`}</span>
      {totalPages > 1 ? (
        <SunmiButton color="slate" aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => onPagina(Math.min(totalPages, page + 1))}>
          <ChevronRight size={14} aria-hidden="true" />
        </SunmiButton>
      ) : null}
    </div>
  );
}

/** El campo VA de una fila, para encontrarlo al escanear. */
const selectorDelCampoVa = (detalleId) => `[data-va="${detalleId}"] input`;

function enfocarVa(detalleId) {
  const campo = document.querySelector(selectorDelCampoVa(detalleId));
  if (!campo) return;
  campo.focus();
  campo.select?.();
}

/**
 * La celda VA. Lo que no se pesa: − campo +, en la unidad en que se pidió; lo
 * que se pesa: un solo campo de kilos, del mismo ancho. Lo tipeado se queda en
 * el campo hasta salir o Enter —como `CampoCantidadDeFila` del escritorio del
 * local—; el − y el + cambian en el acto.
 */
function CeldaVa({ l, valor, onCambiar, onConfirmar, deshabilitado }) {
  const alTeclear = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onConfirmar({ conEnter: true });
  };
  return (
    <div data-va={l.detalleId} className={ANCHO_DEL_CAMPO_VA}>
      {sePesa(l) ? (
        <SunmiInput
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onCambiar(e.target.value, { tecleado: true })}
          onBlur={() => onConfirmar({ conEnter: false })}
          onKeyDown={alTeclear}
          placeholder="kg"
          aria-label={`Kilos de ${l.productoNombre}`}
          disabled={deshabilitado}
          className="w-full text-center tabular-nums"
        />
      ) : (
        <SunmiCampoCantidad
          valor={valor}
          onCambiar={(s) => onCambiar(s, { tecleado: document.activeElement?.closest?.(`[data-va="${l.detalleId}"]`) && document.activeElement.tagName === "INPUT" })}
          etiqueta={`Va de ${l.productoNombre}`}
          minimo={0}
          tamano="compacto"
          ocupaElAncho
          conMarco={false}
          claseInput="text-center"
          apagaMenosEnMinimo
          deshabilitado={deshabilitado}
          onBlur={() => onConfirmar({ conEnter: false })}
          onKeyDown={alTeclear}
        />
      )}
    </div>
  );
}

export default function PrepararPedidoEscritorio({ posId, PantallaDeSiempre }) {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();

  const [modo, setModo] = useState(null);
  const [miDepositoId, setMiDepositoId] = useState(null);
  const [pos, setPos] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState(FILTRO_PREPARAR.PENDIENTES);
  const [categoria, setCategoria] = useState(null);
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(() => tamanoDePaginaCatalogo(null));
  // Lo escrito en VA y todavía no guardado, por renglón.
  const [borradores, setBorradores] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [textoCatalogo, setTextoCatalogo] = useState("");
  const [catalogo, setCatalogo] = useState(null);
  const [masAcciones, setMasAcciones] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const delDeposito = modo === "deposito" || modo === "admin";
  const esPedido = pos?.estado === "Solicitado";
  const propia = delDeposito && esPedido;

  // El título va al `<h1>` del encabezado del shell. El Volver, el shell no lo
  // dibuja desde `md` —ahí lo pone la pantalla—, así que el nodo registrado va
  // también al principio de la barra fija, como en `PedidosEscritorio`.
  useTituloDePagina(propia ? `Pedido #${posId}` : null);
  const volver = useAccionDePagina(
    () => (propia ? <SunmiBackButton onVolver={() => router.push(ENTRADA)} className="shrink-0" /> : null),
    [propia, router]
  );

  /** COPIA de `leer` de `PrepararPedidoCelular.jsx`. */
  const leer = useCallback(async () => {
    const res = await fetch(`/api/pos-transferencias/detalle?posId=${posId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      setPos({ estado: null });
      setAviso({ tono: "danger", texto: json.error || "No se pudo leer el pedido." });
      return;
    }
    setPos(json.item.encabezado);
    setLineas(json.item.detalles || []);
  }, [posId]);

  // COPIA de la entrada de `PrepararPedidoCelular.jsx`: opciones, el pedido y
  // cuándo y quién lo pidió.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const resOpt = await fetch("/api/pos-transferencias/opciones", { cache: "no-store" });
        const jsonOpt = await resOpt.json().catch(() => ({}));
        if (!vivo) return;
        setModo(jsonOpt.ok ? jsonOpt.modo : "otro");
        setMiDepositoId(jsonOpt.ok && jsonOpt.modo === "deposito" ? jsonOpt.origen?.id ?? null : null);
        if (!jsonOpt.ok || (jsonOpt.modo !== "deposito" && jsonOpt.modo !== "admin")) return;
        await leer();
        const resSol = await fetch("/api/pos-transferencias/solicitados", { cache: "no-store" });
        const jsonSol = await resSol.json().catch(() => ({}));
        if (vivo && jsonSol.ok) setSolicitud((jsonSol.items || []).find((s) => s.id === posId) || null);
      } catch (err) {
        console.error(err);
        if (vivo) {
          setModo((m) => m ?? "otro");
          setAviso({ tono: "danger", texto: "Error de conexión al leer el pedido." });
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [leer, posId]);

  /** COPIA de `tras` de `PrepararPedidoCelular.jsx`. */
  const tras = async (res) => {
    const json = await res.json().catch(() => ({}));
    if (json.ok) {
      setLineas((prev) => {
        const i = prev.findIndex((x) => x.detalleId === json.item.detalleId);
        if (i < 0) return [...prev, json.item];
        const copia = [...prev];
        copia[i] = { ...prev[i], ...json.item, modoEnvio: prev[i].modoEnvio ?? json.item.modoEnvio };
        return copia;
      });
      return true;
    }
    setAviso({ tono: res.status === 409 ? "warning" : "danger", texto: json.error || "No se pudo guardar." });
    if (res.status === 409) await leer();
    return false;
  };

  /** COPIA de `escribirPreparado` de `PrepararPedidoCelular.jsx`; además suelta lo escrito en VA. */
  const escribirPreparado = async (l, cuerpo) => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos-transferencias/detalle/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalleId: l.detalleId, ...cuerpo }),
      });
      const ok = await tras(res);
      if (ok) {
        setBorradores((b) => {
          const { [l.detalleId]: _, ...resto } = b;
          return resto;
        });
      }
      return ok;
    } catch (err) {
      console.error(err);
      setAviso({ tono: "danger", texto: "Error de conexión al guardar." });
      return false;
    } finally {
      setGuardando(false);
    }
  };

  /** COPIA de `buscarEnCatalogo` de `PrepararPedidoCelular.jsx`. */
  const buscarEnCatalogo = async (q) => {
    if (!q.trim() || !pos?.origenId) return setCatalogo(null);
    const res = await fetch(
      `/api/pos-transferencias/buscarProductos?q=${encodeURIComponent(q.trim())}&origenId=${pos.origenId}`,
      { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    setCatalogo(json.ok ? json.items || [] : []);
  };

  /** COPIA de `agregarDelCatalogo` de `PrepararPedidoCelular.jsx`. */
  const agregarDelCatalogo = async (p) => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos-transferencias/agregarItem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId, productoLocalId: p.productoLocalId, cantidad: 1, tipo: "manual" }),
      });
      if (await tras(res)) {
        setAgregando(false);
        setTextoCatalogo("");
        setCatalogo(null);
        setFiltro(FILTRO_PREPARAR.CON_CAMBIOS);
      }
    } finally {
      setGuardando(false);
    }
  };

  /** COPIA de `enviar` de `PrepararPedidoCelular.jsx`. */
  const enviar = async () => {
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos-transferencias/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        showSuccess(`Transferencia enviada a ${pos?.destino?.nombre ?? "el local"}`);
        router.push(ENTRADA);
        return;
      }
      if (res.status === 409 && (json.error === MENSAJE_SE_CANCELO || json.error === MENSAJE_YA_SE_ENVIO)) {
        showWarning(json.error);
        router.push(ENTRADA);
        return;
      }
      if (res.status === 409) {
        setAviso({ tono: "warning", texto: json.error });
        await leer();
        return;
      }
      const faltantes = json.error === "STOCK_INSUFICIENTE" && Array.isArray(json.faltantes)
        ? `Stock insuficiente: ${json.faltantes.map((f) => `${f.productoNombre} (hacen falta ${f.necesario}, hay ${f.disponible})`).join(", ")}`
        : null;
      setAviso({ tono: "danger", texto: faltantes || json.error || "No se pudo enviar." });
    } catch (err) {
      console.error(err);
      setAviso({ tono: "danger", texto: "Error de conexión al enviar." });
    } finally {
      setEnviando(false);
    }
  };

  /** COPIA de `cancelar` de `PrepararPedidoCelular.jsx`. */
  const cancelar = async () => {
    setCancelando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos-transferencias/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        showSuccess(`Pedido #${posId} cancelado`);
        router.push(ENTRADA);
        return;
      }
      setConfirmandoCancelar(false);
      setAviso({ tono: res.status === 409 ? "warning" : "danger", texto: json.error || "No se pudo cancelar el pedido." });
      if (res.status === 409) await leer();
    } catch (err) {
      console.error(err);
      setConfirmandoCancelar(false);
      setAviso({ tono: "danger", texto: "Error de conexión al cancelar." });
    } finally {
      setCancelando(false);
    }
  };

  // Escanear un código lleva a su renglón y lo deja listo para escribir: el
  // código exacto ya deja solo ese producto en la lista (`lineasVisibles`).
  const exacta = lineaPorCodigo(lineas, texto);
  useEffect(() => {
    if (exacta) enfocarVa(exacta.detalleId);
  }, [exacta?.detalleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const permisos = perfil?.permisos || [];
  const puede = (Array.isArray(permisos) && permisos.includes("*")) || permisos.includes("pos_transferencias.ver");

  if (cargandoPerfil || modo === null || (delDeposito && pos === null)) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando...</span>
      </div>
    );
  }
  if (!propia) return <PantallaDeSiempre />;
  if (!puede) return <SinPermisos />;

  const conteo = conteoDePreparacion(lineas);
  const total = conteo[FILTRO_PREPARAR.TODOS];
  const preparados = conteo[FILTRO_PREPARAR.PREPARADOS];
  const pendientes = conteo[FILTRO_PREPARAR.PENDIENTES];
  const pct = total > 0 ? Math.floor((preparados / total) * 100) : 0;
  const visibles = lineasVisibles(lineas, { filtro, categoria, texto });
  const paginas = Math.max(1, Math.ceil(visibles.length / pageSize));
  const paginaVista = Math.min(pagina, paginas);
  const enLaPagina = visibles.slice((paginaVista - 1) * pageSize, paginaVista * pageSize);

  const valorDeVa = (l) => borradores[l.detalleId] ?? valorInicialDeVa(l);
  const escribirVa = (l, s) => setBorradores((b) => ({ ...b, [l.detalleId]: s }));

  // El primer botón de un renglón pendiente: "✓ Va completo" con lo pedido;
  // "✓ Guardar" si se cambió VA (corregido); "✓ Guardar peso" si es por peso y
  // se pidió en unidades —no hace nada hasta que haya un peso—.
  const primeraAccion = (l) => {
    const escrito = borradores[l.detalleId];
    if (pidioEnUnidades(l)) {
      const cuerpo = cuerpoDeVa(l, escrito ?? "");
      return { texto: TEXTO_GUARDAR_PESO, cuerpo, apagado: cuerpo == null };
    }
    if (vaCambio(l, escrito)) {
      const cuerpo = cuerpoDeVa(l, escrito);
      return { texto: TEXTO_GUARDAR, cuerpo, apagado: cuerpo == null };
    }
    return { texto: TEXTO_VA_COMPLETO, cuerpo: vaCompleto(l), apagado: false };
  };

  // VA de un renglón RESUELTO: cambiarlo lo guarda en el momento, corregido.
  const guardarVaResuelta = (l, s) => {
    if (!vaCambio(l, s)) return;
    const cuerpo = cuerpoDeVa(l, s);
    if (cuerpo) escribirPreparado(l, cuerpo);
  };

  const columnas = conEncabezado([
    {
      clave: "producto",
      titulo: "Producto",
      render: (l) => {
        const loPreparo = textoLoPreparoOtro(l, miDepositoId);
        return (
          <div className="relative min-w-0">
            <span data-nombre-producto="" className="block break-words sunmi-text-strong">
              {l.productoNombre}
            </span>
            {/* Cuelga debajo del nombre sin ocupar lugar: aparecer no le cambia
                el alto a la fila (COPIA de la marca de `CeldaProducto`). */}
            {loPreparo ? (
              <span data-lo-preparo="" className="absolute inset-x-0 top-full truncate text-xs2 leading-none sunmi-text-muted">
                {loPreparo}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      clave: "categoria",
      titulo: "Categoría",
      thClassName: ANCHO.categoria,
      render: (l) => <span className="break-words sunmi-text-muted">{categoriaDe(l)}</span>,
    },
    {
      clave: "pidio",
      titulo: "Pidió",
      thClassName: ANCHO.pidio,
      // La misma pieza y el mismo texto que el celular y la recepción.
      render: (l) => <CantidadDestacada rotulo={null} cantidad={rotuloDeLoPedido(l)} />,
    },
    {
      clave: "va",
      titulo: "Va",
      thClassName: ANCHO.va,
      render: (l) => (
        <CeldaVa
          l={l}
          valor={valorDeVa(l)}
          deshabilitado={guardando}
          onCambiar={(s, { tecleado }) => {
            escribirVa(l, s);
            // El − y el + de un renglón resuelto guardan en el acto.
            if (!tecleado && estaRevisada(l) && !sePesa(l)) guardarVaResuelta(l, s);
          }}
          onConfirmar={({ conEnter }) => {
            const escrito = borradores[l.detalleId];
            if (estaRevisada(l)) {
              if (escrito != null) guardarVaResuelta(l, escrito);
              return;
            }
            // Enter en un renglón pendiente: lo mismo que el primer botón.
            if (conEnter) {
              const a = primeraAccion(l);
              if (!a.apagado) escribirPreparado(l, a.cuerpo);
            }
          }}
        />
      ),
    },
    {
      clave: "acciones",
      titulo: "",
      thClassName: ANCHO.acciones,
      render: (l) => {
        const resuelta = estaRevisada(l);
        const a = resuelta ? null : primeraAccion(l);
        const estado = resuelta ? estadoEnTexto(l) : null;
        return (
          <div className="grid grid-cols-2 gap-2" data-acciones="">
            {resuelta ? (
              <span
                data-estado-resuelto=""
                className={`flex items-center justify-center truncate text-sm2 font-semibold ${estado === TEXTO_NO_HAY ? "sunmi-text-muted" : "sunmi-text-success"}`}
              >
                {estado}
              </span>
            ) : (
              <SunmiAccionRapida onClick={() => escribirPreparado(l, a.cuerpo)} disabled={guardando || a.apagado} className="w-full justify-center whitespace-nowrap">
                {a.texto}
              </SunmiAccionRapida>
            )}
            {resuelta ? (
              <SunmiButton color="slate" onClick={() => escribirPreparado(l, { pendiente: true })} disabled={guardando} className="w-full justify-center whitespace-nowrap">
                {TEXTO_VOLVER_A_PENDIENTE}
              </SunmiButton>
            ) : (
              <SunmiButton color="slate" onClick={() => escribirPreparado(l, NO_HAY)} disabled={guardando} className="w-full justify-center whitespace-nowrap">
                {TEXTO_NO_HAY}
              </SunmiButton>
            )}
          </div>
        );
      },
    },
  ]);

  const categorias = categoriasDePreparacion(lineas);
  const filtroBoton = ([clave, t]) => (
    <SunmiButton key={clave} color={clave === filtro ? "amber" : "slate"} aria-pressed={clave === filtro} onClick={() => {
      setFiltro(clave);
      setPagina(1);
    }} className="shrink-0">
      {`${t} ${conteo[clave]}`}
    </SunmiButton>
  );

  return (
    <div className="sunmi-bg w-full min-h-full" data-preparar-pedido-escritorio={posId}>
      {/* ── 1 · LA BARRA FIJA (el molde: la de `PedidosEscritorio`) ──────── */}
      <div className="sticky top-0 z-10 sunmi-bg-card border-b sunmi-divider px-3 py-2 space-y-2" data-barra-preparar="">
        {aviso ? <SunmiAviso tono={aviso.tono}>{aviso.texto}</SunmiAviso> : null}

        <div className="flex items-center gap-3" data-herramientas-preparar="">
          {volver}
          <div className="flex-1 min-w-0">
            <SunmiCampoBusquedaVoz
              value={texto}
              onChange={(v) => {
                setTexto(v);
                setPagina(1);
              }}
              onVoz={(v) => {
                setTexto(v);
                setPagina(1);
              }}
              onKeyDown={(e) => {
                // Un lector físico escribe el código y manda Enter; buscando a
                // mano, Enter lleva al primer renglón que quedó.
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (visibles[0]) enfocarVa(visibles[0].detalleId);
              }}
              placeholder={PLACEHOLDER_BUSCAR}
              ariaLabel="Buscar o escanear un producto de este pedido"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm2 sunmi-text-muted">Categoría</span>
            <SunmiSelectAdv
              id="categoria-preparar-escritorio"
              value={categoria ?? ""}
              onChange={(v) => {
                setCategoria(v === "" ? null : v);
                setPagina(1);
              }}
              aria-label="Categoría"
              className="w-56 shrink-0"
            >
              <SunmiSelectOption value="">{`Todas · ${total}`}</SunmiSelectOption>
              {categorias.map((c) => (
                <SunmiSelectOption key={c.nombre} value={c.nombre}>
                  {`${c.nombre} · ${c.cantidad}`}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>
          {pendientes > 0 ? <span className="shrink-0 text-sm2 sunmi-text-muted">{`Falta revisar ${pendientes}`}</span> : null}
          <SunmiButton color="primary" onClick={enviar} disabled={pendientes > 0 || enviando} className="shrink-0">
            {enviando ? "Enviando..." : TEXTO_ENVIAR}
          </SunmiButton>
        </div>

        <div className="flex items-center gap-2" data-filtros-preparar="">
          <div role="group" aria-label="Filtrar productos por estado" className="flex items-center gap-2">
            {TEXTOS_FILTRO_PREPARAR.map(filtroBoton)}
          </div>
          <span className="ml-auto min-w-0 truncate text-sm2 sunmi-text-muted">
            {[pos?.destino?.nombre, cuandoDelPedido(solicitud?.solicitadoAt), `${preparados} / ${total} preparados`].filter(Boolean).join(" · ")}
          </span>
          <SunmiButton color="slate" onClick={() => setAgregando(true)} className="shrink-0">
            {TEXTO_AGREGAR}
          </SunmiButton>
          <SunmiButton color="slate" onClick={() => setMasAcciones(true)} aria-label={TITULO_MAS_ACCIONES} aria-haspopup="dialog" className="shrink-0">
            <MoreHorizontal size={18} aria-hidden="true" />
          </SunmiButton>
        </div>

        <SunmiBarraDeAvance pct={pct} />
      </div>

      {/* ── 2 · LA LISTA ────────────────────────────────────────────────── */}
      <div className="p-3">
        <div className="overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card" data-lista-preparar="">
          <SunmiTable
            columnas={columnas}
            filas={enLaPagina}
            claveFila={(l) => l.detalleId}
            densidad="normal"
            vacio="No hay productos que coincidan con este filtro."
            // La resuelta, en el fondo tenue de la fila cargada del local.
            claseFila={(l) => (estaRevisada(l) ? "sunmi-surface" : "")}
            className="text-sm3 table-fixed"
          />
          {/* ── 3 · EL PIE (COPIA del de `PedidosEscritorio`) ─────────────── */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t sunmi-divider" data-pie-lista="">
            <PieDePaginas page={paginaVista} pageSize={pageSize} total={visibles.length} totalPages={paginas} onPagina={setPagina} />
            <div className="flex items-center gap-1.5" data-mostrar="">
              <span className="text-sm2 sunmi-text-muted">Mostrar</span>
              {TAMANOS_DE_PAGINA_CATALOGO.map((n) => (
                <SunmiButton key={n} color={n === pageSize ? "primary" : "slate"} aria-pressed={n === pageSize} onClick={() => {
                  setPageSize(n);
                  setPagina(1);
                }}>
                  {n}
                </SunmiButton>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* COPIA de la hoja de agregar de `PrepararPedidoCelular.jsx`, centrada. */}
      <SunmiModalLayout
        open={agregando}
        title={TEXTO_AGREGAR.replace(/^\+ /, "")}
        onClose={() => setAgregando(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma="centrado"
        espacioCuerpo="gap-2"
      >
        <SunmiCampoBusquedaVoz
          value={textoCatalogo}
          onChange={(t) => {
            setTextoCatalogo(t);
            buscarEnCatalogo(t);
          }}
          onVoz={(t) => {
            setTextoCatalogo(t);
            buscarEnCatalogo(t);
          }}
          placeholder="Buscar en el catálogo del depósito"
          ariaLabel="Buscar en el catálogo del depósito"
        />
        {catalogo !== null && catalogo.length === 0 ? <p className="text-sm2 sunmi-text-muted">No está en el catálogo del depósito.</p> : null}
        {(catalogo || []).map((p) => (
          <FilaCatalogoRecepcion key={p.productoLocalId} p={p} onElegir={agregarDelCatalogo} agregando={guardando} />
        ))}
      </SunmiModalLayout>

      {/* COPIA de "Más acciones" de `PrepararPedidoCelular.jsx`, centrada. */}
      <SunmiModalLayout
        open={masAcciones}
        title={TITULO_MAS_ACCIONES}
        subtitle={`Pedido #${posId} · ${pos?.destino?.nombre ?? ""}`}
        onClose={() => setMasAcciones(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma="centrado"
        espacioCuerpo="gap-2"
      >
        <SunmiButton
          color="red"
          className="w-full justify-center"
          onClick={() => {
            setMasAcciones(false);
            setConfirmandoCancelar(true);
          }}
        >
          {TEXTO_CANCELAR_PEDIDO}
        </SunmiButton>
      </SunmiModalLayout>

      {confirmandoCancelar ? (
        <SunmiHojaDeConfirmacion
          titulo={`¿Cancelar el pedido #${posId} de ${pos?.destino?.nombre ?? "el local"}?`}
          puntos={[TEXTO_LO_PREPARADO_NO_SE_ENVIA]}
          textoConfirmar={TEXTO_CANCELAR_PEDIDO}
          textoTrabajando="Cancelando..."
          colorConfirmar="red"
          trabajando={cancelando}
          onConfirmar={cancelar}
          onVolver={() => setConfirmandoCancelar(false)}
        />
      ) : null}
    </div>
  );
}
