"use client";

// components/comprobantes/LineasComprobante.jsx
//
// Las líneas leídas de un comprobante, cada una al lado del producto al que
// corresponde.
//
// ── LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ─────────────────────────────
//
// QUE SE VEA A SIMPLE VISTA QUÉ VINCULÓ SOLO Y QUÉ ESPERA CONFIRMACIÓN.
//
// Si las dos cosas se vieran igual, alguien va a confirmar en masa sin mirar y
// se pierde toda la cautela del motor — que a propósito solo vincula solo por
// código o por alias exacto, porque un vínculo equivocado no se ve: la línea
// queda al lado de un producto plausible y el costo entra en el que no era.
//
// Por eso la diferencia va en TRES cosas a la vez y no solo en el color: la
// palabra ("Vinculado" contra "¿Es este?"), la forma (el sugerido viene con
// botones y el vinculado no) y el tono. Quien mira apurado lee la palabra.
//
// ── SOLO SE MUESTRA LO QUE PIDE DECISIÓN ───────────────────────────────────
//
// Lo que el sistema ya resolvió no se dibuja. Ocupaba lo mismo que lo que pide
// atención, y una factura de siete líneas no entraba en una pantalla: lo que
// sobraba era justamente lo que no había que mirar.
//
// Se pueden ver con el interruptor de arriba, cerrado por defecto.
//
// EL CONTEO DE ARRIBA ES SIEMPRE EL TOTAL REAL, no el de lo visible. Si dijera
// "6 líneas" porque hay seis a la vista, alguien creería que la factura tiene
// seis y tiene siete — y esa es la clase de error que después nadie encuentra,
// porque el número que lo delataría es el que está mal.
//
// ── UNA LÍNEA RESUELTA NO SE VA DE ABAJO DEL DEDO ──────────────────────────
//
// Al vincular, la línea deja de pedir decisión y le tocaría desaparecer. Si se
// fuera en el acto, todo lo de abajo sube un renglón justo cuando la persona
// está yendo a tocar la siguiente, y toca otra cosa.
//
// Por eso las que se resuelven ACÁ se quedan a la vista, ya en verde, hasta que
// se cierre la lista. El movimiento ocurre cuando la persona decide, no en el
// medio de su gesto.
//
// ── VINCULAR A MANO SIN SALIR DE ACÁ ───────────────────────────────────────
//
// Va a pasar seguido las primeras veces, hasta que los alias se acumulen. Si
// hubiera que ir a otra pantalla, nadie lo haría y las líneas quedarían sin
// vincular para siempre.

