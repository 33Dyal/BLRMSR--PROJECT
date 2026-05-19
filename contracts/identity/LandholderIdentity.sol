// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LandholderIdentity – Rongai Blockchain Land Registry
/// @notice Stores hashed identity credentials for landholders.
///         Raw PII (ID numbers, names) is NEVER stored on-chain –
///         only a keccak256 hash of (nationalId + fullName + walletAddress).
///
/// @dev    Access model:
///         - owner (deployer)     : add/remove registry officers
///         - registryOfficer      : register, verify, revoke identities
///         - anyone               : read-only view functions

contract LandholderIdentity is Ownable {

    // ── Identity Record ───────────────────────────────────────────────────
    struct Identity {
        address wallet;           // Landholder wallet address
        string  did;              // Decentralized ID  e.g. "did:rongai:0x..."
        bytes32 identityHash;     // keccak256(nationalId + fullName + wallet)
        string  idType;           // "National ID" | "Passport" | "Alien Card"
        bool    isVerified;       // Verified by registry officer
        bool    exists;           // Record exists guard
        uint256 registeredAt;     // Timestamp
        uint256 verifiedAt;       // Timestamp of verification
        address verifiedBy;       // Officer who verified
    }

    // ── Storage ───────────────────────────────────────────────────────────
    mapping(address => Identity) private _identities;    // wallet → identity
    mapping(bytes32 => address)  private _hashToWallet;  // hash   → wallet
    mapping(string  => address)  private _didToWallet;   // DID    → wallet
    mapping(address => bool)     private _isOfficer;     // officer whitelist

    address[] private _allHolders;
    address[] private _allOfficers;

    // ── Events ────────────────────────────────────────────────────────────
    event IdentityRegistered(address indexed wallet, string did, bytes32 identityHash);
    event IdentityVerified(address indexed wallet, address indexed officer, uint256 timestamp);
    event IdentityRevoked(address indexed wallet, string reason);
    event OfficerAdded(address indexed officer);
    event OfficerRemoved(address indexed officer);

    // ── Modifiers ─────────────────────────────────────────────────────────
    modifier onlyOfficer() {
        require(
            _isOfficer[msg.sender] || msg.sender == owner(),
            "LandholderIdentity: caller is not a registry officer"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        // Deployer is automatically the first officer
        _isOfficer[msg.sender] = true;
        _allOfficers.push(msg.sender);
        emit OfficerAdded(msg.sender);
    }

    // ── Officer Management (owner only) ───────────────────────────────────

    /// @notice Grant registry officer role to a wallet
    function addOfficer(address officer) external onlyOwner {
        require(officer != address(0), "Invalid address");
        require(!_isOfficer[officer], "Already an officer");
        _isOfficer[officer] = true;
        _allOfficers.push(officer);
        emit OfficerAdded(officer);
    }

    /// @notice Revoke registry officer role from a wallet
    function removeOfficer(address officer) external onlyOwner {
        require(_isOfficer[officer], "Not an officer");
        _isOfficer[officer] = false;
        emit OfficerRemoved(officer);
    }

    /// @notice Check if a wallet is a registry officer
    function isOfficer(address wallet) external view returns (bool) {
        return _isOfficer[wallet];
    }

    /// @notice Get all officers ever added
    function getAllOfficers() external view returns (address[] memory) {
        return _allOfficers;
    }

    // ── Register Identity (officer only) ──────────────────────────────────
    /// @notice Officer registers a landholder's hashed identity on-chain.
    /// @param wallet       The landholder's wallet address
    /// @param did          Decentralized identity string
    /// @param identityHash keccak256 hash computed OFF-CHAIN before calling
    /// @param idType       Document type used for identification
    function registerIdentity(
        address wallet,
        string  memory did,
        bytes32 identityHash,
        string  memory idType
    ) external onlyOfficer {
        require(wallet != address(0),                      "Invalid wallet address");
        require(!_identities[wallet].exists,               "Identity already registered");
        require(_hashToWallet[identityHash] == address(0), "Identity hash already registered");
        require(_didToWallet[did] == address(0),           "DID already registered");
        require(identityHash != bytes32(0),                "Invalid identity hash");

        _identities[wallet] = Identity({
            wallet:       wallet,
            did:          did,
            identityHash: identityHash,
            idType:       idType,
            isVerified:   false,
            exists:       true,
            registeredAt: block.timestamp,
            verifiedAt:   0,
            verifiedBy:   address(0)
        });

        _hashToWallet[identityHash] = wallet;
        _didToWallet[did]           = wallet;
        _allHolders.push(wallet);

        emit IdentityRegistered(wallet, did, identityHash);
    }

    // ── Verify Identity (officer only) ────────────────────────────────────
    /// @notice Registry officer marks an identity as verified.
    function verifyIdentity(address wallet) external onlyOfficer {
        require(_identities[wallet].exists,      "Identity not found");
        require(!_identities[wallet].isVerified, "Already verified");

        _identities[wallet].isVerified = true;
        _identities[wallet].verifiedAt = block.timestamp;
        _identities[wallet].verifiedBy = msg.sender;

        emit IdentityVerified(wallet, msg.sender, block.timestamp);
    }

    // ── Revoke Identity (officer only) ────────────────────────────────────
    /// @notice Revokes a verified identity (fraud / court order).
    function revokeIdentity(address wallet, string memory reason) external onlyOfficer {
        require(_identities[wallet].exists,     "Identity not found");
        require(_identities[wallet].isVerified, "Identity not verified");

        _identities[wallet].isVerified = false;
        emit IdentityRevoked(wallet, reason);
    }

    // ── Verify Hash — public proof check ──────────────────────────────────
    /// @notice Verifies that a given hash matches the registered identity.
    function verifyIdentityHash(
        address wallet,
        bytes32 hashToCheck
    ) external view returns (bool) {
        if (!_identities[wallet].exists)     return false;
        if (!_identities[wallet].isVerified) return false;
        return _identities[wallet].identityHash == hashToCheck;
    }

    // ── View Functions (public) ───────────────────────────────────────────
    function getIdentity(address wallet)
        external view returns (Identity memory)
    {
        require(_identities[wallet].exists, "Identity not found");
        return _identities[wallet];
    }

    function isVerified(address wallet) external view returns (bool) {
        return _identities[wallet].exists && _identities[wallet].isVerified;
    }

    function getWalletByDID(string memory did)
        external view returns (address)
    {
        return _didToWallet[did];
    }

    function totalHolders() external view returns (uint256) {
        return _allHolders.length;
    }

    function getAllHolders() external view returns (address[] memory) {
        return _allHolders;
    }
}
