; ==========================================================
; ERP Azul - Instalador de Impresion Termica
; Generado con Inno Setup
; ==========================================================

#define MyAppName "ERP Azul - Impresion"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ERP Azul"
#define MyAppExeName "ERP-Imprimir.exe"
#define MyAppURL "http://localhost:17777"

[Setup]
AppId={{E8B3F1A2-7C4D-4E5F-9A1B-2D3C4E5F6A7B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ERP-Imprimir
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=ERP-Azul-Printer-Setup
; Si tenes un icono personalizado, descomenta la siguiente linea y coloca icon.ico en installer/
; SetupIconFile=icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.WelcomeLabel1=Instalador de Impresion Termica
spanish.WelcomeLabel2=Este asistente instalara el servidor de impresion termica para ERP Azul.%n%nPermite imprimir tickets directamente en la impresora termica USB sin usar el navegador.%n%nSe recomienda cerrar todas las aplicaciones antes de continuar.
spanish.FinishedHeadingLabel=Instalacion completa
spanish.FinishedLabel=El servidor de impresion se instalo correctamente.%n%nAhora abri el ERP > Configuracion > Impresora termica para elegir tu impresora y hacer una prueba.

[Files]
; El ejecutable compilado con pkg
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Config inicial (solo si no existe, para no pisar config del usuario)
Source: "config-default.json"; DestDir: "{app}"; DestName: "config.json"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"

[Registry]
; Inicio automatico con Windows (HKLM para todos los usuarios)
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "ERP-Imprimir"; \
  ValueData: """{app}\{#MyAppExeName}"""; \
  Flags: uninsdeletevalue

[Run]
; Iniciar el servidor al terminar la instalacion
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar servidor de impresion"; \
  Flags: nowait postinstall skipifsilent runhidden

[UninstallRun]
; Detener el proceso antes de desinstalar
Filename: "taskkill"; Parameters: "/F /IM {#MyAppExeName}"; \
  Flags: runhidden; RunOnceId: "KillPrintServer"

[UninstallDelete]
; Limpiar config y logs que el exe pueda haber creado
Type: files; Name: "{app}\config.json"
Type: dirifempty; Name: "{app}"

[Code]
// Detener instancia anterior antes de instalar/actualizar
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    Exec('taskkill', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

// Verificar si ya hay una instancia corriendo al iniciar el instalador
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
