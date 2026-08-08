# Baja el backup del día desde el VPS y lo distribuye a los destinos externos.
#
# Corre en la notebook por el Programador de tareas de Windows. Ver
# docs/RESTAURACION-BACKUP.md para el procedimiento de recuperación.
#
# ── POR QUÉ SE TIRA Y NO SE EMPUJA ──────────────────────────────────────────
# El VPS no guarda ninguna credencial hacia afuera. Si alguien lo compromete, se
# lleva la base pero NO los backups: no tiene con qué llegar a ellos. Si el VPS
# empujara, tendría que guardar la llave del lugar donde están las copias, que es
# justo lo que un atacante busca. Por eso el sentido del tráfico importa.
#
# ── LOS TRES DESTINOS ───────────────────────────────────────────────────────
#   1. Notebook  — el diario, siempre.
#   2. Disco externo — el diario, SI está conectado. Si no, se registra y sigue.
#   3. Repo git privado — solo semanal y mensual, CIFRADOS con gpg.
#
# Ninguna falla de un destino impide los otros: el objetivo es maximizar las
# copias que sí se pueden hacer, no abortar en la primera piedra.

[CmdletBinding()]
param(
  # Para probar sin esperar al domingo: fuerza el envío de semanal y mensual.
  [switch]$ForzarRepo,
  # No escribe en el repo ni en el disco: solo informa qué haría.
  [switch]$Simular
)

$ErrorActionPreference = "Stop"

# ── Configuración ───────────────────────────────────────────────────────────
$VPS          = "vps-erp"                                   # alias de ~/.ssh/config
$DIR_REMOTO   = "/srv/produccion/backups"
$DIR_LOCAL    = "C:\Users\emanuel\Backups\erpazul"
$DIR_ESTADO   = "C:\Users\emanuel\.erpazul-backup"
$ARCHIVO_FRASE= Join-Path $DIR_ESTADO "frase-gpg.xml"
$LOG          = Join-Path $DIR_LOCAL "backup.log"
$ESTADO       = Join-Path $DIR_LOCAL "ESTADO.txt"
$REPO_LOCAL   = Join-Path $DIR_ESTADO "erpazul-backups"     # clon del repo privado
$REPO_REMOTO  = "https://github.com/islaemanuel25-glitch/erpazul-backups.git"

# Etiqueta del disco externo. Se busca por etiqueta y no por letra porque la
# letra cambia según qué haya enchufado antes.
$ETIQUETA_DISCO = "BACKUP-ERP"

New-Item -ItemType Directory -Path $DIR_LOCAL, $DIR_ESTADO -Force | Out-Null

# ── Log ─────────────────────────────────────────────────────────────────────
$script:lineas = @()
function Registrar {
  param([string]$Destino, [string]$Resultado, [string]$Detalle = "")
  $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  $linea = "{0} | {1,-16} | {2,-24} | {3}" -f $ts, $Destino, $Resultado, $Detalle
  Add-Content -Path $LOG -Value $linea -Encoding UTF8
  $script:lineas += $linea
  Write-Host $linea
}

# Estado: una línea por destino con la ÚLTIMA copia exitosa. Se lee de un vistazo
# sin recorrer el historial. Un destino que dejó de funcionar se nota por la
# fecha vieja, aunque el log siga creciendo con corridas "exitosas" de los otros.
function ActualizarEstado {
  param([string]$Destino, [string]$Archivo)
  $mapa = @{}
  if (Test-Path $ESTADO) {
    foreach ($l in Get-Content $ESTADO -Encoding UTF8) {
      if ($l -match '^(\S+)\s*=\s*(.*)$') { $mapa[$Matches[1]] = $Matches[2] }
    }
  }
  $mapa[$Destino] = "{0} | {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $Archivo
  $salida = @("# Ultima copia EXITOSA a cada destino. Si una fecha quedo vieja, ese destino dejo de funcionar.")
  foreach ($k in @("notebook", "disco_externo", "repo_git")) {
    $v = if ($mapa.ContainsKey($k)) { $mapa[$k] } else { "NUNCA" }
    $salida += ("{0,-14} = {1}" -f $k, $v)
  }
  Set-Content -Path $ESTADO -Value $salida -Encoding UTF8
}

