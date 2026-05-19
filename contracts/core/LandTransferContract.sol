// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LandTransferContract — Rongai Blockchain Land Registry
/// @notice Manages land ownership transfers with officer approval workflow.
///         Landholders initiate transfers; Registry Officers approve or reject.
///         Ownership is verified on-chain against LandRegistry before transfer.

/// @dev Minimal interface to verify parcel ownership from LandRegistry
interface ILandRegistry {
    struct RegistryEntry {
        string  parcelId;
        string  titleDeedNumber;
        string  lrNumber;
        address currentOwner;
        string  ownerDID;
        string  landUse;
        uint256 areaSquareMeters;
        uint256 landValueKES;
        bool    isActive;
        uint256 registeredAt;
        uint256 lastUpdatedAt;
    }
    function getParcel(string memory parcelId) external view returns (RegistryEntry memory);
    function isParcelRegistered(string memory parcelId) external view returns (bool);
}

contract LandTransferContract is Ownable, ReentrancyGuard {

    // ── Transfer Status ───────────────────────────────────────────
    enum Status { Pending, UnderReview, Approved, Rejected, Completed }

    // ── Transfer Record ───────────────────────────────────────────
    struct TransferRecord {
        string  transferId;
        string  parcelId;
        address seller;
        address buyer;
        string  sellerDID;
        string  buyerDID;
        uint256 agreedPriceKES;
        string  transferType;
        string  ipfsDocHash;
        Status  status;
        uint256 requestTimestamp;
        uint256 actionTimestamp;
        address actionedBy;
        bool    exists;
    }

    // ── Officer Registry ──────────────────────────────────────────
    mapping(address => bool) private _officers;
    address[] private _officerList;

    // ── LandRegistry reference ────────────────────────────────────
    address private _landRegistryAddress;

    // ── Storage ───────────────────────────────────────────────────
    mapping(string  => TransferRecord) private _transfers;
    mapping(string  => string[])       private _parcelTxns;
    mapping(address => string[])       private _sellerTxns;
    mapping(address => string[])       private _buyerTxns;
    string[]  private _allTransferIds;
    uint256   private _totalTransfers;

    // ── Events ────────────────────────────────────────────────────
    event TransferInitiated(
        string  indexed transferId,
        string  indexed parcelId,
        address indexed seller,
        address buyer,
        uint256 agreedPriceKES,
        string  transferType
    );
    event TransferStatusUpdated(string indexed transferId, Status newStatus, address actionedBy);
    event OfficerAdded(address indexed officer);
    event OfficerRemoved(address indexed officer);
    event LandRegistrySet(address indexed registryAddress);

    // ── Modifiers ─────────────────────────────────────────────────
    modifier onlyOfficer() {
        require(
            _officers[msg.sender] || msg.sender == owner(),
            "LandTransfer: caller is not a Registry Officer"
        );
        _;
    }

    modifier transferMustExist(string memory transferId) {
        require(_transfers[transferId].exists, "Transfer not found");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        _officers[msg.sender] = true;
        _officerList.push(msg.sender);
        emit OfficerAdded(msg.sender);
    }

    // ── Link LandRegistry (Owner only) ───────────────────────────
    /// @notice Set the LandRegistry contract address for ownership verification
    function setLandRegistry(address registryAddress) external onlyOwner {
        require(registryAddress != address(0), "Invalid registry address");
        _landRegistryAddress = registryAddress;
        emit LandRegistrySet(registryAddress);
    }

    function getLandRegistryAddress() external view returns (address) {
        return _landRegistryAddress;
    }

    // ── Officer Management ────────────────────────────────────────
    function addOfficer(address officer) external onlyOwner {
        require(officer != address(0), "Invalid officer address");
        require(!_officers[officer],   "Already an officer");
        _officers[officer] = true;
        _officerList.push(officer);
        emit OfficerAdded(officer);
    }

    function removeOfficer(address officer) external onlyOwner {
        require(officer != owner(), "Cannot remove deployer");
        require(_officers[officer], "Not an officer");
        _officers[officer] = false;
        emit OfficerRemoved(officer);
    }

    function isOfficer(address wallet) external view returns (bool) {
        return _officers[wallet];
    }

    function getOfficers() external view returns (address[] memory) {
        return _officerList;
    }

    // ══════════════════════════════════════════════════════════════
    // INITIATE TRANSFER — with 3-layer ownership verification
    // ══════════════════════════════════════════════════════════════
    /// @notice A landholder initiates a transfer of their parcel.
    ///
    ///         Three on-chain checks enforced automatically:
    ///         ① msg.sender must equal the seller address
    ///         ② Parcel must exist and be active in LandRegistry
    ///         ③ Seller must be the current owner in LandRegistry
    function initiateTransfer(
        string  memory transferId,
        string  memory parcelId,
        address seller,
        address buyer,
        string  memory sellerDID,
        string  memory buyerDID,
        uint256 agreedPriceKES,
        string  memory transferType,
        string  memory ipfsDocHash
    ) external nonReentrant {

        // ── Basic validations ──────────────────────────────────────
        require(!_transfers[transferId].exists, "Transfer ID already exists");
        require(bytes(transferId).length  > 0,  "Transfer ID cannot be empty");
        require(bytes(parcelId).length    > 0,  "Parcel ID cannot be empty");
        require(buyer  != address(0),           "Invalid buyer address");
        require(seller != buyer,                "Seller and buyer cannot be the same");

        // ── Check ①: Caller must be the seller ────────────────────
        require(
            msg.sender == seller,
            "Only the seller can initiate their own transfer"
        );

        // ── Checks ② & ③: Verify ownership in LandRegistry ───────
        if (_landRegistryAddress != address(0)) {
            ILandRegistry registry = ILandRegistry(_landRegistryAddress);

            require(
                registry.isParcelRegistered(parcelId),
                "Parcel not found in Land Registry. Register the parcel before initiating a transfer."
            );

            ILandRegistry.RegistryEntry memory entry = registry.getParcel(parcelId);

            require(
                entry.isActive,
                "Parcel is not active in the Land Registry."
            );

            require(
                entry.currentOwner == seller,
                "Ownership verification failed: your wallet is not the registered owner of this parcel."
            );
        }

        // ── Store the transfer record ──────────────────────────────
        _transfers[transferId] = TransferRecord({
            transferId:       transferId,
            parcelId:         parcelId,
            seller:           seller,
            buyer:            buyer,
            sellerDID:        sellerDID,
            buyerDID:         buyerDID,
            agreedPriceKES:   agreedPriceKES,
            transferType:     transferType,
            ipfsDocHash:      ipfsDocHash,
            status:           Status.Pending,
            requestTimestamp: block.timestamp,
            actionTimestamp:  0,
            actionedBy:       address(0),
            exists:           true
        });

        _parcelTxns[parcelId].push(transferId);
        _sellerTxns[seller].push(transferId);
        _buyerTxns[buyer].push(transferId);
        _allTransferIds.push(transferId);
        _totalTransfers++;

        emit TransferInitiated(
            transferId, parcelId, seller, buyer, agreedPriceKES, transferType
        );
    }

    // ── Officer Actions ───────────────────────────────────────────

    function setUnderReview(string memory transferId)
        external onlyOfficer transferMustExist(transferId)
    {
        require(
            _transfers[transferId].status == Status.Pending,
            "Transfer must be Pending to set Under Review"
        );
        _transfers[transferId].status         = Status.UnderReview;
        _transfers[transferId].actionTimestamp = block.timestamp;
        _transfers[transferId].actionedBy      = msg.sender;
        emit TransferStatusUpdated(transferId, Status.UnderReview, msg.sender);
    }

    function approveTransfer(string memory transferId)
        external onlyOfficer transferMustExist(transferId) nonReentrant
    {
        Status current = _transfers[transferId].status;
        require(
            current == Status.Pending || current == Status.UnderReview,
            "Transfer must be Pending or Under Review to approve"
        );
        _transfers[transferId].status         = Status.Completed;
        _transfers[transferId].actionTimestamp = block.timestamp;
        _transfers[transferId].actionedBy      = msg.sender;
        emit TransferStatusUpdated(transferId, Status.Completed, msg.sender);
    }

    function rejectTransfer(string memory transferId)
        external onlyOfficer transferMustExist(transferId)
    {
        Status current = _transfers[transferId].status;
        require(
            current == Status.Pending || current == Status.UnderReview,
            "Transfer must be Pending or Under Review to reject"
        );
        _transfers[transferId].status         = Status.Rejected;
        _transfers[transferId].actionTimestamp = block.timestamp;
        _transfers[transferId].actionedBy      = msg.sender;
        emit TransferStatusUpdated(transferId, Status.Rejected, msg.sender);
    }

    // ── View Functions ────────────────────────────────────────────
    function getTransfer(string memory transferId)
        external view returns (TransferRecord memory)
    {
        require(_transfers[transferId].exists, "Transfer not found");
        return _transfers[transferId];
    }

    function getTransfersByParcel(string memory parcelId)
        external view returns (string[] memory)
    {
        return _parcelTxns[parcelId];
    }

    function getTransfersBySeller(address seller)
        external view returns (string[] memory)
    {
        return _sellerTxns[seller];
    }

    function getTransfersByBuyer(address buyer)
        external view returns (string[] memory)
    {
        return _buyerTxns[buyer];
    }

    function totalTransfers() external view returns (uint256) {
        return _totalTransfers;
    }

    function transferExistsCheck(string memory transferId)
        external view returns (bool)
    {
        return _transfers[transferId].exists;
    }
}
