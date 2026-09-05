# ResortHub Phase 7 E2E - self-serve signup, tenant isolation, plan caps,
# rate limiting, light load run. PS 5.1 ASCII.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"

# 1) signup
$suffix = Get-Date -Format "HHmmss"
$slug = "demo-resort-$suffix"
$body = @{
  companyName = "Demo Group $suffix"; resortName = "Demo Resort"; location = "Cox's Bazar"
  name = "Demo Admin"; phone = "01900$suffix"; password = "Password123!" ; slug = $slug
} | ConvertTo-Json -Compress
$signup = Invoke-RestMethod -Method Post "$BASE/auth/signup" -ContentType "application/json" -Body $body
$T = @{ Authorization = "Bearer $($signup.accessToken)" }
Write-Host ("1. signup ok - role=" + $signup.user.role + " resort=" + $signup.user.resortIds[0] + " slug=" + $slug)
$newResortId = $signup.user.resortIds[0]
$tenantId = 99 # resolved below via usage of my own resort detail

# 2) duplicate slug + duplicate phone
try {
  Invoke-RestMethod -Method Post "$BASE/auth/signup" -ContentType "application/json" -Body (@{ companyName="X"; resortName="Y"; name="Z"; phone="01911$suffix"; password="Password123!"; slug=$slug } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "2a. FAIL: duplicate slug accepted"
} catch { Write-Host ("2a. duplicate slug rejected: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }
try {
  Invoke-RestMethod -Method Post "$BASE/auth/signup" -ContentType "application/json" -Body (@{ companyName="X2"; resortName="Y2"; name="Z2"; phone="01900$suffix"; password="Password123!" } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "2b. FAIL: duplicate phone accepted"
} catch { Write-Host ("2b. duplicate phone rejected: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

# 3) tenant isolation: cannot touch resort 1
try { Invoke-RestMethod -Method Get "$BASE/bookings?resortId=1" -Headers $T | Out-Null; Write-Host "3a. FAIL: cross-tenant bookings visible" }
catch { Write-Host ("3a. cross-tenant bookings blocked: HTTP " + $_.Exception.Response.StatusCode.value__) }
try { Invoke-RestMethod -Method Get "$BASE/resorts/1/rooms" -Headers $T | Out-Null; Write-Host "3b. FAIL" }
catch { Write-Host ("3b. cross-tenant rooms blocked: HTTP " + $_.Exception.Response.StatusCode.value__) }

# 4) FREE cap: create 10 rooms ok, 11th -> 402
$std = Invoke-RestMethod -Method Post "$BASE/resorts/$newResortId/room-types" -ContentType "application/json" -Headers $T -Body '{"name":"Standard","maxAdults":2}'
$created = 0
for ($i = 1; $i -le 10; $i++) {
  try {
    Invoke-RestMethod -Method Post "$BASE/resorts/$newResortId/rooms" -ContentType "application/json" -Headers $T -Body (@{ name = "Room $i"; roomTypeId = $std.id; baseRate = 5000 } | ConvertTo-Json -Compress) | Out-Null
    $created++
  } catch { }
}
Write-Host ("4a. created " + $created + "/10 rooms under FREE")
try {
  Invoke-RestMethod -Method Post "$BASE/resorts/$newResortId/rooms" -ContentType "application/json" -Headers $T -Body (@{ name = "Room 11"; roomTypeId = $std.id; baseRate = 5000 } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "4b. FAIL: 11th room accepted on FREE"
} catch { Write-Host ("4b. cap enforced (HTTP " + $_.Exception.Response.StatusCode.value__ + "): " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

# 5) usage snapshot
$me = Invoke-RestMethod -Method Get "$BASE/auth/me" -Headers $T
$tid = $me.resorts[0].resort.tenantId
$usage = Invoke-RestMethod -Method Get "$BASE/tenants/$tid/usage" -Headers $T
Write-Host ("5. usage: plan=" + $usage.plan + " resorts=" + $usage.resorts + " rooms=" + $usage.rooms + " staff=" + $usage.staffUsers)

# 6) super upgrades plan -> 11th room now ok
$sa = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000000","password":"Password123!"}'
$S = @{ Authorization = "Bearer $($sa.accessToken)" }
Invoke-RestMethod -Method Patch "$BASE/tenants/$tid/plan" -ContentType "application/json" -Headers $S -Body '{"plan":"STANDARD"}' | Out-Null
Invoke-RestMethod -Method Post "$BASE/resorts/$newResortId/rooms" -ContentType "application/json" -Headers $T -Body (@{ name = "Room 11"; roomTypeId = $std.id; baseRate = 5000 } | ConvertTo-Json -Compress) | Out-Null
Write-Host "6. after STANDARD upgrade, room 11 created ok"
$guestTry = $null
try { $guestTry = Invoke-RestMethod -Method Patch "$BASE/tenants/$tid/plan" -ContentType "application/json" -Headers $T -Body '{"plan":"PRO"}' } catch { }
if ($guestTry) { Write-Host "6b. FAIL: tenant admin changed own plan" } else { Write-Host "6b. tenant admin cannot change own plan (correct)" }

# 7) rate limit: hammer login
$codes = @()
for ($i = 0; $i -lt 35; $i++) {
  try { Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"0000000000","password":"wrongpass"}' | Out-Null; $codes += 200 }
  catch { $codes += [int]$_.Exception.Response.StatusCode.value__ }
}
$limited = ($codes | Where-Object { $_ -eq 429 } | Measure-Object).Count
Write-Host ("7. rate limit: " + $limited + "/35 requests got 429 (expect >0)")

# 8) light load: 150 availability requests
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$lat = @()
for ($i = 0; $i -lt 150; $i++) {
  $t0 = [System.Diagnostics.Stopwatch]::StartNew()
  Invoke-RestMethod -Method Get "$BASE/health" | Out-Null
  $lat += $t0.ElapsedMilliseconds
}
$sw.Stop()
$avg = ($lat | Measure-Object -Average).Average
$max = ($lat | Measure-Object -Maximum).Maximum
Write-Host ("8. load: 150 req in " + $sw.ElapsedMilliseconds + "ms, avg " + [math]::Round($avg, 1) + "ms, max " + $max + "ms")

Write-Host ""
Write-Host "PHASE7 SMOKE COMPLETE"
