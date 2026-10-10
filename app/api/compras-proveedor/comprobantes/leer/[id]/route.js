// POST /api/compras-proveedor/comprobantes/leer/[id]
//
// Lee un comprobante ya subido y guarda lo que se leyó. Es lo que cierra el
// circuito subida → lectura, y el único lugar donde una lectura se convierte en
// filas de la base.
//
// ── LO QUE ESTA RUTA GARANTIZA ─────────────────────────────────────────────
//
// 1. TODA lectura pasa por la puerta antes de guardarse. No hay camino que
//    escriba lo que devolvió el modelo sin verificarlo.
// 2. Si no cierra, el comprobante queda MAL_LEIDO, sin identidad y sin líneas
//    aplicables. De ahí no sale ninguna propuesta de costo.
// 3. NO REINTENTA SOLA. Decidido el 2026-08-11: con cuota diaria, reintentar
//    solo puede quemarla en un comprobante que igual no se va a poder leer. El
//    intento se cuenta y se puede reintentar a mano.
// 4. El consumo y el modelo se guardan pase lo que pase, incluso cuando la
//    lectura sale mal. Una lectura fallida consumió igual.
//
// ── EL ARCHIVO PUEDE NO ESTAR, Y ES NORMAL ─────────────────────────────────
//
// La imagen vive siete días. Pedir la lectura de un comprobante viejo cuya foto
// ya se borró NO es un error del sistema: es la ventana funcionando. Se contesta
// con eso dicho, y no con un 500.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pasarPorLaPuerta, queHacerLectura } from "@/lib/compras-proveedor/comprobante/lector";
import { armarCadena, leerConCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import { escalarAlModeloGrande } from "@/lib/compras-proveedor/comprobante/lector/escalada";
import { medicionDeLaLlamada } from "@/lib/compras-proveedor/comprobante/lector/medicionDeLaLlamada";
import { armarInterpretes } from "@/lib/compras-proveedor/comprobante/lector/gemini";
import {
  recetaDelProveedor,
  fechaLeidaONull,
} from "@/lib/compras-proveedor/comprobante/lector/recetaDelProveedor";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import {
  achicarTodas,
  resumenDelAchicado,
} from "@/lib/compras-proveedor/comprobante/lector/achicarFoto";
import {
  comprobanteConLaMismaIdentidad,
  textoDeDuplicado,
} from "@/lib/compras-proveedor/comprobante/facturaRepetida";
import { agruparLasHojasDelPapel } from "@/lib/compras-proveedor/comprobante/fusionarHojas";
import { sembrarPedidoDesdeFactura } from "@/lib/compras-proveedor/sembrarPedidoDesdeFactura";
import {
  estadoDeLaFalla,
  MOTIVO_LECTURA,
} from "@/lib/compras-proveedor/comprobante/lector/contrato";
// El MISMO contador que usa el importador: la cuota es una sola.
import { usadasHoy } from "@/lib/ia/contadorDeIa";
import { hayCuota, limiteDiario, MOTIVO_LIMITE, TEXTO_LIMITE } from "@/lib/ia/limiteDiario";
import { herenciaDeLosRenglones } from "@/lib/compras-proveedor/comprobante/herenciaDelRenglon";
import { origenDeLectura } from "@/lib/compras-proveedor/comprobante/origenDeLectura";
import {
  tomarLaLectura,
  terminarLaLectura,
  respuestaParaGuardar,
  comoVaLaLectura,
  respuestaDeLaCortada,
  TEXTO_LEYENDO_EN_SEGUNDO_PLANO,
} from "@/lib/compras-proveedor/comprobante/lecturaEnSegundoPlano";
import {
  arrancarTurno,
  ESTADO_TURNO,
  TEXTO_TURNO,
} from "@/lib/compras-proveedor/comprobante/lector/lecturasEnCurso";

export async function POST(req, { params }) {
  // ── QUIÉN PIDIÓ ESTA LECTURA ─────────────────────────────────────────
  //
  // Una lectura REESCRIBE los renglones del comprobante, así que solo corre
  // cuando una persona la pide: el botón, subir una foto, o la relectura de la
  // receta. Nunca al abrir ni al refrescar una pantalla. Lo que llega sin
  // declararlo queda como SIN_DECLARAR, que es la verdad y se puede contar.
  const origenPedido = origenDeLectura(
    await req
      .clone()
      .json()
      .then((b) => b?.origen)
      .catch(() => null)
  );
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El alcance va en el WHERE, no en un chequeo después: así un comprobante de
    // otro grupo no existe, en vez de existir y estar prohibido.
    const comprobante = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: {
        id: true,
        proveedorId: true,
        estado: true,
        imagenBorradaEn: true,
        estado: true,
        cerroEnIntento: true,
        // A qué pedido pertenece: lo necesita la siembra de abajo, que solo
        // corre cuando ese pedido nació de esta misma factura.
        pedidoId: true,
        // TODAS las fotos, en orden: se leen juntas como el papel que son.
        archivos: {
          orderBy: { orden: "asc" },
          select: { orden: true, ubicacion: true, mime: true, nombre: true },
        },
        intentosLectura: true,
        lecturaEnCursoDesde: true,
        ultimaLectura: true,
        proveedor: { select: { nombre: true } },
      },
    });
    if (!comprobante) {
      return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
    }

    // Releer uno ya leído se permite —una lectura puede haber salido mal y
    // haberse arreglado la receta— pero uno ANULADO no: liberó su número y
    // volver a escribirle identidad lo resucitaría a medias.
    if (comprobante.estado === "ANULADO") {
      return NextResponse.json(
        { ok: false, error: "El comprobante está anulado.", queHacer: "Subilo de nuevo si hace falta." },
        { status: 409 }
      );
    }

    const fotos = (comprobante.archivos || []).filter((a) => a.ubicacion);
    if (comprobante.imagenBorradaEn || !fotos.length) {
      // No es un error del sistema: es la ventana de siete días funcionando.
      return NextResponse.json(
        {
          ok: false,
          error: "La imagen de este comprobante ya no está.",
          queHacer:
            "Las fotos viven siete días desde que se suben. Este comprobante se puede " +
            "completar a mano, o volver a subir la foto si todavía la tenés.",
        },
        { status: 410 }
      );
    }

    // ── La cadena: titular y respaldo ────────────────────────────────────
    //
    // El respaldo se usa SOLO si el titular falla por cuota o por servicio
    // caído. Ver cadena.js: pasar por una respuesta ilegible convertiría "el
    // modelo se equivocó" en "probemos hasta que alguno diga algo".
    const cadena = armarCadena();
    const eleccion = cadena.titular;
    if (!eleccion.ok) {
      // El intento NO se cuenta: no hubo lectura. Contar un intento que nunca
      // salió haría que el contador midiera problemas de configuración en vez de
      // dificultad de lectura, que es lo que interesa mirar.
      return NextResponse.json(
        { ok: false, error: eleccion.queHacer, motivo: eleccion.motivo },
        { status: 503 }
      );
    }

    // ── ¿QUEDA CUOTA DEL DÍA? SE PREGUNTA ANTES DE LLAMAR ────────────────
    //
    // El tope del nivel gratuito son VEINTE consultas por día y **una consulta
    // que falla gasta una igual**. El 2026-09-21 se hicieron 22 en el día,
    // casi todas reintentos de una lectura que no salía: cada toque de «Leer»
    // se comía una de las veinte, y la pantalla contestaba "el servicio de
    // lectura no respondió", que invita a tocar de nuevo. El círculo se cierra
    // solo.
    //
    // El contador ya existía —`lib/ia/contadorDeIa`, sobre esta misma tabla— y
    // lo usaba el importador. Esta ruta no lo miraba: dos consumidores de la
    // misma cuota y uno solo llevando la cuenta. Acá se pregunta con la MISMA
    // función, que es lo que hace que los dos números digan lo mismo.
    // ── SI YA SE ESTÁ LEYENDO, NO SE LANZA OTRA ──────────────────────────
    //
    // Cada lectura gasta Flash y quizás el modelo grande. Un segundo «Leer»
    // —o volver a la pantalla mientras lee— se engancha a la que está en
    // curso. Va ANTES de la cuota: engancharse no gasta nada.
    const leyendoYa = () =>
      NextResponse.json({
        ok: true,
        leyendo: true,
        yaEstabaLeyendo: true,
        turno: String(comprobante.id),
        comprobanteId: comprobante.id,
        texto: TEXTO_LEYENDO_EN_SEGUNDO_PLANO,
      });
    if (comoVaLaLectura(comprobante).estado === "LEYENDO") return leyendoYa();

    const cuota = hayCuota({ usadasHoy: await usadasHoy(), limite: limiteDiario() });
    if (!cuota.puede) {
      return NextResponse.json(
        {
          ok: false,
          // ── EL TOPE PROPIO NO SE DISFRAZA DE CUOTA DE GOOGLE ──────────
          //
          // Acá se contestaba con el motivo y el texto del proveedor, y decía
          // "se agotó la cuota gratuita del día" SIN haber llamado a nadie.
          // El 2026-09-21, con el proyecto ya en plan pago, eso cortó la
          // lectura de una factura real afirmando dos cosas falsas: que la
          // cuota era gratuita y que la había agotado Google. Medido: el
          // contador de llamadas no se movió y la API contestaba 200.
          //
          // El motivo y el texto son los del tope PROPIO, que es lo que pasó.
          motivo: MOTIVO_LIMITE,
          error: TEXTO_LIMITE,
          // El número, porque un tope sin decir cuál es no se puede ni discutir
          // ni subir.
          cuota: { usadas: cuota.usadas, limite: cuota.limite },
        },
        { status: 429 }
      );
    }

    // ── DE ACÁ EN ADELANTE NO SE ESPERA: SE CONTESTA UN TURNO ────────────
    //
    // Leer un papel tarda hasta 45 segundos y nginx corta a los 60 sin declarar
    // `proxy_read_timeout`. Con UNA factura eso iba justo; con cuatro o cinco
    // por pedido, y una lectura por hoja, es cuestión de tiempo que alguna se
    // pase y la pantalla muestre un 504 que ni siquiera es JSON.
    //
    // El mecanismo ya existía y lo usaba «Probar» en la receta: se arranca el
    // trabajo, se contesta enseguida con un número de turno, y la pantalla
    // pregunta por él. Ningún pedido HTTP dura más que una consulta a la base,
    // así que ningún proxy puede cortarlo — ni éste, ni el que venga.
    //
    // Lo que el trabajo devuelve es la MISMA respuesta que antes se devolvía
    // acá: no hay un segundo formato que pueda quedar desfasado del primero.
    const hacerLaLectura = async () => {
      // ── La receta del proveedor: es lo que guía qué buscar ───────────────
      const recetaFila = await prisma.recetaProveedor.findUnique({
        where: { grupoId_proveedorId: { grupoId, proveedorId: comprobante.proveedorId } },
      });
      const { receta, version: recetaVersion, esGenerica } = recetaDelProveedor(recetaFila);

      // Se leen TODAS antes de mandar: si falta una, no se manda media factura.
      // Media factura leída daría una cuenta que no cierra por el motivo
      // equivocado, y la puerta la marcaría como mal leída culpando al modelo.
      let archivosLeidos;
      try {
        archivosLeidos = await Promise.all(
          fotos.map(async (f) => ({ bytes: await readFile(f.ubicacion), mime: f.mime, orden: f.orden }))
        );
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "No se pudo abrir el archivo del comprobante.",
            queHacer: "Puede que el almacén no esté montado. Avisá.",
          },
          { status: 503 }
        );
      }

      // ── ACHICAR ANTES DE MANDAR ──────────────────────────────────────────
      //
      // Lo que viaja a la IA se achica; lo que queda en el volumen no se toca.
      // `sharp` entra por import dinámico a propósito: si algún día no estuviera,
      // esto devuelve las fotos intactas y la lectura sigue — un problema de
      // redimensionado no puede convertirse en "no se pudo leer la factura".
      let paraLeer = archivosLeidos;
      try {
        const { default: sharp } = await import("sharp");
        paraLeer = await achicarTodas(archivosLeidos, sharp);
      } catch {
        paraLeer = archivosLeidos;
      }
      const ahorro = resumenDelAchicado(paraLeer);
      if (ahorro) {
        console.log(
          `[comprobante ${comprobante.id}] achicado: ${ahorro.achicadas}/${ahorro.archivos} fotos, ` +
            `${Math.round(ahorro.antes / 1024)} KB → ${Math.round(ahorro.despues / 1024)} KB`
        );
      }

      // ── La lectura ───────────────────────────────────────────────────────
      const pedirle = () =>
        leerConCadena({
          cadena,
          archivos: paraLeer,
          receta,
          proveedorNombre: comprobante.proveedor?.nombre ?? null,
        });

      // ── QUIÉN LEE ────────────────────────────────────────────────────────
      //
      // Con la explicación confirmada del proveedor, Flash, guiado por ella.
      // Sin explicación no hay con qué guiarlo: lee directamente el modelo
      // grande, que interpreta el papel y explica cómo viene —esa explicación
      // queda como receta para confirmar—. Si el grande no está configurado,
      // lee Flash igual, sin guía. Ver `escalada.js`.
      const sinExplicacion = !String(receta?.explicacion ?? "").trim();
      const interpretes = armarInterpretes();
      const hayGrande = [interpretes.titular, interpretes.respaldo].some((i) => i?.disponible?.().ok === true);
      let resultado =
        sinExplicacion && hayGrande
          ? { ok: false, motivo: null, lector: null, intentos: [], usoRespaldo: false, porQuePaso: null }
          : await pedirle();

      // ── SI FLASH NO ALCANZA, ENTRA EL MODELO GRANDE. UNA SOLA VEZ ────────
      //
      // Sin explicación, faltan renglones, no cierra, o Flash no contestó: ahí
      // y en ningún otro caso, y nunca con un papel sin total. Lo que devuelve
      // lo verifica el código con la misma puerta: la suma de los costos
      // finales contra el total impreso.
      //
      // La receta que queda con la lectura es su explicación: el costo no sale
      // de ella, lo trae cada renglón.
      let recetaDeLaLectura = { interpretada: true, explicacion: receta?.explicacion ?? null };
      let versionDeLaLectura = recetaVersion;
      const escalada = await escalarAlModeloGrande({
        resultado,
        receta,
        recetaVersion,
        sinExplicacion: sinExplicacion && hayGrande,
        interpretes,
        archivos: paraLeer,
        proveedorNombre: comprobante.proveedor?.nombre ?? null,
      });
      if (escalada.cerro || (escalada.lectura && resultado.ok !== true)) {
        // `ok: true` porque puede venir sin lectura de Flash —sin explicación,
        // o Flash que no contestó—: ahí la del grande es la ÚNICA. Si cerró es
        // buena porque la cuenta la verificó el código; si no cerró, se guarda
        // igual como "no cierra", que se puede recibir y corregir a mano.
        resultado = { ...resultado, ok: true, motivo: null, lectura: escalada.lectura };
        recetaDeLaLectura = escalada.receta;
        versionDeLaLectura = escalada.recetaVersion;
      } else if (resultado.ok !== true && resultado.motivo == null) {
        // Sin explicación leyó solo el grande, y no pudo contestar: el motivo
        // de la falla es el suyo, para que la pantalla diga qué pasó.
        resultado = {
          ...resultado,
          motivo: escalada.llamadas.at(-1)?.motivo ?? MOTIVO_LECTURA.SERVICIO_CAIDO,
          lector: escalada.llamadas.at(-1)?.lector ?? null,
        };
      }

      // ── SI EL MODELO DICE HABER TRANSCRIPTO DE MENOS, SE LE PIDE OTRA VEZ ─
      //
      // El comprobante 20 —pyg #247— lo dejó a la vista el 2026-09-23: la misma
      // foto, el mismo prompt y el mismo modelo devolvieron 12 renglones en una
      // corrida y UNO en otra. No es un defecto del camino —los dos achican
      // igual, 0 de 1 fotos porque la foto ya pesa 149 KB, y mandan la misma
      // receta con la misma explicación—: es variabilidad del modelo.
      //
      // El sistema YA lo detectaba —`lineasEnElPapel` 12 contra
      // `lineasTranscriptas` 1— y marcaba MAL_LEIDO. Lo que no hacía era
      // insistir, así que la salida era que Emanuel tocara el botón hasta que
      // saliera bien. Lo hizo TRES veces en dos minutos, a ciegas.
      //
      // ── POR QUÉ ESTO NO GASTA MÁS, Y PROBABLEMENTE GASTE MENOS ──────────
      //
      // El reintento corre SOLO cuando el propio modelo declara que vio más
      // renglones de los que transcribió. En ese caso la lectura ya está
      // perdida y hoy se reintentaba igual, a mano. Acá se reintenta UNA vez:
      // si la segunda tampoco alcanza, se guarda la MEJOR de las dos y la
      // pantalla dice el conteo, que es lo que permite decidir con un dato.
      //
      // La cuota la sigue cuidando la cadena, que la consulta en cada llamada:
      // si no queda, el reintento devuelve su error y se conserva la primera.
      //
      // ── Y SOLO SI NO ENTRÓ EL MODELO GRANDE ─────────────────────────────
      //
      // Desde el 2026-10-09 una lectura corta es el caso (a) de la escalada:
      // el que vuelve a mirar el papel es el modelo grande. Pedírselo además
      // otra vez a Flash serían tres llamadas por una lectura. Este reintento
      // queda para cuando el modelo grande no está configurado.
      const cuantasTrajo = (r) => (Array.isArray(r?.lectura?.lineas) ? r.lectura.lineas.length : 0);
      const cuantasDice = (r) => {
        const n = Number(r?.lectura?.lineasEnElPapel);
        return Number.isFinite(n) ? n : null;
      };
      const quedoCorta = (r) => {
        const dice = cuantasDice(r);
        return r?.ok === true && dice !== null && dice > cuantasTrajo(r);
      };

      let reintento = null;
      if (!escalada.llamo && quedoCorta(resultado)) {
        console.log(
          `[comprobante ${comprobante.id}] transcribió ${cuantasTrajo(resultado)} de ` +
            `${cuantasDice(resultado)} renglones: se le pide otra vez`
        );
        reintento = await pedirle();
        // Se queda la que trajo MÁS renglones. Si el reintento falló o trajo
        // menos, manda la primera: una lectura peor no puede pisar a una mejor
        // solo por ser la última.
        if (reintento?.ok === true && cuantasTrajo(reintento) > cuantasTrajo(resultado)) {
          resultado = reintento;
        }
      }

      // ── CADA LLAMADA QUEDA REGISTRADA, HAYA SALIDO BIEN O MAL ────────────
      //
      // La cadena informa cuántas hubo: pasar al respaldo son DOS, y la del
      // titular gastó cuota aunque haya devuelto 429. De acá sale el número de
      // lecturas que quedan en el día, y contar solo las que salieron bien lo
      // mostraría más alto de lo que es.
      //
      // Best-effort: si esto falla, la lectura NO se pierde. Es un contador, no
      // un dato del comprobante, y hacerlo bloqueante convertiría un problema de
      // estadística en un problema de operación.
      try {
        // LAS DOS TANDAS DE INTENTOS, no solo la que ganó. El reintento gastó
        // cuota igual, y el contador existe para que nadie se entere de que no
        // quedan con el camión en la puerta. Se desduplica por si el reintento
        // ES el resultado que quedó.
        const intentos = [
          ...(Array.isArray(resultado.intentos) ? resultado.intentos : []),
          ...(reintento && reintento !== resultado && Array.isArray(reintento.intentos)
            ? reintento.intentos
            : []),
          // Las del modelo grande —el titular, y el respaldo si hubo que
          // pasar—, con POR QUÉ se lo llamó. Se cuentan aparte: su modelo dice
          // cuál de los dos respondió y su `escalada`, cuál de los tres casos.
          ...escalada.llamadas,
        ];
        if (intentos.length) {
          await prisma.llamadaLector.createMany({
            data: intentos.map((i) => ({
              modelo: i.lector,
              ok: i.ok === true,
              motivo: i.ok ? null : i.motivo ?? null,
              // ── LO QUE DIJO EL SERVICIO, TAL CUAL ─────────────────────
              //
              // Sin esto, la bitácora contesta "SERVICIO_CAIDO" y nada más. El
              // 2026-09-21 hubo que volver a llamar a la API a mano para poder
              // contestar por qué no leía: la respuesta estaba en el cuerpo del
              // error y se tiraba. Ahora queda guardada.
              detalle: i.ok ? null : i.detalle ?? null,
              // QUIÉN LA PIDIÓ. Sin esto no se puede contestar por qué un
              // comprobante tiene diez lecturas, y hubo que deducirlo cruzando
              // `intentosLectura` contra la cantidad de filas.
              origen: origenPedido,
              comprobanteId: comprobante.id,
              escalada: i.escalada ?? null,
              // Cuánto tardó, cuánto escribió y cuánto razonó: con esto se
              // eligen las esperas y el techo de razonamiento con datos.
              ...medicionDeLaLlamada(i),
            })),
          });
        }
      } catch (e) {
        console.error("No se pudo registrar la llamada al lector:", e?.message);
      }

      if (!resultado.ok) {
        // Acá SÍ se cuenta el intento: hubo una lectura y salió mal. Se suma, no se
        // pisa, para que se vea que hubo que insistir.
        await prisma.comprobanteProveedor.update({
          where: { id: comprobante.id },
          // Se guarda QUIÉN intentó último: si se pasó al respaldo, es el
          // respaldo el que falló, y anotar el titular contaría otra historia.
          data: {
            intentosLectura: { increment: 1 },
            modeloLectura: resultado.lector ?? eleccion.lector.nombre,
            usoRespaldo: resultado.usoRespaldo === true,
            motivoPaseRespaldo: resultado.porQuePaso ?? null,
          },
        });
        return NextResponse.json(
          {
            ok: false,
            motivo: resultado.motivo,
            // Si Flash no contestó y entró el modelo grande sin poder cerrar,
            // las dos cosas se dicen: qué le pasó a Flash y qué al grande.
            error: [queHacerLectura(resultado.motivo), escalada.texto].filter(Boolean).join(" "),
            escalada: escalada.llamo
              ? { motivo: escalada.motivo, cerro: escalada.cerro, texto: escalada.texto }
              : null,
            // Se dice explícitamente que no reintenta sola, para que nadie se quede
            // esperando que se resuelva.
            reintentaSola: false,
            usoRespaldo: resultado.usoRespaldo === true,
            porQuePaso: resultado.porQuePaso ?? null,
            intentos: comprobante.intentosLectura + 1,
            // El detalle crudo también viaja a la pantalla: es lo que deja
            // avisar con precisión en vez de "probá de nuevo".
            detalle: (resultado.intentos || []).find((i) => !i.ok)?.detalle ?? null,
          },
          // ── EL ESTADO TAMBIÉN TIENE QUE DECIR LO QUE ES ──────────────────
          //
          // Acá todo fallo de lectura contestaba 502, y 502 significa "la
          // aplicación no responde". Con la cuota agotada eso es falso dos veces:
          // la aplicación contestó perfecto, y lo que pasó no se arregla
          // reintentando. Además el 502 es el estado que el proxy reemplaza por
          // su propia página, y ahí se pierde el cuerpo con el motivo.
          { status: estadoDeLaFalla(resultado.motivo) }
        );
      }

      // ── LA PUERTA. Toda lectura pasa por acá antes de guardarse ──────────
      // Con la receta con que se LEYÓ: la del proveedor, o la que propuso el
      // modelo grande si fue su lectura la que cerró. Queda copiada en
      // `recetaUsada`, que es de donde sale el costo.
      const puerta = pasarPorLaPuerta({
        lectura: resultado.lectura,
        receta: recetaDeLaLectura,
        recetaVersion: versionDeLaLectura,
      });

      // ── ¿ESTA MISMA FACTURA YA ESTÁ CARGADA? ─────────────────────────────
      //
      // Con cuatro o cinco facturas por pedido y doce fotos seguidas, subir dos
      // veces la misma es cuestión de tiempo. La identidad —proveedor, tipo,
      // punto de venta y número— ya tiene un índice único PARCIAL en la base, así
      // que la segunda reventaba con un P2002 y la pantalla mostraba "Error
      // interno al leer": un mensaje que no dice nada sobre lo único que pasó, y
      // que además manda a reintentar algo que va a fallar igual.
      //
      // Se pregunta ANTES de escribir. Así la lectura no se pierde —está pagada—
      // y lo que se informa es el hecho: esta factura ya está, con cuál es.
      const yaEsta = await comprobanteConLaMismaIdentidad(prisma, {
        grupoId,
        proveedorId: comprobante.proveedorId,
        identidad: puerta.aGuardar,
        exceptoId: comprobante.id,
      });
      if (yaEsta) {
        return NextResponse.json(
          {
            ok: false,
            motivo: "YA_ESTA_CARGADA",
            duplicadoDe: yaEsta.id,
            error: textoDeDuplicado(yaEsta),
            // El mensaje completo va TAMBIÉN en `queHacer` porque es el campo
            // que la pantalla prefiere. Con el hecho en `error` y la acción en
            // `queHacer`, lo que se leía era "No se agregó dos veces" a secas,
            // sin decir cuál factura ni contra cuál chocó.
            queHacer:
              textoDeDuplicado(yaEsta) +
              " No se agregó dos veces. Si era la misma, borrá esta foto; si es otra factura, " +
              "revisá el número impreso.",
            reintentaSola: false,
          },
          { status: 409 }
        );
      }

      const guardado = await prisma.$transaction(async (tx) => {
        // ── LO QUE YA SE HABÍA HECHO SOBRE ESTOS RENGLONES ────────────────
        //
        // Releer borra los renglones y los crea de nuevo, y con ellos se iba todo
        // lo que una persona había decidido: a qué producto se vinculó cada uno,
        // que estaba controlado, por unidad o por bulto. Sobre el pedido 242 eso
        // fueron cuatro lecturas y cuatro veces volver a controlar once renglones.
        //
        // Se fotografían ANTES de borrar y se vuelven a poner sobre el renglón
        // que ocupa el mismo número y dice el mismo texto. El que cambió de
        // número o de texto no hereda y queda para revisar.
        const renglonesDeAntes = await tx.comprobanteLinea.findMany({
          where: { comprobanteId: comprobante.id },
          select: {
            orden: true, textoCrudo: true,
            // La corrección de un dígito mal leído es una decisión sobre el
            // renglón, no un número de la lectura: se hereda como el resto.
            subtotalCorregido: true,
            productoLocalId: true, pedidoDetalleId: true, unidadElegida: true,
            revisadoEnRecepcion: true, revisadoEnRecepcionPorId: true, revisadoEnRecepcionAt: true,
            costoEscrito: true, costoFinalUnitario: true, costoPrevioAplicacion: true,
            precioPedidoPrevio: true,
          },
        });

        // Releer reemplaza las líneas anteriores: si quedaran, una lectura vieja y
        // una nueva convivirían y la suma daría cualquier cosa.
        await tx.comprobanteLinea.deleteMany({ where: { comprobanteId: comprobante.id } });

        const actualizado = await tx.comprobanteProveedor.update({
          where: { id: comprobante.id },
          data: {
            ...puerta.aGuardar,
            leidoEn: new Date(),
            intentosLectura: { increment: 1 },
            usoRespaldo: resultado.usoRespaldo === true,
            motivoPaseRespaldo: resultado.porQuePaso ?? null,
            // EN QUÉ INTENTO CERRÓ POR PRIMERA VEZ. Solo se escribe la primera
            // vez que cierra: releer uno que ya había cerrado no puede reescribir
            // su historia, o el número de "cerró a la primera" se iría inflando
            // solo. Sin esto, después de veinte facturas reales no habría número.
            ...(puerta.cierra && comprobante.cerroEnIntento == null
              ? { cerroEnIntento: comprobante.intentosLectura + 1 }
              : {}),
            // La fecha viene del papel como texto: se convierte acá, y si no se
            // entiende queda en null en vez de en una fecha inventada.
            fecha: fechaLeidaONull(puerta.aGuardar.fecha),
          },
          select: { id: true, estado: true, diferenciaCentavos: true, intentosLectura: true },
        });

        // Las líneas se guardan SIEMPRE, cierre o no. Son lo que alguien va a
        // mirar para entender por qué no cerró: sin ellas, un MAL_LEIDO sería un
        // cartel sin nada detrás.
        // ── NINGÚN RENGLÓN DESAPARECE EN SILENCIO ──────────────────────
        //
        // Acá había un `.filter(l => l.cantidad !== null && l.netoUnitario !== null)`
        // justo debajo del comentario de arriba, que promete que las líneas se
        // guardan siempre. Con el papel de TDC —que imprime el neto del RENGLÓN
        // y no el de una unidad— el modelo dejaba `netoUnitario` vacío, que es
        // lo correcto, y los DOCE renglones se borraban sin dejar rastro: el
        // comprobante 20 quedó con `lineasTranscriptas` 12 y cero filas, y la
        // pantalla decía "los productos suman $0,00" con el total del papel al
        // lado y sin un número para elegir.
        //
        // Ahora el unitario lo despeja `completarElRenglon` —el sistema hace la
        // cuenta, no el modelo— y lo único que queda afuera es el renglón al
        // que le faltan los DOS números y la cantidad. Ése tampoco se pierde:
        // se cuenta y el motivo se informa, porque la base exige esas columnas
        // y guardarlo con ceros afirmaría que vale cero.
        const transcriptas = resultado.lectura.lineas ?? [];
        const lineas = transcriptas.filter((l) => l.cantidad !== null && l.netoUnitario !== null);
        const renglonesIlegibles = transcriptas.length - lineas.length;
        let herencia = { conHerencia: [], heredados: [], sinHeredar: [] };
        if (lineas.length) {
          herencia = herenciaDeLosRenglones({
            viejos: renglonesDeAntes,
            nuevos: lineas.map((l, i) => ({ orden: i + 1, textoCrudo: l.descripcion ?? "(sin descripción)" })),
          });
          await tx.comprobanteLinea.createMany({
            data: lineas.map((l, i) => ({
              // Lo que decidió una persona sobre el renglón que ocupaba este
              // número y decía esto mismo. Vacío si no hay a quién heredarle.
              ...herencia.conHerencia[i],
              comprobanteId: comprobante.id,
              orden: i + 1,
              textoCrudo: l.descripcion ?? "(sin descripción)",
              // El código del proveedor es el primer escalón de la cascada de
              // vínculo, y el único que no interpreta nada. Se guardaba nada:
              // el lector lo leía y esta ruta lo tiraba.
              codigoProveedor: l.codigoProveedor ?? null,
              cantidad: l.cantidad,
              netoUnitario: l.netoUnitario,
              subtotalImpreso: l.subtotalImpreso ?? l.netoUnitario * l.cantidad,
              internoUnitario: l.internoUnitario ?? null,
              // Los kilos del papel y el descuento del renglón. Con kilos, el
              // costo real sale de dividir el subtotal por ellos y no por las
              // piezas; el descuento no se aplica a nada —el subtotal ya lo
              // tiene— y sirve para señalar un renglón mal leído.
              pesoKg: l.peso ?? null,
              bonificacionPct: l.bonificacion ?? null,
              // La alícuota de IVA que el papel imprime en este renglón. La
              // columna existía y nadie la escribía; sin ella la harina se
              // costeaba al 21.
              ivaPct: l.alicuotaIva ?? null,
              // ── LO QUE INTERPRETÓ EL MODELO ─────────────────────────────
              //
              // El costo del renglón entero, con todo adentro según ESTE papel:
              // de acá sale el costo del producto, no de reglas de formato.
              // En qué viene la cantidad, y si es mercadería o envase.
              costoFinalRenglon: l.costoFinal ?? null,
              enQueViene: l.enQueViene ?? null,
              tipoRenglon: l.tipo ?? null,
            })),
          });
        }
        return { actualizado, cuantasLineas: lineas.length };
      });

      // ── SI EL PEDIDO NACIÓ DE ESTA FACTURA, SUS LÍNEAS SALEN DE ACÁ ──────
      //
      // Es el único momento en que existe todo lo que hace falta: las líneas
      // leídas, el proveedor y el pedido vacío esperándolas. Va DESPUÉS de la
      // transacción de la lectura y no adentro: la cascada de vínculo lee el
      // catálogo entero, y tener eso abierto dentro de la transacción que guarda
      // el papel alargaría un bloqueo por algo que se puede repetir.
      //
      // Best-effort a propósito: si esto falla, la lectura NO se pierde —ya costó
      // una llamada de IA— y volver a leer vuelve a intentarlo, porque sembrar es
      // idempotente. Lo que sí se dice es que no se pudo, para que la pantalla no
      // muestre un pedido vacío sin explicación.
      // ── ¿ESTA FOTO ERA UNA HOJA DE LA FACTURA ANTERIOR? ──────────────────
      //
      // Recién ahora se puede contestar: la respuesta es si el papel traía su
      // total impreso o no, y eso lo dice la lectura que acaba de terminar.
      //
      // Se agrupa sobre TODOS los comprobantes del mismo pedido —o del mismo
      // proveedor sin pedido—, no solo sobre el que se leyó: si alguien leyó las
      // hojas en desorden, cada lectura vuelve a preguntar por el conjunto y la
      // agrupación se completa sola en cuanto no quedan agujeros.
      //
      // Best-effort, y a propósito: la lectura ya está guardada y pagada. Si esto
      // falla, lo que queda son dos comprobantes separados —que es exactamente lo
      // que había antes de esta tanda— y no una lectura perdida.
      // ── LA RECETA QUE PROPUSO EL MODELO GRANDE QUEDA PARA CONFIRMAR ──────
      //
      // Solo la que CERRÓ y es distinta de la confirmada: `escalada.propuesta`
      // viene en null en cualquier otro caso. Va a su propia tabla y no a
      // `RecetaProveedor`, porque una fila ahí es "este proveedor tiene receta
      // confirmada" y nadie la confirmó. La confirma una persona en Recetas de
      // facturas, con «Está bien, guardar».
      //
      // Best-effort: la lectura ya está guardada y pagada. Si esto falla, lo
      // que se pierde es la propuesta, y la próxima boleta la vuelve a armar.
      if (escalada.cerro && escalada.propuesta) {
        try {
          const propuesta = {
            respuestas: escalada.propuesta,
            lectura: escalada.lectura,
            comprobanteId: comprobante.id,
            modelo: escalada.modelo ?? "",
            creadaEn: new Date(),
          };
          await prisma.recetaPropuestaProveedor.upsert({
            where: { grupoId_proveedorId: { grupoId, proveedorId: comprobante.proveedorId } },
            create: { grupoId, proveedorId: comprobante.proveedorId, ...propuesta },
            update: propuesta,
          });
        } catch (e) {
          console.error("No se pudo dejar la receta propuesta para confirmar:", e?.message);
        }
      }

      let agrupacion = null;
      try {
        agrupacion = await agruparLasHojasDelPapel(prisma, {
          grupoId,
          pedidoId: comprobante.pedidoId,
          proveedorId: comprobante.proveedorId,
        });
      } catch (e) {
        console.error("No se pudieron agrupar las hojas del comprobante:", e?.message);
      }

      let siembra = null;
      if (comprobante.pedidoId) {
        try {
          siembra = await sembrarPedidoDesdeFactura(prisma, {
            pedidoId: comprobante.pedidoId,
            grupoId,
            localId: ctx.localId,
          });
        } catch (e) {
          console.error("No se pudieron armar las líneas del pedido desde la factura:", e?.message);
          siembra = { ok: false, motivo: "NO_SE_PUDO" };
        }
      }

      return NextResponse.json({
        ok: true,
        comprobanteId: comprobante.id,
        estado: guardado.actualizado.estado,
        // Null cuando el pedido no nació de una factura, que es el caso normal.
        siembra: siembra?.ok === true ? siembra : siembra?.motivo === "NO_NACIO_DE_FACTURA" ? null : siembra,
        // Si esta foto resultó ser una hoja de la factura anterior, acá se dice
        // en qué comprobante quedó: la pantalla tiene que poder señalar la
        // factura entera y no la foto suelta que ya no existe.
        agrupacion: agrupacion?.fusiones?.length ? agrupacion.fusiones : null,
        cierra: puerta.cierra,
        // ── EL CONTEO VIAJA, PARA QUE EL BOTÓN NO TERMINE EN SILENCIO ────
        //
        // Sin esto la pantalla no puede distinguir "se leyó bien" de "volvió a
        // traer un renglón de doce": las dos respuestas son `ok: true` y la
        // pantalla queda igual que antes. Le pasó al #247 el 2026-09-23, tres
        // veces seguidas.
        lineasEnElPapel: puerta.aGuardar?.lineasEnElPapel ?? null,
        lineasTranscriptas: puerta.aGuardar?.lineasTranscriptas ?? null,
        // La única puerta hacia una propuesta de costo.
        proponeCostos: puerta.proponeCostos,
        porque: puerta.porque,
        diferenciaCentavos: puerta.diferenciaCentavos,
        lineasIncoherentes: puerta.lineasIncoherentes ?? [],
        lineas: guardado.cuantasLineas,
        fotos: fotos.length,
        modelo: resultado.lectura.modelo,
        recetaGenerica: esGenerica,
        // Cuál leyó y si hubo que ir al respaldo. El nombre del modelo ya los
        // distingue, pero contar cuántas veces el titular se quedó sin cuota no
        // tiene que depender de deducirlo.
        usoRespaldo: resultado.usoRespaldo === true,
        porQuePaso: resultado.porQuePaso ?? null,
        intentos: guardado.actualizado.intentosLectura,
        consumo: resultado.lectura.consumo,
        // Si entró el modelo grande: por qué, si cerró, y la frase para la
        // persona. Null cuando Flash alcanzó, que es lo de todos los días.
        escalada: escalada.llamo
          ? { motivo: escalada.motivo, cerro: escalada.cerro, texto: escalada.texto }
          : null,
      });
    };

    // ── LA LECTURA SE TOMA EN LA BASE, Y RECIÉN AHÍ ARRANCA ──────────────
    //
    // Dos pedidos que pasaron juntos la pregunta de arriba no pueden tomarla
    // los dos: es un UPDATE con la condición adentro. El que pierde se
    // engancha a la del otro.
    if (!(await tomarLaLectura(prisma, { comprobanteId: comprobante.id, grupoId }))) return leyendoYa();

    // El trabajo corre con `arrancarTurno`, como desde el 2026-09-21; lo que
    // contesta queda en la base, que es de donde lo lee el GET. Pase lo que
    // pase —también si revienta— la lectura se suelta: una que queda tomada
    // sin nadie leyendo es un "leyendo" para siempre.
    const turno = randomUUID();
    arrancarTurno({
      id: turno,
      dueño: session?.id ?? null,
      trabajo: async () => {
        let respuesta;
        try {
          respuesta = await respuestaParaGuardar(await hacerLaLectura());
        } catch (e) {
          console.error("Falló la lectura del comprobante en segundo plano:", e?.message ?? e);
          respuesta = {
            status: 500,
            cuerpo: {
              ok: false,
              error: errorInesperado({
                operacion: "leer el comprobante",
                quedo: "El comprobante y su foto quedaron guardados, así que no hay que volver a subirlo.",
              }),
            },
          };
        }
        await terminarLaLectura(prisma, { comprobanteId: comprobante.id, respuesta });
      },
    });

    return NextResponse.json({
      ok: true,
      leyendo: true,
      // El GET pregunta por el comprobante, no por el turno: el estado está en
      // la base. Se manda igual para no cambiarle el contrato a la pantalla.
      turno: String(comprobante.id),
      comprobanteId: comprobante.id,
      texto: TEXTO_LEYENDO_EN_SEGUNDO_PLANO,
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/leer:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "leer el comprobante",
        quedo: "El comprobante y su foto quedaron guardados, así que no hay que volver a subirlo.",
      }) }, { status: 500 });
  }
}


