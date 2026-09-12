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
import { Minus, Plus } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

import { BadgeAgregado, fmtCantidad, fmtDiferencia } from "./detallePresentacion";
// El formateador del ERP, el mismo que usa la tarjeta. `detallePresentacion`
// tiene otro —con espacio después del signo— que sirve a la tabla de escritorio
// y que NO se puede cambiar sin mover esa tabla.
import { formatearMoneda } from "@/lib/moneda";
import { unidadesFisicasDe } from "@/lib/transferencias/recepcion";
import { motivosParaDiferencia, resultadoDeConteo } from "@/lib/transferencias/recepcionUI";
import { ESTADO_PRODUCTO, estadoDeProducto } from "@/lib/transferencias/controlFisico";
import {
  ORIGEN_PRESENTACION,
  origenDePresentacion,
} from "@/lib/transferencias/adopcionDePresentacion";
import {
  descriptorDeEnvio,
  escalaDeEnvio,
  nombreDePresentacion,
  rotuloDeEnvio,
  rotuloFisicoDeEnvio,
  rotuloConSueltas,
  unidadCortaDePresentacion,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

/** El BOTÓN de escritorio, que revela el campo. En el teléfono ya no existe. */
export const ROTULO_SUELTAS = "Hay unidades sueltas";

/**
 * El RÓTULO DEL CAMPO, que es otra cosa y por eso otra constante.
 *
 * En el teléfono el campo está siempre y no hay botón que lo revele, así que
 * "Hay unidades sueltas" ahí sería una pregunta sin respuesta posible. Rotula
 * qué se escribe en esa caja, no si existe.
 */
export const ROTULO_SUELTAS_CAMPO = "Unidades sueltas";

// ── ACÁ VIVÍAN LOS SIETE RÓTULOS DEL BLOQUE DE ADOPCIÓN ──────────────────
//
// "Transferencia histórica", "Remito original", "Presentación actual del
// depósito", "Usar … para esta recepción" y su ayuda se fueron con el bloque.
// No se dejaron exportados por si acaso: una constante que ningún render usa se
// lee como capacidad disponible y el próximo la vuelve a dibujar.
//
// El único que sobrevive es éste, porque tiene seis líneas reales que lo
// necesitan: las que se adoptaron mientras el botón existió.
export const ROTULO_ADOPTADA = "Presentación adoptada en la recepción";

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
  // ── "NO DECLARADO" ES UNA ADVERTENCIA, NO UN ENLACE ──────────────────
  //
  // Estaba en `sunmi-text-link`, el azul de los enlaces. Semanticamente es lo
  // que no es: nadie navega a ningun lado desde ahi, y visualmente competia con
  // los links de verdad de la pantalla.
  //
  // Un producto que llego sin estar en el remito es una INCONSISTENCIA FISICA
  // que alguien informo, y esa es la misma familia que el sobrante — por eso
  // comparte su token. `sunmi-text-warning` sale de `var(--pos-warning)` y lo
  // resuelve el tema: aca no hay hex.
  [ESTADO_PRODUCTO.NO_DECLARADO]: "sunmi-text-warning",
});

/**
 * UN CAMPO DE CANTIDAD CON − Y +, EN UN SOLO MARCO.
 *
 * ── POR QUÉ VIVE ACÁ Y NO EN EL KIT ─────────────────────────────────────
 *
 * Porque hoy lo usa una sola pantalla, dos veces. La regla del kit dice que la
 * pieza que se agrega sale de una pantalla que YA FUNCIONA, nunca escrita
 * adivinando: el día que un segundo lugar la necesite, se muda con su forma ya
 * probada. Escribirla en el kit ahora sería adivinar qué le va a hacer falta al
 * segundo consumidor.
 *
 * ── QUÉ RESUELVE, Y POR QUÉ NO ES UN CONTADOR COMO EL DEL V15 ───────────
 *
 * El contador que el V21 sacó de la TARJETA reemplazaba al teclado: era la
 * única forma de cargar. Éste lo acompaña — el campo se sigue escribiendo a
 * mano, que es lo que hace que sirva para 3,250 KG y para 47.
 *
 * El mínimo es 0 y el `−` no baja de ahí: una cantidad recibida negativa no
 * existe, y dejarla escribir obligaría a validarla después.
 *
 * El valor viaja como TEXTO, igual que el del campo: el estado del formulario
 * es lo que está escrito, no un número. Un `""` es "todavía no escribió nada" y
 * no es lo mismo que un 0, que es "contó y no llegó ninguno".
 */
