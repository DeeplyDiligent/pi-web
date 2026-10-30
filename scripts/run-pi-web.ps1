param(
  [switch]$InstallOnly
)

$ErrorActionPreference = 'Stop'

$installDir = Join-Path $PSScriptRoot '.pi-web'
$server = Join-Path $installDir 'node_modules\.bin\pi-web-server.cmd'
$packageJson = Join-Path $installDir 'node_modules\@agegr\pi-web\package.json'
$releaseCache = Join-Path $installDir 'installed-release-url.txt'
$hasCachedInstall = (Test-Path $server) -and (Test-Path $releaseCache)

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  throw 'Node.js and npm are required. Install Node.js 22.19 or newer, then reopen PowerShell and run this script again.'
}
$nodeVersion = & $node.Source --version
if ($LASTEXITCODE -ne 0 -or [version]($nodeVersion -replace '^v', '') -lt [version]'22.19.0') {
  throw "Node.js 22.19 or newer is required; found $nodeVersion."
}

$proxyUrl = $null
foreach ($name in @('NPM_CONFIG_HTTPS_PROXY', 'HTTPS_PROXY', 'NPM_CONFIG_PROXY', 'HTTP_PROXY', 'ALL_PROXY')) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ($value) {
    $proxyUrl = $value
    break
  }
}
$systemProxy = [System.Net.WebRequest]::GetSystemWebProxy()
if ($proxyUrl) {
  $downloadProxy = New-Object System.Net.WebProxy($proxyUrl)
}
else {
  $downloadProxy = $systemProxy
  $registry = [uri]'https://registry.npmjs.org/'
  if (-not $systemProxy.IsBypassed($registry)) {
    $proxyUrl = $systemProxy.GetProxy($registry).AbsoluteUri
  }
}

$url = $null
try {
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.Proxy = $downloadProxy
  $handler.DefaultProxyCredentials = [System.Net.CredentialCache]::DefaultCredentials
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    $client.Timeout = [TimeSpan]::FromSeconds(30)
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

  if ($hasCachedInstall) {
    $installedVersion = $null
    if (Test-Path $packageJson) {
      try {
        $installedVersion = (Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version
      }
      catch {
        Write-Warning 'Could not read the installed pi-web version; checking the cached release URL instead.'
      }
    }
    $cachedUrl = if (Test-Path $releaseCache) {
      (Get-Content -LiteralPath $releaseCache -Raw).Trim()
    }
    $releaseVersion = $release.tag_name -replace '^v', ''
    if ($cachedUrl -eq $url -and (-not $installedVersion -or $installedVersion -eq $releaseVersion)) {
      Write-Host "Using cached pi-web install at $installDir (release $($release.tag_name))"
      $url = $null
    }
  }
}
catch {
  if ($hasCachedInstall) {
    Write-Warning "Could not check for the latest pi-web release ($($_.Exception.Message)); using cached install at $installDir"
    $url = $null
  }
  else {
    throw
  }
}

$runtimeVars = @('NODE_USE_SYSTEM_CA', 'NODE_USE_ENV_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY')
$previous = @{}
foreach ($name in $runtimeVars) {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  if (-not $env:NODE_USE_SYSTEM_CA) {
    $env:NODE_USE_SYSTEM_CA = '1'
  }
  if (-not $env:NODE_USE_ENV_PROXY) {
    $env:NODE_USE_ENV_PROXY = '1'
  }
  if ($proxyUrl) {
    if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = $proxyUrl }
    if (-not $env:HTTP_PROXY) { $env:HTTP_PROXY = $proxyUrl }
  }
  $env:NO_PROXY = (@($env:NO_PROXY, 'localhost', '127.0.0.1', '::1') |
    Where-Object { $_ }) -join ','

  if ($url) {
    Write-Host "Installing pi-web release $($release.tag_name)..."
    if (Test-Path $releaseCache) {
      Remove-Item -LiteralPath $releaseCache
    }
    $proxyArgs = @()
    if ($proxyUrl) {
      $proxyArgs = @("--proxy=$proxyUrl", "--https-proxy=$proxyUrl")
    }
    # Extract first so the SDK's hardcoded NuGet feeds can be updated before its install script runs.
    & $npm.Source install --prefix "$installDir" --ignore-scripts --no-save --package-lock=false --no-audit --no-fund `
      @proxyArgs -- "$url"
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed (exit code $LASTEXITCODE)"
    }

    $foundryInstaller = Join-Path $installDir 'node_modules\foundry-local-sdk\script\install-utils.cjs'
    if (Test-Path $foundryInstaller) {
      $installerSource = [System.IO.File]::ReadAllText($foundryInstaller)
      $nugetProxy = 'https://packagefeedproxy.microsoft.io/nuget/v3/index.json'
      if (-not $installerSource.Contains("'$nugetProxy'")) {
        $primaryFeed = "'https://api.nuget.org/v3/index.json',"
        if (-not $installerSource.Contains($primaryFeed)) {
          throw 'Foundry SDK feed configuration has changed; cannot safely add the NuGet proxy fallback.'
        }
        $installerSource = $installerSource.Replace($primaryFeed, "$primaryFeed`n    '$nugetProxy',")
        [System.IO.File]::WriteAllText($foundryInstaller, $installerSource, (New-Object System.Text.UTF8Encoding($false)))
      }
      Write-Host "Foundry NuGet fallback: $nugetProxy"
    }

    & $npm.Source rebuild --prefix "$installDir" --foreground-scripts @proxyArgs
    if ($LASTEXITCODE -ne 0) {
      throw "npm rebuild failed (exit code $LASTEXITCODE)"
    }
    if (-not (Test-Path $server)) { throw "pi-web-server not found at $server" }
    Set-Content -LiteralPath $releaseCache -Value $url -Encoding UTF8
  }

  if (-not (Test-Path $server)) { throw "pi-web-server not found at $server" }
  if ($InstallOnly) { return }
  & $server
  if ($LASTEXITCODE -ne 0) { throw "pi-web-server failed (exit code $LASTEXITCODE)" }
}
finally {
  foreach ($name in $runtimeVars) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
 
