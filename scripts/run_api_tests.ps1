$ErrorActionPreference = "Stop"

$baseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8000" }
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$user = @{
    email = "schemathesis-$stamp@example.com"
    username = "schemathesis-$stamp"
    password = "TestPassword123!"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/auth/register" -ContentType "application/json" -Body $user | Out-Null
$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/auth/login" -ContentType "application/x-www-form-urlencoded" -Body @{
    username = "schemathesis-$stamp@example.com"
    password = "TestPassword123!"
}

$env:PYTHONIOENCODING = "utf-8"
& "$PSScriptRoot\..\.venv\Scripts\schemathesis.exe" run `
    "$baseUrl/openapi.json" `
    --url $baseUrl `
    --header "Authorization: Bearer $($login.access_token)"
exit $LASTEXITCODE