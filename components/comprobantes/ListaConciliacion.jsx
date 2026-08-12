"use client";

// components/comprobantes/ListaConciliacion.jsx
//
// UNA SOLA LISTA, agrupada por comprobante.
//
// ── QUÉ REEMPLAZA Y POR QUÉ ────────────────────────────────────────────────
//
// Había dos listas: arriba las líneas de la factura buscando su producto, abajo
// el detalle del pedido con sus 34 líneas. Para saber si lo que vino era lo que
// se había pedido, había que ir de una a la otra y cruzarlas de memoria.
//
// Ahora cada fila es la línea de la factura CON lo que le corresponde del pedido
// al lado: lo pedido contra lo recibido, el costo del catálogo contra el de la
// factura, el subtotal y el aviso. Y las del pedido que ningún comprobante trajo
// van aparte, al final, solo si hay.
//
// ── LA RECEPCIÓN SE CARGA ACÁ, PERO NO SE GUARDA ACÁ ───────────────────────
//
// Los campos de cantidad y de kilos se dibujan en la fila —ese era el punto: si
// se siguieran escribiendo en otra tabla, no habríamos resuelto nada— pero el
// ESTADO y el GUARDADO siguen viviendo en la página, que es la que le habla a la
// ruta de recibir.
//
// Es a propósito: cambiar cómo se ve y cómo se guarda en la misma tanda junta
// dos fuentes de error en la misma ventana. Si más adelante conviene mover el
// estado, se hace solo y sabiendo que lo único que cambia es eso.
//
// ── LAS COLUMNAS SIGUEN CONDICIONADAS POR ESTADO ───────────────────────────
//
// Cantidad recibida solo en recepción; kilos solo si el pedido tiene fiambre; y
// las de "recibido" solo con el pedido cerrado. Una columna de recepción que
// aparece con el pedido cerrado invita a escribir donde ya no corresponde.
//
// El fiambre no es un detalle: entra por PIEZA en el depósito y se mide en KILOS
// en el local. Si esa columna desapareciera, alguien recibiría fiambre sin poder
// cargar el peso y nadie sabría por qué.

import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import { comoSeDice } from "@/lib/compras-proveedor/comprobante/pantalla";
import {
  estadoDeLaFila,
  origenDelCandidato,
  numerosDeLaFila,
  importe,
  formaDeLaFila,
  textoDelProducto,
  ladosDeLaFila,
} from "@/lib/compras-proveedor/comprobante/textosDeFila";
import {
  Unidad,
  Precio,
  BuscadorProducto,
} from "@/components/comprobantes/PiezasConciliacion";

const money = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);
const cant = (v) => (v == null ? "—" : Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(3));

