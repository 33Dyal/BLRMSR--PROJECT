import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("LandParcel", function () {
  let landParcel, owner, buyer, registrar;

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    [owner, buyer, registrar] = await ethers.getSigners();
    const LandParcel = await ethers.getContractFactory("LandParcel");
    landParcel = await LandParcel.deploy();
    await landParcel.waitForDeployment();
  });

  it("should register a parcel and mint NFT to owner", async function () {
    await landParcel.registerParcel(
      buyer.address,
      "RONGAI/001/2024",
      "Rongai Ward, Plot 001, Adj. Kibiko Road",
      250,            // 2.50 hectares
      "QmXyZ123abc..."  // IPFS hash
    );

    // Buyer should now own token #1
    expect(await landParcel.ownerOf(1)).to.equal(buyer.address);

    // Parcel data should be stored correctly
    const parcel = await landParcel.getParcel(1);
    expect(parcel.parcelNumber).to.equal("RONGAI/001/2024");
    expect(parcel.isActive).to.equal(true);
  });

  it("should prevent duplicate parcel registration", async function () {
    await landParcel.registerParcel(
      buyer.address, "RONGAI/001/2024", "Location", 100, "hash1"
    );
    await expect(
      landParcel.registerParcel(
        registrar.address, "RONGAI/001/2024", "Location 2", 200, "hash2"
      )
    ).to.be.revertedWith("Parcel number already registered");
  });

  it("should calculate Kenya stamp duty correctly", async function () {
    // 2% for amounts ≤ KES 4M
    expect(await landParcel.calcStampDuty(2_000_000)).to.equal(40_000);
    // 4% for amounts > KES 4M
    expect(await landParcel.calcStampDuty(6_000_000)).to.equal(240_000);
  });

  it("should block non-owner from registering parcels", async function () {
    await expect(
      landParcel.connect(buyer).registerParcel(
        buyer.address, "RONGAI/002/2024", "Location", 100, "hash"
      )
    ).to.be.revertedWithCustomError(landParcel, "OwnableUnauthorizedAccount");
  });

});