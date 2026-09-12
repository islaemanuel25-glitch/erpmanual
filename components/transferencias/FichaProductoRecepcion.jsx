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
// `resultadoDeConteo` se importaba acá para el renglón teñido. Se dio de baja
// con el V26: sin ese renglón y sin el aviso de la tarjeta quedó sin un solo
// consumidor, que es el patrón del `conImporte`.
import { motivosParaDiferencia } from "@/lib/transferencias/recepcionUI";
import { ESTADO_PRODUCTO, estadoDeProducto } from "@/lib/transferencias/controlFisico";
import {
  ORIGEN_PRESENTACION,
  origenDePresentacion,
} from "@/lib/transferencias/adopcionDePresentacion";
import {
  decimalesDeCantidad,
  descriptorDeEnvio,
  escalaDeEnvio,
  nombreDePresentacion,
  rotuloDeEnvio,
  rotuloFisicoDeEnvio,
  rotuloConSueltas,
  unidadCortaDePresentacion,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

/**
 * EL VALOR QUE ARRANCA EN EL CAMPO, CON LA PRECISIÓN DEL PESO.
 *
 * ── POR QUÉ NO SE USA EL FORMATEADOR DEL RÓTULO ─────────────────────────
 *
 * Porque esto va adentro de un `input type="number"`, y ahí el valor tiene que
 * ser un número en formato HTML: separador PUNTO y sin miles. `0,730` no es un
 * valor válido y el navegador lo descarta.
 *
 * Así que el campo dice `0.730` y el rótulo de arriba dice `0,730`. Esa
 * diferencia de separador ya existía —el campo decía `0.73`— y no la introduce
 * la precisión nueva: decir que se van a ver iguales sería falso. Lo que sí
 * queda igual es cuántos dígitos se ven, que es el pedido.
 *
 * `toFixed(3)` solo en KG: sobre una cantidad de packs daría "6.000".
 */
function enEscalaDelCampo(valor, presentacion) {
  if (valor == null || valor === "") return "";
  const v = Number(valor);
  if (!Number.isFinite(v)) return "";
  return decimalesDeCantidad(presentacion) > 0
    ? v.toFixed(decimalesDeCantidad(presentacion))
    : String(v);
}

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
/**
 * `difiere` pinta el campo en danger — el número Y el borde, a 2 px.
 *
 * Es TODO lo que el V26 dejó para decir que hay una diferencia. Antes había un
 * renglón teñido debajo que decía "3 PACK x4 de 2 PACK x4 · sobran 4 unidades":
 * tres datos que ya estaban en pantalla —el enviado arriba, lo contado en esta
 * misma caja, y la resta de los dos— dichos otra vez y en prosa.
 *
 * El color no va solo: el importe de abajo también pasa a danger y muestra el
 * del remito tachado. Un color por sí mismo no se lee, pero acá no está solo.
 */
function CampoConPasos({ valor, onCambiar, etiqueta, difiere = false, decimales = 0 }) {
  const paso = (delta) => {
    const n = Number(valor === "" ? 0 : valor);
    const base = Number.isFinite(n) ? n : 0;
    const nuevo = Math.max(0, base + delta);
    // `decimales` conserva el relleno del peso al tocar el − y el +. Sin esto,
    // un toque al + sobre "0.730" dejaba "1.73": el campo perdía la precisión
    // justo con el control que existe para no tener que tipear.
    onCambiar(decimales > 0 ? nuevo.toFixed(decimales) : String(nuevo));
  };

  // ── TRES PIEZAS SEPARADAS, NO UNA CAJA CON TRES COSAS ADENTRO ───────────
  //
  // Antes los dos botones vivían DENTRO del marco del campo: `[ − 1 + ]`, todo
  // en una sola caja con borde. Ahora son tres piezas y el borde rodea SOLO al
  // número:
  //
  //     [−]   [ 1 ]   [+]
  //
  // Los botones llevan su propio fondo sutil y su radio; el marco con borde es
  // del número y de nada más. Eso importa para la señal de diferencia: el borde
  // danger tiene que decir "este NÚMERO no coincide", no "estos controles están
  // mal".
  //
  // ── EL ÁREA TOCABLE ERA DE 16 PX, Y NADIE LO SABÍA ─────────────────────
  //
  // El comentario que estaba acá decía que el botón traía "el `px-2 py-1` del kit
  // más el ícono de 16: una caja de 36 px de alto —el mínimo—". **Era falso, y se
  // vio al medirlo.**
  //
  // `SunmiLinkButton` no trae padding: su clase es `text-xs sunmi-text-accent
  // underline` y nada más. Los `px-2 py-1` son de `SunmiButton`, que es otra
  // pieza. Y con `items-center` el botón queda del alto de su contenido, así que
  // el objetivo de toque real eran **16 × 16 px** — medido a 390 px con
  // `cajasDelCampo`. Mientras los botones vivían adentro de la caja con borde eso
  // no se veía; sacarlos lo dejó a la vista.
  //
  // No lo rompió esta tanda: venía así. Se arregla acá porque es donde se vio.
  //
  // El `p-2` los lleva a **32 × 32**. No a 40, y el motivo está medido: el campo
  // son 121 px de contenedor, así que con botones de 40 el marco del número
  // quedaría en ~33 px y entrarían TRES dígitos — debajo del piso de cuatro que
  // el pedido fija. Con 32 entran cinco. Es el punto donde las dos cosas caben.
  //
  // Lo que cede es el marco del número, y cuánto está MEDIDO y afirmado en el
  // arnés, no supuesto: `cajasDelCampo` devuelve las tres cajas y cuántos dígitos
  // entran, calculados con el ancho real de un dígito en la tipografía del campo.
  return (
    <span className="flex items-center gap-1">
      <SunmiLinkButton
        onClick={() => paso(-1)}
        aria-label={`Restar uno a ${etiqueta}`}
        className="shrink-0 no-underline sunmi-link-accent rounded-lg sunmi-surface-soft p-2"
      >
        <Minus size={16} aria-hidden="true" />
      </SunmiLinkButton>

      {/* El marco, alrededor del número y nada más. `min-w-0` para que el flex
          lo pueda encoger hasta lo que sobre: sin eso el input reclama su ancho
          intrínseco y empuja a los botones fuera de los 124 px.

          `border-0` en el input: el marco es de este envoltorio. Si el input
          trajera el suyo se verían dos cajas, una adentro de la otra.

          `text-lg` son los 18 px que pide el V26 — el tamaño de Tailwind sin
          redefinir, no un valor escrito a mano. */}
      <span
        className={`min-w-0 flex-1 rounded-lg ${
          difiere ? "border-2 sunmi-border-danger" : "border sunmi-divider"
        }`}
      >
        <SunmiInput
          type="number"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          aria-label={etiqueta}
          // `px-0` y no el `px-2` del kit: con el marco alrededor y el texto
          // centrado, el relleno lateral del input no separa de nada y se come
          // los dígitos. Medido: con el `px-2` del kit entraban TRES, sin él
          // entran cinco — y el piso del pedido son cuatro.
          //
          // `SunmiInput` es el único componente del kit que NEGOCIA su
          // `className` en vez de concatenarlo —ver `lib/sunmi/claseAncho.js`—,
          // así que acá el `px-0` gana de verdad y no queda a merced del orden
          // de la hoja de estilos.
          className={`w-full border-0 px-0 text-center text-lg ${
            difiere ? "sunmi-text-danger" : ""
          }`}
        />
      </span>

      <SunmiLinkButton
        onClick={() => paso(1)}
        aria-label={`Sumar uno a ${etiqueta}`}
        className="shrink-0 no-underline sunmi-link-accent rounded-lg sunmi-surface-soft p-2"
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
      recibido: enEscalaDelCampo(propuesto, descriptorDeEnvio(d || {}).presentacion),
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

  // Acá se armaba `rotuloDeEnvioUnaLinea` —"1 PACK x12 · 12 unidades físicas"—
  // para el renglón del enviado en el teléfono. El V26 le sacó la segunda mitad:
  // son la misma cantidad dicha dos veces, y la segunda en la escala en la que
  // NO se cuenta. La hoja usa `rotuloConSueltas(envio)` directo.
  //
  // `rotuloFisicoDeEnvio` NO se fue del archivo: escritorio lo sigue usando, y es
  // donde vive la regla de que a 3,250 KG no se le dice "3,250 unidades físicas"
  // —devuelve `null` en KG, PIEZA y UNIDAD, con un candado por presentación en
  // `presentacionEnvio.test.mjs`—.

  // ── EL CAMPO SE PINTA EN DANGER, Y NO HAY RENGLÓN QUE LO EXPLIQUE ──────
  //
  // Acá se armaba `resultadoCorto` —"3 PACK x4 de 2 PACK x4 · sobran 4
  // unidades"— para el renglón teñido de abajo. Se fue entero con el V26.
  //
  // Una agregada no tiene remito contra el cual compararse, así que nunca
  // difiere: su cantidad no contradice a nadie, y pintarla de rojo diría que
  // algo está mal cuando lo único que pasa es que llegó mercadería de más.
  const campoDifiere = !d.agregadoEnRecepcion && hayDiferenciaFisica;

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
          {/* ── LA CATEGORÍA Y EL CÓDIGO SE VAN DEL TELÉFONO ─────────────
              No ayudan a contar. A esta hoja se entra desde una tarjeta que ya
              tiene el nombre, y en el celular ese renglón empujaba los campos
              —que son lo único que hay que tocar— más abajo. En escritorio la
              ficha convive con un listado y ahí sí sirven para ubicarse. */}
          {!enHoja && (
            <p className="text-sm2 sunmi-text-muted">
              {d.categoria?.nombre || "Sin categoría"}
              {d.codigoBarra ? ` · ${d.codigoBarra}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BadgeAgregado d={d} />
          {/* ── EL ESTADO TAMPOCO VA EN LA HOJA ──────────────────────────
              Decía "Pendiente de revisar" arriba a la derecha. Si la hoja está
              abierta, la línea está pendiente: es la definición de estar acá.
              `BadgeAgregado` se queda porque dice otra cosa —que esta línea no
              venía en el remito— y eso no se deduce de estar en el panel.
              Escritorio conserva el estado: ahí la ficha se lee al lado de otras
              y el rótulo es lo que las distingue. */}
          {!enHoja && (
            <span className={`text-sm2 font-semibold ${TONO_ESTADO[estado]}`}>
              {TEXTO_ESTADO[estado]}
            </span>
          )}
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
          {/* ── "ENVIADO" EN UNA SOLA LÍNEA, Y CON PESO ──────────────────
              Eran dos renglones —el rótulo arriba y el valor abajo— y el de
              arriba no decía nada que el de abajo no dijera.

              El V26 le sacó el "· N unidades físicas" y le subió el peso. Las
              físicas eran la misma cantidad dicha otra vez: "2 PACK x4 · 8
              unidades físicas" son dos formas del mismo número, y la segunda
              está en la escala en la que NO se cuenta. La regla de cuándo esa
              línea miente —3,250 KG no son "3,250 unidades"— sigue viva en
              `rotuloFisicoDeEnvio`, que escritorio usa y tiene sus candados.

              Y deja de ser un subtítulo gris: es la referencia contra la que se
              cuenta, así que el rótulo va chico y gris y el dato va en 15
              semibold y en el color de la marca. */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs sunmi-text-muted shrink-0">Enviado</span>
            <span className="min-w-0 text-base2 font-semibold tabular-nums sunmi-text-accent truncate">
              {d.agregadoEnRecepcion ? "—" : rotuloConSueltas(envio)}
            </span>
            {/* ── EL PRECIO DE LA PRESENTACIÓN ─────────────────────────────
                Es el número que se compara contra el remito del proveedor, y no
                estaba en ninguna parte de la pantalla: solo estaba el total de
                la línea. "$132.000,00" son los 15 packs juntos; lo que hace
                falta para controlar es cuánto vale UNO.

                Sale de `d.precioCosto`, y acá hay una trampa que conviene saber:
                ese campo del DTO **no es** la columna cruda. La ruta hace
                `precioCosto: remito.costoPresentacion`, o sea el costo de la
                presentación que este mismo renglón rotula. La columna persistida
                es otra cosa y no se expone.

                El sufijo se DERIVA de la presentación con `unidadCortaDePresentacion`
                —pack, cajón, un, kg, pieza—, no se escribe a mano: escribirlo
                sería una segunda tabla de nombres que el día que cambie una va a
                decir algo distinto que la otra. */}
            {!d.agregadoEnRecepcion && d.precioCosto != null && (
              <span className="text-xs tabular-nums sunmi-text-muted shrink-0">
                · {formatearMoneda(d.precioCosto)} / {unidadCortaDePresentacion(envio).toLowerCase()}
              </span>
            )}
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
              {/* 11 px y no 10: el rótulo dice en qué escala está el número de
                  abajo, así que leerlo no es opcional. Ver `sm2` en el config. */}
              <div className="text-sm2 sunmi-text-muted truncate">{rotuloDeCompletos}</div>
              {puedeRecibir ? (
                <CampoConPasos
                  valor={recibido}
                  onCambiar={setRecibido}
                  etiqueta={`Cantidad recibida en ${nombreDePresentacion(envio)}`}
                  difiere={campoDifiere}
                  decimales={decimalesDeCantidad(envio.presentacion)}
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
                <div className="text-sm2 sunmi-text-muted truncate">{ROTULO_SUELTAS_CAMPO}</div>
                {/* `difiere` va en los DOS campos, porque los dos suman al total
                    que difiere: marcar solo el de completos diría que las
                    sueltas están bien cuando puede ser al revés.

                    Y las sueltas NO llevan decimales de peso: son unidades
                    enteras de un bulto abierto. Este campo solo existe cuando la
                    presentación agrupa, y KG nunca agrupa. */}
                {puedeRecibir ? (
                  <CampoConPasos
                    valor={sueltas}
                    onCambiar={setSueltas}
                    etiqueta={ROTULO_SUELTAS_CAMPO}
                    difiere={campoDifiere}
                  />
                ) : (
                  <div className="font-mono tabular-nums sunmi-text-strong">
                    {fmtCantidad(d.recibidoUnidadesSueltas || 0)}
                  </div>
                )}

                {/* ── EL PRECIO POR UNIDAD, Y SOLO ACÁ ────────────────────
                    Éste es el otro de los dos costos, y sale de
                    `d.costoUnitarioFisico`: el de UNA unidad de stock, no el del
                    pack. Los dos ya vienen calculados del endpoint; ninguno se
                    divide en la pantalla.

                    Va pegado a este campo y a ningún otro lado, porque es acá y
                    solo acá donde la unidad importa: cuando llegaron 3 sueltas
                    rotas y hay que descontarlas. Arriba, debajo de "PACK x10",
                    el costo de la unidad suelta sería una afirmación falsa —es el
                    defecto que la #191 ya pagó una vez—.

                    Puede dar decimales largos —$9,114583… en el Pancho x24—;
                    `formatearMoneda` lo lleva a dos, como toda la plata. */}
                {d.costoUnitarioFisico != null && (
                  <div className="text-xs2 tabular-nums sunmi-text-muted truncate">
                    {formatearMoneda(d.costoUnitarioFisico)} / un
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

      {/* ── LA PLATA DE ESTA LÍNEA — V26, SOLO EN EL TELÉFONO ───────────────
          Acá arriba iba el renglón teñido —"3 PACK x4 de 2 PACK x4 · sobran 4
          unidades"— y abajo el párrafo que explicaba qué son las unidades
          sueltas. Los dos se fueron con el V26 y por el mismo motivo: decían
          con palabras algo que la pantalla ya muestra. El enviado está arriba,
          lo contado está en el campo, y la diferencia es la resta de los dos.
          La explicación de las sueltas es una regla del sistema: va en un
          manual, no repetida en cada línea de cada recepción.

          ── CÓMO SE DICE AHORA QUE HAY UNA DIFERENCIA ─────────────────────
          Sin una palabra nueva: el número del campo y su borde en danger, y
          acá el importe del remito TACHADO arriba y el corregido abajo en 22
          px y en danger. El tachado no es lo mismo que el gris: gris dice
          "secundario", tachado dice "esto ya no vale".

          Se fueron también los tres rótulos —"Importe del remito", "Importe
          corregido", "Diferencia"— y el renglón de la resta. Dos números, uno
          tachado y el otro no, ya dicen de cuánto a cuánto sin nombrarlo.

          ── EL ALTO SIGUE RESERVADO, Y AHORA ES MÁS BARATO ────────────────
          El renglón de arriba se dibuja SIEMPRE —mudo cuando no hay
          diferencia— para que aparecer no empuje el botón de guardar. Que vaya
          MUDO no es estilo: la primera versión dejaba el número puesto detrás
          del `invisible` y ahí aparecía un "$ 0,00" sobre mercadería que sí
          llegó, que es el defecto de la #195 escondido. Un hueco ocupa alto y
          no dice nada. */}
      {enHoja && importeEditado != null && (
        <div className="space-y-0.5">
          {hayDiferenciaDeImporte && importeRemito != null ? (
            <div className="tabular-nums text-sm2 line-through sunmi-text-muted">
              {formatearMoneda(importeRemito)}
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-3" aria-hidden="true">
              <span className="text-sm2 sunmi-text-muted">{" "}</span>
            </div>
          )}

          {/* El que SIEMPRE se ve, y el único número grande del bloque. */}
          <div
            className={`tabular-nums text-xl2 font-semibold ${
              hayDiferenciaDeImporte && importeRemito != null
                ? "sunmi-text-danger"
                : "sunmi-text-strong"
            }`}
          >
            {formatearMoneda(importeEditado)}
          </div>

          {/* Acá iba el renglón de la diferencia —"−$4.200,00"—. Es la resta de
              los dos números de arriba, y los dos están a la vista. Se fue con
              su hueco: un renglón que no aparece nunca no necesita lugar. */}
        </div>
      )}

      {/* Acá iba el párrafo que explicaba qué son las unidades sueltas —"El
          envío sigue siendo PACK x4. Las unidades sueltas solo explican un
          bulto abierto o una rotura."—. Es una regla del sistema y no un dato
          de esta línea: va en un manual, no repetida en cada línea de cada
          recepción. El rótulo del campo ya dice "Unidades sueltas". */}

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

      {/* ── EL PIE VA ANCLADO EN LA HOJA ────────────────────────────────────
          EL DEFECTO, MEDIDO: a 390×440 —el teléfono con el teclado grande
          abierto— el contenido no entra y el botón de guardar quedaba ABAJO del
          borde de la pantalla. Medido con `botonAVariasAlturas`: top 443 en un
          viewport de 440, en los dos estados. No se podía tocar.

          Ya pasaba antes del V25: no lo causó reservar el alto del motivo, y
          por eso reservar más tampoco lo arreglaba. Lo que faltaba era anclar.

          `sticky bottom-0` adentro del cuerpo del modal, que el kit ya dibuja
          con `overflow-y-auto`: el contenido scrollea POR DETRÁS y el botón se
          queda pegado abajo.

          El fondo NO es decoración: sin él se leería el importe a través de los
          botones. Va `sunmi-surface`, que es `--app-bg` y es el único token
          OPACO en los catorce temas —`--card-bg` es translúcido en `sunmiDark`,
          que es el del Sunmi—. Es la misma lección que el desplegable de motivo.

          No se usa el slot `footer` del kit, que sería lo estructuralmente
          correcto, porque los botones dependen del estado interno de la ficha
          —motivo, cantidad, error, el handler de guardar— y sacarlos a
          `RecepcionMovil` es un refactor de otra tanda. Anotado.

          Solo en la hoja. En escritorio la ficha vive dentro de un listado que
          scrollea entero y un pie pegajoso ahí taparía la fila siguiente. */}
      {puedeRecibir && (
        <div
          className={
            enHoja
              ? "sticky bottom-0 sunmi-surface pt-2 pb-1 flex flex-wrap gap-2"
              : "flex flex-wrap gap-2"
          }
        >
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
                // El V26 les sacó dos palabras: "Marcar" no agrega nada al tilde
                // que ya está adelante, y "diferencia" la dice el campo en rojo
                // y el importe tachado. Lo que queda es qué pasa al tocarlo.
                diferenciaFisica
                ? "✓ Guardar y seguir"
                : "✓ Revisado y seguir"
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
