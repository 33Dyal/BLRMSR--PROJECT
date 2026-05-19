// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TitleDeed — Rongai Blockchain Land Registry
/// @notice Records immutable title deed and transfer certificate hashes on-chain.
///
///         How it works:
///         1. Registry Officer fills in deed details in the browser
///         2. Browser computes keccak256(deedId + parcelId + owner + timestamp)
///         3. Only the hash is sent to the blockchain via issueDeed()
///         4. The printable PDF is generated locally — no personal data stored on-chain
///         5. Anyone can verify a deed by calling verifyDeed(deedId, hash)
///
///         Access model:
///         - owner (deployer)   : add/remove registry officers
///         - registryOfficer    : issue deeds
///         - anyone             : view and verify deeds (read-only)
///
///         Governing law: Land Registration Act, Cap 300 (Kenya)

contract TitleDeed is Ownable {

    // ── Deed Types ────────────────────────────────────────────────
    /// @dev 0 = TitleDeed (initial ownership), 1 = TransferCertificate (after transfer)
    enum DeedType { TitleDeed, TransferCertificate }

    // ── Deed Record ───────────────────────────────────────────────
    struct DeedRecord {
        string   deedId;          // e.g. "DEED-RONGAI-2026-001" — follows county registry format
        string   parcelId;        // Linked parcel ID e.g. "RONGAI/001/2026"
        string   linkedTxId;      // Transfer ID for certificates; "" for initial deeds
        address  owner;           // Owner wallet at time of deed issuance
        bytes32  documentHash;    // keccak256 of deed details computed in browser
        DeedType deedType;        // TitleDeed or TransferCertificate
        uint256  issuedAt;        // Block timestamp of issuance
        address  issuedBy;        // Registry Officer who issued the deed
        bool     exists;          // Duplicate guard
    }

    // ── Officer Registry ──────────────────────────────────────────
    mapping(address => bool) private _officers;
    address[] private _officerList;

    // ── Storage ───────────────────────────────────────────────────
    mapping(string  => DeedRecord) private _deeds;        // deedId   → record
    mapping(string  => string[])   private _parcelDeeds;  // parcelId → deedIds[]
    mapping(address => string[])   private _ownerDeeds;   // owner    → deedIds[]

    string[] private _allDeedIds;

    // ── Events ────────────────────────────────────────────────────
    event DeedIssued(
        string   indexed deedId,
        string   indexed parcelId,
        address  indexed owner,
        bytes32  documentHash,
        DeedType deedType,
        address  issuedBy
    );
    event OfficerAdded(address indexed officer);
    event OfficerRemoved(address indexed officer);

    // ── Modifiers ─────────────────────────────────────────────────
    modifier onlyOfficer() {
        require(
            _officers[msg.sender] || msg.sender == owner(),
            "TitleDeed: caller is not a Registry Officer"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        // Deployer is automatically the first officer
        _officers[msg.sender] = true;
        _officerList.push(msg.sender);
        emit OfficerAdded(msg.sender);
    }

    // ══════════════════════════════════════════════════════════════
    // OFFICER MANAGEMENT  (owner only)
    // ══════════════════════════════════════════════════════════════

    /// @notice Whitelist a wallet as a Registry Officer
    /// @param officer Wallet address to grant officer role
    function addOfficer(address officer) external onlyOwner {
        require(officer != address(0), "Invalid officer address");
        require(!_officers[officer],   "Already an officer");
        _officers[officer] = true;
        _officerList.push(officer);
        emit OfficerAdded(officer);
    }

    /// @notice Remove a Registry Officer's access
    /// @param officer Wallet address to revoke
    function removeOfficer(address officer) external onlyOwner {
        require(officer != owner(), "Cannot remove deployer");
        require(_officers[officer], "Not an officer");
        _officers[officer] = false;
        emit OfficerRemoved(officer);
    }

    /// @notice Check if a wallet is a Registry Officer
    function isOfficer(address wallet) external view returns (bool) {
        return _officers[wallet];
    }

    /// @notice Get list of all officers ever added
    function getOfficers() external view returns (address[] memory) {
        return _officerList;
    }

    // ══════════════════════════════════════════════════════════════
    // ISSUE DEED  (officers only)
    // ══════════════════════════════════════════════════════════════

    /// @notice Records a deed hash permanently on-chain.
    ///         The documentHash must be computed in the browser BEFORE calling this.
    ///         Formula: keccak256(abi.encodePacked(deedId, parcelId, owner, timestamp))
    ///
    /// @param deedId       Unique deed identifier following county registry format
    ///                     e.g. "DEED-RONGAI-2026-001"
    /// @param parcelId     Land parcel this deed belongs to e.g. "RONGAI/001/2026"
    /// @param linkedTxId   Transfer ID if this is a TransferCertificate; "" for initial deeds
    /// @param owner        Owner wallet address at time of issuance
    /// @param documentHash keccak256 hash of deed details — computed in browser, never raw data
    /// @param deedType     0 = TitleDeed (initial), 1 = TransferCertificate (after transfer)
    function issueDeed(
        string   memory deedId,
        string   memory parcelId,
        string   memory linkedTxId,
        address  owner,
        bytes32  documentHash,
        DeedType deedType
    ) external onlyOfficer {
        require(bytes(deedId).length   > 0,   "Deed ID cannot be empty");
        require(bytes(parcelId).length > 0,   "Parcel ID cannot be empty");
        require(!_deeds[deedId].exists,        "Deed ID already exists");
        require(owner != address(0),           "Invalid owner address");
        require(documentHash != bytes32(0),    "Invalid document hash");

        // Enforce: TransferCertificate must have a linked transfer ID
        if (deedType == DeedType.TransferCertificate) {
            require(bytes(linkedTxId).length > 0, "Transfer Certificate must have a linked Transfer ID");
        }

        _deeds[deedId] = DeedRecord({
            deedId:       deedId,
            parcelId:     parcelId,
            linkedTxId:   linkedTxId,
            owner:        owner,
            documentHash: documentHash,
            deedType:     deedType,
            issuedAt:     block.timestamp,
            issuedBy:     msg.sender,
            exists:       true
        });

        _parcelDeeds[parcelId].push(deedId);
        _ownerDeeds[owner].push(deedId);
        _allDeedIds.push(deedId);

        emit DeedIssued(deedId, parcelId, owner, documentHash, deedType, msg.sender);
    }

    // ══════════════════════════════════════════════════════════════
    // VERIFY DEED  (public)
    // ══════════════════════════════════════════════════════════════

    /// @notice Verifies a deed by checking its hash matches the on-chain record.
    ///         Use this to prove a printed deed has not been tampered with.
    /// @param deedId       The deed to verify
    /// @param documentHash The hash to check — recompute from deed details to verify
    /// @return true if the hash matches the on-chain record
    function verifyDeed(
        string memory deedId,
        bytes32 documentHash
    ) external view returns (bool) {
        if (!_deeds[deedId].exists) return false;
        return _deeds[deedId].documentHash == documentHash;
    }

    // ══════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS  (public read-only)
    // ══════════════════════════════════════════════════════════════

    /// @notice Get full deed record by deed ID
    function getDeed(string memory deedId)
        external view returns (DeedRecord memory)
    {
        require(_deeds[deedId].exists, "Deed not found");
        return _deeds[deedId];
    }

    /// @notice Get all deed IDs issued for a parcel
    function getDeedsByParcel(string memory parcelId)
        external view returns (string[] memory)
    {
        return _parcelDeeds[parcelId];
    }

    /// @notice Get all deed IDs belonging to an owner wallet
    function getDeedsByOwner(address owner)
        external view returns (string[] memory)
    {
        return _ownerDeeds[owner];
    }

    /// @notice Check if a deed ID exists
    function deedExists(string memory deedId) external view returns (bool) {
        return _deeds[deedId].exists;
    }

    /// @notice Total number of deeds ever issued
    function totalDeeds() external view returns (uint256) {
        return _allDeedIds.length;
    }

    /// @notice Get all deed IDs ever issued (use with caution on large registries)
    function getAllDeedIds() external view returns (string[] memory) {
        return _allDeedIds;
    }
}
