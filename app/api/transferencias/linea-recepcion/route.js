// app/api/transferencias/linea-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esComboBase } from "@/lib/combos/guards";
import { productoDelCatalogoLocal } from "@/lib/productos/buscarCatalogoLocal";
import { ERRORES_RECEPCION, resolverUnidadEnviada } from "@/lib/transferencias/recepcion";
import { presentacionDeProducto } from "@/lib/productos/presentacionDeProducto";
import {
  PRESENTACION,
  agrupa,
  nombreDePresentacion,
  unidadFisicaDe,
} from "@/lib/transferencias/presentacionEnvio";
import {
  ErrorRecepcion,
  estadoAdmiteRecepcion,
  puedeRecibir,
  reclamarOFallar,
} from "@/lib/transferencias/recepcionServidor";

// AGREGAR O QUITAR UNA LÍNEA QUE APARECIÓ AL ABRIR LOS BULTOS.
//
// ── LO QUE ESTA RUTA NO MUEVE ─────────────────────────────────────────────
//
// Stock. Ni una unidad. Agregar una línea es registrar que ese producto llegó;
// el inventario recién se toca al CONFIRMAR, dentro de la única transacción que
// ya existe. Por eso una línea agregada por error se puede borrar sin
// consecuencias mientras la recepción siga abierta: nunca movió nada.
//
// ── POR QUÉ NO CREA UNA LÍNEA SI EL PRODUCTO YA ESTÁ ──────────────────────
//
// Si el producto ya es una línea del remito, lo que llegó de más no es un
// producto nuevo: es MÁS de esa línea. Crear una segunda fila del mismo producto
// dejaría la transferencia con dos verdades sobre lo mismo —cuánto se envió se
// leería en una y cuánto llegó en las dos— y rompería la lectura de cualquier
// reporte que agrupe por producto. Se contesta con la línea existente para que
// el operador aumente su `recibido`, que es exactamente el caso 1.
//
// ── UNA LÍNEA DEL REMITO NO SE BORRA DESDE ACÁ ────────────────────────────
//
// Solo se puede borrar lo que se agregó en recepción. Borrar una línea original
// haría desaparecer mercadería que SÍ salió del origen: su tránsito quedaría
// reservado para siempre y el faltante no volvería a ningún stock. Si no llegó
// nada de esa línea, el camino es `recibido = 0`, que sí lo contempla la
// aritmética.

/** El producto que se pide agregar, resuelto contra el catálogo del ORIGEN. */
async function resolverPedido(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: { status: 401, body: { ok: false, error: "No autenticado" } } };

  const perm = checkPerm(session, "transferencias.recibir");
  if (!perm.ok) return { error: { status: perm.status, body: { ok: false, error: perm.error } } };

  const usuarioId = Number(session.id || 0);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return {
      error: {
        status: 401,
        body: {
          ok: false,
          codigo: "USUARIO_SESION_INVALIDO",
          error: "Tu sesión no identifica un usuario válido. Volvé a iniciar sesión.",
        },
      },
    };
  }

  const body = await req.json().catch(() => ({}));
  const transferenciaId = Number(body?.transferenciaId || 0);
  if (!transferenciaId) {
    return { error: { status: 400, body: { ok: false, error: "transferenciaId requerido" } } };
  }

  const transferencia = await prisma.transferencia.findUnique({
    where: { id: transferenciaId },
    select: { id: true, origenId: true, destinoId: true, estado: true },
  });
  if (!transferencia) {
    return { error: { status: 404, body: { ok: false, error: "Transferencia no encontrada" } } };
  }

  const alcance = puedeRecibir(session, transferencia);
  if (!alcance.ok) {
    return { error: { status: alcance.status, body: { ok: false, error: alcance.error } } };
  }

  const estado = estadoAdmiteRecepcion(transferencia.estado, { accion: "modificar las líneas" });
  if (!estado.ok) {
    return { error: { status: estado.status, body: { ok: false, error: estado.error } } };
  }

  return { session, usuarioId, transferencia, body };
}

