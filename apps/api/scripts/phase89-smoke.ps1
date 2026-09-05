# ResortHub Phase 8/9 E2E - expenses, F&B bills, invoices, metrics, daily rows.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]

# 1) expenses: 600 + 100 + 300 today, 2000 yesterday
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); category="Utilities"; amount=600 } | ConvertTo-Json -Compress) | Out-Null
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); category="Supplies"; amount=100 } | ConvertTo-Json -Compress) | Out-Null
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); category="Transport"; details="CNG"; amount=300 } | ConvertTo-Json -Compress) | Out-Null
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today -1); category="Utilities"; amount=2000 } | ConvertTo-Json -Compress) | Out-Null
$exp = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/expenses" -Headers $M
Write-Host ("1. expenses total=" + $exp.total + " (expect 3000) days=" + @($exp.byDay).Count + " cats=" + @($exp.byCategory).Count)

# 2) F&B bills: walk-in fully paid + charged-to-room partial (sheet RES-00001 shape)
$b1 = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/fb/bills" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); items=@(@{ name="Lunch"; qty=2; unitPrice=300 }); paidAmount=600; method="CASH" } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("2a. " + $b1.code + " total=" + $b1.total + " status=" + $b1.status + " (expect 600 PAID)")
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$cam = ($rooms | Where-Object { $_.name -eq "Camellia" }).id
$b2 = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/fb/bills" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); items=@(@{ name="Lunch"; qty=2; unitPrice=300 }); paidAmount=200; method="CASH"; roomId=$cam } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("2b. " + $b2.code + " total=" + $b2.total + " paid=" + $b2.paid + " due=" + $b2.due + " status=" + $b2.status + " (expect PARTIAL, due 400)")

# 3) collect the rest
$b2 = Invoke-RestMethod -Method Post "$BASE/fb/bills/$($b2.id)/pay" -ContentType "application/json" -Headers $M -Body '{"amount":400}'
Write-Host ("3. after collection status=" + $b2.status + " (expect PAID)")
# overpay blocked
try { Invoke-RestMethod -Method Post "$BASE/fb/bills/$($b2.id)/pay" -ContentType "application/json" -Headers $M -Body '{"amount":100}' | Out-Null; Write-Host "3b. FAIL overpay" }
catch { Write-Host ("3b. overpay blocked: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

# 4) invoice generation on a booking (seeded BK-00001)
$bookings = Invoke-RestMethod -Method Get "$BASE/bookings?resortId=$rid&state=CONFIRMED" -Headers $M
$bid = $bookings.rows[0].id
$inv = Invoke-RestMethod -Method Post "$BASE/bookings/$bid/invoice" -Headers $M
Write-Host ("4. invoice " + $inv.invoiceNo + " (expect SER-00001) total=" + $inv.rent + " due=" + $inv.due + " checkin=" + $inv.resort.checkInTime)

# 5) metrics (sheet tab 12 shape)
$mx = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/metrics" -Headers $M
Write-Host ("5. metrics: roomRev=" + $mx.resortRevenue + " disc=" + $mx.discount + " netRoom=" + $mx.netRoomRevenue + " fb=" + $mx.restaurantRevenue + " gross=" + $mx.grossIncome + " exp=" + $mx.expenses + " net=" + $mx.netProfit)

# 6) daily rows
$dl = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/reports/daily`?from=$(Today -1)&to=$(Today 1)" -Headers $M
$dl | ForEach-Object { "   " + $_.date + " room=" + $_.roomRevenue + " fb=" + $_.fbRevenue + " exp=" + $_.expenses + " net=" + $_.net }

# 7) agent blocked from expense creation
$ag = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000002","password":"Password123!"}'
$A = @{ Authorization = "Bearer $($ag.accessToken)" }
try { Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $A -Body (@{ date=(Today 0); category="X"; amount=5 } | ConvertTo-Json -Compress) | Out-Null; Write-Host "7. FAIL agent created expense" }
catch { Write-Host ("7. agent expense blocked: HTTP " + $_.Exception.Response.StatusCode.value__) }

Write-Host ""
Write-Host "PHASE8/9 SMOKE COMPLETE"
