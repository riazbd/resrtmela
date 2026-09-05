# ResortHub R3 E2E - tour groups, walk-in fast path, collector report.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]

# 1) group: 3 rooms, one guest, advance per room (Kaktaruya pattern)
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$three = @(
  ($rooms | Where-Object { $_.name -eq "Lunaria" }).id,
  ($rooms | Where-Object { $_.name -eq "Snow Drop" }).id,
  ($rooms | Where-Object { $_.name -eq "Margarita" }).id
)
$grp = Invoke-RestMethod -Method Post "$BASE/bookings/group" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=$three; checkIn=(Today 1); checkOut=(Today 3); adults=4
  guest=@{ fullName="Kaktaruya Tour"; phone="01711-444555" }
  advancePerRoom=1000; remarks="school trip"
} | ConvertTo-Json -Compress -Depth 5)
Write-Host ("1. group " + $grp.groupTag + ": " + $grp.count + " bookings (" + (($grp.bookings | ForEach-Object { $_.code }) -join ", ") + ")")

# 2) one guest record shared (no duplicates)
$guests = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/guests?search=Kaktaruya" -Headers $M
Write-Host ("2. guest rows for Kaktaruya: " + @($guests).Count + " (expect 1)")

# 3) group filter returns exactly the 3
$list = Invoke-RestMethod -Method Get "$BASE/bookings?resortId=$rid&group=$($grp.groupTag)" -Headers $M
Write-Host ("3. group filter: " + $list.total + " rows (expect 3)")

# 4) day-sheet for tomorrow shows the group in all 3 cells
$ds = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/day-sheet`?date=$(Today 1)" -Headers $M
$grpCells = ($ds.rooms | Where-Object { $_.cell.guestName -eq "Kaktaruya Tour" })
Write-Host ("4. day-sheet group cells: " + @($grpCells).Count + " (expect 3), due=" + (($grpCells | ForEach-Object { $_.cell.due }) -join ","))

# 5) walk-in fast path: no phone, name local
$walk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=@(($rooms | Where-Object { $_.name -eq "Camellia" }).id)
  checkIn=(Today 0); checkOut=(Today 1); adults=2; guest=@{ fullName="local" }
} | ConvertTo-Json -Compress -Depth 5)
Write-Host ("5. walk-in " + $walk.code + " guest=" + $walk.guest.fullName + " phone='" + $walk.guest.phone + "'")

# 6) collector report: 3 advances x 1000 under manager
$rep = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/reports/collectors" -Headers $M
$top = $rep.rows | Select-Object -First 1
Write-Host ("6. collectors: " + (($rep.rows | ForEach-Object { $_.name + "=" + $_.advances + "x" + $_.total }) -join " | ") + " (expect manager 3x3000)")

# 7) conflict: overlapping group on same room rejected
try {
  Invoke-RestMethod -Method Post "$BASE/bookings/group" -ContentType "application/json" -Headers $M -Body (@{
    resortId=$rid; roomIds=$three; checkIn=(Today 2); checkOut=(Today 3); adults=2; guest=@{ fullName="Clash" }
  } | ConvertTo-Json -Compress -Depth 5) | Out-Null
  Write-Host "7. FAIL: overlapping group accepted"
} catch { Write-Host ("7. overlap rejected: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

Write-Host ""
Write-Host "R3 SMOKE COMPLETE"
