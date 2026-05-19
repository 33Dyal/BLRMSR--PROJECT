import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("LandRegistry", function () {
  let landRegistry, owner, registrar, buyer, seller;

  beforeEach(async function () {
    [owner, registrar, buyer, seller] = await ethers.getSigners();
    const LandRegistry = await ethers.getContractFactory("LandRegistry");
    landRegistry = await LandRegistry.deploy();
    await landRegistry.waitForDeployment();
  });

  // ── Registration Tests ───────────────────────────────────
  describe("Parcel Registration", function () {

    it("should add a new parcel to the registry", async function () {
      await landRegistry.addParcel(
        "KJD/RNG/0042/2026",
        "KAJIADO/RONGAI/0042",
        "LR.No.56789",
        buyer.address,
        "did:rongai:0x4a3f2c1d",
        "Residential",
        500,
        4_500_000
      );

      const parcel = await landRegistry.getParcel("KJD/RNG/0042/2026");
      expect(parcel.parcelId).to.equal("KJD/RNG/0042/2026");
      expect(parcel.currentOwner).to.equal(buyer.address);
      expect(parcel.isActive).to.equal(true);
      expect(parcel.landUse).to.equal("Residential");
    });

    it("should prevent duplicate parcel registration", async function () {
      await landRegistry.addParcel(
        "KJD/RNG/0042/2026", "KAJIADO/RONGAI/0042", "LR.No.56789",
        buyer.address, "did:rongai:0x4a3f", "Residential", 500, 4_500_000
      );

      await expect(
        landRegistry.addParcel(
          "KJD/RNG/0042/2026", "KAJIADO/RONGAI/0042-B", "LR.No.56790",
          seller.address, "did:rongai:0x9b8c", "Agricultural", 600, 3_000_000
        )
      ).to.be.revertedWith("Parcel already registered");
    });

    it("should track total number of registered parcels", async function () {
      expect(await landRegistry.totalParcels()).to.equal(0);

      await landRegistry.addParcel(
        "KJD/RNG/0001/2026", "KAJIADO/RONGAI/0001", "LR.No.001",
        buyer.address, "did:rongai:0x001", "Residential", 300, 2_000_000
      );
      await landRegistry.addParcel(
        "KJD/RNG/0002/2026", "KAJIADO/RONGAI/0002", "LR.No.002",
        seller.address, "did:rongai:0x002", "Agricultural", 1000, 1_500_000
      );

      expect(await landRegistry.totalParcels()).to.equal(2);
    });

    it("should block non-owner from registering parcels", async function () {
      await expect(
        landRegistry.connect(buyer).addParcel(
          "KJD/RNG/0042/2026", "KAJIADO/RONGAI/0042", "LR.No.56789",
          buyer.address, "did:rongai:0x4a3f", "Residential", 500, 4_500_000
        )
      ).to.be.revertedWithCustomError(landRegistry, "OwnableUnauthorizedAccount");
    });

  });

  // ── Ownership Transfer Tests ─────────────────────────────
  describe("Ownership Transfer", function () {

    beforeEach(async function () {
      await landRegistry.addParcel(
        "KJD/RNG/0042/2026", "KAJIADO/RONGAI/0042", "LR.No.56789",
        seller.address, "did:rongai:0xSELLER", "Residential", 500, 4_500_000
      );
    });

    it("should transfer ownership and update registry", async function () {
      await landRegistry.transferOwnership(
        "KJD/RNG/0042/2026",
        buyer.address,
        "did:rongai:0xBUYER",
        "TXN-RNG-2026-00089"
      );

      const parcel = await landRegistry.getParcel("KJD/RNG/0042/2026");
      expect(parcel.currentOwner).to.equal(buyer.address);
      expect(parcel.ownerDID).to.equal("did:rongai:0xBUYER");
    });

    it("should record ownership history after transfer", async function () {
      await landRegistry.transferOwnership(
        "KJD/RNG/0042/2026",
        buyer.address,
        "did:rongai:0xBUYER",
        "TXN-RNG-2026-00089"
      );

      const history = await landRegistry.getOwnershipHistory("KJD/RNG/0042/2026");
      expect(history.length).to.equal(2); // Initial + transfer
      expect(history[0].owner).to.equal(seller.address);
      expect(history[1].owner).to.equal(buyer.address);
    });

    it("should track parcels owned by an address", async function () {
      await landRegistry.transferOwnership(
        "KJD/RNG/0042/2026",
        buyer.address,
        "did:rongai:0xBUYER",
        "TXN-RNG-2026-00089"
      );

      const buyerParcels = await landRegistry.getParcelsByOwner(buyer.address);
      expect(buyerParcels).to.include("KJD/RNG/0042/2026");
    });

  });

  // ── Other Registry Functions ─────────────────────────────
  describe("Registry Management", function () {

    beforeEach(async function () {
      await landRegistry.addParcel(
        "KJD/RNG/0042/2026", "KAJIADO/RONGAI/0042", "LR.No.56789",
        buyer.address, "did:rongai:0x4a3f", "Residential", 500, 4_500_000
      );
    });

    it("should update land value", async function () {
      await landRegistry.updateLandValue("KJD/RNG/0042/2026", 5_500_000);
      const parcel = await landRegistry.getParcel("KJD/RNG/0042/2026");
      expect(parcel.landValueKES).to.equal(5_500_000);
    });

    it("should deactivate a parcel", async function () {
      await landRegistry.deactivateParcel("KJD/RNG/0042/2026");
      const parcel = await landRegistry.getParcel("KJD/RNG/0042/2026");
      expect(parcel.isActive).to.equal(false);
    });

    it("should confirm parcel is registered", async function () {
      expect(await landRegistry.isParcelRegistered("KJD/RNG/0042/2026")).to.equal(true);
      expect(await landRegistry.isParcelRegistered("KJD/RNG/9999/2026")).to.equal(false);
    });

  });

});
