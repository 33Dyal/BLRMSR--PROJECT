import { ethers } from "ethers";

/**
 * Computes keccak256(nationalId + fullName + walletAddress)
 * using the same encoding as Solidity's abi.encodePacked.
 *
 * @param {string} nationalId     e.g. "12345678"
 * @param {string} fullName       e.g. "John Kamau Mwangi"
 * @param {string} walletAddress  e.g. "0xABC..."
 * @returns {string} bytes32 hex string ready to pass to the contract
 */
export function computeIdentityHash(nationalId, fullName, walletAddress) {
  const normalized = {
    nationalId:    nationalId.trim().toUpperCase(),
    fullName:      fullName.trim().toUpperCase(),
    walletAddress: ethers.getAddress(walletAddress), // checksum
  };

  return ethers.solidityPackedKeccak256(
    ["string", "string", "address"],
    [normalized.nationalId, normalized.fullName, normalized.walletAddress]
  );
}

/**
 * Generates a DID string from a wallet address.
 * Format: did:rongai:<checksumAddress>
 *
 * @param {string} walletAddress
 * @returns {string} e.g. "did:rongai:0xAbC..."
 */
export function generateDID(walletAddress) {
  return `did:rongai:${ethers.getAddress(walletAddress)}`;
}