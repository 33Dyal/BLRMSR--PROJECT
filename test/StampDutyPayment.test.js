import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("StampDutyPayment", function () {
  let stampDuty, owner, buyer;

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();
    const StampDutyPayment = await ethers.getContractFactory("StampDutyPayment");
    stampDuty = await StampDutyPayment.deploy();
    await stampDuty.waitForDeployment();
  });

  // ── Stamp Duty Calculation Tests ─────────────────────────
  describe("Stamp Duty Calculation", function () {

    it("should calculate 2% urban stamp duty correctly", async function () {
      const [duty, regFee, total] = await stampDuty.calculateDuty(2_000_000, true);
      expect(duty).to.equal(40_000);       // 2% of 2,000,000
      expect(regFee).to.equal(5_000);      // Fixed KES 5,000
      expect(total).to.equal(45_000);      // 40,000 + 5,000
    });

    it("should calculate 4% rural stamp duty correctly", async function () {
      const [duty, regFee, total] = await stampDuty.calculateDuty(4_800_000, false);
      expect(duty).to.equal(192_000);      // 4% of 4,800,000
      expect(regFee).to.equal(5_000);      // Fixed KES 5,000
      expect(total).to.equal(197_000);     // 192,000 + 5,000
    });

    it("should apply urban rate for values at the threshold", async function () {
      const [duty,,] = await stampDuty.calculateDuty(4_000_000, true);
      expect(duty).to.equal(80_000);       // 2% of 4,000,000
    });

    it("should revert for zero transaction value", async function () {
      await expect(
        stampDuty.calculateDuty(0, true)
      ).to.be.revertedWith("Transaction value must be greater than zero");
    });

  });

  // ── Payment Creation Tests ───────────────────────────────
  describe("Create Payment", function () {

    it("should create a stamp duty payment record", async function () {
      await stampDuty.createPayment(
        "SDP-RNG-2026-00089",
        "TXN-RNG-2026-00089",
        "KJD/RNG/0042/2026",
        buyer.address,
        4_800_000,
        false,        // rural = 4%
        "M-Pesa"
      );

      const payment = await stampDuty.getPayment("SDP-RNG-2026-00089");
      expect(payment.paymentId).to.equal("SDP-RNG-2026-00089");
      expect(payment.stampDutyAmountKES).to.equal(192_000);
      expect(payment.totalFeesKES).to.equal(197_000);
      expect(payment.status).to.equal(0); // Pending
    });

    it("should prevent duplicate payment for same transfer", async function () {
      await stampDuty.createPayment(
        "SDP-RNG-2026-00089", "TXN-RNG-2026-00089",
        "KJD/RNG/0042/2026", buyer.address,
        4_800_000, false, "M-Pesa"
      );

      await expect(
        stampDuty.createPayment(
          "SDP-RNG-2026-00090", "TXN-RNG-2026-00089",
          "KJD/RNG/0042/2026", buyer.address,
          4_800_000, false, "Bank Transfer"
        )
      ).to.be.revertedWith("Payment already exists for this transfer");
    });

  });

  // ── Payment Confirmation Tests ───────────────────────────
  describe("Confirm Payment", function () {

    beforeEach(async function () {
      await stampDuty.createPayment(
        "SDP-RNG-2026-00089", "TXN-RNG-2026-00089",
        "KJD/RNG/0042/2026", buyer.address,
        4_800_000, false, "M-Pesa"
      );
    });

    it("should confirm a payment with KRA confirmation code", async function () {
      await stampDuty.confirmPayment(
        "SDP-RNG-2026-00089",
        "KRA2026031800089XYZ",
        "MPESA-REF-123456"
      );

      const payment = await stampDuty.getPayment("SDP-RNG-2026-00089");
      expect(payment.status).to.equal(2); // Confirmed
      expect(payment.kraConfirmationCode).to.equal("KRA2026031800089XYZ");
    });

    it("should return true for confirmed payment on transfer", async function () {
      await stampDuty.confirmPayment(
        "SDP-RNG-2026-00089",
        "KRA2026031800089XYZ",
        "MPESA-REF-123456"
      );

      expect(
        await stampDuty.isPaymentConfirmed("TXN-RNG-2026-00089")
      ).to.equal(true);
    });

    it("should return false for unconfirmed payment", async function () {
      expect(
        await stampDuty.isPaymentConfirmed("TXN-RNG-2026-00089")
      ).to.equal(false);
    });

  });

  // ── Refund Tests ─────────────────────────────────────────
  describe("Refund Payment", function () {

    beforeEach(async function () {
      await stampDuty.createPayment(
        "SDP-RNG-2026-00089", "TXN-RNG-2026-00089",
        "KJD/RNG/0042/2026", buyer.address,
        4_800_000, false, "M-Pesa"
      );
    });

    it("should refund a pending payment", async function () {
      await stampDuty.refundPayment("SDP-RNG-2026-00089");
      const payment = await stampDuty.getPayment("SDP-RNG-2026-00089");
      expect(payment.status).to.equal(4); // Refunded
    });

    it("should not refund a confirmed payment", async function () {
      await stampDuty.confirmPayment(
        "SDP-RNG-2026-00089",
        "KRA2026031800089XYZ",
        "MPESA-REF-123456"
      );

      await expect(
        stampDuty.refundPayment("SDP-RNG-2026-00089")
      ).to.be.revertedWith("Only pending or failed payments can be refunded");
    });

  });

});
