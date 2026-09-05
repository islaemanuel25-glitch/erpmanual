import { NextResponse, after } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { ejecutarBarrido } from "@/lib/ofertas/barrido";
import {
  MEDIOS_CON_RECARGO,
  MEDIO_RECARGO_LABEL,
  normalizarRecargos,
  validarRecargoPct,
} from "@/lib/recargos-pago/recargoPago";

// RECARGOS POR MEDIO DE PAGO DEL LOCAL — lo que el comercio le cobra AL CLIENTE.
//
// ⚠️ ESTA RUTA NO TIENE NADA QUE VER CON LAS COMISIONES BANCARIAS. Esas viven en
// `ConfiguracionGrupo.comisionDebito` y hermanas, se configuran en otra pantalla,
// son por GRUPO y representan lo que el procesador le cobra AL COMERCIO. Acá no
// se lee ni se escribe ninguna de ellas: si alguna vez este archivo importa algo
// que diga "comision", algo se mezcló.
//
// El recargo es por LOCAL porque es una decisión comercial de cada boca: uno
// puede cobrar 5 % por débito y el de al lado no cobrar nada.

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    // Se lee con el permiso de configurarlos O con el de usar el POS: el cajero
    // necesita saber cuánto se le suma a cada medio ANTES de cobrar, y negárselo
    // sería esconderle el número que le va a pedir al cliente.
    const perm = checkPerm(session, ["config_local.recargos_pago", "pos.usar"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // ── EL AVISO DE VENCIMIENTO SE CUELGA DE ACÁ ─────────────────────────────
    //
    // Un vencimiento es tiempo, no un evento del sistema: nada lo dispara solo.
    // Sin planificador, la única forma de avisar es engancharlo a una superficie
    // que se abre todos los días, y ésta es la que el POS pide al montar. No se
    // agrega ni un request: el POS ya llamaba a esta ruta para saber los
    // recargos, que es lo más cercano a Ofertas que consulta.
    //
    // Corre en `after()`, DESPUÉS de responder: abrir la caja no puede tardar
    // más porque además haya que revisar ofertas. Y va acelerado —una corrida
    // cada 15 minutos por ubicación, `MINUTOS_ENTRE_BARRIDOS`— así que abrir y
    // cerrar la pantalla no lo dispara cada vez. El costo de cada corrida lo fija
    // la cantidad de líneas de ofertas VIVAS del local, no el catálogo.
    //
    // ── QUE LO DISPARE UN CAJERO NO LE DA NINGÚN PERMISO ────────────────────
    //
    // Esto NO pide `ofertas.ver` y no tiene que pedirlo: no le devuelve nada a
    // quien lo dispara. Todo lo que produce son filas de `Notificacion` con
    // `alcance: "LOCAL"` y `permisoRequerido: "ofertas.ver"`, así que el cajero
    // que las provocó no ve una sola. Quién dispara y quién ve son dos preguntas
    // distintas, y acá se contestan por separado.
    try {
      after(async () => {
        try {
          await ejecutarBarrido(prisma, { grupoId, localIds: [localId] });
        } catch (e) {
          console.error("[ofertas] barrido desde la apertura del POS:", e?.message);
        }
      });
    } catch {
      // `after()` fuera de un request (una prueba llamando al handler directo).
      // Que no haya aviso no puede impedir que el POS sepa sus recargos.
    }

    const filas = await prisma.recargoPagoLocal.findMany({
      where: { localId },
      select: { medio: true, porcentaje: true, updatedAt: true },
    });

    const mapa = normalizarRecargos(filas);
    const porUpdated = new Map(filas.map((f) => [f.medio, f.updatedAt]));

    return NextResponse.json({
      ok: true,
      localId,
      recargos: mapa,
      // La lista con etiquetas sale de acá y no del navegador, para que la
      // pantalla de configuración y el POS nombren los medios igual.
      medios: MEDIOS_CON_RECARGO.map((m) => ({
        medio: m,
        label: MEDIO_RECARGO_LABEL[m],
        porcentaje: mapa[m],
        // Sin fila nunca se configuró: la pantalla lo puede decir en vez de
        // mostrar un 0 que parece una decisión.
        configurado: porUpdated.has(m),
        actualizadoEn: porUpdated.get(m) ?? null,
      })),
    });
  } catch (err) {
    console.error("Error leyendo recargos por medio de pago:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los recargos del local: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.recargos_pago");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const pedidos = body?.recargos && typeof body.recargos === "object" ? body.recargos : null;
    if (!pedidos) {
      return NextResponse.json(
        { ok: false, error: "Falta el objeto `recargos` con el porcentaje de cada medio." },
        { status: 400 }
      );
    }

    // Se valida TODO antes de escribir NADA. Guardar tres medios y fallar en el
    // cuarto dejaría al local cobrando una combinación que nadie eligió.
    const aGuardar = [];
    for (const [medio, valor] of Object.entries(pedidos)) {
      const m = String(medio).toUpperCase();
      if (!MEDIOS_CON_RECARGO.includes(m)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `"${medio}" no admite recargo. Los medios configurables son: ` +
              `${MEDIOS_CON_RECARGO.join(", ")}. El fiado queda afuera a propósito: ` +
              `es una promesa de pago, y el recargo se define cuando se cobra de verdad.`,
          },
          { status: 400 }
        );
      }
      const val = validarRecargoPct(valor);
      if (!val.valido) {
        return NextResponse.json(
          { ok: false, error: `${MEDIO_RECARGO_LABEL[m]}: ${val.error}` },
          { status: 400 }
        );
      }
      aGuardar.push({ medio: m, porcentaje: val.porcentaje });
    }

    await prisma.$transaction(
      aGuardar.map((r) =>
        prisma.recargoPagoLocal.upsert({
          where: { localId_medio: { localId, medio: r.medio } },
          update: { porcentaje: r.porcentaje, actualizadoPorId: session.id },
          create: {
            localId,
            medio: r.medio,
            porcentaje: r.porcentaje,
            actualizadoPorId: session.id,
          },
        })
      )
    );

    // Queda en el log además de en la bitácora: es un número que cambia lo que
    // paga la gente en la caja, y conviene poder reconstruir cuándo cambió sin
    // depender de que la auditoría lo haya tomado.
    console.log(
      "[recargos-pago] local=%s usuario=%s → %s",
      localId,
      session.id,
      aGuardar.map((r) => `${r.medio}:${r.porcentaje}%`).join(" ")
    );

    return NextResponse.json({ ok: true, guardados: aGuardar.length });
  } catch (err) {
    console.error("Error guardando recargos por medio de pago:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron guardar los recargos: ${err.message}` },
      { status: 500 }
    );
  }
}
