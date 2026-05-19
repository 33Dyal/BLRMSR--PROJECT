// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LandRegistry — Rongai Blockchain Land Registry
/// @notice Main ledger that tracks all parcels and ownership history

contract LandRegistry is Ownable {

    // ── Registry Entry ─────────────────────────────────────
    struct RegistryEntry {
        string  parcelId;           // e.g. "KJD/RNG/0042/2026"
        string  titleDeedNumber;    // e.g. "KAJIADO/RONGAI/0042"
        string  lrNumber;           // Land Reference Number
        address currentOwner;       // Current owner wallet address
        string  ownerDID;           // Decentralized Identity ID
        string  landUse;            // Residential / Agricultural / Commercial
        uint256 areaSquareMeters;   // Area in square metres
        uint256 landValueKES;       // Assessed value in KES
        bool    isActive;           // Active status
        uint256 registeredAt;       // Registration timestamp
        uint256 lastUpdatedAt;      // Last update timestamp
    }

    // ── Ownership History ──────────────────────────────────
    struct OwnershipRecord {
        address owner;
        string  ownerDID;
        uint256 fromTimestamp;
        uint256 toTimestamp;
        string  transferTxId;
    }

    // ── Storage ────────────────────────────────────────────
    mapping(string => RegistryEntry)          private _registry;         // parcelId → entry
    mapping(string => bool)                   private _parcelRegistered; // parcelId → exists
    mapping(string => OwnershipRecord[])      private _ownershipHistory; // parcelId → history
    mapping(address => string[])              private _ownerParcels;     // owner → parcelIds

    string[] private _allParcelIds;

    // ── Events ─────────────────────────────────────────────
    event ParcelAdded(string indexed parcelId, address indexed owner, string titleDeedNumber);
    event OwnershipTransferred(string indexed parcelId, address indexed from, address indexed to, string txId);
    event ParcelValueUpdated(string indexed parcelId, uint256 newValueKES);
    event ParcelDeactivated(string indexed parcelId);

    // ── Constructor ────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ── Register a New Parcel ──────────────────────────────
    /// @notice Adds a new parcel to the land registry ledger
    function addParcel(
        string memory parcelId,
        string memory titleDeedNumber,
        string memory lrNumber,
        address owner,
        string memory ownerDID,
        string memory landUse,
        uint256 areaSquareMeters,
        uint256 landValueKES
    ) external onlyOwner {
        require(!_parcelRegistered[parcelId],  "Parcel already registered");
        require(owner != address(0),           "Invalid owner address");
        require(areaSquareMeters > 0,          "Area must be greater than zero");

        _registry[parcelId] = RegistryEntry({
            parcelId:         parcelId,
            titleDeedNumber:  titleDeedNumber,
            lrNumber:         lrNumber,
            currentOwner:     owner,
            ownerDID:         ownerDID,
            landUse:          landUse,
            areaSquareMeters: areaSquareMeters,
            landValueKES:     landValueKES,
            isActive:         true,
            registeredAt:     block.timestamp,
            lastUpdatedAt:    block.timestamp
        });

        _parcelRegistered[parcelId] = true;
        _allParcelIds.push(parcelId);
        _ownerParcels[owner].push(parcelId);

        // Record initial ownership
        _ownershipHistory[parcelId].push(OwnershipRecord({
            owner:         owner,
            ownerDID:      ownerDID,
            fromTimestamp: block.timestamp,
            toTimestamp:   0,
            transferTxId:  "INITIAL_REGISTRATION"
        }));

        emit ParcelAdded(parcelId, owner, titleDeedNumber);
    }

    // ── Transfer Ownership on Registry ────────────────────
    /// @notice Updates the registry when a land transfer is completed
    function transferOwnership(
        string memory parcelId,
        address newOwner,
        string memory newOwnerDID,
        string memory transferTxId
    ) external onlyOwner {
        require(_parcelRegistered[parcelId], "Parcel not found in registry");
        require(newOwner != address(0),      "Invalid new owner address");

        RegistryEntry storage entry = _registry[parcelId];
        require(entry.isActive, "Parcel is not active");

        // Close previous ownership record
        uint256 historyLen = _ownershipHistory[parcelId].length;
        if (historyLen > 0) {
            _ownershipHistory[parcelId][historyLen - 1].toTimestamp = block.timestamp;
        }

        address previousOwner = entry.currentOwner;

        // Update registry
        entry.currentOwner  = newOwner;
        entry.ownerDID      = newOwnerDID;
        entry.lastUpdatedAt = block.timestamp;

        // Add new ownership record
        _ownershipHistory[parcelId].push(OwnershipRecord({
            owner:         newOwner,
            ownerDID:      newOwnerDID,
            fromTimestamp: block.timestamp,
            toTimestamp:   0,
            transferTxId:  transferTxId
        }));

        _ownerParcels[newOwner].push(parcelId);

        emit OwnershipTransferred(parcelId, previousOwner, newOwner, transferTxId);
    }

    // ── Update Land Value ──────────────────────────────────
    function updateLandValue(string memory parcelId, uint256 newValueKES)
        external onlyOwner
    {
        require(_parcelRegistered[parcelId], "Parcel not found");
        _registry[parcelId].landValueKES  = newValueKES;
        _registry[parcelId].lastUpdatedAt = block.timestamp;
        emit ParcelValueUpdated(parcelId, newValueKES);
    }

    // ── Deactivate Parcel ──────────────────────────────────
    function deactivateParcel(string memory parcelId) external onlyOwner {
        require(_parcelRegistered[parcelId],  "Parcel not found");
        require(_registry[parcelId].isActive, "Parcel already inactive");
        _registry[parcelId].isActive = false;
        emit ParcelDeactivated(parcelId);
    }

    // ── View Functions ─────────────────────────────────────
    function getParcel(string memory parcelId)
        external view returns (RegistryEntry memory)
    {
        require(_parcelRegistered[parcelId], "Parcel not found");
        return _registry[parcelId];
    }

    function getOwnershipHistory(string memory parcelId)
        external view returns (OwnershipRecord[] memory)
    {
        require(_parcelRegistered[parcelId], "Parcel not found");
        return _ownershipHistory[parcelId];
    }

    function getParcelsByOwner(address owner)
        external view returns (string[] memory)
    {
        return _ownerParcels[owner];
    }

    function totalParcels() external view returns (uint256) {
        return _allParcelIds.length;
    }

    function isParcelRegistered(string memory parcelId)
        external view returns (bool)
    {
        return _parcelRegistered[parcelId];
    }
}
