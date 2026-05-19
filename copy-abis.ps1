# copy-abis.ps1 — Run after every recompile
Write-Host "Copying ABIs to frontend..." -ForegroundColor Green

Copy-Item "artifacts\contracts\core\LandParcel.sol\LandParcel.json"                       "frontend\src\contracts\abis\LandParcel.json"
Copy-Item "artifacts\contracts\core\LandRegistry.sol\LandRegistry.json"                   "frontend\src\contracts\abis\LandRegistry.json"
Copy-Item "artifacts\contracts\core\LandTransferContract.sol\LandTransferContract.json"   "frontend\src\contracts\abis\LandTransferContract.json"
Copy-Item "artifacts\contracts\core\StampDutyPayment.sol\StampDutyPayment.json"           "frontend\src\contracts\abis\StampDutyPayment.json"
Copy-Item "artifacts\contracts\core\titleDeed.sol\TitleDeed.json"                         "frontend\src\contracts\abis\TitleDeed.json"
Copy-Item "artifacts\contracts\identity\LandholderIdentity.sol\LandholderIdentity.json"   "frontend\src\contracts\abis\LandholderIdentity.json"

Write-Host "Done! All 6 ABIs copied successfully." -ForegroundColor Green
