# LA IMAGEN DEL ENTORNO DE PRUEBAS — `erpazul-test:estable`.
#
#   docker build -f docker/erpazul-test.Dockerfile -t erpazul-test:estable docker/
#
# ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
#
# Porque el 2026-09-16 la imagen DESAPARECIÓ del VPS a mitad de una tanda, y su
# receta no estaba en ningún lado: vivía en la máquina y en la memoria del que la
# había construido. Sin ella no corre la suite, no corre el build, no corren las
# sondas y no se pueden sacar capturas — o sea, se frena todo, y encima con la
# tanda empezada.
#
# Es la misma familia que el resto de las herramientas del proyecto: algo que
# solo existe en una máquina es algo que se pierde sin aviso y nadie sabe rehacer.
#
# ── QUÉ TIENE Y POR QUÉ ────────────────────────────────────────────────────
#
# · `node:20-alpine` — la MISMA mayor que usa la CI. No es un detalle de gusto:
#   con node 18 el repo se comporta distinto, y eso ya costó una guardia muerta
#   (ver `scripts/hooksSeCargan.test.mjs`).
# · `chromium` — lo usan las sondas y los scripts de captura, que miden contra un
#   navegador de verdad. Vive en `/usr/bin/chromium`, que es la ruta que esos
#   scripts reciben por `--chrome`.
# · `font-noto` y `font-noto-emoji` — sin fuentes, una captura sale con
#   cuadraditos en vez de texto y parece un defecto de la pantalla. Una captura
#   que retrata otra cosa es peor que no tenerla.
# · `git` — varios candados enumeran con `git ls-files` y `git grep`.
# · `bash`, `gnupg`, `openssh-client` — la cadena de backup.
#
# ── LAS DEPENDENCIAS NO ESTÁN ACÁ, Y ES A PROPÓSITO ────────────────────────
#
# `node_modules` y el cliente de Prisma viven en
# `/home/emanuel/.cache/erpazul-test/node_modules` y se montan al correr. Así la
# imagen no se reconstruye cada vez que cambia una dependencia, y el mismo
# `node_modules` lo comparten la suite, el build y las sondas.
#
# Para rehidratar ese cache cuando cambian `package-lock.json` o
# `prisma/schema.prisma`, ver `docs/architecture/base-de-pruebas-v15.md`.

FROM node:20-alpine

RUN apk add --no-cache \
      bash \
      git \
      gnupg \
      openssh-client \
      chromium \
      font-noto \
      font-noto-emoji

# Las sondas levantan el navegador ellas mismas con `--chrome /usr/bin/chromium`;
# esta variable es para cualquier herramienta que lo busque por convención.
ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /repo
