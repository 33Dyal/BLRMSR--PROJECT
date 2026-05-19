import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const StampDutyModule = buildModule("StampDutyModule", (m) => {
  const stampDuty = m.contract("StampDutyPayment");
  return { stampDuty };
});

export default StampDutyModule;