/**
 * GET /api/compras-proveedor/comprobantes/leer/[id]
 *
 * CÓMO VA LA LECTURA DE ESTE COMPROBANTE. Se lee de la base, no de la memoria.
 *
 * Mientras se lee: `{ ok, leyendo: true }`. Cuando terminó: EXACTAMENTE la
 * respuesta que daba el POST antes de pasar a segundo plano, con su estado
 * HTTP — así no hay un segundo formato que pueda desfasarse del primero.
 *
 * El `?turno=` que manda la pantalla se ignora: el comprobante ES el turno.
 * Por eso se puede preguntar desde otro pedido, otro proceso o después de un
 * reinicio, y por eso cerrar la pantalla no pierde nada.
 */
export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { session, grupoId } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }
    // El alcance va en el WHERE: uno de otro grupo no existe.
    const fila = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: { lecturaEnCursoDesde: true, ultimaLectura: true },
    });
    if (!fila) {
      return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
    }

    const como = comoVaLaLectura(fila);
    if (como.estado === "LEYENDO") {
      return NextResponse.json({
        ok: true,
        leyendo: true,
        texto: TEXTO_LEYENDO_EN_SEGUNDO_PLANO,
        esperandoMs: como.esperandoMs,
      });
    }
    if (como.estado === "VENCIDA") {
      // Lleva más de lo que puede durar una lectura: el proceso que la corría
      // no está. Se da por cortada acá mismo, para que nunca quede colgada.
      const respuesta = respuestaDeLaCortada();
      await terminarLaLectura(prisma, { comprobanteId, respuesta });
      return NextResponse.json(respuesta.cuerpo, { status: respuesta.status });
    }
    if (como.estado === "TERMINADA") {
      return NextResponse.json(como.respuesta.cuerpo, { status: como.respuesta.status });
    }

    // Nunca se leyó con este mecanismo: no hay nada que esperar.
    return NextResponse.json(
      { ok: false, error: TEXTO_TURNO[ESTADO_TURNO.NO_ESTA], turnoPerdido: true },
      { status: 410 }
    );
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/leer (turno):", err);
    return NextResponse.json(
      { ok: false, error: errorInesperado({ operacion: "consultar cómo va la lectura", quedo: "Nada se perdió." }) },
      { status: 500 }
    );
  }
}