function EjecutarSsh {
  param([string]$Comando)
  $r = & ssh -o ConnectTimeout=20 -o BatchMode=yes $VPS $Comando 2>&1
  if ($LASTEXITCODE -ne 0) { throw "ssh falló ($LASTEXITCODE): $r" }
  return ($r | Out-String).Trim()
}

Registrar "corrida" "INICIO" ("simular={0} forzarRepo={1}" -f $Simular, $ForzarRepo)

# ── 1. Notebook: el diario ──────────────────────────────────────────────────
$nombreDiario = $null
try {
  $nombreDiario = EjecutarSsh "cat $DIR_REMOTO/ULTIMO_DIARIO.txt"
  if (-not $nombreDiario) { throw "el VPS no reporta ningún diario" }

  $destino = Join-Path $DIR_LOCAL $nombreDiario
  if (Test-Path $destino) {
    Registrar "notebook" "YA ESTABA" $nombreDiario
  } else {
    & scp -o ConnectTimeout=20 "${VPS}:$DIR_REMOTO/$nombreDiario" $destino
    if ($LASTEXITCODE -ne 0) { throw "scp falló ($LASTEXITCODE)" }
  }

  # La verificación es el punto: sin esto solo sabemos que hay un archivo, no
  # que sea el mismo. Se compara contra el hash calculado EN EL SERVIDOR.
  $shaRemoto = (EjecutarSsh "sha256sum $DIR_REMOTO/$nombreDiario").Split(" ")[0]
  $shaLocal  = (Get-FileHash -Path $destino -Algorithm SHA256).Hash.ToLower()
  if ($shaLocal -ne $shaRemoto) {
    Remove-Item $destino -Force   # una copia que no verifica es peor que ninguna
    throw "SHA-256 NO COINCIDE (remoto=$shaRemoto local=$shaLocal). Copia descartada."
  }
  Registrar "notebook" "OK" ("{0} sha256={1}..." -f $nombreDiario, $shaLocal.Substring(0, 16))
  ActualizarEstado "notebook" $nombreDiario
} catch {
  Registrar "notebook" "ERROR" $_.Exception.Message
}

# ── 2. Disco externo: el diario, si está ────────────────────────────────────
# Todavía no existe el disco. Queda escrito para que sumarlo sea enchufarlo y
# ponerle la etiqueta, sin tocar este script.
try {
  $vol = Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.FileSystemLabel -eq $ETIQUETA_DISCO }
  if (-not $vol) {
    Registrar "disco_externo" "NO CONECTADO" ("no hay volumen con etiqueta '{0}'" -f $ETIQUETA_DISCO)
  } elseif (-not $nombreDiario) {
    Registrar "disco_externo" "OMITIDO" "no hubo diario que copiar"
  } else {
    $dirDisco = "{0}:\erpazul-backups" -f $vol.DriveLetter
    $origen   = Join-Path $DIR_LOCAL $nombreDiario
    if ($Simular) {
      Registrar "disco_externo" "SIMULADO" $dirDisco
    } else {
      New-Item -ItemType Directory -Path $dirDisco -Force | Out-Null
      Copy-Item $origen (Join-Path $dirDisco $nombreDiario) -Force
      $shaDisco = (Get-FileHash -Path (Join-Path $dirDisco $nombreDiario) -Algorithm SHA256).Hash.ToLower()
      $shaOrig  = (Get-FileHash -Path $origen -Algorithm SHA256).Hash.ToLower()
      if ($shaDisco -ne $shaOrig) { throw "SHA-256 no coincide tras copiar al disco" }
      Registrar "disco_externo" "OK" ("{0}\{1}" -f $dirDisco, $nombreDiario)
      ActualizarEstado "disco_externo" $nombreDiario
    }
  }
} catch {
  Registrar "disco_externo" "ERROR" $_.Exception.Message
}

