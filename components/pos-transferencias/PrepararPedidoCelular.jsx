"use client";

// components/pos-transferencias/PrepararPedidoCelular.jsx
//
// PREPARAR UN PEDIDO DE LOCAL, EN EL CELULAR (por debajo de 1024 px).
// Diseño aprobado por Emanuel el 2026-10-22: la misma mecánica que la recepción
// de una transferencia —"el que prepara y el que recibe trabajan igual"—.
//
//   · arriba, el local, el estado, el pedido y el avance con su barra;
//   · el buscador (un código exacto deja solo ese producto), los cuatro filtros
//     y la categoría;
//   · una tarjeta por renglón, con la forma de la de la recepción
//     (`components/revision/PiezasDeRevision.jsx`): "✓ Va completo" arriba a la
//     derecha y "Corregir" abajo, que abre la hoja con el campo de cantidad;
//     la corregida queda con el borde y una línea de acento; la que va
//     completa se achica a un renglón;
//   · un producto por peso se carga en KILOS (2026-10-28): pedido en unidades
//     no tiene "va completo" sino "Pesar"; ver `HojaCorregir`;
//   · "+ Agregar producto que no pidió", que busca en el catálogo del depósito;
//   · la barra de abajo, fija, con el avance y "Enviar al local", apagado hasta
//     que no quede nada por revisar.
//
// Todo va por las rutas de siempre de `/api/pos-transferencias`, con sus
// bloqueos: `detalle` para leer, `detalle/editar` para lo preparado (también
// "va completo", "va 0" y "volver a pendiente"), `agregarItem` para lo que el local no pidió y
// `enviar`. Qué está revisado y cuánto viaja es `lib/pedidos/revisionDeLinea.js`;
// cómo se dice y se filtra, `lib/pedidos/preparacionDelPedido.js`.
//
// Un pedido que no está Solicitado, o quien no es depósito ni admin, ve la
// pantalla de siempre (`PantallaDeSiempre`).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MoreHorizontal } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiBarraDeAvance from "@/components/sunmi/SunmiBarraDeAvance";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import { showSuccess, showWarning } from "@/components/sunmi/SunmiToast";
import { TITULO_MAS_ACCIONES } from "@/components/transferencias/RecepcionMovil";
import {
  CajaDeCantidad,
  CantidadDestacada,
  CLASE_ACCION_CORREGIR,
  FilaRevisada,
  ParDeCantidades,
  TarjetaDeRevision,
} from "@/components/revision/PiezasDeRevision";
import SunmiAccionRapida from "@/components/sunmi/SunmiAccionRapida";
import FilaCatalogoRecepcion from "@/components/transferencias/FilaCatalogoRecepcion";
import { cuandoDelPedido } from "@/lib/pedidos/cuandoDelPedido";
import { estaRevisada, loPedido, vaCompleto } from "@/lib/pedidos/revisionDeLinea";
import {
  ESTADO_PREPARACION,
  FILTRO_PREPARAR,
  TEXTOS_FILTRO_PREPARAR,
  categoriasDePreparacion,
  conteoDePreparacion,
  enUnidades,
  esAgregada,
  estadoDePreparacion,
  lineasVisibles,
  pidioEnUnidades,
  sePesa,
  textoDelCambio,
  textoPidio,
  rotuloDeLoPedido,
  textoVa,
} from "@/lib/pedidos/preparacionDelPedido";

export const TEXTO_VA_COMPLETO = "✓ Va completo";
export const TEXTO_CORREGIR = "Corregir";
export const TEXTO_PESAR = "Pesar";
export const TEXTO_VOLVER_A_PENDIENTE = "Volver a pendiente";
export const TEXTO_AGREGAR = "+ Agregar producto que no pidió";
export const TEXTO_ENVIAR = "Enviar al local";
export const PLACEHOLDER_BUSCAR = "Buscar o escanear producto";
export const TEXTO_CANCELAR_PEDIDO = "Cancelar pedido";
export const TEXTO_LO_PREPARADO_NO_SE_ENVIA = "Lo preparado no se envía.";

