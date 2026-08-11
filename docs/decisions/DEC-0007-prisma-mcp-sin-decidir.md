# DEC-0007 — `prisma mcp` daría la vuelta alrededor de la guardia

**Estado:** SIN DECIDIR. Hay que resolverla, no está resuelta.

**Fecha del hallazgo:** 2026-08-11

## Contexto

El CLI de Prisma trae un comando, `prisma mcp`, que levanta un servidor MCP
"para usar con herramientas de desarrollo con IA". Apareció al enumerar la
superficie del CLI instalado (6.19.3) para armar la lista de comandos
bloqueados, y no lo estábamos buscando.

**Hoy no está conectado.** Esto no describe un agujero abierto: describe uno que
se abriría solo si alguien lo enchufa.

## El problema

Toda la protección que existe del lado de la máquina mira **comandos de shell**:

- La guardia de migraciones es un hook `PreToolUse` con matcher `Bash`. Los
  cuatro comandos bloqueados —el empuje de esquema, el reseteo, el SQL crudo y
  el marcado de migraciones— se reconocen por el texto del comando.
- La autorización manual y su bitácora en `.claude/migraciones-autorizadas.log`
  también salen de ahí.
- Las reglas de permisos de `.claude/settings.json` distinguen `Bash` de
  `PowerShell` como herramientas separadas, y solo esas dos.

Si `prisma mcp` estuviera conectado, las operaciones sobre la base llegarían
como **llamadas de herramienta MCP**, que no son ni `Bash` ni `PowerShell`.
Ningún patrón las ve, ningún hook se dispara, la bitácora no registra nada.

No es que se debilitaría un control: se saltarían **todos a la vez**, y en
silencio. Es la vuelta completa alrededor de lo que se construyó entre el
2026-08-10 y el 2026-08-11.

## Por qué está escrito acá y no solo en el código

Porque es exactamente la clase de cosa que dentro de un año nadie recuerda. El
día que alguien —o alguna herramienta, por su cuenta— proponga conectar el
servidor MCP de Prisma "para que sea más cómodo", va a parecer una mejora de
comodidad y no un cambio de seguridad. Este documento existe para que en ese
momento aparezca la palabra que falta.

## Lo que hay que decidir

Tres caminos, y no está elegido ninguno:

1. **No conectarlo, y dejarlo dicho.** Lo más simple. Cuesta perder la comodidad
   que ofrezca, que hoy no sabemos cuál es porque nunca se probó.
2. **Conectarlo y extender la guardia a las herramientas MCP.** Hay que averiguar
   si un hook puede interceptar llamadas MCP con la misma fuerza con que
   intercepta `Bash` — **eso no está verificado** y es lo primero que habría que
   comprobar antes de considerar este camino.
3. **Conectarlo tal cual.** Solo defendible si se acepta explícitamente que la
   base queda sin ninguna protección local. No es una omisión: sería una
   decisión.

## Qué NO hacer mientras tanto

No conectarlo por comodidad y anotarlo después. La protección que se pierde no
avisa cuando se pierde: no hay nada que se ponga rojo, ningún candado que falle,
ninguna línea en ninguna bitácora. Se descubriría el día que algo ya pasó.

## Relacionado

- La lista de comandos bloqueados y su criterio: `lib/deploy/guardiaMigraciones.js`
- Por dónde se saltea la guardia, punto 8: skill `/deploy`
- `DEC-0006-fabrica-de-cliente-prisma.md`, que protege el otro camino a la base
  —los scripts— y que **sí seguiría valiendo**, porque vive en el código y no en
  los permisos.
