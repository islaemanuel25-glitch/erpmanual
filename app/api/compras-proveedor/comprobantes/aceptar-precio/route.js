// POST /api/compras-proveedor/comprobantes/aceptar-precio
//
// Acepta el precio de una línea leída y lo escribe EN LA LÍNEA DEL PEDIDO.
//
// ── Y TAMBIÉN GUARDA LA OTRA RESPUESTA, QUE ES LA MISMA DECISIÓN ───────────
//
// `decision: "DEJA_EL_MIO"` no escribe ningún costo: solo registra que sobre
// estos dos precios ya se contestó. Está en ESTA ruta y no en una al lado
// porque es el mismo hecho con el otro valor —un `ProductoQueNoSeCambia` del
// precio— y porque las dos necesitan exactamente lo mismo para poder guardarse:
// a qué producto es, a qué línea del pedido corresponde y cuáles son los dos
// números que se compararon. Con dos rutas, cualquiera de esas tres se
// resolvería distinto de un lado que del otro, que es el defecto que este
// módulo ya tuvo dos veces.
//
// El default es aceptar, así que quien ya la llamaba —la conciliación de
// escritorio— sigue llamándola igual.
//
// ── UN SOLO ESCRITOR DE COSTO ──────────────────────────────────────────────
//
// Esta ruta NO toca el costo del producto. Escribe el precio en
// `PedidoProveedorDetalle.precioCosto`, y el costo lo sigue escribiendo la
// recepción —`recibir/[id]`— con la frontera que ya está, cuando alguien recibe
// la mercadería de verdad.
//
// Así hay un solo lugar que mueve costos y una sola regla que los gobierna. Si
// esta ruta escribiera el costo directo, habría dos caminos con dos criterios, y
// el día que uno cambie el otro queda viejo sin que nada lo diga.
//
// ── LAS TRES REGLAS SE COMPRUEBAN ACÁ TAMBIÉN ──────────────────────────────
//
// La pantalla esconde el botón cuando no corresponde, pero quien llama a esta
// ruta puede ser cualquiera. `puedeAceptarse` las vuelve a comprobar del lado
// del servidor, y por eso frena una baja o un salto brusco aunque el pedido
// llegue igual.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { puedeAceptarse } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import {
  DETALLE_SELECT,
  cargarConciliacion,
  lineasSospechadasDeCorrimiento,
} from "@/lib/compras-proveedor/comprobante/conciliacionDelPedido";
import { productosDeLasFilas } from "@/lib/compras-proveedor/comprobante/productoDeLaFila";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import {
  aplanarDetalles,
  analizarLineas,
  cargarContexto,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { guardarDecisionDePrecio } from "@/lib/compras-proveedor/comprobante/guardarDecisionDePrecio";
import {
  DECISION_DE_PRECIO,
  esDecisionConocida,
  mismoPrecio,
} from "@/lib/compras-proveedor/decisionDePrecio";
import {
  AVISO_PAPEL_CORRIDO,
  elCatalogoSeMovio,
  escalaSinDeducir,
  motivoSinComparacion,
  saltoDePrecioAceptable,
  saltoSinBultoConOpciones,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { costoParaUnidad } from "@/lib/compras-proveedor/importacion/merge";
import {
  costoDelCatalogoEnLaUnidadDelDeposito,
  costoDelDepositoEnLaUnidadDelCatalogo,
} from "@/lib/conversiones/stock";
import { resolverLineaDelPapel } from "@/lib/compras-proveedor/comprobante/resolverLineaDelPapel";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    // `localId` hace falta para cargar el universo del proveedor con el mismo
    // alcance que la pantalla: el vínculo de un producto se mira desde un local.
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const lineaId = Number(body?.lineaId);
    if (!Number.isFinite(lineaId)) {
      return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
    }

    // Sin `decision` es aceptar, que es lo que esta ruta hacía siempre.
    const decisionPedida = body?.decision ?? DECISION_DE_PRECIO.ACEPTA_FACTURA;
    if (!esDecisionConocida(decisionPedida)) {
      return NextResponse.json(
        { ok: false, error: "Esa no es una decisión de precio conocida." },
        { status: 400 }
      );
    }

    // ── EL RENGLÓN, AUNQUE EL PAPEL SE HAYA VUELTO A LEER ───────────────
    //
    // Una relectura borra los renglones del comprobante y los vuelve a crear
    // con ids nuevos, así que un teléfono con la pantalla abierta desde antes
    // manda un id muerto. Acá se resolvía con un `findFirst` por ese id y se
    // contestaba "No existe esa línea." — un 404 con un número que la persona
    // no eligió ni ve.
    const { linea, motivo: motivoDeLaLinea } = await resolverLineaDelPapel(prisma, {
      grupoId,
      lineaId,
      pedidoId: body?.pedidoId,
      textoCrudo: body?.textoCrudo,
      select: {
        id: true, cantidad: true, netoUnitario: true, internoUnitario: true,
        // ── EL ORDEN, LA ALÍCUOTA Y EL DESCUENTO DEL RENGLÓN ──────────────
        //
        // `orden` es la llave con la que se busca lo que le toca del pie de su
        // factura; `ivaPct`, la alícuota que el papel imprime en ESTE renglón
        // —la harina va al 10,5—; `bonificacionPct`, si vino regalado. Sin
        // ellos esta ruta escribía un costo distinto del que muestra la hoja.
        orden: true, ivaPct: true, bonificacionPct: true,
        // El costo que interpretó el modelo: es el que se acepta.
        costoFinalRenglon: true, enQueViene: true, tipoRenglon: true,
        // EL TEXTO DEL PAPEL Y EL CÓDIGO DEL PROVEEDOR son lo que la cascada de
        // vínculo machea. Sin ellos, una línea que la pantalla resuelve por
        // alias acá quedaría sin producto, que es exactamente el defecto que
        // esta tanda arregla.
        textoCrudo: true, codigoProveedor: true,
        // `subtotalImpreso` es lo que permite comprobar que la cuenta de ESTA
        // línea cierra. Con un papel sin total impreso es lo único que queda
        // para verificar el precio, así que sin él la guarda no puede decidir.
        subtotalImpreso: true,
        // ── LOS KILOS DEL PAPEL, QUE FALTABAN Y NADIE ECHABA DE MENOS ────
        //
        // En un producto que el depósito cuenta por peso, `netoQueFacturaElProveedor`
        // divide por los kilos y, si no los tiene, contesta `faltanKilos` — que
        // acá se convierte en un 409 con el cartel "Pesá la mercadería y cargá
        // los kilos al recibir". Sin este campo en el select llegaba
        // `undefined`, así que el cartel salía en TODOS los fiambres, incluso
        // en los que el papel trae el peso impreso: el salamín picado del 242
        // tiene 2,100 kg guardados desde la lectura.
        //
        // El nombre del campo es el del esquema. La conciliación ya lo pedía
        // así; era esta ruta la que se había quedado corta.
        pesoKg: true,
        // El escalar, no una relación: `productoLocal` no existe en el esquema y
        // pedirla acá rompía la ruta contra Postgres. El producto se trae aparte.
        productoLocalId: true, pedidoDetalleId: true, unidadElegida: true,
        comprobante: {
          select: {
            // `pedidoId` para poder resolver a qué línea del pedido pertenece
            // esta línea, con el mismo criterio que usa la pantalla.
            id: true, pedidoId: true, estado: true, confirmadoEn: true,
            // ── TODAS SUS LÍNEAS, AUNQUE SE ANALICE UNA ────────────────
            //
            // El costo que esta ruta ESCRIBE lleva adentro su parte de los
            // cargos del proveedor, que se reparten en proporción al costo
            // final de cada renglón sobre el de la factura (`cargos.js`): con
            // una sola línea, el flete entero le caería a ella. Se piden los
            // campos que el reparto necesita y nada más.
            lineas: {
              orderBy: { orden: "asc" },
              select: {
                orden: true, cantidad: true, textoCrudo: true, codigoProveedor: true,
                costoFinalRenglon: true, tipoRenglon: true,
              },
            },
            proveedor: { select: { id: true, umbralRevisarPct: true, umbralSospechaBajaPct: true } },
          },
        },
      },
    });
    if (!linea) {
      return NextResponse.json(
        { ok: false, error: motivoDeLaLinea, queHacer: motivoDeLaLinea },
        { status: 409 }
      );
    }

    // ── UN PAPEL QUE NO CIERRA NO PROPONE NINGÚN COSTO ──────────────────
    //
    // Se recibe igual —regla de Emanuel, Secco #256— pero sus precios salen de
    // una lectura que no se pudo verificar: ninguno se acepta. Corregido a mano
    // hasta que cierre, vuelve a proponer costos como siempre.
    if (linea.comprobante.estado === "MAL_LEIDO") {
      const noCierra =
        "Este papel no cierra: no se acepta ningún precio de él. Podés recibir igual y los costos quedan como estaban.";
      return NextResponse.json({ ok: false, error: noCierra, queHacer: noCierra }, { status: 409 });
    }

    // ── LA RESOLUCIÓN ES LA DE LA PANTALLA, NO UNA PARECIDA ──────────────
    //
    // Acá había una versión corta: el producto salía de `productoLocalId` y la
    // línea del pedido de `resolverLineaDelPedido`. La pantalla usa otra cosa
    // —la cascada de vínculo entera, que además resuelve por ALIAS del
    // proveedor— y por eso las dos podían contestar distinto sobre la misma
    // línea. Contestaron distinto: sobre la 112 del comprobante 5 la hoja
    // mostraba la comparación hecha contra Philips 20 red común, resuelto por
    // un alias, mientras esta ruta veía `productoLocalId` en null y devolvía
    // "el producto vinculado no tiene costo ni bulto cargados" — un cartel que
    // contradecía a la hoja Y nombraba una causa falsa: ese producto tiene
    // costo 26.460 y bulto de 10 cargados.
    //
    // Ahora las dos salen de `analizarLineas`, la misma función, con los mismos
    // datos, para la línea sola. Es la regla 1 de CLAUDE.md: dos funciones que
    // deciden lo mismo no se rompen el día que se escriben, se rompen el día
    // que una cambia.
    const detallesDelPedido = aplanarDetalles(
      await prisma.pedidoProveedorDetalle.findMany({
        where: { pedidoId: linea.comprobante.pedidoId },
        // EL MISMO SELECT DE LA PANTALLA, importado y no copiado (2026-11-06).
        // Decía serlo y no lo era: le faltaban `unidad_medida` y
        // `pesoReferenciaKg`, y sin ellos `aplanarDetalles` no pasa a la pieza el
        // costo por kilo de un fiambre. La Mortadela Paladini comparaba $41.330,09
        // la pieza contra $8.888,89 el kilo y frenaba con "No se puede saber en
        // qué viene". Lo de antes —el nombre para la cascada— sigue adentro.
        select: DETALLE_SELECT,
      })
    );
    const contexto = await cargarContexto(prisma, {
      grupoId,
      localId,
      proveedorId: linea.comprobante.proveedor.id,
    });
    const porProductoLocal = await productosDeLasFilas(prisma, [linea]);
    const [analizada] = analizarLineas({
      comprobante: { ...linea.comprobante, lineas: [linea] },
      contexto,
      detallesPlanos: detallesDelPedido,
      porProductoLocal,
      // Se analiza UNA línea pero los cargos se reparten entre TODAS: es
      // proporcional al costo de cada renglón sobre el de la factura.
      todasLasLineas: linea.comprobante.lineas,
    });

    // El producto es el que resolvió esa cascada, tomado del MISMO catálogo que
    // usó la pantalla para comparar.
    const base = analizada?.productoBaseId ? contexto.datosPorBase.get(analizada.productoBaseId) ?? null : null;
    const delPedido = { detalle: analizada?.pedidoDetalle ?? null };

    // El precio se recalcula acá y no se acepta lo que llegó en el pedido: el
    // número que se escribe no puede venir del cliente. Con el mismo producto y
    // el mismo papel da lo mismo que muestra la hoja; lo único que agrega es
    // la unidad que una persona haya elegido mirando la factura, que la
    // pantalla no puede saber de antemano.
    // ── LA ELECCIÓN DE UNIDAD SE GUARDA, NO SE USA Y SE TIRA ────────────
    //
    // Llegaba en el cuerpo, se usaba para calcular el precio de esta llamada y
    // se perdía. Refrescar la pantalla la borraba y el renglón volvía a
    // preguntar por unidad o por bulto sobre algo que alguien ya había
    // contestado. Es una decisión de una persona sobre ESTE renglón.
    if (body?.unidad && linea.unidadElegida !== body.unidad) {
      await prisma.comprobanteLinea.update({
        where: { id: linea.id },
        data: { unidadElegida: String(body.unidad) },
      });
    }

    // ── LA LECTURA DEL RENGLÓN ES LA DE LA HOJA, NO UNA SEGUNDA ─────────
    //
    // Una recepción lee cada renglón UNA sola vez (Emanuel, 2026-11-07). Acá
    // se volvía a llamar a `analizarPrecioDeLinea` con datos propios —sin la
    // propuesta de la IA, que este select no trae—, así que esta ruta podía
    // escribir el precio de otra lectura que la que la hoja mostró. Ahora el
    // análisis es el de la MISMA conciliación que dibuja la pantalla, cargada
    // después de guardar la unidad elegida, con la variación del proveedor
    // adentro. La elección de unidad de arriba ya quedó en el renglón.
    const conciliacion = linea.comprobante.pedidoId
      ? await cargarConciliacion(prisma, { grupoId, localId, pedidoId: linea.comprobante.pedidoId })
      : null;
    const analizadaDeLaHoja = (conciliacion?.analizados ?? [])
      .flatMap((c) => c.lineas ?? [])
      .find((l) => l.id === linea.id);
    const analisis = analizadaDeLaHoja?.precio ?? analizada?.precio ?? null;
    const variacionDelProveedor = conciliacion?.variacionNormalPct ?? VARIACION_POR_DEFECTO;

    // ── SIN LOS KILOS NO HAY PRECIO QUE ACEPTAR, Y SE DICE CUÁL FALTA ────
    //
    // Un producto que se mide en kilos cuyo papel no los trae no tiene precio
    // todavía: los kilos se pesan al recibir. Sin este aviso, el caso caía en
    // "falta el costo de la factura", que es verdad y no dice qué hacer.
    // ── UN RENGLÓN BONIFICADO NO TIENE PRECIO QUE ACEPTAR ────────────────
    //
    // Descuento del 100 %: entra al stock y el producto conserva su costo. Un
    // cero escrito acá le rompería el margen.
    if (analisis?.bonificado) {
      const bonificado = "Este producto vino bonificado: entra al stock y el producto conserva su costo.";
      return NextResponse.json({ ok: false, error: bonificado, queHacer: bonificado }, { status: 409 });
    }

    if (analisis?.faltanKilos) {
      const falta = "Este producto se maneja por kilo y el papel no trae los kilos.";
      return NextResponse.json(
        {
          ok: false,
          error: falta,
          queHacer: "Pesá la mercadería y cargá los kilos al recibir. Con los kilos, el precio sale solo.",
        },
        { status: 409 }
      );
    }

    // ── LA GUARDA MIRA LOS DOS NÚMEROS DE LA COMPARACIÓN, Y NADA MÁS ─────
    //
    // Si la hoja pudo comparar, la decisión se puede guardar. Si no pudo, no
    // hay opciones que ofrecer y se dice CUÁL de los dos falta — la misma
    // función que usa la hoja para decidir si muestra las opciones o el aviso,
    // así no pueden volver a contestar distinto.
    const comparacion = {
      costoFactura: analisis?.precioAEscribir ?? null,
      costoCatalogo: delPedido.detalle?.precioCosto ?? null,
      pedidoDetalleId: delPedido.detalle?.id ?? null,
      // En qué viene lo facturado: sin escala sabida no hay costo que aceptar,
      // igual que en la tarjeta (`escalaSinDeducir`, Pablo #337).
      unidad: analisis?.unidad ?? null,
    };
    const sinComparacion = motivoSinComparacion(comparacion);
    // "Dejo mi precio" no escribe ningún costo, así que un freno de escala o de
    // precio no lo bloquea: es justamente lo que el freno deja hacer (Emanuel,
    // 2026-10-26, Pablo #337). Rechazarlo pintaba el freno en rojo en la hoja
    // sobre una decisión ya tomada.
    const dejaElMioBajoFreno = decisionPedida === DECISION_DE_PRECIO.DEJA_EL_MIO && escalaSinDeducir(comparacion);

    // ── LA MISMA CONCILIACIÓN QUE DIBUJA LA PANTALLA ─────────────────────
    //
    // Cargada una vez, arriba, para la lectura del renglón; sirve además para
    // dos preguntas: si este renglón puede estar corrido, más abajo, y si lo
    // que frena es un salto de PRECIO, acá. Esa segunda no se puede contestar
    // con `comparacion`, que no trae ni la cantidad ni el importe del papel:
    // sin ellos `loQueNoCuadra` dice siempre "escala". Se pregunta sobre la
    // fila de la hoja, con la misma función. "Dejo el mío" no escribe nada y
    // no se le hacen esas dos preguntas.
    const filaDeLaHoja =
      decisionPedida !== DECISION_DE_PRECIO.DEJA_EL_MIO
        ? (conciliacion?.grupos ?? []).flatMap((g) => g.filas ?? []).find((f) => f.lineaId === linea.id)
        : undefined;

    // ── UN SALTO DE PRECIO GRANDE SE ACEPTA (Emanuel, 2026-10-29) ─────────
    //
    // PICNIC 38g: $375,35 contra $246,00, y era un aumento real. Antes esta
    // guarda lo rechazaba con el resto de lo que no se puede comparar. Ahora
    // pasa si es lo ÚNICO que frena, preguntado como lo pregunta la hoja; una
    // escala sin saber, un papel corrido o uno que no cierra siguen rechazados.
    // Con lo que la ruta de la pantalla le agrega a la fila y cambia la respuesta.
    const filaComoLaVeLaHoja =
      filaDeLaHoja != null
        ? {
            ...filaDeLaHoja,
            corridaSospechada: lineasSospechadasDeCorrimiento(conciliacion).has(linea.id),
            variacionNormalPct: conciliacion.variacionNormalPct,
          }
        : null;
    const aceptaUnSalto = filaComoLaVeLaHoja != null && saltoDePrecioAceptable(filaComoLaVeLaHoja);
    // Y si es un producto sin bulto, la baja grande también se acepta: la hoja
    // la ofrece con su número (Emanuel, 2026-11-05, maní de Prod Nat).
    const frenoLevantado = filaComoLaVeLaHoja != null && saltoSinBultoConOpciones(filaComoLaVeLaHoja);
    // ── CON LA FILA DE LA HOJA, SE PREGUNTA SOBRE ELLA (2026-11-06) ───────
    //
    // `comparacion` no trae cantidad ni importe, y sin ellos `loQueNoCuadra`
    // contesta "escala" a cualquier freno: la Mortadela Paladini quedaba sin
    // poder guardarse con "No se puede saber en qué viene" mientras la hoja le
    // ofrecía Aceptar / Dejar. Si está la fila como la ve la hoja, la respuesta
    // es la de la hoja —la misma función sobre los mismos datos—; si no (dejar
    // el propio no carga la conciliación), la de siempre.
    const motivoQueFrena = filaComoLaVeLaHoja != null ? motivoSinComparacion(filaComoLaVeLaHoja) : sinComparacion;
    if (motivoQueFrena && !dejaElMioBajoFreno && !aceptaUnSalto) {
      return NextResponse.json({ ok: false, error: motivoQueFrena, queHacer: motivoQueFrena }, { status: 409 });
    }

    // ── EL CATÁLOGO QUE SE MIRÓ AL DECIDIR ──────────────────────────────
    //
    // Es `precio_costo` de `base`: el producto que resolvió la cascada, leído
    // del catálogo en ESTE pedido al servidor —no del cliente—, y el mismo
    // contra el que `analizarPrecioDeLinea` acaba de clasificar el precio. Se
    // guarda crudo, en la escala de la columna del catálogo, para que el cierre
    // y la hoja lo comparen contra el catálogo de su momento sin conversiones.
    // Sin ese número no hay contra qué fechar la decisión, y no se inventa.
    const costoMaestroObservado =
      base?.precio_costo != null && Number.isFinite(Number(base.precio_costo))
        ? Number(base.precio_costo)
        : null;
    if (costoMaestroObservado == null) {
      const sinCatalogo = "El producto no tiene costo en el catálogo, así que no hay contra qué decidir.";
      return NextResponse.json({ ok: false, error: sinCatalogo, queHacer: sinCatalogo }, { status: 409 });
    }

    // ── DEJAR EL PROPIO NO ESCRIBE NINGÚN COSTO ─────────────────────────
    //
    // Solo registra que sobre estos dos precios ya se contestó, y por eso no
    // pasa por `puedeAceptarse`: esa guarda existe para que un precio de la
    // factura no entre sin que alguien lo mire, y acá no entra ninguno. Lo
    // único que hace falta es contra QUÉ costo se decidió, que es el de la
    // línea del pedido — el mismo número que la pantalla mostró.
    //
    // Acá había un segundo chequeo de que la línea del pedido existiera. Quedó
    // INALCANZABLE al entrar la guarda de arriba —sin línea de pedido no hay
    // costo propio y la comparación ya frenó—, así que se saca en vez de
    // dejarlo: una rama que no puede ejecutarse se lee como protección y no
    // protege de nada.
    if (decisionPedida === DECISION_DE_PRECIO.DEJA_EL_MIO) {
      await guardarDecisionDePrecio(prisma, {
        grupoId,
        proveedorId: linea.comprobante.proveedor.id,
        productoBaseId: base.id,
        decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
        precioFacturado: analisis.precioAEscribir,
        precioPropio: Number(delPedido.detalle.precioCosto),
        costoMaestroObservado,
        comprobanteLineaId: linea.id,
        usuarioId: session?.id ?? null,
      });
      return NextResponse.json({
        ok: true,
        lineaId: linea.id,
        decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
        producto: base?.nombre ?? null,
        queHacer:
          "Queda tu costo. No se vuelve a preguntar mientras la factura traiga el mismo precio " +
          "contra el mismo costo tuyo.",
      });
    }

    // ── UN PRODUCTO DE UN BLOQUE QUE PUEDE ESTAR CORRIDO NO ACEPTA COSTO ──
    //
    // Sus números pueden ser los de la fila vecina (`filasCorridas.js`, Mauro
    // #298). Se pregunta con la MISMA conciliación que dibuja la pantalla
    // (`cargarConciliacion`): si la tarjeta dice que no se propone, acá no se
    // acepta.
    if (conciliacion && decisionPedida !== DECISION_DE_PRECIO.DEJA_EL_MIO) {
      if (lineasSospechadasDeCorrimiento(conciliacion).has(linea.id)) {
        return NextResponse.json(
          { ok: false, error: AVISO_PAPEL_CORRIDO, queHacer: AVISO_PAPEL_CORRIDO },
          { status: 409 }
        );
      }
    }

    const puede = puedeAceptarse({
      linea,
      // El producto que resolvió la cascada, no la columna: es el que la hoja
      // muestra, y es contra el que se hizo la comparación que se está
      // decidiendo.
      productoBaseId: analizada?.productoBaseId ?? null,
      lineaDePedidoId: delPedido.detalle?.id ?? null,
      comprobante: linea.comprobante,
      decision: analisis.decision,
      unidad: analisis.unidad,
      frenoLevantado,
    });
    if (!puede.ok) {
      return NextResponse.json(
        { ok: false, error: puede.motivo, queHacer: puede.motivo, decision: analisis?.decision ?? null },
        { status: 409 }
      );
    }
    const precioAEscribir = analisis.precioAEscribir;
    const clasificacion = analisis.clasificacion;

    // ── LA PREGUNTA TAMBIÉN EXISTE CUANDO SE MOVIÓ EL CATÁLOGO ──────────
    //
    // El papel puede coincidir con la línea y la hoja igual preguntar, porque
    // el costo maestro se movió después del pedido. Es la misma regla que usa
    // la conciliación —`elCatalogoSeMovio`, con la variación vigente del
    // proveedor—, así que se guarda la decisión exactamente cuando la hoja la
    // pidió. Sin esto, aceptar no dejaría rastro y la hoja volvería a
    // preguntar sobre algo ya contestado. El costo maestro sale de `base`, el
    // producto que resolvió la cascada, que ya trae el costo y los campos de la
    // unidad del depósito.
    const catalogoMovido = elCatalogoSeMovio(
      {
        costoFactura: precioAEscribir,
        costoCatalogo: delPedido.detalle?.precioCosto ?? null,
        costoMaestroHoy: costoDelCatalogoEnLaUnidadDelDeposito({ base, costo: base?.precio_costo }),
        factorPack: delPedido.detalle?.factorPack ?? null,
      },
      { variacionPct: variacionDelProveedor }
    );

    const resultado = await prisma.$transaction(async (tx) => {
      const detalle = await tx.pedidoProveedorDetalle.findUnique({
        where: { id: delPedido.detalle.id },
        select: { id: true, precioCosto: true, unidad: true },
      });
      if (!detalle) throw new Error("El producto ya no está en el pedido.");
      // ── EN LA UNIDAD DE LA LÍNEA DEL PEDIDO (2026-11-07) ────────────────
      //
      // `precioAEscribir` es el costo del BULTO de la ficha. Una línea pedida
      // por UNIDAD guarda el de la unidad: el Colon tinto dulce, pedido por
      // unidad a $ 6.666,67, habría quedado a $ 44.543,90 cada botella. La
      // misma conversión que la siembra (`costoParaUnidad`); una línea por
      // BULTO queda igual.
      //
      // ── Y EN LA UNIDAD DEL CATÁLOGO, QUE ES LA DE LA LÍNEA (2026-11-07) ──
      //
      // `precioAEscribir` está en la unidad en que el depósito cuenta: la
      // pieza de un fiambre por pieza. La línea del pedido guarda el kilo, como
      // el catálogo. La Mortadela Paladini del pedido 530 quedó con la pieza,
      // $41.330,09, escrita como kilo: el total de la factura del pedido subió
      // $434.000 y el cierre arrastró el mismo número al catálogo.
      const enElCatalogo = costoDelDepositoEnLaUnidadDelCatalogo({ base, costo: precioAEscribir }) ?? precioAEscribir;
      const precioEnLaLinea =
        costoParaUnidad({ costoMaestro: enElCatalogo, unidad: detalle.unidad, producto: base }) ?? enElCatalogo;

      // EL PRECIO ANTERIOR SE GUARDA ANTES DE PISARLO, en su columna propia.
      // Sin esto no se puede ver a qué se pidió y a qué terminó facturando, que
      // es una pregunta comercial y no de reversión — por eso no comparte
      // columna con `costoPrevioAplicacion`.
      await tx.comprobanteLinea.update({
        where: { id: linea.id },
        data: {
          precioPedidoPrevio: detalle.precioCosto,
          costoFinalUnitario: precioAEscribir,
          claseDiferencia: clasificacion.clase,
          diferenciaPct: clasificacion.diferenciaPct,
        },
      });

      await tx.pedidoProveedorDetalle.update({
        where: { id: detalle.id },
        data: { precioCosto: precioEnLaLinea },
      });

      // LA DECISIÓN, CON LOS DOS PRECIOS QUE SE COMPARARON. El propio es el de
      // ANTES de esta escritura: es contra ése que se decidió, y es el que la
      // próxima factura va a encontrar si el costo no se movió. Guardar el
      // nuevo dejaría una decisión que nunca vuelve a aplicar, porque los dos
      // lados serían el mismo número.
      //
      // Va adentro de la transacción: una decisión guardada sobre un costo que
      // no llegó a escribirse haría que la próxima factura no pregunte por algo
      // que no pasó.
      //
      // Y no se guarda nada si los dos números ya eran el mismo: ahí no hubo
      // ninguna pregunta que contestar, y la fila quedaría diciendo "antes
      // decidiste" sobre una comparación que nunca existió — salvo que la
      // pregunta haya sido por el catálogo movido, que sí existió.
      if (!mismoPrecio(detalle.precioCosto, precioEnLaLinea) || catalogoMovido) {
        await guardarDecisionDePrecio(tx, {
          grupoId,
          proveedorId: linea.comprobante.proveedor.id,
          productoBaseId: base.id,
          decision: DECISION_DE_PRECIO.ACEPTA_FACTURA,
          precioFacturado: precioAEscribir,
          // En la MISMA unidad que el facturado, que es la de la hoja: la línea
          // guarda el kilo de un fiambre por pieza y la decisión compara piezas.
          precioPropio: costoDelCatalogoEnLaUnidadDelDeposito({ base, costo: detalle.precioCosto }) ?? Number(detalle.precioCosto),
          costoMaestroObservado,
          comprobanteLineaId: linea.id,
          usuarioId: session?.id ?? null,
        });
      }

      return { anterior: detalle.precioCosto, nuevo: precioEnLaLinea };
    });

    return NextResponse.json({
      ok: true,
      lineaId: linea.id,
      producto: base?.nombre ?? null,
      precioAnterior: resultado.anterior,
      precioNuevo: resultado.nuevo,
      queHacer:
        "Precio aceptado y escrito en el pedido. El costo del producto se actualiza " +
        "cuando recibas la mercadería, con la regla de siempre.",
    });
  } catch (err) {
    console.error("Error comprobantes/aceptar-precio:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "aceptar el precio",
        quedo: "Puede que el precio haya quedado escrito en el pedido: fijate en el pedido antes de aceptarlo de nuevo.",
      }) }, { status: 500 });
  }
}
