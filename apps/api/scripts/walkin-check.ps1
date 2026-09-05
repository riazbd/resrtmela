$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }
$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$lun = ($rooms | Where-Object { $_.name -eq "Lunaria" }).id
$walk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=@($lun); checkIn=(Today 3); checkOut=(Today 4); adults=2; guest=@{ fullName="local" }
} | ConvertTo-Json -Compress -Depth 5)
Write-Host ("walk-in " + $walk.code + " guest=" + $walk.guest.fullName + " phone='" + $walk.guest.phone + "' due=" + $walk.due)
