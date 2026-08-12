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

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { comoSeDice } from "@/lib/compras-proveedor/comprobante/pantalla";
import {
  estadoDeLaFila,
  origenDelCandidato,
  numerosDeLaFila,
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
        <SunmiCard key={g.comprobante.id} className="mb-2">
          <EncabezadoGrupo comprobante={g.comprobante} cantidad={g.filas.length} />
          <div className="mt-2 flex flex-col gap-2">
            {g.filas.map((f) => (
              <Fila
                key={f.lineaId}
                f={f}
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
          </div>
        </SunmiCard>
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
 * Una fila.
 *
 * ── EL ORDEN, Y POR QUÉ ES ESE ─────────────────────────────────────────────
 *
 * 1. Identidad + ESTADO. El estado se dice UNA sola vez y acá: una palabra a la
 *    derecha. Antes lo insinuaban tres lugares distintos —la grilla con
 *    "Pedido —", el bloque de recepción con "vinculala primero" y la tira de
 *    aviso con "Está en el pedido"— y dos de los tres se contradecían.
 *
 *    Sin vincular, el título es el TEXTO DE LA FACTURA: cuando no hay producto,
 *    ese texto es la identidad de la línea.
 *
 * 2. El texto de la factura, siempre. En una fila vinculada va debajo del
 *    nombre, chico: ES LO ÚNICO QUE DEJA VER QUE EL VÍNCULO ES CORRECTO, así
 *    que no desaparece nunca.
 *
 * 3. Los números, cada uno con su etiqueta pegada. El que no existe no se
 *    dibuja: no hay forma de que quede un guion sin nombre.
 *
 * 4. Solo si hay algo que decir: el acumulado, la unidad, el precio.
 *
 * 5. Solo en recepción y con línea del pedido: los campos de carga.
 *
 * 6. Solo sin vincular: la sugerencia, en UN renglón, con el resto detrás de
 *    "Otro…". Antes eran tres botones a ancho completo apilados y se comían la
 *    pantalla: con 21 líneas, revisar la factura era imposible.
 */
function Fila({
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
    <div className="rounded border sunmi-border px-2 py-1.5">
      {/* 1. IDENTIDAD Y ESTADO — el único lugar donde se dice cómo está. */}
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-xs font-bold min-w-0 truncate ${vinculada ? "sunmi-text-strong" : "sunmi-text-muted"}`}>
          {vinculada ? f.producto ?? "Sin nombre" : f.textoCrudo}
        </p>
        <p className={`text-sm2 shrink-0 ${estado.tono}`}>{estado.palabra}</p>
      </div>

      {/* 2. El texto del papel. En una fila vinculada es lo único que deja
             comprobar que el vínculo es correcto: no se va nunca. */}
      {vinculada && f.textoCrudo && (
        <p className="text-sm2 sunmi-text-muted break-words leading-snug">{f.textoCrudo}</p>
      )}

      {/* 3. Los números, con la etiqueta pegada al valor. */}
      {(numeros.partes.length > 0 || numeros.noEstabaEnElPedido) && (
        <p className="text-sm2 leading-snug mt-0.5">
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

      {/* 4. El acumulado entre TODOS los comprobantes: sin sumar de memoria. */}
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
        <p className="text-sm2 sunmi-text-muted mt-0.5">
          Recibido: {cant(f.cantidadRecibida)}
          {f.esFiambre && f.kgRecibidos != null ? ` · ${Number(f.kgRecibidos).toFixed(2)} kg` : ""}
        </p>
      )}

      {/* 5. Los campos de carga. Sin línea del pedido no hay dónde escribir, y
             el aviso ámbar de arriba ya explica por qué. */}
      {esRecepcion && f.pedidoDetalleId != null && (
        <div className="mt-1">
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

      {/* 6. LA SUGERENCIA, EN UN RENGLÓN. */}
      {puedeRecibir && !vinculada && (
        <div className="mt-1">
          {primero ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-sm2 sunmi-text-strong min-w-0 truncate">¿Es «{primero.nombre}»?</span>
              {origen && <span className={`text-sm2 ${origen.tono}`}>{origen.texto}</span>}
              <SunmiButton color="cyan" type="button" onClick={() => onVincular(f.lineaId, primero.productoBaseId)}>
                Sí
              </SunmiButton>
              {candidatos.length > 1 && (
                <SunmiButton color="slate" type="button" onClick={() => setVerOtros((v) => !v)}>
                  {verOtros ? "Cerrar" : "Otro…"}
                </SunmiButton>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-sm2 sunmi-text-danger">No se encontró ninguno parecido.</span>
              <SunmiButton color="slate" type="button" onClick={() => setBuscandoEn(f.lineaId)}>
                Buscar
              </SunmiButton>
            </div>
          )}

          {/* Los demás candidatos: renglones de texto, no botones a ancho
              completo. Los tres apilados eran la mayor parte del alto de la
              fila, y con 21 líneas hacían la factura imposible de revisar. */}
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
