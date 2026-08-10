# Decisiones

Registro de **por qué** se decidió algo. No se reconstruye toda la historia: acá
solo entra lo que tiene evidencia.

## Formato

```
DEC-XXXX — Título

Estado:        Vigente | Reemplazada | Parcial | Dudosa
Contexto:      qué problema había
Decisión:      qué se decidió
Motivo:        por qué — SOLO si está disponible
Consecuencias: qué cambió, qué se cierra, qué se abre
Evidencia:     commit, archivo:línea, migración o documento
```

**Sin evidencia no hay entrada.** Y si el "por qué" no está escrito en ningún
lado, se pone *"no documentado"* — **no se inventa**. Una decisión con un motivo
inventado es peor que una decisión sin motivo: la próxima persona la va a
defender por una razón que nunca existió.

**Estado "Dudosa"** es para lo que se ve en el código pero no se puede afirmar que
haya sido deliberado.

## Índice

| ID | Título | Estado |
|---|---|---|
| [DEC-0001](DEC-0001-catalogo-baja-no-sube.md) | El catálogo baja del depósito, no sube del local | Vigente |
| [DEC-0002](DEC-0002-propiedad-del-costo.md) | Solo el dueño del producto edita su costo | Vigente |
| [DEC-0003](DEC-0003-un-hecho-una-columna.md) | Un hecho, una columna: la exclusión y la confirmación | Vigente |
| [DEC-0004](DEC-0004-terminada-vs-cancelada.md) | TERMINADA se puede revertir; CANCELADA no | Vigente |
| [DEC-0005](DEC-0005-el-vps-no-construye.md) | El VPS no construye la imagen | Vigente |
| [DEC-0006](DEC-0006-fabrica-de-cliente-prisma.md) | Ningún script construye `PrismaClient` directo | Vigente |

## Decisiones que se ven pero no se pudieron fechar

Están en el código con su razón escrita al lado, pero sin commit que las aísle.
Se listan acá para no perderlas:

- **D2 — el producto sin creador se trata como del depósito**
  (`lib/visibilidad.js:18-19`).
- **D3 — con dos depósitos en un grupo cada uno vería solo lo suyo**, límite
  asumido (`lib/visibilidad.js:47-50`).
- **La acreditación de puntos es best-effort y el canje no**
  (`app/api/pos-ventas/crear/route.js:1027-1082` contra `:971-1006`).
- **Un producto de otro local responde 404 y no 403**, para no revelar existencia
  (`app/api/productos/obtener/route.js:88-93`).
- **`auditoria-pos-ventas` no filtra ventas internas a propósito**
  (`lib/ventas/filtroVentaComercial.js:35-37`).
