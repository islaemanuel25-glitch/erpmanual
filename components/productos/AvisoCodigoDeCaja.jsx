"use client";

// components/productos/AvisoCodigoDeCaja.jsx
//
// "ESTE ES EL CÓDIGO DE LA CAJA, NO EL DE LA UNIDAD".
//
// ── EL CASO, MEDIDO ────────────────────────────────────────────────────────
//
// 83 de los 2.718 productos activos tienen en el campo del código principal un
// código de catorce dígitos: el GTIN-14 de la caja. El POS escanea la unidad, que
// tiene trece, así que esos 83 no aparecen nunca al pasar el lector. No hay error
// en ninguna pantalla — se ve un producto que "no está".
//
// ── DOS LUGARES, UNA PIEZA, Y LA DIFERENCIA ES DELIBERADA ─────────────────
//
// `modo="tarjeta"`  en el listado. Dice lo que pasa y cuál sería el código de la
//                   unidad, y manda a la ficha. NO tiene botón.
// `modo="ficha"`    en editar producto. El mismo texto más lo que el servidor
//                   averiguó —si alguien más vio ese código, si ya lo tiene otro
//                   producto— y ahí sí el botón.
//
// El botón está en UN solo lado porque la regla de la tanda es "nada se corrige
// solo: cada uno se acepta desde su ficha". Un botón en la tarjeta que llevara a
// la ficha sería un botón que no hace lo que dice.
//
// ── EL BOTÓN NO GUARDA: COMPLETA EL FORMULARIO ────────────────────────────
//
// Pone el código de la unidad en el campo principal y el de catorce en el
// secundario, y ahí queda. Guarda la persona, con el Guardar de siempre, que pasa
// por `validarUnicidadCodigos` como cualquier otra edición. Escribir desde acá
// sería una segunda validación de unicidad al lado de la que ya existe.

import { Barcode, TriangleAlert } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { unidadDesdeLaCaja } from "@/lib/productos/codigoDeCaja";

/**
 * @param codigoBarra   el código principal que tiene hoy el producto
 * @param modo          "tarjeta" | "ficha"
 * @param datos         lo que contestó `/api/productos/codigo-de-caja`. Solo en
 *                      la ficha; en la tarjeta se dibuja sin consultar nada.
 * @param onUsarUnidad  completa los dos campos del formulario. Solo en la ficha.
 */