const ENTRADA = "/modulos/pos-transferencias";
/** El 409 de `enviar` cuando el pedido se canceló antes que el envío. */
const MENSAJE_SE_CANCELO = "Este pedido se canceló.";

/** Un peso escrito: entero, o con coma (o punto) y hasta tres decimales. */
const KILOS_ESCRITOS = /^\d+([.,]\d{1,3})?$/;

/** Kilos como se escriben en el campo: "1,850". */
const textoDeKilos = (n) => Number(n || 0).toFixed(3).replace(".", ",");

/** Lo decidido; si no, lo pedido en kilos; pedido en unidades, nada: se pesa. */
function kilosIniciales(l) {
  if (estaRevisada(l)) return textoDeKilos(l.preparado);
  return pidioEnUnidades(l) ? "" : textoDeKilos(l.sugerido);
}

// ── LA HOJA DE CORRECCIÓN ─────────────────────────────────────────────────
//
// La hoja del kit, como la de la recepción, con el mismo par de campos
// (`ParDeCantidades`). Si el local pidió bultos, bultos y —si el producto se
// puede mandar suelto— unidades sueltas, uno al lado del otro; si pidió
// unidades, unidades. Arranca en lo que ya se decidió, o en lo pedido.
//
// 0 es válido: el producto no va.
//
// Una línea ya preparada suma "Volver a pendiente" debajo de Guardar: borra la
// marca y la cantidad (`pendiente: true` en `detalle/editar`). En una pendiente
// no hay nada que deshacer y no aparece.
//
// Un producto por peso (`sePesa`) se carga en KILOS: un campo con coma y hasta
// tres decimales —la balanza pesa en gramos—, sin − / +, porque se pesa y no se
// cuenta. Pedido en kilos, arranca en esos kilos; pedido en unidades, vacío, y
// Guardar no se prende hasta que haya un peso.
function HojaCorregir({ linea, guardando, onGuardar, onVolverAPendiente }) {
  const enKilos = sePesa(linea);
  const [kilos, setKilos] = useState(() => kilosIniciales(linea));
  const hayPeso = KILOS_ESCRITOS.test(kilos.trim());
  const pedido = loPedido(linea);
  const porBulto = pedido.unidad === "BULTO";
  // Un pack que el producto solo deja mandar por bulto no ofrece sueltas: el
  // envío las rechazaría (`validarEnvio`).
  const conSueltas = porBulto && linea.modoEnvio !== "SOLO_BULTO";
  const unidadesIniciales = estaRevisada(linea)
    ? enUnidades(linea.preparado, linea.unidadPreparada || linea.unidadSugerida, linea.factorPack)
    : enUnidades(linea.sugerido, linea.unidadSugerida, linea.factorPack);
  const [bultos, setBultos] = useState(() => String(porBulto ? Math.floor(unidadesIniciales / pedido.factorPack) : unidadesIniciales));
  const [sueltas, setSueltas] = useState(() => String(porBulto ? unidadesIniciales % pedido.factorPack : 0));

  const guardar = () => {
    // Kilos: `UNIDAD` de un producto en kg, que es como viaja y mueve stock.
    if (enKilos) return onGuardar({ preparado: Number(kilos.trim().replace(",", ".")), unidadPreparada: "UNIDAD" });
    const b = Number(String(bultos).replace(",", ".")) || 0;
    const s = conSueltas ? Number(String(sueltas).replace(",", ".")) || 0 : 0;
    if (!porBulto) return onGuardar({ preparado: b, unidadPreparada: "UNIDAD" });
    // Con sueltas, en unidades: un solo número con una sola unidad es lo que
    // guarda la línea (`preparado`, `unidadPreparada`).
    if (s > 0) return onGuardar({ preparado: b * pedido.factorPack + s, unidadPreparada: "UNIDAD" });
    return onGuardar({ preparado: b, unidadPreparada: "BULTO" });
  };

  return (
    <>
      <p className="text-sm2 sunmi-text-muted">{textoPidio(linea)}</p>
      <ParDeCantidades>
        {enKilos ? (
          <CajaDeCantidad rotulo="Kilos">
            <SunmiInput
              type="text"
              inputMode="decimal"
              value={kilos}
              onChange={(e) => setKilos(e.target.value)}
              placeholder="0,000"
              aria-label={`Kilos de ${linea.productoNombre}`}
              className="text-lg"
            />
          </CajaDeCantidad>
        ) : (
          <CajaDeCantidad rotulo={porBulto ? `Bultos de ${pedido.factorPack} u` : "Unidades"}>
            <SunmiCampoCantidad
              valor={bultos}
              onCambiar={setBultos}
              etiqueta={porBulto ? `Bultos de ${linea.productoNombre}` : `Unidades de ${linea.productoNombre}`}
              minimo={0}
              tipo="number"
              claseMarco="flex-1"
              claseInput="text-lg"
            />
          </CajaDeCantidad>
        )}
        {conSueltas && !enKilos ? (
          <CajaDeCantidad rotulo="Unidades sueltas">
            <SunmiCampoCantidad
              valor={sueltas}
              onCambiar={setSueltas}
              etiqueta={`Unidades sueltas de ${linea.productoNombre}`}
              minimo={0}
              tipo="number"
              claseMarco="flex-1"
              claseInput="text-lg"
            />
          </CajaDeCantidad>
        ) : null}
      </ParDeCantidades>
      <SunmiButton
        color="primary"
        className="w-full min-h-toque justify-center"
        onClick={guardar}
        disabled={guardando || (enKilos && !hayPeso)}
      >
        {guardando ? "Guardando..." : "Guardar"}
      </SunmiButton>
      {estaRevisada(linea) ? (
        <SunmiButton color="slate" className="w-full min-h-toque justify-center" onClick={onVolverAPendiente} disabled={guardando}>
          {TEXTO_VOLVER_A_PENDIENTE}
        </SunmiButton>
      ) : null}
    </>
  );
}

