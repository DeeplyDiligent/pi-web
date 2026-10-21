$ErrorActionPreference = 'Stop'

$installDir = Join-Path $PSScriptRoot '.pi-web'
$server = Join-Path $installDir 'node_modules/.bin/pi-web-server.cmd'

$url = $null
try {
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.UseProxy = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('run-pi-web')
    $release = $client.GetStringAsync('https://api.github.com/repos/DeeplyDiligent/pi-web/releases/latest').GetAwaiter().GetResult() |
      ConvertFrom-Json
  }
  finally {
    $client.Dispose()
    $handler.Dispose()
  }

  $url = $release.assets |
    Where-Object name -like '*.tgz' |
    Select-Object -First 1 -ExpandProperty browser_download_url
  if (-not $url) { throw 'No .tgz asset found in the latest pi-web release' }
}
catch {
  if (Test-Path $server) {
    Write-Warning "Could not check for the latest pi-web release ($($_.Exception.Message)); using cached install at $installDir"
    $url = $null
  }
  else {
    throw
  }
}

if ($url) {
  $registry = [uri]'https://registry.npmjs.org/'
  $systemProxy = [System.Net.WebRequest]::GetSystemWebProxy()
  $proxy = $systemProxy.GetProxy($registry)
  if ($systemProxy.IsBypassed($registry) -or $proxy.Host -notlike '*.prismaaccess.com') {
    throw "Expected a Prisma proxy for $registry, got $proxy"
  }

  $proxyVars = @('HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY',
    'NPM_CONFIG_PROXY', 'NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_NOPROXY')
  $previous = @{}
  foreach ($name in $proxyVars) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }

  try {
    $env:HTTPS_PROXY = $proxy.AbsoluteUri
    $env:HTTP_PROXY = $proxy.AbsoluteUri
    $env:ALL_PROXY = $proxy.AbsoluteUri
    $env:NO_PROXY = 'github.com,githubusercontent.com'
    $env:NODE_USE_ENV_PROXY = '1'
    npm install --prefix "$installDir" --no-save --package-lock=false --no-audit --no-fund `
      --proxy="$proxy" --https-proxy="$proxy" --noproxy="$env:NO_PROXY" `
      -- "$url" '@earendil-works/pi-codemode@1.1.0'
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit code $LASTEXITCODE)" }
  }
  finally {
    foreach ($name in $proxyVars) {
      [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
  }
}

if (-not (Test-Path $server)) { throw "pi-web-server not found at $server" }
& $server
if ($LASTEXITCODE -ne 0) { throw "pi-web-server failed (exit code $LASTEXITCODE)" }
 