/**
 * POST — agregar una línea de recepción.
 *
 * Cuerpo: { transferenciaId, productoLocalId, unidadEnviada, recibido? }
 *
 * `productoLocalId` es del catálogo del ORIGEN, y se comprueba contra ese
 * catálogo con el MISMO filtro que usa el buscador: lo que no se puede encontrar
 * tampoco se puede agregar.
 *
 * `unidadEnviada` es OBLIGATORIA. Ver el comentario en el cuerpo.
 */
export async function POST(req) {
  try {
    const pedido = await resolverPedido(req);
    if (pedido.error) return NextResponse.json(pedido.error.body, { status: pedido.error.status });

    const { usuarioId, transferencia, body } = pedido;

    const producto = await productoDelCatalogoLocal(prisma, {
      localId: transferencia.origenId,
      productoLocalId: body?.productoLocalId,
    });

    // Un producto de otro origen, uno inexistente y uno no visible para ese local
    // se contestan IGUAL: desde afuera no se puede distinguir, así que el id no
    // sirve para averiguar qué tiene otro local en su catálogo.
    if (!producto) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "PRODUCTO_FUERA_DEL_ORIGEN",
          error: "Ese producto no pertenece al catálogo del local de origen de esta transferencia.",
        },
        { status: 404 }
      );
    }

    if (esComboBase(producto.base)) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "COMBO_NO_TRANSFERIBLE",
          error: "Un combo no tiene stock físico propio: no se puede recibir como línea.",
        },
        { status: 400 }
      );
    }

    // ── LA UNIDAD ES OBLIGATORIA, Y NO SE ADIVINA ───────────────────────────
    //
    // Acá había `body?.unidadEnviada || "UNIDAD"`. Ese default es la misma
    // familia de defecto que el viejo `unidadEnviada || "BULTO"` que la
    // aritmética de recepción ya eliminó: **el mismo número significa cosas
    // distintas según la unidad**, y elegirla por el servidor convierte un dato
    // que faltó en un dato inventado.
    //
    // No es simétrico con aquél, es peor. Asumir UNIDAD parece "conservador"
    // porque no multiplica por el factor de pack, pero una línea agregada
    // DESCUENTA del origen: un cliente que mande 3 pensando en bultos de 20 le
    // acredita al destino 3 unidades y le descuenta al origen 3, cuando la
    // realidad son 60 y 60. La diferencia de 57 unidades no aparece en ningún
    // lado —no hay envío contra el cual contrastar— y no vuelve a haber ninguna
    // oportunidad de detectarla.
    //
    // Se resuelve con `resolverUnidadEnviada`, la MISMA función que valida la
    // unidad de las líneas del remito, para que las dos puertas por las que
    // entra una unidad contesten igual.
    //
    // Ojo: esto valida la FORMA de lo que mandó el cliente —que sea BULTO o
    // UNIDAD— y nada más. Que sea la unidad CORRECTA lo decide el bloque de
    // abajo, contra el catálogo. Las dos preguntas son distintas y les faltaba
    // la segunda.
    const uni = resolverUnidadEnviada(body?.unidadEnviada);

    // ── Y QUIEN MANDA ES EL CATÁLOGO, NO EL PEDIDO ──────────────────────────
    //
    // El producto ya se releyó del catálogo del ORIGEN unas líneas más arriba,
    // así que el servidor TIENE la respuesta y no hay motivo para confiar en la
    // del cliente. Un pack de 6 es un pack de 6 lo diga quien lo diga, y un
    // cliente viejo —o uno manipulado— que mande "UNIDAD" sobre un PACK x6
    // convierte 2 bultos en 2 unidades: 10 que se le descuentan de menos al
    // origen y que no aparecen en ningún lado, porque una línea agregada no
    // tiene envío contra el cual contrastar.
    //
    // La decisión sale de los helpers canónicos —`presentacionDeProducto` y
    // `unidadFisicaDe`—, los mismos que usa la pantalla para derivarla. Acá no
    // se escribe ninguna regla nueva.
    const presentacion = presentacionDeProducto({
      unidadMedida: producto.base?.unidad_medida,
      factorPack: producto.base?.factor_pack,
      modoVentaDeposito: producto.base?.modoVentaDeposito,
      pesoReferenciaKg: producto.base?.pesoReferenciaKg,
      modoCompraProveedor: producto.base?.modoCompraProveedor,
      pesoEsFijo: producto.base?.pesoEsFijo,
      // SIN `contadoEn`: el pedido no puede influir en qué ES el producto.
    });
    const unidadAutoritativa = unidadFisicaDe(presentacion);

    // Si el cliente mandó una unidad y NO es la del catálogo, se rechaza y se
    // dice qué hacer. No se reinterpreta en silencio: la misma cantidad
    // significa cosas distintas según la escala, y aceptar "2" bajo una unidad
    // y guardarlo bajo otra es exactamente inventar el dato que faltaba.
    if (uni.ok && uni.unidad !== unidadAutoritativa) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "UNIDAD_CONTRADICE_CATALOGO",
          error:
            `El catálogo del origen dice que este producto se cuenta en ${nombreDePresentacion(presentacion)}, ` +
            `y el pedido llegó en ${uni.unidad}. Recargá la pantalla para trabajar con la presentación actual.`,
        },
        { status: 409 }
      );
    }

    // ── LAS SUELTAS SE VALIDAN CON LA MISMA REGLA QUE LA RECEPCIÓN NORMAL ──
    //
    // Solo tienen sentido cuando la presentación AGRUPA: en UNIDAD, en KG y en
    // PIEZA no hay bultos que completar, y un valor ahí sería un dato sobre una
    // escala que no existe. Es la misma condición que `validarDetalleRecepcion`
    // aplica del otro lado con `UNIDADES_SUELTAS_SIN_BULTO`.
    //
    // Y la pregunta se le hace a la unidad AUTORITATIVA, no a la del pedido: si
    // se le hiciera a la del cliente, mandar "BULTO" sobre un producto por kilo
    // habilitaría un desglose que en esa escala no existe.
    const sueltasPedidas = Number(body?.recibidoUnidadesSueltas);
    const traeSueltas = Number.isFinite(sueltasPedidas) && sueltasPedidas > 0;
    //
    // El `uni.ok` se conserva para no cambiar QUÉ error gana cuando faltan las
    // dos cosas: un pedido sin unidad y con desglose sigue contestando
    // UNIDAD_AUSENTE, como antes.
    if (traeSueltas && uni.ok && unidadAutoritativa !== "BULTO") {
      return NextResponse.json(
        {
          ok: false,
          codigo: ERRORES_RECEPCION.SUELTAS_SIN_BULTO,
          error:
            "Las unidades sueltas solo tienen sentido cuando la mercadería viene en bultos. " +
            "En UNIDAD, KG o PIEZA no hay bulto que completar.",
        },
        { status: 400 }
      );
    }
    const sueltas = traeSueltas ? sueltasPedidas : null;
    if (!uni.ok) {
      // El CÓDIGO es el compartido, para que el cliente distinga los dos casos
      // igual que en el resto de la recepción. El TEXTO no: el de
      // `mensajeRecepcion` dice "corregí la transferencia antes de recibirla",
      // que es el consejo correcto para una línea del remito guardada sin unidad
      // y el equivocado acá, donde lo que faltó lo mandó este mismo pedido.
      //
      // Y el status tampoco: allá es 409 porque el dato guardado está mal, acá es
      // 400 porque el pedido vino incompleto.
      const falta = uni.error === ERRORES_RECEPCION.UNIDAD_AUSENTE;
      return NextResponse.json(
        {
          ok: false,
          codigo: uni.error,
          error: falta
            ? "Falta la unidad de la línea agregada. Indicá si contaste en BULTO o en UNIDAD: " +
              "la misma cantidad significa distinto según cuál sea."
            : "Unidad desconocida: se esperaba BULTO o UNIDAD.",
        },
        { status: 400 }
      );
    }

    // ── LA ESCRITURA, DETRÁS DEL LOCK ───────────────────────────────────────
    //
    // Antes esto creaba la línea y después movía el estado, las dos sueltas.
    // Confirmar podía cerrar la transferencia justo en el medio, y la línea
    // nacía dentro de una recepción ya confirmada: su stock no se iba a mover
    // nunca, y el `estado: "Recibiendo"` de después reabría una transferencia
    // que ya estaba "Recibida".
    //
    // `reclamarOFallar` deja las dos cosas resueltas de una: toma el lock de la
    // fila y pone "Recibiendo", que es el estado que esta ruta quería dejar de
    // todos modos. Y la comprobación de duplicado se mudó ADENTRO porque dos
    // POST simultáneos del mismo producto la pasaban los dos.
    const resultado = await prisma.$transaction(async (tx) => {
      await reclamarOFallar(tx, transferencia.id, "Recibiendo");

      // ── SI YA ESTÁ EN EL REMITO, NO SE DUPLICA ────────────────────────────
      const existente = await tx.transferenciaDetalle.findFirst({
        where: { transferenciaId: transferencia.id, productoId: producto.id },
        select: { id: true, cantidad: true, recibido: true, agregadoEnRecepcion: true },
      });

      if (existente) {
        return {
          ok: true,
          yaExistia: true,
          detalleId: existente.id,
          agregadoEnRecepcion: existente.agregadoEnRecepcion,
          mensaje:
            "Ese producto ya figura en esta transferencia. Aumentá la cantidad recibida en su línea en vez de agregarlo de nuevo.",
        };
      }

      const creado = await tx.transferenciaDetalle.create({
        data: {
          transferenciaId: transferencia.id,
          productoId: producto.id,
          // CERO, y es el dato honesto: esta línea no se envió. De acá sale que su
          // tránsito no se toque y que su diferencia sea todo lo recibido.
          cantidad: 0,
          recibido: body?.recibido == null ? null : body.recibido,
          // La del CATÁLOGO. `uni.unidad` ya se comprobó contra ésta más arriba
          // —si difieren, el pedido se rechazó— así que acá son la misma; lo que
          // cambia es cuál de las dos es la fuente de verdad.
          unidadEnviada: unidadAutoritativa,
          // ── EL PACK INCOMPLETO TAMBIÉN EN UNA LÍNEA NO DECLARADA ─────────
          //
          // Un producto que llegó sin estar en el remito puede llegar igual de
          // incompleto que uno declarado: 2 packs de 6 más 1 suelta. Sin esto
          // había que elegir entre escribir 2,166 packs —el error de exactitud
          // que todo este modelo evita— o perder la suelta.
          //
          // La columna YA existía: es la misma `recibidoUnidadesSueltas` que usa
          // la recepción normal. Lo único que faltaba era que el contrato la
          // aceptara. No hay columna nueva ni migración por esto.
          //
          // Se valida con la MISMA regla: sueltas solo si la presentación
          // agrupa. Ver `sueltasParaLineaNueva`.
          recibidoUnidadesSueltas: sueltas,
          // ── LA ESCALA CON LA QUE SE INTERPRETÓ LO RECIBIDO, CONGELADA ────
          //
          // Una línea no declarada no tuvo envío, así que las dos CANTIDADES
          // del snapshot van en cero y eso es el dato honesto. Pero la
          // PRESENTACIÓN y el factor no son cero: son la escala con la que el
          // operador contó lo que tenía en la mano, y de ellos sale cuánto stock
          // se descuenta del origen al confirmar.
          //
          // Sin congelarlos, la línea quedaba leyendo el catálogo vivo hasta el
          // momento de confirmar: alguien edita `factor_pack` de 6 a 12 entre
          // agregar y confirmar, y los 2 packs que se contaron pasan a descontar
          // 24 unidades en vez de 12. Lo mismo con `pesoReferenciaKg` en una
          // pieza. Es el mismo agujero que la línea del remito ya tenía tapado.
          //
          // No hay columna nueva: son las cinco de esta misma migración.
          presentacionEnvio: presentacion.presentacion,
          cantidadPresentada: 0,
          sueltasEnviadas: 0,
          factorPresentacion: agrupa(presentacion.presentacion) ? presentacion.factor : null,
          pesoPiezaKg:
            presentacion.presentacion === PRESENTACION.PIEZA ? presentacion.pesoPiezaKg : null,
          precioCosto: producto.precio_costo ?? producto.base?.precio_costo ?? null,
          agregadoEnRecepcion: true,
          agregadoEnRecepcionPorId: usuarioId,
          agregadoEnRecepcionAt: new Date(),
        },
        select: { id: true },
      });

      return { ok: true, yaExistia: false, detalleId: creado.id };
    });

    return NextResponse.json(resultado);
  } catch (err) {
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR agregar linea de recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo agregar la línea de recepción." },
      { status: 500 }
    );
  }
}