import { useEffect, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const money = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

/**
 * El estado del vínculo, con PALABRA propia.
 *
 * Los textos largos viven en el servidor (`textoOrigen`); acá va la etiqueta
 * corta, que es lo que se lee de un vistazo.
 */
function estadoDeVinculo(l) {
  if (l.productoLocalId) return { etiqueta: "Vinculado", tono: "sunmi-text-success", pideAccion: false };
  if (l.vinculadaSola) return { etiqueta: "Vinculado solo", tono: "sunmi-text-success", pideAccion: false };
  if (l.origen === "SIN_CANDIDATOS") return { etiqueta: "Sin encontrar", tono: "sunmi-text-danger", pideAccion: true };
  return { etiqueta: "¿Es este?", tono: "sunmi-text-warning", pideAccion: true };
}

/**
 * La unidad, EN CRIOLLO.
 *
 * El cociente no le dice nada a nadie: "3,08" no es una respuesta. La respuesta
 * es "36 ÷ 12 = 3 bultos, y el bulto sale 37.464".
 *
 * Y cuando no se puede decidir, la pregunta va entre DOS RESULTADOS CONCRETOS
 * con su cantidad y su costo, no entre dos etiquetas abstractas. Elegir entre
 * "3 bultos a 37.464" y "36 bultos a 3.122" es fácil; elegir entre "¿por unidad
 * o por bulto?" obliga a rehacer la cuenta en la cabeza.
 */
function Unidad({ u, onElegir, puedeElegir, elegida }) {
  if (!u) return null;

  // Ya eligió una persona: se muestra la lectura elegida con sus números, y se
  // deja volver atrás. No se sigue preguntando lo que ya se contestó.
  if (elegida && u.lecturas) {
    const op = elegida === "POR_UNIDAD" ? u.lecturas.porUnidad : u.lecturas.porBulto;
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-strong">{op.texto}</p>
        <p className="text-sm2 sunmi-text-muted">{op.cuenta}</p>
        <div className="mt-1">
          <SunmiButton color="slate" type="button" onClick={() => onElegir?.(null)}>
            Cambiar
          </SunmiButton>
        </div>
      </div>
    );
  }

  if (u.requiereDecision && u.lecturas) {
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-warning font-bold">¿Por unidad o por bulto?</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{u.porque}</p>
        <div className="mt-1 flex flex-col gap-1">
          {[u.lecturas.porUnidad, u.lecturas.porBulto].map((op) => (
            <SunmiButton
              key={op.unidad}
              color="cyan"
              type="button"
              className="justify-start text-left"
              disabled={!puedeElegir}
              onClick={() => onElegir?.(op.unidad)}
            >
              {op.texto}
            </SunmiButton>
          ))}
        </div>
      </div>
    );
  }

  if (u.explicacion) {
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-strong">{u.explicacion.frase}</p>
        <p className="text-sm2 sunmi-text-muted">{u.explicacion.detalle}</p>
        {u.explicacion.avisoDivision && (
          <p className="text-sm2 sunmi-text-warning leading-snug">{u.explicacion.avisoDivision}</p>
        )}
      </div>
    );
  }

  // Sin producto todavía no hay nada que deducir, y decirlo es mejor que el
  // silencio: aclara que falta vincular primero.
  return <p className="text-sm2 sunmi-text-muted mt-1">{u.texto}</p>;
}

/**
 * EL PRECIO: qué cambió y qué se puede hacer.
 *
 * Las tres reglas se ven distintas a propósito, porque son tres cosas
 * distintas:
 *
 *   · Subió más del umbral → el porcentaje y los dos botones. Hay que decidir.
 *   · Bajó → el porcentaje SIN botón. El costo no se baja solo, y el motivo
 *     está escrito en `aceptarPrecio.js`: una baja aplicada sin querer sube el
 *     margen en silencio y nadie la mira nunca.
 *   · Salto brusco → en rojo y sin botón. No es un precio nuevo, es sospecha de
 *     mala lectura.
 *
 * El texto viene armado del servidor. Acá no se recalcula ningún porcentaje: si
 * la pantalla dijera un número y el servidor escribiera otro, sería peor que no
 * mostrarlo.
 */