# ── 3. Repo git privado: semanal y mensual, CIFRADOS ────────────────────────
# El diario NO va al repo: git guarda todas las versiones para siempre y un .gz
# no comprime más, así que subir 365 por año lo haría crecer sin freno.
try {
  $hoy = Get-Date
  $tocaSemanal = ($hoy.DayOfWeek -eq [DayOfWeek]::Sunday) -or $ForzarRepo
  $tocaMensual = ($hoy.Day -eq 1) -or $ForzarRepo

  if (-not ($tocaSemanal -or $tocaMensual)) {
    Registrar "repo_git" "NO CORRESPONDE" "solo domingos (semanal) y día 1 (mensual)"
  } else {
    if (-not (Test-Path $ARCHIVO_FRASE)) { throw "falta la frase gpg en $ARCHIVO_FRASE (ver docs/RESTAURACION-BACKUP.md)" }

    if (-not (Test-Path (Join-Path $REPO_LOCAL ".git"))) {
      Registrar "repo_git" "CLONANDO" $REPO_REMOTO
      if (-not $Simular) {
        & git clone $REPO_REMOTO $REPO_LOCAL 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git clone falló: ¿existe el repo y tenés acceso?" }
      }
    }

    # La frase sale del archivo DPAPI y se pasa a gpg por un descriptor, NUNCA
    # como argumento: los argumentos son visibles para cualquier proceso.
    $sec   = Import-Clixml $ARCHIVO_FRASE
    $frase = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
               [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

    $subidos = @()
    foreach ($serie in @("semanal", "mensual")) {
      if ($serie -eq "semanal" -and -not $tocaSemanal) { continue }
      if ($serie -eq "mensual" -and -not $tocaMensual) { continue }

      $puntero = "ULTIMO_" + $serie.ToUpper() + ".txt"
      $nombre  = EjecutarSsh "cat $DIR_REMOTO/$puntero"
      if (-not $nombre) { Registrar "repo_git" "SIN $serie" "el VPS todavía no generó ninguno"; continue }

      $tmp = Join-Path $env:TEMP $nombre
      & scp -o ConnectTimeout=20 "${VPS}:$DIR_REMOTO/$nombre" $tmp
      if ($LASTEXITCODE -ne 0) { throw "scp del $serie falló" }

      $shaRem = (EjecutarSsh "sha256sum $DIR_REMOTO/$nombre").Split(" ")[0]
      $shaLoc = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
      if ($shaLoc -ne $shaRem) { Remove-Item $tmp -Force; throw "SHA-256 no coincide en el $serie" }

      $cifrado = Join-Path $REPO_LOCAL "$nombre.gpg"
      if ($Simular) {
        Registrar "repo_git" "SIMULADO" "$nombre.gpg"
      } else {
        New-Item -ItemType Directory -Path $REPO_LOCAL -Force | Out-Null
        # --batch --passphrase-fd 0: sin pedir nada por pantalla y sin exponer la
        # frase en la línea de comandos.
        $frase | & gpg --batch --yes --quiet --symmetric --cipher-algo AES256 `
                       --passphrase-fd 0 --pinentry-mode loopback `
                       --output $cifrado $tmp
        if ($LASTEXITCODE -ne 0) { throw "gpg falló al cifrar $nombre" }
        $subidos += "$nombre.gpg"
      }
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }

    if ($subidos.Count -gt 0 -and -not $Simular) {
      Push-Location $REPO_LOCAL
      try {
        & git add -- *.gpg 2>&1 | Out-Null
        $hay = & git status --porcelain
        if ($hay) {
          & git commit -m ("backup cifrado {0}: {1}" -f (Get-Date -Format "yyyy-MM-dd"), ($subidos -join ", ")) 2>&1 | Out-Null
          & git push 2>&1 | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "git push falló" }
          Registrar "repo_git" "OK" ($subidos -join ", ")
          ActualizarEstado "repo_git" ($subidos -join ", ")
        } else {
          Registrar "repo_git" "SIN CAMBIOS" "los archivos ya estaban subidos"
        }
      } finally { Pop-Location }
    }
  }
} catch {
  Registrar "repo_git" "ERROR" $_.Exception.Message
}

Registrar "corrida" "FIN" ""
Write-Host ""
Write-Host "--- ESTADO ---"
if (Test-Path $ESTADO) { Get-Content $ESTADO | Write-Host }
