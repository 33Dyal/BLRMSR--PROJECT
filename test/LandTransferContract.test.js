import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("LandTransferContract", function () {
  let landTransfer, owner, seller, buyer;

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();
    const LandTransferContract = await ethers.getContractFactory("LandTransferContract");
    landTransfer = await LandTransferContract.deploy();
    await landTransfer.waitForDeployment();
  });

  // ── Initiate Transfer Tests ──────────────────────────────
  describe("Initiate Transfer", function () {

    it("should initiate a land transfer request", async function () {
      await landTransfer.initiateTransfer(
        "TXN-RNG-2026-00089",
        "KJD/RNG/0042/2026",
        seller.address,
        buyer.address,
        "did:rongai:0xSELLER",
        "did:rongai:0xBUYER",
        4_800_000,
        "Sale",
        "QmXyZ123abc..."
      );

      const transfer = await landTransfer.getTransfer("TXN-RNG-2026-00089");
      expect(transfer.parcelId).to.equal("KJD/RNG/0042/2026");
      expect(transfer.seller).to.equal(seller.address);
      expect(transfer.buyer).to.equal(buyer.address);
      expect(transfer.agreedPriceKES).to.equal(4_800_000);
      expect(transfer.status).to.equal(0); // Pending
    });

    it("should prevent duplicate transfer IDs", async function () {
      await landTransfer.initiateTransfer(
        "TXN-RNG-2026-00089", "KJD/RNG/0042/2026",
        seller.address, buyer.address,
        "did:rongai:0xSELLER", "did:rongai:0xBUYER",
        4_800_000, "Sale", "QmHash1"
      );

      await expect(
        landTransfer.initiateTransfer(
          "TXN-RNG-2026-00089", "KJD/RNG/0042/2026",
          seller.address, buyer.address,
          "did:rongai:0xSELLER", "did:rongai:0xBUYER",
          4_800_000, "Sale", "QmHash2"
        )
      ).to.be.revertedWith("Transfer ID already exists");
    });

    it("should prevent same seller and buyer", async function () {
      await expect(
        landTransfer.initiateTransfer(
          "TXN-RNG-2026-00090", "KJD/RNG/0042/2026",
          seller.address, seller.address,
          "did:rongai:0xSELLER", "did:rongai:0xSELLER",
          4_800_000, "Sale", "QmHash"
        )
      ).to.be.revertedWith("Seller and buyer cannot be same");
    });

    it("should prevent two active transfers on same parcel", async function () {
      await landTransfer.initiateTransfer(
        "TXN-RNG-2026-00089", "KJD/RNG/0042/2026",
        seller.address, buyer.address,
        "did:rongai:0xSELLER", "did:rongai:0xBUYER",
        4_800_000, "Sale", "QmHash1"
      );

      await expect(
        landTransfer.initiateTransfer(
          "TXN-RNG-2026-00090", "KJD/RNG/0042/2026",
          seller.address, buyer.address,
          "did:rongai:0xSELLER", "did:rongai:0xBUYER",
          5_000_000, "Sale", "QmHash2"
        )
      ).to.be.revertedWith("Parcel already has an active transfer");
    });

  });

  // ── Approve & Complete Tests ─────────────────────────────
  describe("Approve and Complete Transfer", function () {

    beforeEach(async function () {
      await landTransfer.initiateTransfer(
        "TXN-RNG-2026-00089", "KJD/RNG/0042/2026",
        seller.address, buyer.address,
        "did:rongai:0xSELLER", "did:rongai:0xBUYER",
        4_800_000, "Sale", "QmHash"
      );
    });

    it("should approve a pending transfer", async function () {
      await landTransfer.approveTransfer("TXN-RNG-2026-00089");
      const status = await landTransfer.getTransferStatus("TXN-RNG-2026-00089");
      expect(status).to.equal(2); // Approved
    });

    it("should complete an approved transfer", async function () {
      await landTransfer.approveTransfer("TXN-RNG-2026-00089");
      await landTransfer.completeTransfer("TXN-RNG-2026-00089");
      const status = await landTransfer.getTransferStatus("TXN-RNG-2026-00089");
      expect(status).to.equal(4); // Completed
    });

    it("should not complete a transfer that is not approved", async function () {
      await expect(
        landTransfer.completeTransfer("TXN-RNG-2026-00089")
      ).to.be.revertedWith("Transfer must be approved first");
    });

  });

  // ── Reject Transfer Tests ────────────────────────────────
  describe("Reject Transfer", function () {

    beforeEach(async function () {
      await landTransfer.initiateTransfer(
        "TXN-RNG-2026-00089", "KJD/RNG/0042/2026",
        seller.address, buyer.address,
        "did:rongai:0xSELLER", "did:rongai:0xBUYER",
        4_800_000, "Sale", "QmHash"
      );
    });

    it("should reject a transfer with a reason", async function () {
      await landTransfer.rejectTransfer(
        "TXN-RNG-2026-00089",
        "Missing consent to transfer document"
      );

      const transfer = await landTransfer.getTransfer("TXN-RNG-2026-00089");
      expect(transfer.status).to.equal(3); // Rejected
      expect(transfer.rejectionReason).to.equal("Missing consent to transfer document");
    });

    it("should release parcel lock after rejection", async function () {
      await landTransfer.rejectTransfer("TXN-RNG-2026-00089", "Invalid documents");

      const activeTransfer = await landTransfer.getActiveTransferForParcel("KJD/RNG/0042/2026");
      expect(activeTransfer).to.equal("");
    });

  });

});
