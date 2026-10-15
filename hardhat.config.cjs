require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.24",
        settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY}`] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: false,
  },
};
