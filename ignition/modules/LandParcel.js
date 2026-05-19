// ============================================================
//  Rongai Blockchain Land Registry Management System
//  Deployment Module — LandParcel Contract
//  Hardhat Ignition Module
// ============================================================

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LandParcelModule = buildModule("LandParcelModule", (m) => {

  // Deploy the LandParcel contract
  const landParcel = m.contract("LandParcel");

  return { landParcel };
});

export default LandParcelModule;