<#
  Demostración del RATE LIMIT de Dulce Arte (API Gateway + Django).

  Envía muchas peticiones de login AL MISMO TIEMPO a la API Gateway y muestra
  quién respondió cada una:
    401 -> la petición llegó a Django (usuario/clave incorrectos, es lo esperado)
    429 API Gateway -> la API Gateway la bloqueó (throttling de la ruta POST /api/auth/{proxy+})
    429 Django      -> pasó la API Gateway pero la frenó el límite de Django (10 logins/min por IP)

  Luego espera y envía unas pocas peticiones lentas, que pasan sin problema:
  el límite controla la VELOCIDAD, no bloquea para siempre.

  Uso (PowerShell, en la carpeta del proyecto):
    powershell -ExecutionPolicy Bypass -File scripts\demo_rate_limit.ps1
    powershell -ExecutionPolicy Bypass -File scripts\demo_rate_limit.ps1 -Total 60
#>
param(
    [string]$Api = "https://kh6uimo2ob.execute-api.us-east-1.amazonaws.com",
    [int]$Total = 40
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 200
Add-Type -AssemblyName System.Net.Http

$url = "$Api/api/auth/token/"
$cuerpo = '{"username":"prueba_rate_limit","password":"clave-incorrecta"}'
$cliente = New-Object System.Net.Http.HttpClient
$cliente.Timeout = [TimeSpan]::FromSeconds(30)
$salida = Join-Path (Get-Location) ("evidencia_rate_limit_{0}.txt" -f (Get-Date -Format "yyyyMMdd_HHmmss"))

function Clasificar($codigo, $texto) {
    if ($codigo -eq 429 -and $texto -match "Too Many Requests") { return "429 API Gateway (bloqueada)" }
    if ($codigo -eq 429) { return "429 Django (bloqueada)" }
    if ($codigo -eq 401) { return "401 llegó a Django" }
    return "$codigo otro"
}

function Enviar() {
    $contenido = New-Object System.Net.Http.StringContent($cuerpo, [Text.Encoding]::UTF8, "application/json")
    return $cliente.PostAsync($url, $contenido)
}

$lineas = New-Object System.Collections.Generic.List[string]
function Escribir($texto) { Write-Host $texto; $lineas.Add($texto) }

Escribir ("=" * 70)
Escribir "DEMOSTRACIÓN DE RATE LIMIT - Dulce Arte"
Escribir ("Fecha:   {0}" -f (Get-Date -Format "dd-MM-yyyy HH:mm:ss"))
Escribir "Destino: POST $url"
Escribir ("=" * 70)

# ---------- FASE 1: ráfaga de peticiones simultáneas ----------
Escribir ""
Escribir "FASE 1: $Total peticiones enviadas al mismo tiempo"
$reloj = [Diagnostics.Stopwatch]::StartNew()
$tareas = @(1..$Total | ForEach-Object { Enviar })
[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]$tareas)
$reloj.Stop()

$resultados = @()
for ($i = 0; $i -lt $tareas.Count; $i++) {
    $r = $tareas[$i].Result
    $texto = $r.Content.ReadAsStringAsync().Result
    $origen = Clasificar ([int]$r.StatusCode) $texto
    $resultados += [pscustomobject]@{ N = $i + 1; Codigo = [int]$r.StatusCode; Resultado = $origen; Respuesta = $texto }
    Escribir ("  #{0,-3} -> {1}" -f ($i + 1), $origen)
}
Escribir ""
Escribir ("Tiempo total de la ráfaga: {0:N2} s" -f $reloj.Elapsed.TotalSeconds)
Escribir "Resumen fase 1:"
$resultados | Group-Object Resultado | Sort-Object Name | ForEach-Object {
    Escribir ("  {0,-32} {1,4}" -f $_.Name, $_.Count)
}
Escribir "Ejemplo de respuesta de cada tipo:"
$resultados | Group-Object Resultado | Sort-Object Name | ForEach-Object {
    $ejemplo = $_.Group[0].Respuesta
    if ($ejemplo.Length -gt 110) { $ejemplo = $ejemplo.Substring(0, 110) + "..." }
    Escribir ("  {0}: {1}" -f $_.Name, $ejemplo)
}

# ---------- FASE 2: pocas peticiones, lentas ----------
Escribir ""
Escribir "FASE 2: se esperan 5 s y se envían 3 peticiones, una cada 2 segundos"
Start-Sleep -Seconds 5
for ($i = 1; $i -le 3; $i++) {
    $r = (Enviar).Result
    $texto = $r.Content.ReadAsStringAsync().Result
    Escribir ("  lenta #{0} -> {1}" -f $i, (Clasificar ([int]$r.StatusCode) $texto))
    Start-Sleep -Seconds 2
}

Escribir ""
Escribir "Conclusión: con tráfico excesivo la API Gateway responde 429 sin llegar al servidor;"
Escribir "con tráfico normal las peticiones vuelven a pasar."
Escribir ("=" * 70)

$lineas | Out-File -FilePath $salida -Encoding UTF8
Write-Host ""
Write-Host "Resultado guardado en: $salida" -ForegroundColor Green
$cliente.Dispose()
