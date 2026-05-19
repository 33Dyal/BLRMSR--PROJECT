// scripts/setup-after-deploy.js
// ─────────────────────────────────────────────────────────────
// Rongai Blockchain Land Registry — Post-Deploy Setup Script
//
// Run this AFTER deploying to any network:
//   npx hardhat run scripts/setup-after-deploy.js --network localhost
//   npx hardhat run scripts/setup-after-deploy.js --network sepolia
//
// What it does:
//   1. Reads deployed addresses from Hardhat Ignition output
//   2. Adds the deployer as an officer on all 3 contracts
//   3. Verifies the LandRegistry link on LandTransferContract
//   4. Saves all addresses to frontend/.env automatically
// ─────────────────────────────────────────────────────────────
import hre from "hardhat";
import fs  from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const network   = hre.network.name;
  const chainId   = network === "sepolia" ? "11155111" : "31337";
  const [deployer] = await hre.ethers.getSigners();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  Rongai BLRMS — Post-Deploy Setup");
  console.log(`  Network : ${network} (chain ${chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log("══════════════════════════════════════════════════\n");

  // ── Step 1: Read deployed addresses ──────────────────────────
  const deployedPath = path.join(
    __dirname, "..", "ignition", "deployments",
    `chain-${chainId}`, "deployed_addresses.json"
  );

  if (!fs.existsSync(deployedPath)) {
    console.error(`❌ deployed_addresses.json not found at:\n   ${deployedPath}`);
    console.error("   → Run deployment first:");
    console.error(`   npx hardhat ignition deploy ./ignition/modules/DeployAll.js --network ${network}`);
    process.exit(1);
  }

  const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));
  console.log("📄 Deployed addresses loaded:\n", deployed, "\n");

  const addresses = {
    LandParcel:           deployed["DeployAllModule#LandParcel"],
    LandRegistry:         deployed["DeployAllModule#LandRegistry"],
    LandTransferContract: deployed["DeployAllModule#LandTransferContract"],
    StampDutyPayment:     deployed["DeployAllModule#StampDutyPayment"],
    LandholderIdentity:   deployed["DeployAllModule#LandholderIdentity"],
    TitleDeed:            deployed["DeployAllModule#TitleDeed"],
  };

  // ── Step 2: Verify LandRegistry link ─────────────────────────
  console.log("🔗 Verifying LandRegistry link on LandTransferContract…");
  const LT = await hre.ethers.getContractAt(
    "LandTransferContract", addresses.LandTransferContract
  );
  try {
    const linked = await LT.getLandRegistryAddress();
    if (linked.toLowerCase() === addresses.LandRegistry.toLowerCase()) {
      console.log(`   ✅ LandRegistry correctly linked: ${linked}\n`);
    } else {
      console.log(`   ⚠ Mismatch — linked to ${linked}, expected ${addresses.LandRegistry}`);
      console.log("   → Calling setLandRegistry…");
      const tx = await LT.setLandRegistry(addresses.LandRegistry);
      await tx.wait();
      console.log("   ✅ LandRegistry linked successfully.\n");
    }
  } catch {
    console.log("   → getLandRegistryAddress not available — calling setLandRegistry…");
    const tx = await LT.setLandRegistry(addresses.LandRegistry);
    await tx.wait();
    console.log("   ✅ LandRegistry linked.\n");
  }

  // ── Step 3: Add deployer as officer on all 3 contracts ────────
  console.log("🏛️  Adding deployer as Registry Officer on all contracts…");

  const officerContracts = [
    { name: "TitleDeed",          address: addresses.TitleDeed          },
    { name: "LandTransferContract", address: addresses.LandTransferContract },
    { name: "LandholderIdentity", address: addresses.LandholderIdentity },
  ];

  for (const { name, address } of officerContracts) {
    try {
      const contract = await hre.ethers.getContractAt(name, address);
      const isOfficer = await contract.isOfficer(deployer.address);
      if (isOfficer) {
        console.log(`   ✅ ${name}: deployer already an officer — skipping.`);
      } else {
        const tx = await contract.addOfficer(deployer.address);
        await tx.wait();
        console.log(`   ✅ ${name}: deployer added as officer.`);
      }
    } catch (err) {
      console.log(`   ⚠ ${name}: ${err.reason || err.message}`);
    }
  }

  // ── Step 4: Save addresses to frontend/.env ───────────────────
  console.log("\n💾 Saving addresses to frontend/.env…");

  const envPath = path.join(__dirname, "..", "frontend", ".env");

  let envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8")
    : "";

  // Update or append each VITE_ address variable
  const replacements = {
    VITE_LAND_PARCEL:          addresses.LandParcel,
    VITE_LAND_REGISTRY:        addresses.LandRegistry,
    VITE_LAND_TRANSFER:        addresses.LandTransferContract,
    VITE_LANDHOLDER_IDENTITY:  addresses.LandholderIdentity,
    VITE_STAMP_DUTY:           addresses.StampDutyPayment,
    VITE_TITLE_DEED:           addresses.TitleDeed,
    VITE_NETWORK:              network,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent, "utf-8");
  console.log("   ✅ frontend/.env updated.\n");

  // ── Step 5: Print summary ─────────────────────────────────────
  console.log("══════════════════════════════════════════════════");
  console.log("  ✅ POST-DEPLOY SETUP COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.table(addresses);

  if (network === "sepolia") {
    console.log("\n🌐 View your contracts on Sepolia Etherscan:");
    for (const [name, addr] of Object.entries(addresses)) {
      console.log(`   ${name}: https://sepolia.etherscan.io/address/${addr}`);
    }
  }

  console.log("\n📋 Next steps:");
  console.log("   1. Restart Vite:  cd frontend && npm run dev");
  console.log("   2. Switch MetaMask to", network === "sepolia" ? "Sepolia testnet" : "Hardhat localhost");
  console.log("   3. Log in as Registry Officer and test all tabs.\n");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exitCode = 1;
});