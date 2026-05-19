// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StampDutyPayment — Rongai Blockchain Land Registry
/// @notice Handles stamp duty calculation, escrow and KRA remittance
/// @dev Implements Kenya Stamp Duty Act rates: 2% urban / 4% rural

contract StampDutyPayment is Ownable, ReentrancyGuard {

    // ── Payment Status Enum ────────────────────────────────
    enum PaymentStatus {
        Pending,
        Processing,
        Confirmed,
        Failed,
        Refunded
    }

    // ── Payment Record ─────────────────────────────────────
    struct PaymentRecord {
        string        paymentId;             // e.g. "SDP-RNG-2026-00089"
        string        transferId;            // Linked transfer ID
        string        parcelId;              // Land parcel ID
        address       payer;                 // Buyer address
        uint256       transactionValueKES;   // Sale price in KES
        uint256       stampDutyRatePercent;  // 2 or 4
        uint256       stampDutyAmountKES;    // Calculated duty
        uint256       registrationFeeKES;    // Fixed registration fee
        uint256       totalFeesKES;          // Total amount due
        string        paymentMethod;         // M-Pesa / Bank / Escrow
        string        paymentReference;      // M-Pesa ref or bank ref
        string        kraConfirmationCode;   // KRA iTax confirmation
        PaymentStatus status;                // Current status
        uint256       createdAt;             // Record creation time
        uint256       confirmedAt;           // Payment confirmation time
    }

    // ── Constants (Kenya Land Act rates) ──────────────────
    uint256 public constant URBAN_RATE_PERCENT   = 2;   // 2% for urban land
    uint256 public constant RURAL_RATE_PERCENT   = 4;   // 4% for rural land
    uint256 public constant URBAN_THRESHOLD_KES  = 4_000_000; // KES 4M threshold
    uint256 public constant REGISTRATION_FEE_KES = 5_000;     // Fixed KES 5,000

    // ── Storage ────────────────────────────────────────────
    mapping(string => PaymentRecord) private _payments;     // paymentId → record
    mapping(string => bool)          private _paymentExists; // paymentId → exists
    mapping(string => string)        private _transferPayment; // transferId → paymentId

    string[] private _allPaymentIds;

    // ── Events ─────────────────────────────────────────────
    event PaymentCreated(string indexed paymentId, string indexed transferId, uint256 totalFeesKES);
    event PaymentConfirmed(string indexed paymentId, string kraConfirmationCode);
    event PaymentRefunded(string indexed paymentId, address indexed payer);
    event PaymentFailed(string indexed paymentId, string reason);

    // ── Constructor ────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ── Calculate Stamp Duty ───────────────────────────────
    /// @notice Calculates stamp duty based on Kenya land law
    /// @param transactionValueKES  Sale price in Kenya Shillings
    /// @param isUrban              true = urban (2%), false = rural (4%)
    /// @return stampDuty           Stamp duty amount in KES
    /// @return registrationFee     Fixed registration fee in KES
    /// @return totalFees           Total fees payable in KES
    function calculateDuty(uint256 transactionValueKES, bool isUrban)
        public pure
        returns (
            uint256 stampDuty,
            uint256 registrationFee,
            uint256 totalFees
        )
    {
        require(transactionValueKES > 0, "Transaction value must be greater than zero");

        uint256 rate = isUrban ? URBAN_RATE_PERCENT : RURAL_RATE_PERCENT;
        stampDuty       = (transactionValueKES * rate) / 100;
        registrationFee = REGISTRATION_FEE_KES;
        totalFees       = stampDuty + registrationFee;
    }

    // ── Create Payment Record ──────────────────────────────
    /// @notice Creates a new stamp duty payment record
    function createPayment(
        string memory paymentId,
        string memory transferId,
        string memory parcelId,
        address payer,
        uint256 transactionValueKES,
        bool    isUrban,
        string memory paymentMethod
    ) external onlyOwner {
        require(!_paymentExists[paymentId],           "Payment ID already exists");
        require(payer != address(0),                  "Invalid payer address");
        require(transactionValueKES > 0,              "Value must be greater than zero");
        require(
            bytes(_transferPayment[transferId]).length == 0,
            "Payment already exists for this transfer"
        );

        (
            uint256 stampDuty,
            uint256 regFee,
            uint256 totalFees
        ) = calculateDuty(transactionValueKES, isUrban);

        uint256 rate = isUrban ? URBAN_RATE_PERCENT : RURAL_RATE_PERCENT;

        _payments[paymentId] = PaymentRecord({
            paymentId:            paymentId,
            transferId:           transferId,
            parcelId:             parcelId,
            payer:                payer,
            transactionValueKES:  transactionValueKES,
            stampDutyRatePercent: rate,
            stampDutyAmountKES:   stampDuty,
            registrationFeeKES:   regFee,
            totalFeesKES:         totalFees,
            paymentMethod:        paymentMethod,
            paymentReference:     "",
            kraConfirmationCode:  "",
            status:               PaymentStatus.Pending,
            createdAt:            block.timestamp,
            confirmedAt:          0
        });

        _paymentExists[paymentId]      = true;
        _transferPayment[transferId]   = paymentId;
        _allPaymentIds.push(paymentId);

        emit PaymentCreated(paymentId, transferId, totalFees);
    }

    // ── Confirm Payment ────────────────────────────────────
    /// @notice Confirms payment after KRA iTax verification
    function confirmPayment(
        string memory paymentId,
        string memory kraConfirmationCode,
        string memory paymentReference
    ) external onlyOwner {
        require(_paymentExists[paymentId], "Payment not found");
        PaymentRecord storage rec = _payments[paymentId];
        require(
            rec.status == PaymentStatus.Pending ||
            rec.status == PaymentStatus.Processing,
            "Payment cannot be confirmed in current status"
        );

        rec.status              = PaymentStatus.Confirmed;
        rec.kraConfirmationCode = kraConfirmationCode;
        rec.paymentReference    = paymentReference;
        rec.confirmedAt         = block.timestamp;

        emit PaymentConfirmed(paymentId, kraConfirmationCode);
    }

    // ── Mark Payment Failed ────────────────────────────────
    function markPaymentFailed(string memory paymentId, string memory reason)
        external onlyOwner
    {
        require(_paymentExists[paymentId], "Payment not found");
        require(
            _payments[paymentId].status == PaymentStatus.Pending ||
            _payments[paymentId].status == PaymentStatus.Processing,
            "Payment cannot be failed in current status"
        );
        _payments[paymentId].status = PaymentStatus.Failed;
        emit PaymentFailed(paymentId, reason);
    }

    // ── Refund Payment ─────────────────────────────────────
    function refundPayment(string memory paymentId)
        external onlyOwner nonReentrant
    {
        require(_paymentExists[paymentId], "Payment not found");
        PaymentRecord storage rec = _payments[paymentId];
        require(
            rec.status == PaymentStatus.Pending ||
            rec.status == PaymentStatus.Failed,
            "Only pending or failed payments can be refunded"
        );
        rec.status = PaymentStatus.Refunded;
        emit PaymentRefunded(paymentId, rec.payer);
    }

    // ── View Functions ─────────────────────────────────────
    function getPayment(string memory paymentId)
        external view returns (PaymentRecord memory)
    {
        require(_paymentExists[paymentId], "Payment not found");
        return _payments[paymentId];
    }

    function getPaymentByTransfer(string memory transferId)
        external view returns (PaymentRecord memory)
    {
        string memory paymentId = _transferPayment[transferId];
        require(bytes(paymentId).length > 0, "No payment found for this transfer");
        return _payments[paymentId];
    }

    function isPaymentConfirmed(string memory transferId)
        external view returns (bool)
    {
        string memory paymentId = _transferPayment[transferId];
        if (bytes(paymentId).length == 0) return false;
        return _payments[paymentId].status == PaymentStatus.Confirmed;
    }

    function totalPayments() external view returns (uint256) {
        return _allPaymentIds.length;
    }
}