export default function ListaConciliacion({
  pedidoId,
  estadoPedido,
  esRecepcion = false,
  puedeRecibir = true,
  // El estado de la recepción vive en la página; acá solo se dibuja.
  recibidos = {},
  setRecibidos,
  kgRecibidos = {},
  setKgRecibidos,
  onCambio,
  recargarToken,
}) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [buscandoEn, setBuscandoEn] = useState(null);
  const [unidadElegida, setUnidadElegida] = useState({});
  const [aceptando, setAceptando] = useState(null);
  const [decididas, setDecididas] = useState({});

  // NO HAY COLUMNA QUE SE CAIGA A 360.
  //
  // Antes había una: con cuatro columnas la tabla se iba de ancho, así que se
  // dejaba caer el precio por debajo de 480. Ya no hace falta —son tres, y las
  // de números se miden por su contenido— y además el precio ahora no puede
  // faltar: sin él, la fila muestra una cantidad sin nada contra qué
  // compararla, que es el defecto que esta tanda vino a sacar.
  //
  // Medido a 360 con las 21 líneas reales: nada desborda.

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/compras-proveedor/conciliacion/${pedidoId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const d = await r.json().catch(() => null);
      if (d?.ok) setDatos(d);
      else setMensaje({ tipo: "error", texto: d?.error || `El servidor contestó ${r.status}.` });
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo cargar la recepción: se cortó la conexión." });
    } finally {
      setCargando(false);
    }
  }, [pedidoId]);

  useEffect(() => { recargar(); }, [recargar, recargarToken]);

  async function vincular(lineaId, productoBaseId) {
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lineaId, productoBaseId }),
      });
      const d = await r.json().catch(() => null);
      setMensaje({ tipo: d?.ok ? "ok" : "error", texto: d?.queHacer || d?.error || `Contestó ${r.status}.` });
      setBuscandoEn(null);
      await recargar();
      onCambio?.();
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión al vincular. No se guardó nada." });
    }
  }

  async function aceptarPrecio(lineaId) {
    setMensaje(null);
    setAceptando(lineaId);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/aceptar-precio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lineaId, unidad: unidadElegida[lineaId] ?? undefined }),
      });
      const d = await r.json().catch(() => null);
      setMensaje({ tipo: d?.ok ? "ok" : "error", texto: d?.queHacer || d?.error || `Contestó ${r.status}.` });
      if (d?.ok) setDecididas((s) => ({ ...s, [lineaId]: "SI" }));
      await recargar();
      onCambio?.();
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión al aceptar el precio. No se escribió nada." });
    } finally {
      setAceptando(null);
    }
  }

  if (cargando && !datos) return <SunmiLoader />;
  if (!datos) return <p className="text-xs sunmi-text-danger">{mensaje?.texto ?? "Sin datos."}</p>;

  const cerrado = estadoPedido === "RECIBIDO";
  const tieneFiambre =
    datos.grupos.some((g) => g.filas.some((f) => f.esFiambre)) ||
    datos.sinComprobante.some((f) => f.esFiambre);

  return (
    <div className="mt-2">
      {datos.cobertura?.texto && (
        <p className={`mb-2 text-sm2 ${datos.cobertura.esAviso ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
          {datos.cobertura.texto}
        </p>
      )}

      {mensaje && (
        <p className={`text-xs mb-2 ${mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"}`}>
          {mensaje.texto}
        </p>
      )}

      {datos.grupos.length === 0 && !datos.hayFaltantes && (
        <p className="text-xs sunmi-text-muted py-3 text-center">
          Todavía no hay comprobantes ni líneas del pedido.
        </p>
      )}

      {datos.grupos.map((g) => (
        <GrupoComprobante
          key={g.comprobante.id}
          g={g}
          esRecepcion={esRecepcion && !cerrado}
          cerrado={cerrado}
          tieneFiambre={tieneFiambre}
          puedeRecibir={puedeRecibir}
          recibidos={recibidos}
          setRecibidos={setRecibidos}
          kgRecibidos={kgRecibidos}
          setKgRecibidos={setKgRecibidos}
          buscandoEn={buscandoEn}
          setBuscandoEn={setBuscandoEn}
          unidadElegida={unidadElegida}
          setUnidadElegida={setUnidadElegida}
          aceptando={aceptando}
          decididas={decididas}
          setDecididas={setDecididas}
          onVincular={vincular}
          onAceptar={aceptarPrecio}
        />
      ))}

      {/* EL GRUPO FINAL, SOLO SI HAY ALGO, con el conteo en el título.
          No se pinta como error: mientras falten comprobantes por subir, una
          línea sin cubrir puede estar en una factura que todavía no llegó. Eso
          lo dice el texto de cobertura, que ya tiene esa regla adentro. */}
      {datos.hayFaltantes && (
        <SunmiCard>
          <p className="text-xs font-bold sunmi-text-strong">
            {datos.sinComprobante.length}{" "}
            {datos.sinComprobante.length === 1
              ? "línea del pedido que ningún comprobante trajo"
              : "líneas del pedido que ningún comprobante trajo"}
          </p>
          <p className="text-sm2 sunmi-text-muted leading-snug">
            Se pueden recibir igual: puede haber llegado sin papel, o no haber llegado.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {datos.sinComprobante.map((f) => (
              <FilaSinComprobante
                key={f.pedidoDetalleId}
                f={f}
                esRecepcion={esRecepcion && !cerrado}
                cerrado={cerrado}
                tieneFiambre={tieneFiambre}
                recibidos={recibidos}
                setRecibidos={setRecibidos}
                kgRecibidos={kgRecibidos}
                setKgRecibidos={setKgRecibidos}
              />
            ))}
          </div>
        </SunmiCard>
      )}
    </div>
  );
}

/** El encabezado del grupo: qué comprobante es y cómo está. */
function EncabezadoGrupo({ comprobante, cantidad }) {
  const v = comoSeDice(comprobante.estado);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b sunmi-border pb-1">
      <div className="min-w-0">
        <p className="text-xs font-bold sunmi-text-strong">{comprobante.identidad}</p>
        <p className="text-sm2 sunmi-text-muted">
          {cantidad} {cantidad === 1 ? "línea" : "líneas"} · {comprobante.lineasVinculadas} vinculadas
        </p>
      </div>
      <p className="text-sm2 font-bold sunmi-text-muted">{v.titulo}</p>
    </div>
  );
}

