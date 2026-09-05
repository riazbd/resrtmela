# ResortHub R2 E2E - F&B charge-to-room appears in Day Sheet due; expenses
# cashbook totals; metrics split room vs F&B. PS 5.1 ASCII.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]

# 1) booking: Lunaria tonight, 1 night, no advance
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$lun = ($rooms | Where-Object { $_.name -eq "Lunaria" }).id
$bk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{ resortId=$rid; roomIds=@($lun); checkIn=(Today 0); checkOut=(Today 1); adults=2; guest=@{ fullName="Fnb Probe"; phone="01855-777888" } } | ConvertTo-Json -Compress -Depth 5)
$due0 = $bk.due
Write-Host ("1. " + $bk.code + " room due=" + $due0 + " (Lunaria 7500)")

# 2) F&B ticket charged to room: 2x Lunch = 600, 200 cash at counter
$bill = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/fb/bills" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); bookingId=$bk.id; items=@(@{ name="Lunch"; qty=2; unitPrice=300 }); paidAmount=200; method="CASH" } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("2. " + $bill.code + " total=" + $bill.total + " paid=" + $bill.paid + " due=" + $bill.due + " room=" + $bill.roomId)

# 3) THE EXIT CRITERION: Day Sheet due includes the F&B charge (net 400)
$ds = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/day-sheet`?date=$(Today 0)" -Headers $M
$cell = ($ds.rooms | Where-Object { $_.name -eq "Lunaria" }).cell
Write-Host ("3. Day Sheet due=" + $cell.due + " (expect " + ($due0 + 400) + ") - F&B visible on the register")
if ([math]::Abs($cell.due - ($due0 + 400)) -ge 1) { Write-Host "   FAIL" } else { Write-Host "   PASS" }

# 4) collect the remaining 400 on the bill -> booking due returns to 7500
Invoke-RestMethod -Method Post "$BASE/fb/bills/$($bill.id)/pay" -ContentType "application/json" -Headers $M -Body '{"amount":400}' | Out-Null
$ds2 = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/day-sheet`?date=$(Today 0)" -Headers $M
$cell2 = ($ds2.rooms | Where-Object { $_.name -eq "Lunaria" }).cell
Write-Host ("4. after collecting F&B: Day Sheet due=" + $cell2.due + " (expect $due0)")if ([math]::Abs($cell2.due - $due0) -ge 1) { Write-Host "   FAIL" } else { Write-Host "   PASS" }

# 5) in-house picker shows the booking
$ih = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/fb/in-house" -Headers $M
Write-Host ("5. in-house: " + (($ih | ForEach-Object { $_.guestName + "@" + ($_.rooms -join "/") }) -join " | "))

# 6) expenses cashbook: 600 + 100 today -> day total 700
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); category="সবজি"; amount=600 } | ConvertTo-Json -Compress) | Out-Null
Invoke-RestMethod -Method Post "$BASE/resorts/$rid/expenses" -ContentType "application/json" -Headers $M -Body (@{ date=(Today 0); category="নাস্তা"; amount=100 } | ConvertTo-Json -Compress) | Out-Null
$exp = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/expenses`?from=$(Today 0)&to=$(Today 1)" -Headers $M
Write-Host ("6. day total=" + $exp.total + " (expect 700) byDay=" + $exp.byDay[0].amount)
$cats = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/expenses/categories" -Headers $M
Write-Host ("6b. autocomplete: " + (($cats | ForEach-Object { $_.category + "(" + $_.uses + ")" }) -join ", "))

# 7) metrics split: roomRevenue excludes F&B, restaurantRevenue includes it
$mx = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/metrics`?from=$(Today 0)&to=$(Today 1)" -Headers $M
Write-Host ("7. metrics: roomRev=" + $mx.resortRevenue + " (expect 7500) fbRev=" + $mx.restaurantRevenue + " (expect 600) net=" + $mx.netProfit + " (expect " + (7500 + 600 - 700) + ")")

# 8) bill charged to a room cannot be deleted
try { Invoke-RestMethod -Method Delete "$BASE/fb/bills/$($bill.id)" -Headers $M | Out-Null; Write-Host "8. FAIL deleted a room-charged bill" }
catch { Write-Host ("8. delete blocked: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

Write-Host ""
Write-Host "R2 SMOKE COMPLETE"