export default function AvisoCodigoDeCaja({
  codigoBarra,
  modo = "tarjeta",
  datos = null,
  onUsarUnidad = null,
  trabajando = false,
}) {
  // ── LA CUENTA SE HACE ACÁ Y NO SE PIDE ─────────────────────────────────
  //
  // Es aritmética sobre una cadena: no necesita servidor. Si la tarjeta pidiera
  // un endpoint por producto, una página de 25 dispararía 25 consultas para
  // mostrar un texto que se puede calcular sin salir del navegador.
  const calculo = unidadDesdeLaCaja(codigoBarra);
  if (!calculo.ok) {
    // ── LA MEDIDA VARIABLE SE DICE, NO SE ESCONDE ────────────────────────
    //
    // Indicador 9: adentro del código viaja el peso, no una unidad de catálogo.
    // No hay código de unidad que deducir, y callarse dejaría al producto en el
    // control sin explicación de por qué no se le ofrece nada.
    if (modo === "ficha" && calculo.motivo === "MEDIDA_VARIABLE") {
      return (
        <Marco tono="warning" icono={<TriangleAlert size={18} strokeWidth={2} />}>
          <Titulo>Este código es de medida variable</Titulo>
          <Parrafo>
            Empieza con 9, así que adentro lleva el peso o el importe y no identifica una unidad
            suelta. No se puede deducir el código de la unidad: hay que escanear el producto y
            cargarlo.
          </Parrafo>
        </Marco>
      );
    }
    return null;
  }

  const { unidad, indicador } = calculo;

  // ── LA TARJETA DEL LISTADO ─────────────────────────────────────────────
  if (modo !== "ficha") {
    return (
      <span className="sunmi-text-warning text-xs2 leading-snug block">
        Este código es el de la caja ({codigoBarra}). En el POS no se encuentra. El de la unidad
        sería {unidad} — abrí la ficha para revisarlo.
      </span>
    );
  }

  // ── LA FICHA ───────────────────────────────────────────────────────────
  //
  // Mientras el servidor no contestó no se dibuja el botón. Ofrecerlo antes de
  // saber si el código ya es de otro producto sería ofrecer algo que puede estar
  // mal, y la pantalla no tiene cómo saberlo sola.
  const ocupadoPor = datos?.ocupadoPor ?? null;
  const confirmado = datos?.confirmado ?? null;
  const secundarioOcupado = datos?.secundarioOcupado === true;
  const esperando = datos === null;

  return (
    <Marco
      tono={ocupadoPor ? "danger" : "warning"}
      icono={<Barcode size={18} strokeWidth={2} />}
    >
      <Titulo>Este es el código de la caja, no el de la unidad</Titulo>
      <Parrafo>
        Tiene catorce dígitos y empieza con {indicador}, que es el indicador de empaque. El lector
        del POS busca el de la unidad, de trece, así que este producto no aparece al escanearlo.
      </Parrafo>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="sunmi-text-muted">Hoy</span>
        <span className="font-mono font-semibold sunmi-text-strong">{codigoBarra}</span>
        <span className="sunmi-text-muted">→ la unidad sería</span>
        <span className="font-mono font-bold sunmi-text-strong">{unidad}</span>
      </div>

      {/* ── DE DÓNDE SALE LA CONFIANZA, DICHA ANTES DE APRETAR ────────────
          La cuenta es exacta, pero que el 14 esté bien formado no prueba que el
          13 que sale sea el que el fabricante imprimió. Si el código aparece en
          una lista del proveedor, eso SÍ lo prueba. Si no aparece en ningún
          lado, hay que decirlo: es la diferencia entre proponer y adivinar. */}
      {esperando ? (
        <Parrafo>Buscando si este código aparece en las listas de tus proveedores…</Parrafo>
      ) : confirmado ? (
        <p className="text-xs sunmi-text-success leading-snug">
          Confirmado: ese código de trece aparece{" "}
          {confirmado.fuente === "LISTA" ? "en la lista de " : "en los códigos guardados de "}
          <strong className="sunmi-text-strong">{confirmado.proveedor ?? "un proveedor"}</strong>.
        </p>
      ) : (
        <p className="text-xs sunmi-text-warning leading-snug">
          No pude confirmarlo: ese código no aparece en ninguna lista de proveedor ni en los
          códigos guardados. La cuenta da bien, pero conviene escanear el producto antes de
          usarlo.
        </p>
      )}

      {/* ── SI YA ES DE OTRO PRODUCTO, NO HAY NADA QUE OFRECER ────────────
          Y el nombre del otro es el dato que importa: lo más probable es que el
          duplicado sea el problema de verdad, no este código. */}
      {ocupadoPor && (
        <p className="text-xs sunmi-text-danger leading-snug">
          Ese código ya lo tiene{" "}
          <strong className="sunmi-text-strong">{ocupadoPor.nombre}</strong>. No se puede poner en
          dos productos: mirá primero si no son el mismo cargado dos veces.
        </p>
      )}

      {/* ── QUÉ PASA CON EL DE CATORCE, ANTES DE APRETAR ─────────────────
          Es un dato del proveedor y no se tira. Va al secundario, salvo que el
          secundario tenga otra cosa — y ahí se dice, y no se pisa nada. */}
      {!ocupadoPor && !esperando && (
        <p className="text-xs sunmi-text-muted leading-snug">
          {secundarioOcupado ? (
            <>
              El código de la caja <strong className="sunmi-text-strong">no se va a guardar</strong>
              : el campo secundario ya tiene {datos.secundarioActual}, y no se pisa. Si querés
              conservar los dos, movelo a mano antes.
            </>
          ) : (
            <>El de catorce pasa al campo de código secundario, así no se pierde.</>
          )}
        </p>
      )}

      {/* ── EL BOTÓN OCUPA EL ANCHO Y PUEDE PARTIR EL RENGLÓN ──────────────
          Copié `whitespace-nowrap` del aviso de escala, que está al lado y lo
          usa bien: sus botones dicen "Guardar igual" y entran. Éste lleva un
          código de trece dígitos adentro del texto, y a 360 se salía de la
          tarjeta — se veía "Usar 7790740000257 como código prin…". Medido en la
          pantalla, no deducido: la página no desbordaba, así que el corte solo
          se veía mirando. */}
      {!ocupadoPor && !esperando && typeof onUsarUnidad === "function" && (
        <SunmiButton
          color="cyan"
          onClick={() => onUsarUnidad({ unidad, caja: codigoBarra, secundarioOcupado })}
          disabled={trabajando}
          className="w-full font-semibold min-h-toque text-left leading-snug"
        >
          Usar {unidad} como código principal
        </SunmiButton>
      )}
      {!ocupadoPor && !esperando && (
        <p className="text-xs sunmi-text-muted leading-snug">
          Completa los campos y no guarda nada: revisalo y después tocá Guardar.
        </p>
      )}
    </Marco>
  );
}

/**
 * El marco del aviso.
 *
 * Copiado de `AvisoCambioDeEscala`, que es el aviso que HOY funciona en esta
 * misma pantalla: mismo panel integrado, mismo icono en su caja, mismas clases de
 * estado del theme. Inventarle otra forma a este aviso haría que dos avisos de la
 * ficha se vieran distinto sin que nadie lo hubiera decidido.
 */
function Marco({ tono, icono, children }) {
  const clase = tono === "danger" ? "sunmi-state-danger" : "sunmi-state-warning";
  const texto = tono === "danger" ? "sunmi-text-danger" : "sunmi-text-warning";
  return (
    <div role="alert" className={`${clase} sunmi-border rounded-lg p-3 flex flex-col gap-2`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft ${texto}`}>
          {icono}
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

function Titulo({ children }) {
  return <div className="text-sm font-bold sunmi-text-strong leading-tight">{children}</div>;
}

function Parrafo({ children }) {
  return <p className="text-xs sunmi-text-muted leading-snug">{children}</p>;
}
