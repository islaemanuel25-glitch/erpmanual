"use client";

// LA FICHA DEL PRODUCTO QUE SE ESTÁ CONTROLANDO.
//
// ── UN PRODUCTO SE RECIBE EN LA PRESENTACIÓN EN QUE SALIÓ ─────────────────
//
// Si el remito dice 6 PACK x6, la recepción principal es en PACK x6. No se
// convierte la pantalla a "36 unidades" ni se deja elegir otra presentación: la
// persona está contando cajas contra un remito que habla de cajas, y cambiarle
// la escala la obliga a hacer la cuenta de cabeza. `unidadEnviada` manda.
//
// Las 36 unidades físicas se muestran como información secundaria, porque son
// las que mueven stock y conviene verlas — pero no son el campo que se edita.
//
// ── EL PACK INCOMPLETO ────────────────────────────────────────────────────
//
// Llegaron 5 cajas enteras y 5 sueltas. Eso NO es "5,833 bultos": ese número no
// existe en el depósito y además no es exacto —5,833 × 6 = 34,998—. Son dos
// campos, y el total sale de `unidadesFisicasDe`, la misma función que usa el
// servidor al confirmar.
//
// El desglose solo aparece cuando la presentación agrupa: en UNIDAD no hay
// bultos que completar y el campo no tendría significado.
//
// ── MARCAR REVISADO PERSISTE ──────────────────────────────────────────────
//
// No es un checkbox de React. Al tocarlo se guarda: cantidad, sueltas, motivo,
// la marca, quién y cuándo. Con 150 productos, cerrar el navegador y volver
// tiene que conservar el avance.

import { useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

import { BadgeAgregado, fmtCantidad, fmtDiferencia } from "./detallePresentacion";
import { unidadesFisicasDe } from "@/lib/transferencias/recepcion";
import { motivosParaDiferencia } from "@/lib/transferencias/recepcionUI";
import { ESTADO_PRODUCTO, estadoDeProducto } from "@/lib/transferencias/controlFisico";
import {
  PRESENTACION,
  agrupa,
  descriptorDeEnvio,
  nombreDePresentacion,
  rotuloDeEnvio,
  rotuloFisicoDeEnvio,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

export const ROTULO_SUELTAS = "Hay unidades sueltas";

/**
 * El nombre de la presentación, tal como el remito la nombra.
 *
 * ── ESTO DECIDÍA MAL, Y ERA EL DEFECTO CENTRAL ──────────────────────────
 *
 * Decía: BULTO → "PACK xN", todo lo demás → "UNIDAD". Con eso un cajón se veía
 * como pack, un kilo como unidad y una pieza como unidad. Y no podía hacerlo
 * mejor: `unidadEnviada` solo tiene BULTO y UNIDAD.
 *
 * Ahora delega en `descriptorDeEnvio`, que contesta con el snapshot de cómo se
 * despachó cuando la línea lo tiene, y reconstruye del catálogo cuando es
 * anterior. La decisión de qué es un pack, un cajón, un kilo o una pieza vive en
 * un solo lugar del repo — `presentacionDeProducto`— y la comparten los
 * comprobantes del POS y esta pantalla.
 */
export function presentacionDelEnvio(d = {}) {
  return nombreDePresentacion(descriptorDeEnvio(d));
}

/** El texto del estado. NO se depende del color para distinguirlos. */
export const TEXTO_ESTADO = Object.freeze({
  [ESTADO_PRODUCTO.PENDIENTE]: "Pendiente de revisar",
  [ESTADO_PRODUCTO.CORRECTO]: "Correcto",
  [ESTADO_PRODUCTO.FALTANTE]: "Faltante",
  [ESTADO_PRODUCTO.SOBRANTE]: "Sobrante",
  [ESTADO_PRODUCTO.NO_DECLARADO]: "No declarado",
});

const TONO_ESTADO = Object.freeze({
  [ESTADO_PRODUCTO.PENDIENTE]: "sunmi-text-muted",
  [ESTADO_PRODUCTO.CORRECTO]: "sunmi-text-success",
  [ESTADO_PRODUCTO.FALTANTE]: "sunmi-text-danger",
  [ESTADO_PRODUCTO.SOBRANTE]: "sunmi-text-warning",
  [ESTADO_PRODUCTO.NO_DECLARADO]: "sunmi-text-link",
});

export default function FichaProductoRecepcion({
  producto,
  puedeRecibir = false,
  guardando = false,
  onRevisar,
  onQuitar,
  quitando = false,
  /**
   * La ficha se está dibujando DENTRO de una hoja inferior.
   *
   * ── ES PRESENTACIÓN Y NADA MÁS ─────────────────────────────────────────
   *
   * Cambia dos cosas y ninguna es de negocio: no pone su propia `SunmiCard`
   * —adentro de la hoja ya hay una tarjeta y anidarlas dibuja dos bordes y dos
   * fondos—, y el botón principal dice "y seguir", porque en el teléfono
   * guardar CIERRA la hoja y devuelve al buscador para el producto siguiente.
   *
   * El default es `false`, así que el escritorio queda exactamente como estaba.
   */
  enHoja = false,
  /** Se llama después de guardar BIEN. La hoja lo usa para cerrarse sola. */
  onGuardado = null,
}) {
  const d = producto;

  // ── EL VALOR PROPUESTO NO ES EL DATO PERSISTIDO ─────────────────────────
  //
  // Si el producto todavía no tiene recepción cargada, el campo arranca con lo
  // ENVIADO: si llegó todo bien, el operador toca "Marcar revisado" y listo. Es
  // el caso feliz de un toque.
  //
  // Pero eso vive SOLO acá, en la ficha del producto que está abierto. No se
  // escribe en ningún lado hasta que alguien lo confirma con el botón, y por eso
  // un "Guardar" no puede convertir en correctos 149 productos que nadie miró.
  // ── EL VALOR INICIAL SE DERIVA DE LAS PROPS, NO DE UN EFECTO ────────────
  //
  // La primera versión lo hacía en un `useEffect`. Dos problemas, y el candado
  // de render encontró el segundo:
  //
  //   · en el navegador, el primer pintado sale con los campos VACÍOS y recién
  //     el efecto los llena — un parpadeo en cada producto que se abre, con 150
  //     productos por recepción;
  //   · en render de servidor el efecto no corre nunca, así que lo que se dibuja
  //     no tiene nada adentro.
  //
  // Se inicializa con la función de `useState`, que corre una sola vez, y el
  // consumidor monta la ficha con `key={producto.id}`: cambiar de producto la
  // vuelve a montar y el estado nace del producto nuevo. Es el mecanismo de
  // React para "resetear estado cuando cambia la identidad", y no necesita un
  // efecto que sincronice.
  const inicial = () => {
    const propuesto = d?.cantidadRecibida == null ? d?.cantidadEnviada : d.cantidadRecibida;
    const s = Number(d?.recibidoUnidadesSueltas || 0);
    return {
      recibido: String(propuesto ?? ""),
      sueltas: s > 0 ? String(s) : "",
      conSueltas: s > 0,
      motivo: d?.motivoPrincipal || "",
      detalleMotivo: d?.motivoDetalle || "",
    };
  };

  const [recibido, setRecibido] = useState(() => inicial().recibido);
  const [sueltas, setSueltas] = useState(() => inicial().sueltas);
  const [conSueltas, setConSueltas] = useState(() => inicial().conSueltas);
  const [motivo, setMotivo] = useState(() => inicial().motivo);
  const [detalleMotivo, setDetalleMotivo] = useState(() => inicial().detalleMotivo);
  const [error, setError] = useState("");

  // El guard va DESPUÉS de los hooks: React cuenta hooks por render y retornar
  // antes cambiaría la cantidad entre un render y el siguiente. Es el mismo
  // defecto que ya rompió esta pantalla una vez.
  if (!d) return null;

  // ── LA PRESENTACIÓN SALE DEL DESCRIPTOR, NO DE `unidadEnviada` ──────────
  //
  // Antes acá se preguntaba `d.unidadEnviada === "BULTO"`, y con eso un cajón se
  // contaba como pack y un kilo como unidad. El descriptor contesta con lo que
  // se REGISTRÓ al despachar cuando la línea lo tiene, y reconstruye del
  // catálogo cuando es anterior a la migración.
  const envio = descriptorDeEnvio(d);
  const factor = envio.factor || 1;
  // `agrupaEsta` y no `agrupa`: el import del módulo se llama así y sombrearlo
  // acá adentro dejaría inalcanzable la función del dominio.
  const agrupaEsta = agrupa(envio.presentacion) && factor > 1;
  const estado = estadoDeProducto(d);

  // Las físicas de lo que está escrito AHORA. Misma función que el servidor, y
  // con el factor CONGELADO: si el catálogo cambió después del envío, la cuenta
  // sigue siendo la del remito.
  const unidadParaCuenta = agrupaEsta ? "BULTO" : "UNIDAD";
  const fisicasEditadas = unidadesFisicasDe({
    cantidad: recibido === "" ? 0 : recibido,
    sueltas: agrupaEsta && conSueltas ? sueltas || 0 : 0,
    unidad: unidadParaCuenta,
    factorPack: factor,
  });
  const fisicasEnviadas = unidadesFisicasDe({
    cantidad: envio.cantidad,
    sueltas: envio.sueltas,
    unidad: unidadParaCuenta,
    factorPack: factor,
  });
  const diferenciaFisica =
    fisicasEditadas == null || fisicasEnviadas == null ? null : fisicasEditadas - fisicasEnviadas;

  const motivos = motivosParaDiferencia({
    // La diferencia se mide en FÍSICO: 6 packs + 1 suelta contra 6 enviados es
    // una diferencia aunque los dos números de packs sean 6.
    enviada: fisicasEnviadas,
    recibida: fisicasEditadas,
    agregadoEnRecepcion: d.agregadoEnRecepcion,
  });

  const revisar = async () => {
    setError("");
    if (motivos.length > 0 && !motivo) {
      setError("Elegí el motivo de la diferencia antes de marcarlo como revisado.");
      return;
    }
    if (motivos.length > 0 && motivo === "Otro" && !detalleMotivo.trim()) {
      setError("Detallá el motivo.");
      return;
    }
    const r = await onRevisar?.({
      detalleId: d.id,
      recibido: recibido === "" ? null : recibido,
      recibidoUnidadesSueltas: agrupaEsta && conSueltas ? sueltas || 0 : 0,
      motivoPrincipal: motivos.length > 0 ? motivo : null,
      motivoDetalle: motivos.length > 0 && motivo === "Otro" ? detalleMotivo : null,
    });
    if (r && r.ok === false) {
      setError(r.error || "No se pudo guardar la revisión.");
      return;
    }
    // Solo cuando salió bien. Si la hoja se cerrara igual ante un error, el
    // operador vería desaparecer el producto creyendo que quedó guardado.
    onGuardado?.();
  };

  // Adentro de una hoja la tarjeta la pone el modal. Ver `enHoja`.
  const Envoltorio = enHoja ? "div" : SunmiCard;
  const claseEnvoltorio = enHoja ? "space-y-2" : "p-3 space-y-2";

  return (
    <Envoltorio className={claseEnvoltorio}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {/* Adentro de la hoja el nombre YA está en el encabezado del modal, y
              repetirlo dos veces seguidas se lee como un error de la pantalla.
              En escritorio la ficha no tiene encabezado arriba, así que ahí el
              título sigue siendo suyo. Se vio en la captura de 390 px. */}
          {!enHoja && (
            <h3 className="font-semibold sunmi-text-strong leading-tight break-words">{d.nombre}</h3>
          )}
          <p className="text-sm2 sunmi-text-muted">
            {d.categoria?.nombre || "Sin categoría"}
            {d.codigoBarra ? ` · ${d.codigoBarra}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BadgeAgregado d={d} />
          {/* El estado con TEXTO, no solo con color. */}
          <span className={`text-sm2 font-semibold ${TONO_ESTADO[estado]}`}>
            {TEXTO_ESTADO[estado]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-sm2 sunmi-text-muted">Enviado</div>
          {/* La presentación REGISTRADA es la principal: "6 CAJÓN x8", no "48
              UNIDAD". Cuando el envío llevó bultos incompletos, el desglose se
              dice acá mismo — un remito de 4 packs más 5 sueltas no es "4,833
              packs" ni "29 unidades". */}
          <div className="font-mono tabular-nums sunmi-text-strong">
            {d.agregadoEnRecepcion ? "—" : rotuloDeEnvio(envio)}
          </div>
          {!d.agregadoEnRecepcion && envio.sueltas > 0 && (
            <div className="text-sm2 sunmi-text-muted">
              + {fmtCantidad(envio.sueltas)} {envio.sueltas === 1 ? "unidad suelta" : "unidades sueltas"}
            </div>
          )}
          {/* Las unidades físicas, SECUNDARIAS y solo donde significan algo. En
              KG y en PIEZA `rotuloFisicoDeEnvio` devuelve null: decir "3,250
              unidades" de un fiambre sería falso. */}
          {!d.agregadoEnRecepcion && rotuloFisicoDeEnvio(envio) && (
            <div className="text-sm2 sunmi-text-muted">{rotuloFisicoDeEnvio(envio)}</div>
          )}
        </div>
        <div>
          <div className="text-sm2 sunmi-text-muted">Recibido</div>
          {puedeRecibir ? (
            <SunmiInput
              type="number"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              aria-label={`Cantidad recibida en ${nombreDePresentacion(envio)}`}
            />
          ) : (
            <div className="font-mono tabular-nums sunmi-text-strong">
              {d.cantidadRecibida == null ? "—" : fmtCantidad(d.cantidadRecibida)}
            </div>
          )}
          <div className="text-sm2 sunmi-text-muted">{nombreDePresentacion(envio)}</div>
        </div>
      </div>

      {/* ── EL PACK INCOMPLETO ────────────────────────────────────────────── */}
      {puedeRecibir && agrupaEsta && (
        <div className="space-y-1.5">
          <SunmiButton
            color={conSueltas ? "primary" : "slate"}
            aria-pressed={conSueltas}
            onClick={() => {
              setConSueltas((v) => !v);
              if (conSueltas) setSueltas("");
            }}
          >
            {ROTULO_SUELTAS}
          </SunmiButton>
          {conSueltas && (
            <div>
              <div className="text-sm2 sunmi-text-muted mb-1">
                Unidades sueltas, fuera de los bultos completos
              </div>
              <SunmiInput
                type="number"
                value={sueltas}
                onChange={(e) => setSueltas(e.target.value)}
                aria-label="Unidades sueltas"
              />
            </div>
          )}
        </div>
      )}

      {/* El total físico y la diferencia. Es lo que va a mover stock. */}
      {fisicasEditadas != null && (
        <div className="text-sm2 sunmi-text-muted">
          {/* ── LA UNIDAD DEL RESULTADO ES LA DEL DOMINIO ──────────────────
              Decía "unidades" SIEMPRE. Para un fiambre de 3,250 KG eso es
              falso, y para una pieza también. `unidadDeDiferencia` contesta
              con la escala en la que esta línea mide de verdad. */}
          Ingreso físico: <span className="tabular-nums">{fmtCantidad(fisicasEditadas)}</span>{" "}
          {unidadDeDiferencia(envio)}
          {!d.agregadoEnRecepcion && diferenciaFisica != null && (
            <>
              {" · "}Diferencia{" "}
              <span className="tabular-nums font-semibold">{fmtDiferencia(diferenciaFisica)}</span>{" "}
              {/* En KG la diferencia se dice en KG y en PIEZA en piezas. El
                  singular solo aplica a lo contable: "0,150 KG" no tiene
                  singular. */}
              {unidadDeDiferencia(envio) === "unidades"
                ? Math.abs(diferenciaFisica) === 1
                  ? "unidad"
                  : "unidades"
                : unidadDeDiferencia(envio)}
            </>
          )}
        </div>
      )}

      {/* El motivo, solo si esta línea tiene que explicar algo. Una agregada no:
          su procedencia ya está registrada con autor y fecha. */}
      {puedeRecibir && motivos.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm2 sunmi-text-muted">Motivo de la diferencia</div>
          <SunmiSelectAdv value={motivo} onChange={setMotivo}>
            <option value="">Seleccionar…</option>
            {motivos.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </SunmiSelectAdv>
          {motivo === "Otro" && (
            <SunmiInput
              type="text"
              value={detalleMotivo}
              onChange={(e) => setDetalleMotivo(e.target.value)}
              placeholder="Detalle…"
              aria-label="Detalle del motivo"
            />
          )}
        </div>
      )}

      {error && <SunmiAviso tono="warning">{error}</SunmiAviso>}

      {puedeRecibir && (
        <div className="flex flex-wrap gap-2">
          <SunmiButton
            color="amber"
            onClick={revisar}
            disabled={guardando}
            aria-pressed={d.revisadoEnRecepcion === true}
          >
            {guardando
              ? "Guardando…"
              : enHoja
              ? // En el teléfono el botón dice qué pasa DESPUÉS: guardar cierra
                // la hoja y deja el buscador listo para el producto siguiente.
                // Y nombra lo que se está guardando, que con una diferencia en
                // pantalla no es lo mismo que "revisado".
                diferenciaFisica
                ? "✓ Guardar diferencia y seguir"
                : "✓ Marcar revisado y seguir"
              : d.revisadoEnRecepcion
              ? "✓ Revisado — guardar de nuevo"
              : "✓ Marcar como revisado"}
          </SunmiButton>

          {d.revisadoEnRecepcion && (
            <SunmiButton
              color="slate"
              onClick={() => onRevisar?.({ detalleId: d.id, revisado: false })}
              disabled={guardando}
            >
              Desmarcar
            </SunmiButton>
          )}

          {/* Quitar solo existe en una línea agregada: una del remito no se borra
              nunca desde acá. */}
          {d.agregadoEnRecepcion && onQuitar && (
            <SunmiButton color="red" onClick={() => onQuitar(d.id)} disabled={quitando}>
              {quitando ? "Quitando…" : "Quitar producto agregado"}
            </SunmiButton>
          )}
        </div>
      )}

      {d.revisadoEnRecepcion && d.revisadoEnRecepcionPor?.nombre && (
        <p className="text-sm2 sunmi-text-muted">
          Revisado por {d.revisadoEnRecepcionPor.nombre}
        </p>
      )}
    </Envoltorio>
  );
}
