// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LandParcel is ERC721, Ownable {

    uint256 private _tokenIdCounter;

    struct Parcel {
        uint256 tokenId;
        string  parcelNumber;
        string  location;
        uint256 areaSqMeters;
        string  ipfsHash;
        bool    isActive;
        uint256 registeredAt;
    }

    mapping(uint256 => Parcel)  private _parcels;
    mapping(string  => bool)    private _parcelExists;
    mapping(string  => uint256) private _parcelNumberToId;

    event ParcelRegistered(
        uint256 indexed tokenId,
        address indexed owner,
        string  parcelNumber,
        uint256 areaSqMeters
    );

    constructor() ERC721("RongaiLandParcel", "RLP") Ownable(msg.sender) {
        _tokenIdCounter = 0;
    }

    function registerParcel(
        address to,
        string  memory parcelNumber,
        string  memory location,
        uint256 areaSqMeters,
        string  memory ipfsHash
    ) external onlyOwner {
        require(!_parcelExists[parcelNumber], "Parcel number already registered");
        require(to != address(0), "Invalid owner address");
        require(areaSqMeters > 0, "Area must be greater than zero");

        _tokenIdCounter += 1;
        uint256 newTokenId = _tokenIdCounter;
        _safeMint(to, newTokenId);

        _parcels[newTokenId] = Parcel({
            tokenId:      newTokenId,
            parcelNumber: parcelNumber,
            location:     location,
            areaSqMeters: areaSqMeters,
            ipfsHash:     ipfsHash,
            isActive:     true,
            registeredAt: block.timestamp
        });

        _parcelExists[parcelNumber]     = true;
        _parcelNumberToId[parcelNumber] = newTokenId;

        emit ParcelRegistered(newTokenId, to, parcelNumber, areaSqMeters);
    }

    function getParcel(uint256 tokenId) external view returns (Parcel memory) {
        require(_parcels[tokenId].isActive, "Parcel does not exist");
        return _parcels[tokenId];
    }

    function calcStampDuty(uint256 transactionValueKES)
        external pure returns (uint256)
    {
        if (transactionValueKES <= 4_000_000) {
            return (transactionValueKES * 2) / 100;
        } else {
            return (transactionValueKES * 4) / 100;
        }
    }

    function deactivateParcel(uint256 tokenId) external onlyOwner {
        require(_parcels[tokenId].isActive, "Parcel already inactive");
        _parcels[tokenId].isActive = false;
    }

    function totalParcels() external view returns (uint256) {
        return _tokenIdCounter;
    }
}