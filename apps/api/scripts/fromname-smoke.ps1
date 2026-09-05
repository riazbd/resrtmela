$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$lun = ($rooms | Where-Object { $_.name -eq "Lunaria" }).id

$bk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=@($lun); checkIn=(Today 5); checkOut=(Today 6); adults=2
  guest=@{ fullName="From Name Probe"; phone="01833-222111"; email="probe@example.com" }
} | ConvertTo-Json -Compress -Depth 5)
Write-Host ("1. " + $bk.code + " email=" + $bk.guest.email)

$null = Invoke-RestMethod -Method Post "$BASE/notifications/dispatch" -ContentType "application/json" -Headers $M -Body '{"sweeps":1}'
$feed = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=3" -Headers $M
$conf = $feed | Where-Object { $_.template -eq "booking_confirmed" -and $_.to -eq "probe@example.com" } | Select-Object -First 1
Write-Host ("2. channel=" + $conf.channel + " to=" + $conf.to + " fromName=" + $conf.payload.resortName + " sent=" + $conf.sent)

$inv = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/email-invoice" -Headers $M
Write-Host ("3. email-invoice to=" + $inv.to + " (resort name used as From-name at send time)")
Write-Host ""
Write-Host "FROM-NAME E2E COMPLETE"