/**
 * DELETE — quitar una línea agregada por error.
 *
 * Cuerpo: { transferenciaId, detalleId }
 *
 * Solo líneas agregadas en recepción, y solo mientras la recepción esté abierta.
 * No mueve stock porque la línea nunca lo movió.
 */
export async function DELETE(req) {
  try {
    const pedido = await resolverPedido(req);
    if (pedido.error) return NextResponse.json(pedido.error.body, { status: pedido.error.status });

    const { transferencia, body } = pedido;
    const detalleId = Number(body?.detalleId || 0);

    // ── EL LOCK PRIMERO, Y RECIÉN DESPUÉS SE MIRA LA LÍNEA ──────────────────
    //
    // Ésta era la peor de las tres carreras, porque borra. Validar afuera y
    // borrar después dejaba esta secuencia: el DELETE comprueba que el estado
    // admite edición, confirmar toma la transferencia y le mueve el stock a esa
    // línea, y el borrado se ejecuta encima. El stock ya se movió y la línea que
    // lo explica desaparece: queda un ajuste de inventario sin origen, y la
    // auditoría apunta a un `transferenciaDetalleId` que ya no existe.
    //
    // Con el lock adelante eso no puede pasar en ningún orden: o el DELETE llega
    // primero y confirmar ve una transferencia sin esa línea, o confirmar llega
    // primero y el DELETE empareja cero y aborta.
    await prisma.$transaction(async (tx) => {
      await reclamarOFallar(tx, transferencia.id, "Recibiendo");

      // El detalle se busca DENTRO de la transferencia: un id de otra transferencia
      // no aparece, así que no se puede borrar una línea ajena pasando su número.
      const detalle = await tx.transferenciaDetalle.findFirst({
        where: { id: detalleId, transferenciaId: transferencia.id },
        select: { id: true, agregadoEnRecepcion: true },
      });

      if (!detalle) {
        throw new ErrorRecepcion(
          "LINEA_AJENA",
          "Esa línea no pertenece a esta transferencia.",
          404
        );
      }

      if (!detalle.agregadoEnRecepcion) {
        throw new ErrorRecepcion(
          "LINEA_DEL_REMITO_NO_SE_BORRA",
          "Esa línea es parte del envío original y no se puede eliminar desde la recepción. " +
            "Si no llegó nada de ese producto, cargá 0 como cantidad recibida.",
          409
        );
      }

      await tx.transferenciaDetalle.delete({ where: { id: detalle.id } });
    });

    return NextResponse.json({ ok: true, eliminada: true });
  } catch (err) {
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR eliminar linea de recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar la línea de recepción." },
      { status: 500 }
    );
  }
}