// ── UNA LÍNEA ─────────────────────────────────────────────────────────────
function LineaParaPreparar({ l, guardando, onVaCompleto, onCorregir }) {
  const estado = estadoDePreparacion(l);

  // Va completa: un renglón, tocable entero para corregirla, como la recepción.
  if (estado === ESTADO_PREPARACION.COMPLETO) {
    return (
      <FilaRevisada
        icono={<Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />}
        nombre={l.productoNombre}
        derecha={<span className="min-w-0 truncate text-sm2 text-right sunmi-text-muted">{`· ${textoVa(l)}`}</span>}
        onTocar={() => onCorregir(l)}
        disabled={guardando}
        ariaLabel={`Corregir ${l.productoNombre}`}
        data-linea-preparar={l.productoNombre}
        data-estado={estado}
      />
    );
  }

  const cambio = textoDelCambio(l);
  return (
    <TarjetaDeRevision
      nombre={l.productoNombre}
      tono={estado === ESTADO_PREPARACION.CON_CAMBIOS ? "border-1.5 sunmi-border-accent" : ""}
      debajo={
        <>
          {/* Lo que pidió el local, resaltado IGUAL que lo enviado en la
              recepción: la misma pieza (`CantidadDestacada`) y el mismo texto
              (`rotuloDeLoPedido`, con la función de "2 PACK x10"). */}
          {esAgregada(l) ? null : <CantidadDestacada rotulo="Pidió" cantidad={rotuloDeLoPedido(l)} />}
          {cambio ? <p className="text-sm2 font-semibold sunmi-text-accent">{cambio}</p> : null}
        </>
      }
      accionArriba={
        // Pedido en unidades y por peso no hay "va completo": lo pedido no son
        // kilos. Se pesa, en la misma hoja.
        estado === ESTADO_PREPARACION.PENDIENTE && pidioEnUnidades(l) ? (
          <SunmiAccionRapida onClick={() => onCorregir(l)} disabled={guardando}>
            {TEXTO_PESAR}
          </SunmiAccionRapida>
        ) : estado === ESTADO_PREPARACION.PENDIENTE ? (
          <SunmiAccionRapida onClick={() => onVaCompleto(l)} disabled={guardando}>
            {TEXTO_VA_COMPLETO}
          </SunmiAccionRapida>
        ) : null
      }
      accionAbajo={
        <SunmiButton onClick={() => onCorregir(l)} disabled={guardando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
          {TEXTO_CORREGIR}
        </SunmiButton>
      }
      data-linea-preparar={l.productoNombre}
      data-estado={estado}
    />
  );
}

export default function PrepararPedidoCelular({ posId, PantallaDeSiempre }) {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();

  const [modo, setModo] = useState(null);
  const [pos, setPos] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState(FILTRO_PREPARAR.PENDIENTES);
  const [categoria, setCategoria] = useState(null);
  const [texto, setTexto] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [textoCatalogo, setTextoCatalogo] = useState("");
  const [catalogo, setCatalogo] = useState(null);
  const [masAcciones, setMasAcciones] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const delDeposito = modo === "deposito" || modo === "admin";
  const esPedido = pos?.estado === "Solicitado";
  const propia = delDeposito && esPedido;

  useTituloDePagina(propia ? `Pedido #${posId}` : null);
  useAccionDePagina(
    () => (propia ? <SunmiBackButton onVolver={() => router.push(ENTRADA)} /> : null),
    [propia, router]
  );

  /** Lee el pedido de nuevo: después de un 409, o al entrar. */
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

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const resOpt = await fetch("/api/pos-transferencias/opciones", { cache: "no-store" });
        const jsonOpt = await resOpt.json().catch(() => ({}));
        if (!vivo) return;
        setModo(jsonOpt.ok ? jsonOpt.modo : "otro");
        if (!jsonOpt.ok || (jsonOpt.modo !== "deposito" && jsonOpt.modo !== "admin")) return;
        await leer();
        // Cuándo y quién lo pidió: lo sabe la lista de pedidos, no el detalle.
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

  /** Lo que contestó una escritura: la línea actualizada, o el aviso. */
  const tras = async (res) => {
    const json = await res.json().catch(() => ({}));
    if (json.ok) {
      setLineas((prev) => {
        const i = prev.findIndex((x) => x.detalleId === json.item.detalleId);
        if (i < 0) return [...prev, json.item];
        const copia = [...prev];
        // El modo de envío se queda con el del DETALLE: `editar` y
        // `agregarItem` le deducen a un pack sin modo cargado "SOLO_BULTO", y
        // `detalle` y `enviar` —que es quien valida— "MIXTO". Medido en la
        // sección 14 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`. Con el
        // de `editar`, la segunda corrección de un pack dejaba de ofrecer
        // sueltas que el envío sí acepta.
        copia[i] = { ...prev[i], ...json.item, modoEnvio: prev[i].modoEnvio ?? json.item.modoEnvio };
        return copia;
      });
      return true;
    }
    setAviso({ tono: res.status === 409 ? "warning" : "danger", texto: json.error || "No se pudo guardar." });
    if (res.status === 409) await leer();
    return false;
  };

  const escribirPreparado = async (l, cuerpo) => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos-transferencias/detalle/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalleId: l.detalleId, ...cuerpo }),
      });
      return await tras(res);
    } catch (err) {
      console.error(err);
      setAviso({ tono: "danger", texto: "Error de conexión al guardar." });
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const buscarEnCatalogo = async (q) => {
    if (!q.trim() || !pos?.origenId) return setCatalogo(null);
    const res = await fetch(
      `/api/pos-transferencias/buscarProductos?q=${encodeURIComponent(q.trim())}&origenId=${pos.origenId}`,
      { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    setCatalogo(json.ok ? json.items || [] : []);
  };

  const agregarDelCatalogo = async (p) => {
    setGuardando(true);
    setAviso(null);
    try {
      // La ruta de siempre, con una unidad de la presentación por defecto del
      // producto; la cantidad se corrige en la tarjeta.
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
      // El 409 de "el local cambió el pedido mientras lo enviabas": el aviso
      // arriba y el pedido como está ahora.
      // Lo canceló el depósito mientras se enviaba: no hay nada que releer,
      // el aviso y de vuelta a la lista, donde ya no está.
      if (res.status === 409 && json.error === MENSAJE_SE_CANCELO) {
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

  // El depósito cancela el pedido, empezado o no: lo preparado no movió stock y
  // no se envía. Un 409 —ya se envió, o lo cambió otro— deja el aviso arriba y
  // el pedido como está ahora, igual que `enviar`.
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

  const permisos = perfil?.permisos || [];
  const puede =(Array.isArray(permisos) && permisos.includes("*")) || permisos.includes("pos_transferencias.ver");

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
  const empezado = lineas.some(estaRevisada);
  const visibles = lineasVisibles(lineas, { filtro, categoria, texto });
  const categorias = categoriasDePreparacion(lineas);

  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4" data-preparar-pedido={posId}>
      <SunmiPantallaDeTrabajo
        idCategoria="categoria-preparar"
        contexto={
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-lg2 font-semibold sunmi-text-strong">{pos?.destino?.nombre}</span>
              <span className="flex shrink-0 items-center gap-2">
                <SunmiPill color={empezado ? "amber" : "cyan"}>{empezado ? "Preparando" : "Nuevo"}</SunmiPill>
                {/* El mismo "⋯" que la recepción (`RecepcionMovil`): un icono y
                    no el carácter, que la fuente puede no tener. */}
                <SunmiButton
                  color="slate"
                  onClick={() => setMasAcciones(true)}
                  aria-label={TITULO_MAS_ACCIONES}
                  aria-haspopup="dialog"
                  className="shrink-0"
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </SunmiButton>
              </span>
            </div>
            <p className="text-sm2 sunmi-text-muted">
              {[
                `Pedido #${posId}`,
                cuandoDelPedido(solicitud?.solicitadoAt),
                solicitud?.solicitadoPorNombre ? `lo pidió ${solicitud.solicitadoPorNombre}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm2 sunmi-text-muted">
                <span className="tabular-nums sunmi-text-strong font-semibold">{`${preparados} / ${total}`}</span> preparados
              </span>
              <span className="text-sm2 sunmi-text-accent">{`${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`}</span>
            </div>
            <SunmiBarraDeAvance pct={pct} />
          </>
        }
        buscador={
          <SunmiCampoBusquedaVoz
            value={texto}
            onChange={setTexto}
            onVoz={setTexto}
            onKeyDown={(e) => {
              // Un lector físico escribe el código y manda Enter: el código
              // exacto ya deja solo ese producto en la lista.
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={PLACEHOLDER_BUSCAR}
            ariaLabel="Buscar o escanear un producto de este pedido"
          />
        }
        filtros={
          <SunmiFiltroEstado
            opciones={TEXTOS_FILTRO_PREPARAR.map(([clave, t]) => ({ clave, texto: t, cantidad: conteo[clave] }))}
            valor={filtro}
            onCambiar={setFiltro}
            ariaLabel="Filtrar productos por estado"
          />
        }
        categoria={
          <SunmiSelectAdv
            id="categoria-preparar"
            value={categoria ?? ""}
            onChange={(v) => setCategoria(v === "" ? null : v)}
          >
            <option value="">{`Todas · ${total}`}</option>
            {categorias.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {`${c.nombre} · ${c.cantidad}`}
              </option>
            ))}
          </SunmiSelectAdv>
        }
        antesDeLista={aviso ? <SunmiAviso tono={aviso.tono}>{aviso.texto}</SunmiAviso> : null}
        lista={
          <>
            {visibles.length === 0 ? (
              <p className="text-center py-6 sunmi-text-muted text-sm2">No hay productos que coincidan con este filtro.</p>
            ) : null}
            {visibles.map((l) => (
              <LineaParaPreparar
                key={l.detalleId}
                l={l}
                guardando={guardando}
                onVaCompleto={(x) => escribirPreparado(x, vaCompleto(x))}
                onCorregir={setCorrigiendo}
              />
            ))}
          </>
        }
        despuesDeLista={
          <SunmiButton color="slate" className="w-full min-h-toque justify-center" onClick={() => setAgregando(true)}>
            {TEXTO_AGREGAR}
          </SunmiButton>
        }
        pieDePantalla={
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm2 sunmi-text-muted">Preparados</span>
              <span className="block tabular-nums text-lg2 font-semibold sunmi-text-strong">{`${preparados} de ${total}`}</span>
            </span>
            <span className="shrink-0 text-right">
              <SunmiButton
                color="primary"
                onClick={enviar}
                disabled={pendientes > 0 || enviando}
                className="justify-center"
              >
                {enviando ? "Enviando..." : TEXTO_ENVIAR}
              </SunmiButton>
              {pendientes > 0 ? <span className="block text-sm2 sunmi-text-muted">{`Falta revisar ${pendientes}`}</span> : null}
            </span>
          </div>
        }
        despuesDelPie={
          <>
            <SunmiModalLayout
              open={!!corrigiendo}
              title={corrigiendo?.productoNombre || ""}
              onClose={() => setCorrigiendo(null)}
              z={NIVEL_MODAL_GLOBAL}
              forma="hoja"
              // Es carga: hay una cantidad escrita que un toque al costado tiraría.
              destructivo
              espacioCuerpo="gap-2"
            >
              {corrigiendo ? (
                <HojaCorregir
                  key={corrigiendo.detalleId}
                  linea={corrigiendo}
                  guardando={guardando}
                  onGuardar={async (cuerpo) => {
                    if (await escribirPreparado(corrigiendo, cuerpo)) setCorrigiendo(null);
                  }}
                  onVolverAPendiente={async () => {
                    if (await escribirPreparado(corrigiendo, { pendiente: true })) setCorrigiendo(null);
                  }}
                />
              ) : null}
            </SunmiModalLayout>

            <SunmiModalLayout
              open={agregando}
              title={TEXTO_AGREGAR.replace(/^\+ /, "")}
              onClose={() => setAgregando(false)}
              z={NIVEL_MODAL_GLOBAL}
              forma="hoja"
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
              {catalogo !== null && catalogo.length === 0 ? (
                <p className="text-sm2 sunmi-text-muted">No está en el catálogo del depósito.</p>
              ) : null}
              {(catalogo || []).map((p) => (
                <FilaCatalogoRecepcion key={p.productoLocalId} p={p} onElegir={agregarDelCatalogo} agregando={guardando} />
              ))}
            </SunmiModalLayout>

            {/* ── MÁS ACCIONES: HOY, CANCELAR EL PEDIDO ──────────────────────
                La misma hoja que la de la recepción. Cancelar no es una acción
                del flujo de preparar: queda a un toque, pero afuera. */}
            <SunmiModalLayout
              open={masAcciones}
              title={TITULO_MAS_ACCIONES}
              subtitle={`Pedido #${posId} · ${pos?.destino?.nombre ?? ""}`}
              onClose={() => setMasAcciones(false)}
              z={NIVEL_MODAL_GLOBAL}
              forma="hoja"
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
          </>
        }
      />
    </div>
  );
}
