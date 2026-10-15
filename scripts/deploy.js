// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// Rongai Blockchain Land Registry — Main Deployment Script
// Kajiado County, Kenya
//
// Deploys contracts in this order (dependencies first):
//   1. LandParcel          (no dependencies)
//   2. LandRegistry        (no dependencies)
//   3. LandholderIdentity  (no dependencies)
//   4. StampDutyPayment    (no dependencies)
//   5. TitleDeed           (depends on LandRegistry)
//   6. LandTransferContract(depends on LandRegistry + TitleDeed)
//
// Usage:
//   npx hardhat run scripts/deploy.js --network localhost
//   npx hardhat run scripts/deploy.js --network sepolia
// ─────────────────────────────────────────────────────────────────────────────

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  // ── Pre-flight checks ────────────────────────────────────────────────────
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceETH = hre.ethers.formatEther(balance);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Rongai Blockchain Land Registry — Deployment Script        ║");
  console.log("║   Kajiado County, Kenya                                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`📡 Network:          ${network}`);
  console.log(`👤 Deployer:         ${deployer.address}`);
  console.log(`💰 Balance:          ${balanceETH} ETH`);
  console.log("────────────────────────────────────────────────────────────────\n");

  // Warn if balance is too low
  if (parseFloat(balanceETH) < 0.05) {
    console.error("❌ ERROR: Balance too low. Need at least 0.05 ETH to deploy.");
    process.exit(1);
  }

  const addresses = {};

  // ── 1. Deploy LandParcel ─────────────────────────────────────────────────
  console.log("📦 [1/6] Deploying LandParcel...");
  try {
    const LandParcel = await hre.ethers.getContractFactory("LandParcel");
    const landParcel = await LandParcel.deploy();
    await landParcel.waitForDeployment();
    addresses.LandParcel = await landParcel.getAddress();
    console.log(`   ✅ LandParcel deployed to: ${addresses.LandParcel}\n`);
  } catch (err) {
    console.error(`   ❌ LandParcel failed: ${err.message}`);
    process.exit(1);
  }

  // ── 2. Deploy LandRegistry ───────────────────────────────────────────────
  console.log("📦 [2/6] Deploying LandRegistry...");
  try {
    const LandRegistry = await hre.ethers.getContractFactory("LandRegistry");
    const landRegistry = await LandRegistry.deploy();
    await landRegistry.waitForDeployment();
    addresses.LandRegistry = await landRegistry.getAddress();
    console.log(`   ✅ LandRegistry deployed to: ${addresses.LandRegistry}\n`);
  } catch (err) {
    console.error(`   ❌ LandRegistry failed: ${err.message}`);
    process.exit(1);
  }

  // ── 3. Deploy LandholderIdentity ─────────────────────────────────────────
  console.log("📦 [3/6] Deploying LandholderIdentity...");
  try {
    const LandholderIdentity = await hre.ethers.getContractFactory("LandholderIdentity");
    const landholderIdentity = await LandholderIdentity.deploy();
    await landholderIdentity.waitForDeployment();
    addresses.LandholderIdentity = await landholderIdentity.getAddress();
    console.log(`   ✅ LandholderIdentity deployed to: ${addresses.LandholderIdentity}\n`);
  } catch (err) {
    console.error(`   ❌ LandholderIdentity failed: ${err.message}`);
    process.exit(1);
  }

  // ── 4. Deploy StampDutyPayment ───────────────────────────────────────────
  console.log("📦 [4/6] Deploying StampDutyPayment...");
  try {
    const StampDutyPayment = await hre.ethers.getContractFactory("StampDutyPayment");
    const stampDutyPayment = await StampDutyPayment.deploy();
    await stampDutyPayment.waitForDeployment();
    addresses.StampDutyPayment = await stampDutyPayment.getAddress();
    console.log(`   ✅ StampDutyPayment deployed to: ${addresses.StampDutyPayment}\n`);
  } catch (err) {
    console.error(`   ❌ StampDutyPayment failed: ${err.message}`);
    process.exit(1);
  }

  // ── 5. Deploy TitleDeed ──────────────────────────────────────────────────
  console.log("📦 [5/6] Deploying TitleDeed...");
  try {
    const TitleDeed = await hre.ethers.getContractFactory("TitleDeed");
    const titleDeed = await TitleDeed.deploy(addresses.LandRegistry);
    await titleDeed.waitForDeployment();
    addresses.TitleDeed = await titleDeed.getAddress();
    console.log(`   ✅ TitleDeed deployed to: ${addresses.TitleDeed}\n`);
  } catch (err) {
    // Try deploying without constructor args if it fails
    console.log(`   ⚠ TitleDeed with LandRegistry arg failed, trying no-arg deploy...`);
    try {
      const TitleDeed = await hre.ethers.getContractFactory("TitleDeed");
      const titleDeed = await TitleDeed.deploy();
      await titleDeed.waitForDeployment();
      addresses.TitleDeed = await titleDeed.getAddress();
      console.log(`   ✅ TitleDeed deployed to: ${addresses.TitleDeed}\n`);
    } catch (err2) {
      console.error(`   ❌ TitleDeed failed: ${err2.message}`);
      process.exit(1);
    }
  }

  // ── 6. Deploy LandTransferContract ──────────────────────────────────────
  console.log("📦 [6/6] Deploying LandTransferContract...");
  try {
    const LandTransferContract = await hre.ethers.getContractFactory("LandTransferContract");
    const landTransferContract = await LandTransferContract.deploy(
      addresses.LandRegistry,
      addresses.TitleDeed
    );
    await landTransferContract.waitForDeployment();
    addresses.LandTransferContract = await landTransferContract.getAddress();
    console.log(`   ✅ LandTransferContract deployed to: ${addresses.LandTransferContract}\n`);
  } catch (err) {
    // Try with only LandRegistry if two-arg deploy fails
    console.log(`   ⚠ LandTransferContract with two args failed, trying one-arg deploy...`);
    try {
      const LandTransferContract = await hre.ethers.getContractFactory("LandTransferContract");
      const landTransferContract = await LandTransferContract.deploy(addresses.LandRegistry);
      await landTransferContract.waitForDeployment();
      addresses.LandTransferContract = await landTransferContract.getAddress();
      console.log(`   ✅ LandTransferContract deployed to: ${addresses.LandTransferContract}\n`);
    } catch (err2) {
      // Try no-arg deploy as final fallback
      console.log(`   ⚠ One-arg failed, trying no-arg deploy...`);
      try {
        const LandTransferContract = await hre.ethers.getContractFactory("LandTransferContract");
        const landTransferContract = await LandTransferContract.deploy();
        await landTransferContract.waitForDeployment();
        addresses.LandTransferContract = await landTransferContract.getAddress();
        console.log(`   ✅ LandTransferContract deployed to: ${addresses.LandTransferContract}\n`);
      } catch (err3) {
        console.error(`   ❌ LandTransferContract failed: ${err3.message}`);
        process.exit(1);
      }
    }
  }

  // ── Save addresses to JSON file ──────────────────────────────────────────
  console.log("💾 Saving deployed addresses...");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network,
    chainId: network === "sepolia" ? 11155111 : 31337,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    addresses,
  };

  const jsonPath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(deploymentData, null, 2));
  console.log(`   ✅ Saved to: deployments/${network}.json\n`);

  // ── Update frontend/.env ─────────────────────────────────────────────────
  console.log("🔄 Updating frontend/.env...");

  const envPath = path.join(__dirname, "..", "frontend", ".env");
  let envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8")
    : "";

  const replacements = {
    VITE_LAND_PARCEL:         addresses.LandParcel,
    VITE_LAND_REGISTRY:       addresses.LandRegistry,
    VITE_LAND_TRANSFER:       addresses.LandTransferContract,
    VITE_LANDHOLDER_IDENTITY: addresses.LandholderIdentity,
    VITE_STAMP_DUTY:          addresses.StampDutyPayment,
    VITE_TITLE_DEED:          addresses.TitleDeed,
    VITE_NETWORK:             network,
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
  console.log("   ✅ frontend/.env updated with new contract addresses.\n");

  // ── Print final summary ──────────────────────────────────────────────────
  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  const spent = parseFloat(balanceETH) - parseFloat(hre.ethers.formatEther(finalBalance));

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              ✅ DEPLOYMENT COMPLETE                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("📋 Deployed Contract Addresses:");
  console.log("────────────────────────────────────────────────────────────────");
  for (const [name, address] of Object.entries(addresses)) {
    console.log(`   ${name.padEnd(25)} ${address}`);
  }
  console.log("────────────────────────────────────────────────────────────────");
  console.log(`   ETH spent on deployment:  ~${spent.toFixed(6)} ETH`);
  console.log(`   Remaining balance:         ${hre.ethers.formatEther(finalBalance)} ETH`);

  if (network === "sepolia") {
    console.log("\n🔍 Verify your contracts on Etherscan:");
    for (const [name, address] of Object.entries(addresses)) {
      console.log(`   ${name}: https://sepolia.etherscan.io/address/${address}`);
    }
    console.log("\n▶ Next step — run post-deploy setup:");
    console.log("   npx hardhat run scripts/setup-after-deploy.js --network sepolia\n");
  } else {
    console.log("\n▶ Next step — run post-deploy setup:");
    console.log("   npx hardhat run scripts/setup-after-deploy.js --network localhost\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:");
    console.error(err);
    process.exit(1);
  });