/** Los campos de recepción. Se dibujan acá; el estado y el guardado son de la página. */
function CamposRecepcion({ detalleId, esFiambre, tieneFiambre, recibidos, setRecibidos, kgRecibidos, setKgRecibidos }) {
  if (detalleId == null) {
    return (
      <p className="text-sm2 sunmi-text-muted">
        Sin línea del pedido: vinculala primero para poder recibirla.
      </p>
    );
  }
  const valor = recibidos?.[detalleId] ?? "";
  const paso = (delta) => {
    const actual = Number(recibidos?.[detalleId]) || 0;
    setRecibidos?.((prev) => ({ ...prev, [detalleId]: Math.max(0, actual + delta) }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <SunmiButton color="slate" type="button" onClick={() => paso(-1)}>−</SunmiButton>
        <SunmiInput
          type="text"
          inputMode="numeric"
          value={valor}
          onChange={(e) => {
            const crudo = e.target.value;
            if (crudo === "") { setRecibidos?.((p) => ({ ...p, [detalleId]: "" })); return; }
            const n = parseInt(crudo, 10);
            setRecibidos?.((p) => ({ ...p, [detalleId]: Number.isNaN(n) ? "" : Math.max(0, n) }));
          }}
          onBlur={() => {
            const n = Number(recibidos?.[detalleId]);
            if (Number.isNaN(n) || n < 0) setRecibidos?.((p) => ({ ...p, [detalleId]: 0 }));
          }}
          className="w-14 text-center"
          aria-label="Cantidad recibida"
        />
        <SunmiButton color="slate" type="button" onClick={() => paso(1)}>+</SunmiButton>
      </div>

      {/* Los kilos SOLO si la línea es fiambre. El fiambre entra por pieza en el
          depósito y se mide en kilos en el local: sin este campo, entra sin peso. */}
      {tieneFiambre && esFiambre && (
        <SunmiInput
          type="number"
          min="0"
          step="0.01"
          value={kgRecibidos?.[detalleId] ?? ""}
          onChange={(e) => setKgRecibidos?.((p) => ({ ...p, [detalleId]: e.target.value }))}
          className="w-24 text-center"
          placeholder="kg"
          aria-label="Kilos recibidos"
        />
      )}
    </div>
  );
}

/**
 * Un comprobante: su encabezado y su tabla.
 *
 * ── UNA TABLA POR COMPROBANTE ──────────────────────────────────────────────
 *
 * Y no una sola con filas separadoras: así el encabezado de columnas queda
 * pegado a las filas que describe. Con separadores, líneas de facturas distintas
 * quedan bajo un mismo encabezado y cuesta ver dónde empieza cada una.
 *
 * ── EL PATRÓN NO SE INVENTÓ ACÁ ────────────────────────────────────────────
 *
 * Es el mismo de la conciliación de listas de precios: fila colapsada con
 * chevron, y al desplegar el detalle completo. Lo aporta `SunmiTable` en su modo
 * por columnas —`columnas`, `filas`, `filaExpandible`— que ya existía. Escribir
 * una tabla desplegable al lado habría sido rehacer un mecanismo probado.
 *
 * Lo que sí se copió a propósito es la DECISIÓN de diseño que está escrita en
 * `PanelDecision`: la forma siempre igual y el contenido cambiando. Es lo que
 * permite mirar veintiuna filas sin volver a aprender dónde está cada cosa.
 */
function GrupoComprobante({
  g, esRecepcion, cerrado, tieneFiambre, puedeRecibir,
  recibidos, setRecibidos, kgRecibidos, setKgRecibidos,
  buscandoEn, setBuscandoEn, unidadElegida, setUnidadElegida,
  aceptando, decididas, setDecididas, onVincular, onAceptar,
}) {
  // TODAS ARRANCAN CERRADAS.
  //
  // La regla anterior —abierta la que pide algo— parecía buena y en la primera
  // factura real abrió las 21: con ninguna vinculada todavía, todas piden algo.
  // Volvía el scroll infinito que la tabla vino a sacar.
  //
  // Lo que dice cuáles piden algo es la columna "Falta", que se lee de arriba
  // abajo sin abrir nada. Abrir es elegir cuál resolver.
  const [abiertas, setAbiertas] = useState(() => new Set());
  const alternar = (f) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      s.has(f.lineaId) ? s.delete(f.lineaId) : s.add(f.lineaId);
      return s;
    });

  const columnas = [
    {
      clave: "abrir",
      titulo: "",
      thClassName: "w-6",
      render: (f) => (
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={`transition-transform ${
            abiertas.has(f.lineaId) ? "rotate-90 sunmi-text-accent" : "sunmi-text-muted"
          }`}
        />
      ),
    },
    {
      clave: "producto",
      titulo: "Producto",
      // `w-full max-w-0` es lo que hace que `truncate` funcione DENTRO de una
      // tabla: sin acotar la celda, un nombre largo estira la columna y la tabla
      // se va de ancho. Medido en 360 con los nombres reales: salía 376 y
      // aparecía scroll lateral, que es peor que una columna menos.
      tdClassName: "w-full max-w-0",
      // Los dos renglones los decide `textoDelProducto`, fuera del componente,
      // para que la regla se pueda ejercer sin dibujar nada. Acá solo se pinta.
      //
      // LA IDENTIDAD PUEDE OCUPAR DOS RENGLONES, y por eso va `line-clamp-2` y
      // no `truncate`. Medido en 360 con la factura real: en un solo renglón
      // "CHESTERFIELD 20 CONV KS" y "CHESTERFIELD 20 CONV BOX" se cortaban los
      // dos en "CHESTERFIELD 20 C…" — justo donde difieren— y quedaban iguales.
      // Distinguirlos es lo único que esta fila tiene que lograr cerrada.
      //
      // Un nombre del ERP entra en un renglón, así que las filas vinculadas no
      // crecen: el alto extra lo paga solo la que todavía no se resolvió.
      render: (f) => {
        const t = textoDelProducto(f);
        return (
          <>
            <div className="line-clamp-2 break-words font-medium leading-snug sunmi-text-strong" title={t.arriba}>
              {t.arriba}
            </div>
            {t.abajo && (
              <div
                className={`text-xs2 truncate ${t.esPregunta ? "sunmi-text-accent" : "sunmi-text-muted"}`}
                title={t.abajo}
              >
                {t.abajo}
              </div>
            )}
          </>
        );
      },
    },
    // ── LO QUE SE COMPARA, AL LADO ────────────────────────────────────────
    //
    // Dos columnas con la misma forma: cantidad arriba, precio abajo. Es el
    // equivalente exacto de "costo actual" contra "costo nuevo" en la grilla de
    // listas. Antes había una sola cantidad, sin nada contra qué compararla, y
    // esta lista existe para comparar.
    //
    // El ámbar es del precio de la factura y solo cuando hay los dos números.
    ...["pedido", "factura"].map((lado) => ({
      clave: lado,
      titulo: lado === "pedido" ? "Pedido" : "Factura",
      align: "der",
      tdClassName: "tabular-nums whitespace-nowrap",
      render: (f) => {
        const l = ladosDeLaFila(f);
        const v = l[lado];
        const ambar = lado === "factura" && l.difiere;
        return (
          <>
            <div className="sunmi-text-strong">{v.cantidad ?? "—"}</div>
            <div className={`text-xs2 ${ambar ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
              {v.precio ?? "—"}
            </div>
          </>
        );
      },
    })),
  ];

  return (
    <SunmiCard className="mb-2">
      <EncabezadoGrupo comprobante={g.comprobante} cantidad={g.filas.length} />
      <div className="mt-2">
        <SunmiTable
          densidad="compacta"
          columnas={columnas}
          filas={g.filas}
          claveFila={(f) => f.lineaId}
          vacio="Este comprobante no tiene líneas leídas."
          onClickFila={alternar}
          filaSeleccionada={(f) => abiertas.has(f.lineaId)}
          // El tono adelanta cuáles piden algo, sin abrir ninguna.
          tonoFila={(f) => (formaDeLaFila(f).pide ? "atencion" : null)}
          // Devolver null es "esta fila está cerrada": el estado de apertura vive
          // acá, que es donde vive el dato.
          filaExpandible={(f) =>
            abiertas.has(f.lineaId) ? (
              <DetalleFila
                f={f}
                esRecepcion={esRecepcion}
                cerrado={cerrado}
                tieneFiambre={tieneFiambre}
                puedeRecibir={puedeRecibir}
                recibidos={recibidos}
                setRecibidos={setRecibidos}
                kgRecibidos={kgRecibidos}
                setKgRecibidos={setKgRecibidos}
                buscandoEn={buscandoEn}
                setBuscandoEn={setBuscandoEn}
                unidadElegida={unidadElegida}
                setUnidadElegida={setUnidadElegida}
                aceptando={aceptando}
                decididas={decididas}
                setDecididas={setDecididas}
                onVincular={onVincular}
                onAceptar={onAceptar}
              />
            ) : null
          }
        />
      </div>
    </SunmiCard>
  );
}

/**
 * Lo que se ve al desplegar una fila.
 *
 * La forma es SIEMPRE la misma y en este orden: qué dice el papel, qué le
 * corresponde del pedido, y las acciones. Lo que cambia es cuál de las acciones
 * aparece, y eso lo decidió `formaDeLaFila` — acá no se vuelve a decidir.
 */
function DetalleFila({
  f, esRecepcion, cerrado, tieneFiambre, puedeRecibir,
  recibidos, setRecibidos, kgRecibidos, setKgRecibidos,
  buscandoEn, setBuscandoEn, unidadElegida, setUnidadElegida,
  aceptando, decididas, setDecididas, onVincular, onAceptar,
}) {
  const [verOtros, setVerOtros] = useState(false);
  const estado = estadoDeLaFila(f);
  const numeros = numerosDeLaFila(f);
  const vinculada = estado.codigo !== "SIN_VINCULAR";
  const candidatos = f.candidatos ?? [];
  const primero = candidatos[0] ?? null;
  const origen = origenDelCandidato(f.origen);

  return (
    // El detalle cuelga en un `td` con `p-0`, así que sin esto queda pegado al
    // borde y el último botón parece de la fila de abajo. La barra a la
    // izquierda y el fondo lo atan visualmente a su fila.
    <div className="flex flex-col gap-1 border-l-2 sunmi-border sunmi-surface px-2 py-1.5 ml-6">
      {/* EL TEXTO DEL PAPEL. En una fila vinculada es lo único que deja ver que
          el vínculo es correcto, así que no falta nunca. */}
      {f.textoCrudo && (
        <p className="text-sm2 sunmi-text-muted break-words leading-snug">{f.textoCrudo}</p>
      )}

      {/* Los números, con la etiqueta pegada al valor. El que no existe no se
          dibuja: nunca un guion sin nombre. */}
      {(numeros.partes.length > 0 || numeros.noEstabaEnElPedido) && (
        <p className="text-sm2 leading-snug">
          {numeros.partes.map((x, i) => (
            <span key={x.clave}>
              {i > 0 && <span className="sunmi-text-muted"> · </span>}
              <span className="sunmi-text-muted">{x.etiqueta} </span>
              <span className="sunmi-text-strong">{x.valor}</span>
            </span>
          ))}
          {numeros.noEstabaEnElPedido && (
            <span className="sunmi-text-warning">
              {numeros.partes.length > 0 ? " · " : ""}No estaba en el pedido
            </span>
          )}
        </p>
      )}

      {/* El acumulado entre TODOS los comprobantes: para no sumar de memoria. */}
      {f.textoAcumulado && (
        <p className="text-sm2 sunmi-text-warning leading-snug">{f.textoAcumulado}</p>
      )}

      <Unidad
        u={f.unidad}
        puedeElegir={puedeRecibir}
        elegida={unidadElegida[f.lineaId] ?? null}
        onElegir={(v) => setUnidadElegida((s) => ({ ...s, [f.lineaId]: v }))}
      />
      <Precio
        p={f.precio}
        puede={puedeRecibir}
        aceptando={aceptando === f.lineaId}
        decidida={decididas[f.lineaId] === "NO" ? "NO" : null}
        onAceptar={() => onAceptar(f.lineaId)}
        onNo={() => setDecididas((s) => ({ ...s, [f.lineaId]: "NO" }))}
      />

      {cerrado && (
        <p className="text-sm2 sunmi-text-muted">
          Recibido: {cant(f.cantidadRecibida)}
          {f.esFiambre && f.kgRecibidos != null ? ` · ${Number(f.kgRecibidos).toFixed(2)} kg` : ""}
        </p>
      )}

      {/* Los campos de carga. Sin línea del pedido no hay dónde escribir, y el
          aviso ámbar de arriba ya explica por qué. */}
      {esRecepcion && f.pedidoDetalleId != null && (
        <CamposRecepcion
          detalleId={f.pedidoDetalleId}
          esFiambre={f.esFiambre}
          tieneFiambre={tieneFiambre}
          recibidos={recibidos}
          setRecibidos={setRecibidos}
          kgRecibidos={kgRecibidos}
          setKgRecibidos={setKgRecibidos}
        />
      )}

      {/* LA SUGERENCIA: la pregunta arriba, los botones juntos abajo.
          En una línea sola con `flex-wrap`, "Sí" quedaba colgando del final de
          la pregunta y "Otro…" caía solo al renglón siguiente, pegado al borde
          izquierdo: se leía como un botón suelto de la pantalla y no como la
          otra mitad de la misma decisión. */}
      {puedeRecibir && !vinculada && (
        <div>
          {primero ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm2 leading-snug">
                <span className="sunmi-text-strong">¿Es «{primero.nombre}»?</span>
                {origen && <span className={`ml-1 ${origen.tono}`}>{origen.texto}</span>}
              </p>
              <div className="flex items-center gap-1">
                <SunmiButton color="cyan" type="button" onClick={() => onVincular(f.lineaId, primero.productoBaseId)}>
                  Sí
                </SunmiButton>
                {candidatos.length > 1 && (
                  <SunmiButton color="slate" type="button" onClick={() => setVerOtros((v) => !v)}>
                    {verOtros ? "Cerrar" : "Otro…"}
                  </SunmiButton>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-sm2 sunmi-text-danger">No se encontró ninguno parecido.</span>
              <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(f.lineaId)}>
                Buscar
              </SunmiButton>
            </div>
          )}

          {verOtros && (
            <div className="mt-1 flex flex-col gap-0.5">
              {candidatos.slice(1).map((c) => (
                <SunmiButton
                  key={c.productoBaseId}
                  color="slate"
                  type="button"
                  className="justify-start text-left truncate"
                  onClick={() => onVincular(f.lineaId, c.productoBaseId)}
                >
                  {c.nombre}
                </SunmiButton>
              ))}
              <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(f.lineaId)}>
                Buscar otro…
              </SunmiButton>
            </div>
          )}

          {buscandoEn === f.lineaId && (
            <BuscadorProducto
              onElegir={(p) => onVincular(f.lineaId, p.productoBaseId)}
              onCancelar={() => setBuscandoEn(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Una línea del pedido que ningún comprobante trajo. */
function FilaSinComprobante({ f, esRecepcion, cerrado, tieneFiambre, recibidos, setRecibidos, kgRecibidos, setKgRecibidos }) {
  return (
    <div className="rounded border sunmi-border p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold sunmi-text-strong">{f.producto ?? "Sin nombre"}</p>
        <p className="text-sm2 sunmi-text-muted">{money(f.subtotalPedido)}</p>
      </div>
      <p className="text-sm2 sunmi-text-muted">
        Pediste {cant(f.cantidadPedida)} {f.unidad ? f.unidad.toLowerCase() : ""} a {money(f.costoCatalogo)}.
        Ningún comprobante la trajo.
      </p>

      {cerrado && (
        <p className="text-sm2 sunmi-text-muted mt-1">
          Recibido: {cant(f.cantidadRecibida)}
          {f.esFiambre && f.kgRecibidos != null ? ` · ${Number(f.kgRecibidos).toFixed(2)} kg` : ""}
        </p>
      )}

      {esRecepcion && (
        <div className="mt-2">
          <CamposRecepcion
            detalleId={f.pedidoDetalleId}
            esFiambre={f.esFiambre}
            tieneFiambre={tieneFiambre}
            recibidos={recibidos}
            setRecibidos={setRecibidos}
            kgRecibidos={kgRecibidos}
            setKgRecibidos={setKgRecibidos}
          />
        </div>
      )}
    </div>
  );
}
