// ignition/modules/DeployAll.js
// ─────────────────────────────────────────────────────────────
// Rongai Blockchain Land Registry — Hardhat Ignition Deploy Module
// Deploys all 6 contracts and wires LandTransferContract → LandRegistry
// ─────────────────────────────────────────────────────────────
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DeployAllModule = buildModule("DeployAllModule", (m) => {

  // ── 1. Core contracts ───────────────────────────────────────
  const landParcel           = m.contract("LandParcel");
  const landRegistry         = m.contract("LandRegistry");
  const stampDutyPayment     = m.contract("StampDutyPayment");
  const landholderIdentity   = m.contract("LandholderIdentity");
  const titleDeed            = m.contract("TitleDeed");

  // ── 2. LandTransferContract ─────────────────────────────────
  const landTransferContract = m.contract("LandTransferContract");

  // ── 3. Wire LandTransferContract → LandRegistry ─────────────
  // This replaces the manual console step:
  //   await LT.setLandRegistry("0x...")
  m.call(landTransferContract, "setLandRegistry", [landRegistry]);

  // ── 4. Return all deployed contracts ────────────────────────
  return {
    landParcel,
    landRegistry,
    landTransferContract,
    stampDutyPayment,
    landholderIdentity,
    titleDeed,
  };
});

export default DeployAllModule;