function Precio({ p, onAceptar, onNo, puede, aceptando, decidida }) {
  const d = p?.decision;
  if (!d || d.accion === "NINGUNA") return null;

  const tono =
    d.accion === "FRENA" ? "sunmi-text-danger"
    : d.accion === "OFRECER" ? "sunmi-text-warning"
    : "sunmi-text-muted";

  return (
    <div className={`mt-1 flex gap-2 ${tono}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold">{d.titulo}</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{d.detalle}</p>
        {d.ofreceAceptar && puede && !decidida && (
          <div className="mt-1 flex flex-wrap gap-1">
            <SunmiButton color="cyan" type="button" disabled={aceptando} onClick={onAceptar}>
              {aceptando ? "Aceptando…" : "Aceptar"}
            </SunmiButton>
            <SunmiButton color="slate" type="button" disabled={aceptando} onClick={onNo}>
              No
            </SunmiButton>
          </div>
        )}
        {/* Decir que no NO escribe nada: el estado de no aceptar es el que la
            línea ya tiene. Por eso alcanza con dejar de ofrecerlo. */}
        {decidida === "NO" && (
          <p className="text-sm2 sunmi-text-muted mt-1">
            Queda con el precio que tenía. No se escribió nada.
          </p>
        )}
      </div>
    </div>
  );
}

/** La tira de aviso de la columna Revisar: barra, palabra corta, detalle chico. */
function Revisar({ linea, children }) {
  const e = estadoDeVinculo(linea);
  return (
    <div className={`flex gap-2 ${e.tono}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold">{e.etiqueta}</p>
        {(linea.problema || linea.textoOrigen) && (
          <p className="text-sm2 sunmi-text-muted leading-snug">{linea.problema || linea.textoOrigen}</p>
        )}
        {linea.textoMotivoPedido && (
          <p className="text-sm2 sunmi-text-warning leading-snug">{linea.textoMotivoPedido}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/** Buscar un producto a mano, sin salir de la pantalla. */
function BuscadorProducto({ onElegir, onCancelar }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const texto = q.trim();
      if (texto.length < 3) { setItems([]); return; }
      setBuscando(true);
      try {
        const r = await fetch(`/api/productos/listar?q=${encodeURIComponent(texto)}&pageSize=8`);
        const d = await r.json();
        setItems(d?.items || d?.productos || []);
      } catch { setItems([]); } finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-2 rounded border sunmi-border p-2">
      <div className="flex gap-2 items-center">
        <SunmiInput
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto por nombre…"
          className="flex-1"
        />
        <SunmiButton color="slate" type="button" onClick={onCancelar}>Cancelar</SunmiButton>
      </div>
      {buscando && <p className="text-sm2 sunmi-text-muted mt-1">Buscando…</p>}
      {!buscando && q.trim().length >= 3 && items.length === 0 && (
        <p className="text-sm2 sunmi-text-muted mt-1">Ninguno con ese nombre.</p>
      )}
      <div className="flex flex-col gap-1 mt-1">
        {items.map((p) => (
          <SunmiButton
            key={p.baseId ?? p.id}
            color="slate"
            type="button"
            className="justify-start text-left"
            onClick={() => onElegir({ productoBaseId: p.baseId ?? p.base?.id ?? p.id, nombre: p.nombre })}
          >
            {p.nombre}
          </SunmiButton>
        ))}
      </div>
    </div>
  );
}

export default function LineasComprobante({ comprobanteId, puedeVincular = true, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [buscandoEn, setBuscandoEn] = useState(null); // lineaId
  const [verResueltas, setVerResueltas] = useState(false);
  // Las que se resolvieron en ESTA apertura de la lista. Se quedan a la vista
  // para que nada se mueva abajo del dedo; se van al cerrar y volver a abrir.
  const [recienResueltas, setRecienResueltas] = useState(() => new Set());
  // La unidad que una persona eligió cuando el cociente no alcanzó.
  //
  // Vive en la pantalla y no en la base: NO SE GUARDA. Si se cierra sin
  // aceptar, la próxima vez vuelve a preguntar. Es a propósito por ahora —
  // guardarla es otra columna— y se dice acá para que nadie la suponga
  // persistida. Al aceptar sí viaja al servidor, que la vuelve a usar para
  // resolver qué precio escribe.
  const [unidadElegida, setUnidadElegida] = useState({}); // lineaId → POR_UNIDAD | POR_BULTO
  const [aceptando, setAceptando] = useState(null); // lineaId
  const [decididas, setDecididas] = useState({}); // lineaId → "SI" | "NO"

  async function recargar() {
    setCargando(true);
    try {
      const r = await fetch(`/api/compras-proveedor/comprobantes/lineas/${comprobanteId}`);
      const d = await r.json();
      if (d.ok) setDatos(d);
      else setMensaje({ tipo: "error", texto: d.error });
    } finally { setCargando(false); }
  }

  useEffect(() => { recargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [comprobanteId]);

  async function vincular(lineaId, productoBaseId, pedidoDetalleId = null) {
    setMensaje(null);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaId, productoBaseId, pedidoDetalleId }),
      });
      const d = await r.json();
      setMensaje({ tipo: d.ok ? "ok" : "error", texto: d.ok ? d.queHacer : d.queHacer || d.error });
      if (d.ok) setRecienResueltas((s) => new Set(s).add(lineaId));
      setBuscandoEn(null);
      await recargar();
      onCambio?.();
    } catch {
      setMensaje({ tipo: "error", texto: "Se cortó la conexión al vincular. No se guardó nada: probá de nuevo." });
    }
  }

  async function aceptarPrecio(lineaId) {
    setMensaje(null);
    setAceptando(lineaId);
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/aceptar-precio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaId, unidad: unidadElegida[lineaId] ?? undefined }),
      });
      const d = await r.json();
      setMensaje({ tipo: d.ok ? "ok" : "error", texto: d.ok ? d.queHacer : d.queHacer || d.error });
      if (d.ok) {
        setDecididas((s) => ({ ...s, [lineaId]: "SI" }));
        setRecienResueltas((s) => new Set(s).add(lineaId));
      }
      await recargar();
      onCambio?.();
    } catch {
      setMensaje({
        tipo: "error",
        texto: "Se cortó la conexión al aceptar el precio. No se escribió nada.",
      });
    } finally {
      setAceptando(null);
    }
  }

  if (cargando) return <SunmiLoader />;
  if (!datos) return <p className="text-xs sunmi-text-muted">{mensaje?.texto ?? "Sin datos."}</p>;

  const { lineas, resumen } = datos;

  // Lo que se dibuja: lo que pide decisión, más lo que se acaba de resolver acá
  // —para que no se mueva nada abajo del dedo— más todo si el interruptor está
  // abierto.
  // Una línea con la unidad sin resolver también pide decisión: si no, quedaría
  // escondida detrás del filtro y nadie la miraría nunca.
  // Un precio que espera un sí o un no también pide decisión: si no, quedaría
  // escondido detrás del filtro y nadie lo miraría nunca. Es el mismo motivo por
  // el que entró la unidad sin resolver.
  const pideDecision = (l) =>
    l.requiereDecision ||
    l.unidad?.requiereDecision ||
    (l.precio?.decision?.ofreceAceptar && !decididas[l.id]) ||
    recienResueltas.has(l.id);
  const visibles = verResueltas ? lineas : lineas.filter(pideDecision);
  const resueltasOcultas = lineas.length - visibles.length;

  return (
    <div className="mt-2">
      {/* EL CONTEO ES EL TOTAL REAL, no el de lo visible. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <p className="text-sm2 sunmi-text-muted">
          {resumen.total} {resumen.total === 1 ? "línea" : "líneas"} ·{" "}
          {resumen.vinculadasSolas} {resumen.vinculadasSolas === 1 ? "vinculada sola" : "vinculadas solas"} ·{" "}
          <span className={resumen.esperandoDecision ? "sunmi-text-warning font-bold" : ""}>
            {resumen.esperandoDecision}{" "}
            {resumen.esperandoDecision === 1 ? "espera que la mires" : "esperan que las mires"}
          </span>
          {resumen.unidadSinResolver > 0 && (
            <span className="sunmi-text-warning">
              {" "}· {resumen.unidadSinResolver} sin saber si es por unidad o por bulto
            </span>
          )}
          {resumen.precioEsperando > 0 && (
            <span className="sunmi-text-warning">
              {" "}· {resumen.precioEsperando}{" "}
              {resumen.precioEsperando === 1 ? "precio que subió" : "precios que subieron"}
            </span>
          )}
        </p>
        {/* El conteo contra el PEDIDO no va acá: un pedido se cubre con
            varias facturas, así que compararlo con UN comprobante haría que
            toda entrega parcial pareciera incompleta. La cobertura vive en el
            panel, contra todos los comprobantes juntos. Acá queda solo el
            control de este comprobante contra su propio papel. */}
        {resueltasOcultas > 0 && !verResueltas && (
          <SunmiButton color="slate" type="button" onClick={() => setVerResueltas(true)}>
            Ver las {resueltasOcultas} ya resueltas
          </SunmiButton>
        )}
        {verResueltas && (
          <SunmiButton color="slate" type="button" onClick={() => setVerResueltas(false)}>
            Ocultar las resueltas
          </SunmiButton>
        )}
      </div>

      {/* FALTAN RENGLONES: se avisa arriba de todo y aunque la cuenta cierre.
          Una línea que el lector no transcribió nunca se evalúa, así que las
          dos ecuaciones pueden dar bien con la factura incompleta. */}
      {datos.conteos?.faltanDelPapel > 0 && (
        <div className="mb-2 rounded border sunmi-border p-2">
          <p className="text-xs font-bold sunmi-text-danger">
            Faltan {datos.conteos.faltanDelPapel}{" "}
            {datos.conteos.faltanDelPapel === 1 ? "renglón" : "renglones"} del comprobante
          </p>
          <p className="text-sm2 sunmi-text-muted leading-snug">
            El lector dice ver {datos.conteos.enElPapel} en el papel y transcribió{" "}
            {datos.conteos.transcriptas}. Revisá el detalle contra la foto antes de dar esta
            lectura por buena, aunque la cuenta cierre.
          </p>
        </div>
      )}

      {mensaje && (
        <p className={`text-xs mb-2 ${mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"}`}>
          {mensaje.texto}
        </p>
      )}

      {/* ── Escritorio: tabla, con Revisar entre Producto y SKU ─────────── */}
      <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
        <SunmiTable headers={["Producto", "Revisar", "Cant.", "Precio unit.", "Subtotal", "En el pedido"]}>
          {visibles.length === 0 ? (
            <SunmiTableEmpty
              label={
                lineas.length === 0
                  ? "El comprobante no tiene líneas leídas"
                  : "Nada pendiente: todas las líneas están resueltas"
              }
            />
          ) : (
            visibles.map((l) => {
              const e = estadoDeVinculo(l);
              // EL NOMBRE SOLO SI ESTÁ VINCULADO. Pintar el primer candidato acá hacía
              // que una línea sin vincular pareciera vinculada: la columna decía
              // "pan" y era apenas una sugerencia entre cinco. Es justo la
              // confusión que la pantalla existe para evitar.
              const nombre = l.productoLocalId || l.vinculadaSola ? l.sugerido?.nombre ?? null : null;
              return (
                <SunmiTableRow key={l.id}>
                  <td className="px-3 py-1.5 align-top max-w-[18rem]">
                    <p className={`text-xs font-bold ${nombre ? "sunmi-text-strong" : "sunmi-text-muted"}`}>
                      {nombre ?? "Sin vincular"}
                    </p>
                    {/* El texto crudo de la factura, debajo del nombre. */}
                    <p className="text-sm2 sunmi-text-muted break-words">{l.textoCrudo}</p>
                  </td>
                  <td className="px-3 py-1.5 align-top max-w-[24rem]">
                    <Revisar linea={l}>
                      <Unidad
                        u={l.unidad}
                        puedeElegir={puedeVincular}
                        elegida={unidadElegida[l.id] ?? null}
                        onElegir={(v) => setUnidadElegida((s) => ({ ...s, [l.id]: v }))}
                      />
                      <Precio
                        p={l.precio}
                        puede={puedeVincular}
                        aceptando={aceptando === l.id}
                        decidida={decididas[l.id] === "NO" ? "NO" : null}
                        onAceptar={() => aceptarPrecio(l.id)}
                        onNo={() => setDecididas((s) => ({ ...s, [l.id]: "NO" }))}
                      />
                      {puedeVincular && e.pideAccion && (
                        <div className="mt-1 flex flex-col gap-1">
                          {(l.candidatos || []).slice(0, 3).map((c) => (
                            <div key={c.productoBaseId} className="flex items-center gap-2">
                              <SunmiButton color="cyan" type="button" onClick={() => vincular(l.id, c.productoBaseId)}>
                                Es este
                              </SunmiButton>
                              <span className="text-sm2 sunmi-text-muted truncate">{c.nombre}</span>
                            </div>
                          ))}
                          {buscandoEn === l.id ? (
                            <BuscadorProducto
                              onElegir={(p) => vincular(l.id, p.productoBaseId)}
                              onCancelar={() => setBuscandoEn(null)}
                            />
                          ) : (
                            <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(l.id)}>
                              Buscar otro…
                            </SunmiButton>
                          )}
                        </div>
                      )}
                    </Revisar>
                  </td>
                  <td className="px-3 py-1.5 align-top text-xs">{Number(l.cantidad)}</td>
                  <td className="px-3 py-1.5 align-top text-xs">{money(l.netoUnitario)}</td>
                  <td className="px-3 py-1.5 align-top text-xs">{money(l.subtotalImpreso)}</td>
                  <td className="px-3 py-1.5 align-top text-sm2 sunmi-text-muted">
                    {l.pedidoDetalle
                      ? `${Number(l.pedidoDetalle.cantidad)} × ${money(l.pedidoDetalle.precioCosto)}`
                      : "—"}
                  </td>
                </SunmiTableRow>
              );
            })
          )}
        </SunmiTable>
      </div>

      {/* ── Móvil: tarjetas ──────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-2">
        {visibles.length === 0 && lineas.length > 0 && (
          <p className="text-xs sunmi-text-success py-3 text-center">
            Nada pendiente: todas las líneas están resueltas
          </p>
        )}
        {visibles.map((l) => {
          const e = estadoDeVinculo(l);
          // EL NOMBRE SOLO SI ESTÁ VINCULADO. Pintar el primer candidato acá hacía
              // que una línea sin vincular pareciera vinculada: la columna decía
              // "pan" y era apenas una sugerencia entre cinco. Es justo la
              // confusión que la pantalla existe para evitar.
              const nombre = l.productoLocalId || l.vinculadaSola ? l.sugerido?.nombre ?? null : null;
          return (
            <div key={l.id} className="rounded border sunmi-border p-2">
              <p className={`text-xs font-bold ${nombre ? "sunmi-text-strong" : "sunmi-text-muted"}`}>
                      {nombre ?? "Sin vincular"}
                    </p>
              <p className="text-sm2 sunmi-text-muted break-words">{l.textoCrudo}</p>
              <p className="text-sm2 sunmi-text-muted mt-1">
                {Number(l.cantidad)} × {money(l.netoUnitario)} = {money(l.subtotalImpreso)}
              </p>
              <div className="mt-2">
                <Revisar linea={l}>
                  <Unidad
                    u={l.unidad}
                    puedeElegir={puedeVincular}
                    elegida={unidadElegida[l.id] ?? null}
                    onElegir={(v) => setUnidadElegida((s) => ({ ...s, [l.id]: v }))}
                  />
                  <Precio
                    p={l.precio}
                    puede={puedeVincular}
                    aceptando={aceptando === l.id}
                    decidida={decididas[l.id] === "NO" ? "NO" : null}
                    onAceptar={() => aceptarPrecio(l.id)}
                    onNo={() => setDecididas((s) => ({ ...s, [l.id]: "NO" }))}
                  />
                  {puedeVincular && e.pideAccion && (
                    <div className="mt-1 flex flex-col gap-1">
                      {(l.candidatos || []).slice(0, 3).map((c) => (
                        <SunmiButton
                          key={c.productoBaseId}
                          color="cyan"
                          type="button"
                          className="justify-start text-left"
                          onClick={() => vincular(l.id, c.productoBaseId)}
                        >
                          Es este: {c.nombre}
                        </SunmiButton>
                      ))}
                      {buscandoEn === l.id ? (
                        <BuscadorProducto
                          onElegir={(p) => vincular(l.id, p.productoBaseId)}
                          onCancelar={() => setBuscandoEn(null)}
                        />
                      ) : (
                        <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(l.id)}>
                          Buscar otro…
                        </SunmiButton>
                      )}
                    </div>
                  )}
                </Revisar>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
