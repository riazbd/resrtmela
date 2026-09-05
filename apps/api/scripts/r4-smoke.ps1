# ResortHub R4 E2E - full migration v2 into a fresh resort: bookings + expenses
# + F&B history, grid reconciliation via the product endpoint, P&L vs tab 12.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"

$sa = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000000","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($sa.accessToken)" }
$rid = 2
"resort: $rid (Sky Eco imported)"

$csvBookings = [IO.File]::ReadAllText("$env:TEMP\opencode\sheet_5_1425480030.csv")
$csvExpenses = [IO.File]::ReadAllText("$env:TEMP\opencode\sheet_4_1392440806.csv")
$csvFb       = [IO.File]::ReadAllText("$env:TEMP\opencode\sheet_10_2137254037.csv")
$csv7        = [IO.File]::ReadAllText("$env:TEMP\opencode\sheet_7_1744145081.csv")
$csv11       = [IO.File]::ReadAllText("$env:TEMP\opencode\sheet_11_696329374.csv")

# 1) bookings
$b = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/import/bookings" -ContentType "application/json; charset=utf-8" -Headers $M -Body (@{ csv=$csvBookings; dryRun=$false } | ConvertTo-Json -Compress)
Write-Host ("1. bookings imported=" + $b.imported + " skipped=" + $b.skipped + " oos=" + $b.outOfService)

# 2) expenses (Bangla categories) + the sheet's own Daily Total column check
$e = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/import/expenses" -ContentType "application/json; charset=utf-8" -Headers $M -Body (@{ csv=$csvExpenses } | ConvertTo-Json -Compress)
Write-Host ("2. expenses imported=" + $e.imported + " total=" + $e.total + " dailyTotalCheck=" + $e.dailyTotalCheck.compared + " compared, mismatches=" + $e.dailyTotalCheck.mismatches.Count)

# 3) F&B history with room map (Room ID 3 = Snow Drop per rooms master)
$fb = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/import/fb" -ContentType "application/json; charset=utf-8" -Headers $M -Body (@{ csv=$csvFb; roomMap=@{ "3" = "Snow Drop" } } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("3. fb bills imported=" + $fb.imported + " skipped=" + $fb.skipped + " statusMismatches=" + $fb.statusMismatches.Count)
$fb.statusMismatches | Select-Object -First 4 | ForEach-Object { "   status: " + $_.code + " sheet=" + $_.sheet + " computed=" + $_.computed }

# 4) grid reconciliation via the product endpoint
$rec = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/reconcile" -ContentType "application/json; charset=utf-8" -Headers $M -Body (@{ sheet7=$csv7; sheet11=$csv11 } | ConvertTo-Json -Compress -Depth 3)
Write-Host ("4. reconcile: dates=" + $rec.datesChecked + " checked=" + $rec.checked + " matched=" + $rec.matched + " cancelledExplained=" + $rec.cancelledExplained + " UNEXPLAINED=" + $rec.unexplainedCount)
$rec.unexplained | Select-Object -First 6 | ForEach-Object { "   DIFF " + $_.date + " " + $_.room + " " + $_.kind + " sheet=" + $_.sheet + " ours=" + $_.ours }

# 5) P&L vs tab 12 (manager's manual numbers)
$mx = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/metrics`?from=2026-08-15&to=2026-08-27" -Headers $M
Write-Host ("5. P&L Aug15-26:")
Write-Host ("   resortRevenue " + $mx.resortRevenue + "  (sheet 862000, delta " + ($mx.resortRevenue - 862000) + ")")
Write-Host ("   discount       " + $mx.discount + "  (sheet 96975, delta " + ($mx.discount - 96975) + ")")
Write-Host ("   netRoom        " + $mx.netRoomRevenue + "  (sheet 765025, delta " + ($mx.netRoomRevenue - 765025) + ")")
Write-Host ("   restaurant     " + $mx.restaurantRevenue + "  (sheet 151300, delta " + ($mx.restaurantRevenue - 151300) + ")")
Write-Host ("   expenses       " + $mx.expenses + "  (sheet 216354, delta " + ($mx.expenses - 216354) + ")")
Write-Host ("   netProfit      " + $mx.netProfit + "  (sheet 699971, delta " + ($mx.netProfit - 699971) + ")")

Write-Host ""
Write-Host "R4 SMOKE COMPLETE"
