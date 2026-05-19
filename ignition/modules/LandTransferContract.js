import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LandTransferModule = buildModule("LandTransferModule", (m) => {
  const landTransfer = m.contract("LandTransferContract");
  return { landTransfer };
});

export default LandTransferModule;