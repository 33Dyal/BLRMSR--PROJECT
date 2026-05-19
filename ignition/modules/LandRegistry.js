import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LandRegistryModule = buildModule("LandRegistryModule", (m) => {
  const landRegistry = m.contract("LandRegistry");
  return { landRegistry };
});

export default LandRegistryModule;