function CampoConPasos({ valor, onCambiar, etiqueta }) {
  const paso = (delta) => {
    const n = Number(valor === "" ? 0 : valor);
    const base = Number.isFinite(n) ? n : 0;
    onCambiar(String(Math.max(0, base + delta)));
  };

  // ── EL MARCO SE APRETÓ, PERO EL ÁREA TOCABLE NO ─────────────────────────
  //
  // El V24 bajó los campos de la mitad del ancho a 124 px, así que el marco va
  // sin `gap` y sin relleno lateral propio. Lo que NO se achicó es el botón: el
  // `px-2 py-1` de `.sunmi-btn-parte-pad-*` más el ícono de 16 dan una caja de
  // 36 px de alto —el mínimo del kit— y unos 32 de ancho. Es lo que se toca con
  // el pulgar, y apretarlo más para ganar píxeles sería cambiar espacio por
  // toques fallados.
  //
  // Medido a 390: 124 de campo menos dos botones de ~32 dejan ~60 para el
  // número, que a 13 px entra hasta cinco dígitos. Si algún día el campo baja de
  // ahí, el número es lo que empieza a apretar — no el botón.
  return (
    <span className="flex items-center rounded-lg border sunmi-divider">
      <SunmiLinkButton
        onClick={() => paso(-1)}
        aria-label={`Restar uno a ${etiqueta}`}
        className="shrink-0 no-underline sunmi-link-accent"
      >
        <Minus size={16} aria-hidden="true" />
      </SunmiLinkButton>
      {/* `border-0` y centrado: el marco es del envoltorio, no del campo. Si el
          input trajera el suyo se verían dos cajas, una adentro de la otra. */}
      <SunmiInput
        type="number"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label={etiqueta}
        className="w-full border-0 text-center"
      />
      <SunmiLinkButton
        onClick={() => paso(1)}
        aria-label={`Sumar uno a ${etiqueta}`}
        className="shrink-0 no-underline sunmi-link-accent"
      >
        <Plus size={16} aria-hidden="true" />
      </SunmiLinkButton>
    </span>
  );
}

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
    // ── LO PROPUESTO VA EN LA PRESENTACIÓN, NO EN FÍSICO ────────────────
    //
    // Decía `d.cantidadEnviada`, que es la cantidad FÍSICA persistida. Para una
    // línea con snapshot eso proponía 48 debajo de un rótulo que dice "6 CAJÓN
    // x8": el caso feliz —llegó todo, un toque a "Marcar revisado"— guardaba 48
    // cajones, o sea 384 unidades. El descriptor contesta en la misma escala en
    // la que está escrito el campo.
    const propuesto =
      d?.cantidadRecibida == null ? descriptorDeEnvio(d || {}).cantidad : d.cantidadRecibida;
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

  // ── EN EL TELÉFONO LOS DOS CAMPOS ESTÁN SIEMPRE ─────────────────────────
  //
  // En escritorio el desglose vive detrás de un botón, y ahí tiene sentido: la
  // pantalla es ancha, el caso normal es que no haya pack incompleto y el botón
  // deja el formulario corto.
  //
  // En el teléfono no. Ahí el panel es el ÚNICO lugar donde se carga la
  // cantidad —el V21 sacó el contador de la tarjeta— y esconder la mitad del
  // desglose detrás de un toque es pedirle al que tiene la mercadería en la mano
  // que adivine que hay un segundo campo. Se vio recibiendo la #191.
  //
  // Va detrás del `enHoja` que ya existía, así que escritorio queda EXACTAMENTE
  // como estaba: es presentación, no negocio. Y `usaSueltas` reemplaza a
  // `conSueltas` en las dos cuentas, para que no queden dos condiciones que
  // puedan decir cosas distintas sobre la misma línea.
  const sueltasSiempreVisibles = enHoja;
  const usaSueltas = sueltasSiempreVisibles || conSueltas;
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
  //
  // Y la escala —unidad y factor— sale de `escalaDeEnvio`, la MISMA que usan
  // las cuatro rutas del servidor. Acá se calculaba al lado con las mismas tres
  // líneas; dos copias de la misma decisión se separan el día que una cambia, y
  // esta decide qué se le manda a `revisar-producto`.
  const escala = escalaDeEnvio(d);
  const envio = escala.envio;
  const factor = escala.factorPack;
  // `agrupaEsta` y no `agrupa`: el import del módulo se llama así y sombrearlo
  // acá adentro dejaría inalcanzable la función del dominio.
  const agrupaEsta = escala.unidad === "BULTO";
  const estado = estadoDeProducto(d);

  // De dónde salió la presentación con la que se está contando. Sigue haciendo
  // falta después de sacar la adopción: hay seis líneas en producción que se
  // adoptaron mientras el botón existió, y su ficha tiene que seguir diciendo
  // que la presentación no la registró el origen.
  const adoptada = origenDePresentacion(d) === ORIGEN_PRESENTACION.ADOPTADA;

  // Las físicas de lo que está escrito AHORA. Misma función que el servidor, y
  // con el factor CONGELADO: si el catálogo cambió después del envío, la cuenta
  // sigue siendo la del remito.
  const unidadParaCuenta = escala.unidad;
  const fisicasEditadas = unidadesFisicasDe({
    cantidad: recibido === "" ? 0 : recibido,
    sueltas: agrupaEsta && usaSueltas ? sueltas || 0 : 0,
    unidad: unidadParaCuenta,
    factorPack: factor,
  });
  const fisicasEnviadas = unidadesFisicasDe({
    cantidad: escala.cantidad,
    sueltas: escala.sueltas,
    unidad: unidadParaCuenta,
    factorPack: factor,
  });
  const diferenciaFisica =
    fisicasEditadas == null || fisicasEnviadas == null ? null : fisicasEditadas - fisicasEnviadas;

  // ── LO QUE EL V22 DIBUJA EN EL TELÉFONO ──────────────────────────────────
  //
  // Van acá y no arriba porque dependen de `envio`, `agrupaEsta` y las físicas,
  // que se derivan más arriba en este mismo render.
  //
  // `hayDiferenciaFisica` es un booleano y no el número: decide un COLOR y el
  // nombre de un botón, y `diferenciaFisica` puede valer `null` —cuando no se
  // puede saber— que no es lo mismo que cero pero se pinta igual de bien.
  const hayDiferenciaFisica = diferenciaFisica != null && diferenciaFisica !== 0;

  /**
   * El rótulo del campo de completos, con la presentación adentro.
   *
   * "CAJÓN x8 completos" dice en una línea qué se está contando Y en qué escala.
   * Decía "Recibido", que con el campo de sueltas al lado no distingue uno del
   * otro. Donde no hay bultos que completar —KG, PIEZA, UNIDAD— no se escribe
   * "completos", que ahí no significaría nada.
   */
  const rotuloDeCompletos = agrupaEsta
    ? `${nombreDePresentacion(envio)} completos`
    : `Recibido en ${nombreDePresentacion(envio)}`;

  /**
   * "1 PACK x12 · 12 unidades físicas", en un renglón.
   *
   * Las dos mitades son las que el panel ya mostraba por separado: el rótulo del
   * envío con sus sueltas, y las unidades físicas cuando significan algo.
   * `rotuloFisicoDeEnvio` devuelve `null` en KG, PIEZA y UNIDAD a propósito
   * —llamarle "unidades físicas" a 3,250 KG es la mentira que ese helper evita—,
   * así que ahí el renglón queda con una sola mitad y no con un separador
   * colgando.
   */
  const fisicoDelEnvio = rotuloFisicoDeEnvio(envio);
  const rotuloDeEnvioUnaLinea = `${rotuloConSueltas(envio)}${
    fisicoDelEnvio ? ` · ${fisicoDelEnvio}` : ""
  }`;

  // Una agregada no tiene remito contra el cual compararse, así que no hay
  // "N de M" que decir. Su ingreso físico ya lo muestra la tarjeta.
  const resultadoCorto = d.agregadoEnRecepcion
    ? null
    : resultadoDeConteo({ recibidas: fisicasEditadas, enviadas: fisicasEnviadas, envio });

  // ── LA PLATA, EN VIVO ────────────────────────────────────────────────────
  //
  // El panel no mostraba plata en ningún lado: se corregía a ciegas y el impacto
  // recién se veía al cerrar la hoja y mirar la tarjeta.
  //
  // ── NO SE CALCULA NADA NUEVO ACÁ, Y ES LA REGLA ────────────────────────
  //
  // `subtotal` y `subtotalRecibido` son los MISMOS campos que alimentan la
  // tarjeta y el total del documento. Lo único que se hace es una regla de tres
  // sobre lo que el operador está tipeando AHORA, porque el servidor todavía no
  // lo sabe: mientras no se guarde, `subtotalRecibido` es el del último guardado.
  //
  // ── DE DÓNDE SALE EL PRECIO POR UNIDAD FÍSICA ──────────────────────────
  //
  // Primero `costoUnitarioFisico`, que el endpoint ya manda y que es
  // exactamente eso: el costo de UNA unidad de stock. No se usa `precioCosto`,
  // que es el de la PRESENTACIÓN: multiplicarlo por físicas mezcla escalas, y
  // ésa es la #198.
  //
  // El respaldo —dividir el importe del remito por sus físicas— existe para las
  // líneas viejas que no traigan el campo.
  //
  // Que sea `costoUnitarioFisico` y no la división arregla un defecto que se vio
  // en la captura: para un NO DECLARADO lo enviado es cero, así que la división
  // no existe y el bloque caía en `subtotalRecibido`, que hasta que no se guarda
  // sigue siendo el del último guardado — cero para una línea recién agregada.
  // El panel decía "$0,00" mientras alguien escribía 3,25 KG. Es el $0,00 de la
  // #195 otra vez, adentro del panel.
  const costoFisico =
    d.costoUnitarioFisico != null && Number.isFinite(Number(d.costoUnitarioFisico))
      ? Number(d.costoUnitarioFisico)
      : fisicasEnviadas && Number(fisicasEnviadas) !== 0 && d.subtotal != null
        ? Number(d.subtotal) / Number(fisicasEnviadas)
        : null;
  const importeRemito = d.agregadoEnRecepcion ? null : d.subtotal;
  const importeEditado =
    costoFisico != null && fisicasEditadas != null
      ? costoFisico * Number(fisicasEditadas)
      : d.subtotalRecibido == null
        ? d.subtotal
        : d.subtotalRecibido;
  const diferenciaImporte =
    importeRemito == null || importeEditado == null
      ? null
      : Number(importeEditado) - Number(importeRemito);
  const hayDiferenciaDeImporte =
    diferenciaImporte != null && Math.abs(diferenciaImporte) >= 0.005;

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
      recibidoUnidadesSueltas: agrupaEsta && usaSueltas ? sueltas || 0 : 0,
      motivoPrincipal: motivos.length > 0 ? motivo : null,
      motivoDetalle: motivos.length > 0 && motivo === "Otro" ? detalleMotivo : null,
    });
    if (r && r.ok === false) {
      setError(r.error || "No se pudo guardar la revisión.");
      return;
    }
    // ── QUÉ SE LE CUENTA A LA LISTA ────────────────────────────────────────
    //
    // Solo cuando salió bien. Si la hoja se cerrara igual ante un error, el
    // operador vería desaparecer el producto creyendo que quedó guardado.
    //
    // Y se le pasa QUÉ quedó guardado, porque el aviso vive arriba de la lista y
    // no acá: esta ficha se desmonta al cerrarse la hoja, así que un aviso
    // dibujado adentro se iría con ella justo cuando hay que leerlo.
    //
    // Los números son los que la ficha tenía en pantalla en el momento de
    // guardar. No se vuelven a calcular ni se esperan del servidor: el aviso
    // dice "esto es lo que mandé", y si el servidor hubiera guardado otra cosa
    // la tarjeta —que sí se recarga— lo mostraría distinto.
    onGuardado?.({
      nombre: d.nombre,
      de: fisicasEnviadas,
      a: fisicasEditadas,
      unidad: unidadDeDiferencia(envio),
      importeDe: importeRemito,
      importeA: importeEditado,
      huboCorreccion: Boolean(hayDiferenciaFisica),
    });
  };

  // Adentro de una hoja la tarjeta la pone el modal. Ver `enHoja`.
  const Envoltorio = enHoja ? "div" : SunmiCard;
  const claseEnvoltorio = enHoja ? "space-y-2" : "p-3 space-y-2";

  // ── ACÁ ESTABA EL BLOQUE DE ADOPCIÓN, Y SE SACÓ DE LAS DOS PANTALLAS ────
  //
  // La ficha le preguntaba al operador en qué presentación quería contar cuando
  // la línea no traía snapshot y el catálogo decía otra cosa. La pregunta partía
  // de una premisa falsa: que el catálogo y el remito se contradicen y hay que
  // desempatarlos.
  //
  // No se contradicen porque contestan preguntas distintas. `unidad_medida`
  // guarda cómo se COMPRA el producto; `unidadEnviada` guarda en qué formato
  // SALIÓ esa línea del depósito. `POETT PERFUMINA` se compra por pack de 12 y
  // se despachó suelto: los dos datos son ciertos al mismo tiempo.
  //
  // Para contar una recepción manda el formato de salida, y punto. El descriptor
  // ya lo hace —camino 2 le pasa `contadoEn: linea.unidadEnviada` a
  // `presentacionDeProducto`—, así que la escala salía bien y la pantalla
  // preguntaba encima. Sacar el bloque no cambió una sola cuenta.
  //
  // El criterio completo, con las dos veces que el mismo error apareció, está en
  // `docs/business-rules/unidad-medida-es-como-se-compra.md`.
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

      {/* ── LOS CAMPOS DE CARGA — V22, SOLO EN EL TELÉFONO ─────────────────
          En la hoja los dos campos van LADO A LADO y los dos están siempre,
          con la presentación en el rótulo del primero y la unidad adentro de
          cada caja. Son dos cantidades en escalas distintas escritas una al
          lado de la otra: sin la unidad en la caja, el rótulo de arriba es lo
          único que las separa y se lee mal con la mercadería en la mano.

          Escritorio queda EXACTAMENTE como estaba, en la rama de abajo. Es la
          misma división que ya usaba el botón de las sueltas. */}
      {enHoja ? (
        <div className="space-y-2">
          {/* ── "ENVIADO" EN UNA SOLA LÍNEA ──────────────────────────────
              Eran dos renglones —el rótulo arriba y el valor abajo— y el de
              arriba no decía nada que el de abajo no dijera. Con el panel más
              corto, el desplegable de motivo tiene lugar para abrirse, que es
              el defecto que esta tanda vino a cerrar. */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm2 sunmi-text-muted shrink-0">Enviado</span>
            <span className="min-w-0 font-mono tabular-nums sunmi-text-strong truncate">
              {d.agregadoEnRecepcion ? "—" : rotuloDeEnvioUnaLinea}
            </span>
          </div>

          {/* ── LOS DOS CAMPOS, AL 35 % Y CON UN HUECO EN EL MEDIO ───────
              Ocupaban la mitad cada uno y llenaban el ancho. Bajan a 124 px
              sobre 390 —el 35 % del contenedor— y el hueco del medio queda
              VACÍO a propósito: es lo que separa dos cantidades que se leen de
              un vistazo y no una columna que haya que llenar.

              `justify-between` y no un grid de tres columnas: la del medio
              tendría que existir para quedar vacía, y un grid con una celda
              muerta es una invitación a meterle algo. */}
          <div className="flex justify-between gap-2">
            <div className="w-35p">
              <div className="text-xs2 sunmi-text-muted truncate">{rotuloDeCompletos}</div>
              {puedeRecibir ? (
                <CampoConPasos
                  valor={recibido}
                  onCambiar={setRecibido}
                  etiqueta={`Cantidad recibida en ${nombreDePresentacion(envio)}`}
                />
              ) : (
                <div className="font-mono tabular-nums sunmi-text-strong">
                  {d.cantidadRecibida == null ? "—" : fmtCantidad(d.cantidadRecibida)}
                </div>
              )}
            </div>

            {/* Las sueltas solo donde significan algo: en KG, PIEZA y UNIDAD la
                cantidad YA está en unidades físicas y un desglose se sumaría
                encima de sí mismo. */}
            {agrupaEsta && (
              <div className="w-35p">
                <div className="text-xs2 sunmi-text-muted truncate">{ROTULO_SUELTAS_CAMPO}</div>
                {puedeRecibir ? (
                  <CampoConPasos
                    valor={sueltas}
                    onCambiar={setSueltas}
                    etiqueta={ROTULO_SUELTAS_CAMPO}
                  />
                ) : (
                  <div className="font-mono tabular-nums sunmi-text-strong">
                    {fmtCantidad(d.recibidoUnidadesSueltas || 0)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
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
      )}

      {/* Cuando ya se adoptó, la card dice de dónde salió la presentación. Sin
          esto la línea se leería como si el origen la hubiera registrado así. */}
      {adoptada && (
        <div className="text-sm2 sunmi-text-muted">
          {ROTULO_ADOPTADA}
          {d.presentacionAdoptadaPor ? ` por ${d.presentacionAdoptadaPor}` : ""}
        </div>
      )}

      {/* ── EL PACK INCOMPLETO — SOLO ESCRITORIO ────────────────────────────
          En el teléfono este bloque ya no existe: el V22 subió el campo de
          sueltas al grid de arriba, al lado del de completos. Si siguiera acá
          habría DOS campos escribiendo la misma variable, que es peor que
          ninguno — el segundo taparía al primero sin que nadie lo note.

          En escritorio queda igual que siempre: el botón y el campo detrás. */}
      {puedeRecibir && agrupaEsta && !enHoja && (
        <div className="space-y-1.5">
          {!sueltasSiempreVisibles && (
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
          )}
          {usaSueltas && (
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

      {/* ── EL RESULTADO — V22, SOLO EN EL TELÉFONO ─────────────────────────
          Teñido y en formato corto: "10 de 10 · sin diferencia" o
          "47 de 48 · falta 1". Es el dato que decide si esta línea mueve stock
          distinto del remito, y en gris chico competía con todo lo demás.

          El fondo y el número van del mismo color, y el color lo decide el
          HECHO: positivo cuando coincide, danger cuando no. Ver
          `resultadoDeConteo` para las tres decisiones del texto — el sentido al
          derecho, el singular, y cuándo se nombra la unidad. */}
      {enHoja && resultadoCorto && (
        <div className={`rounded-lg p-2 ${hayDiferenciaFisica ? "sunmi-state-danger" : "sunmi-state-success"}`}>
          <p
            className={`text-md2 font-semibold tabular-nums ${
              hayDiferenciaFisica ? "sunmi-text-danger" : "sunmi-text-success"
            }`}
            aria-live="polite"
          >
            {resultadoCorto}
          </p>
        </div>
      )}

      {/* ── LA PLATA DE ESTA LÍNEA — V23, SOLO EN EL TELÉFONO ───────────────
          Tres renglones cuando hay diferencia y UNO cuando no: repetir el mismo
          número tres veces con tres rótulos distintos es ruido que además
          sugiere que pasó algo. Se recalcula con lo que se está tipeando, igual
          que el ingreso físico y los motivos.

          ── Y ACÁ ESTABA LA OTRA MITAD DEL SALTO DEL V25 ──────────────────

          El pedido decía "el panel crece cuando aparece el motivo", y eso es lo
          que se ve. Pero al MEDIRLO —arnés de 390 px, `botonAVariasAlturas`— el
          motivo resultó ser la mitad: este bloque pasaba de UN renglón a TRES al
          mismo tiempo, y sumaba sus propios ~40 px.

          Reservar solo el motivo dejaba el salto casi igual, y el candado habría
          quedado verde afirmando un arreglo que no arreglaba. Los números están
          en el arnés, al lado de la afirmación.

          Por eso los tres renglones se dibujan SIEMPRE y lo que cambia es cuáles
          se ven. La forma aprobada en el V23 no se mueve: sin diferencia se lee
          un solo renglón que dice "Importe", igual que antes. */}
      {enHoja && importeEditado != null && (
        <div className="space-y-0.5">
          {/* El del remito: solo cuando hay algo contra qué comparar. Reserva su
              alto siempre para que aparecer no empuje nada.

              ── EL RENGLÓN RESERVADO VA MUDO, Y NO ES UN DETALLE ───────────
              La primera versión dejaba el rótulo y el número puestos detrás del
              `invisible`. Dos candados viejos se pusieron en rojo y los dos
              tenían razón: el del V23 encontraba "Importe del remito" en una
              línea que coincide, y el del `$0,00` encontraba un "$ 0,00" —la
              diferencia de una línea sin diferencia— sobre mercadería que sí
              llegó. Ese `$0,00` es el defecto de la #195, y que estuviera
              invisible no lo hace inofensivo: el día que alguien saque el
              `invisible` por cualquier motivo, vuelve dibujado.
              Un hueco solo tiene que ocupar alto. No tiene que decir nada. */}
          {hayDiferenciaDeImporte && importeRemito != null ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm2 sunmi-text-muted">Importe del remito</span>
              <span className="tabular-nums text-sm2 sunmi-text-muted">
                {formatearMoneda(importeRemito)}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-3" aria-hidden="true">
              <span className="text-sm2 sunmi-text-muted">{" "}</span>
            </div>
          )}

          {/* El renglón que SIEMPRE se ve. Cambia de rótulo, no de lugar. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm2 sunmi-text-muted">
              {hayDiferenciaDeImporte && importeRemito != null ? "Importe corregido" : "Importe"}
            </span>
            <span className="tabular-nums text-md2 font-semibold sunmi-text-strong">
              {formatearMoneda(importeEditado)}
            </span>
          </div>

          {/* Falta es danger y sobra es warning: son dos hechos distintos y
              el segundo no es un error — llegó mercadería de más. */}
          {hayDiferenciaDeImporte && importeRemito != null ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm2 sunmi-text-muted">Diferencia</span>
              <span
                className={`tabular-nums text-sm2 font-semibold ${
                  diferenciaImporte < 0 ? "sunmi-text-danger" : "sunmi-text-warning"
                }`}
              >
                {diferenciaImporte > 0 ? "+" : "−"}
                {formatearMoneda(Math.abs(diferenciaImporte))}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-3" aria-hidden="true">
              {/* Un espacio DURO. Un espacio común lo colapsa el navegador y el
                  renglón mediría cero, que es no reservar nada. */}
              <span className="text-sm2 sunmi-text-muted">{" "}</span>
            </div>
          )}
        </div>
      )}

      {/* La explicación de qué son las sueltas, para que nadie las lea como una
          cantidad alternativa. Solo donde hay bultos que abrir. */}
      {enHoja && agrupaEsta && (
        <p className="text-sm2 sunmi-text-muted">
          El envío sigue siendo {nombreDePresentacion(envio)}. Las unidades sueltas solo explican un
          bulto abierto o una rotura.
        </p>
      )}

      {/* El total físico y la diferencia, en escritorio. */}
      {!enHoja && fisicasEditadas != null && (
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

      {/* ── EL MOTIVO, Y SU ALTO RESERVADO EN EL TELÉFONO ──────────────────
          Solo si esta línea tiene que explicar algo. Una agregada no: su
          procedencia ya está registrada con autor y fecha.

          EL DEFECTO QUE ARREGLA `motivoReservado`: en la hoja, tocar el − o el
          + hasta que la cantidad deja de coincidir hacía APARECER este bloque,
          y el panel entero crecía unos 60 px de golpe. El botón de guardar
          —que está justo abajo— se corría mientras el dedo iba hacia él, así
          que se terminaba tocando otra cosa. Cambiar un número no puede mover
          el botón que cierra la línea.

          Se reserva con el bloque REAL, invisible, y no con un alto en píxeles
          escrito a mano: así el hueco mide exactamente lo que va a ocupar el
          desplegable, y sigue midiéndolo el día que cambie el tipo de letra.
          El desplegable reservado no lleva opciones y no le hacen falta: lo que
          ocupa alto es el campo cerrado, y la lista vive en un portal.
          `visibility:hidden` saca el contenido del árbol de accesibilidad y del
          orden de tabulación, y conserva el espacio — que es justo lo que se
          quiere. El `pointer-events-none` es el cinturón: un select invisible
          que se pudiera tocar sería peor que el salto.

          En escritorio no se reserva nada: la ficha vive al lado de un listado
          largo y ahí los 60 px no mueven ningún botón. */}
      {puedeRecibir && (motivos.length > 0 || enHoja) && (
        <div
          className={`space-y-1.5${
            motivos.length === 0 ? " invisible pointer-events-none" : ""
          }`}
          aria-hidden={motivos.length === 0 ? "true" : undefined}
          data-motivo-reservado={motivos.length === 0 ? "1" : undefined}
        >
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
          {/* ── EL COLOR DICE QUÉ SE ESTÁ POR GUARDAR ──────────────────────
              En la hoja: color de acción cuando la línea coincide —es el cierre
              normal— y warning cuando hay una diferencia, que es lo que hace
              que el remito y lo recibido dejen de ser el mismo número. El texto
              ya lo decía; el color lo dice antes de leerlo.
              Escritorio sigue en ámbar, como siempre. */}
          <SunmiButton
            color={enHoja ? (hayDiferenciaFisica ? "warning" : "primary") : "amber"}
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
