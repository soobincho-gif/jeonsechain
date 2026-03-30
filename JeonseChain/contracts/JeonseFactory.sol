// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./JeonseVault.sol";
import "./JeonseOracle.sol";

/**
 * @title MockKRW
 * @notice 테스트용 원화 스테이블코인 (실제 배포 시 CBDC·KRWC로 교체).
 */
contract MockKRW is ERC20, Ownable {
    constructor() ERC20("Korean Won Stablecoin", "KRW") Ownable(msg.sender) {}
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/**
 * @title JeonseFactory
 * @notice 전세 계약마다 독립적인 JeonseVault를 생성하는 팩토리.
 *         각 볼트가 독립된 온체인 SPV로 기능 → 계약 간 위험 격리.
 *
 * 실제 운영 시에는 가스비 절감을 위해 Clone 패턴(EIP-1167) 사용 권장.
 */
contract JeonseFactory is Ownable {

    JeonseOracle public immutable oracle;
    MockKRW      public immutable krw;

    // 생성된 볼트 목록
    address[] public allVaults;
    mapping(address => address[]) public landlordVaults; // 임대인 => 볼트 목록

    event VaultCreated(address indexed vault, address indexed landlord, address indexed tenant);

    constructor(address _oracle, address _krw) Ownable(msg.sender) {
        oracle = JeonseOracle(_oracle);
        krw    = MockKRW(_krw);
    }

    /**
     * @notice 새 전세 계약용 볼트 생성.
     *         각 볼트가 독립된 SPV → 다른 계약 위험과 완전 격리.
     */
    function createVault(
        address tenant,
        uint256 depositAmount,
        uint256 durationDays,
        bytes32 propertyId
    ) external returns (address vaultAddress, bytes32 leaseId) {

        // 새 볼트 배포 (독립 SPV)
        JeonseVault vault = new JeonseVault(
            IERC20(address(krw)),
            address(oracle),
            owner()  // HUG admin
        );

        vaultAddress = address(vault);
        allVaults.push(vaultAddress);
        landlordVaults[msg.sender].push(vaultAddress);

        // 오라클 권한 부여
        oracle.addOracleNode(owner()); // 실제: 국토부·HUG 노드 주소

        // 계약 등록
        leaseId = vault.registerLease(
            tenant,
            depositAmount,
            durationDays,
            propertyId
        );

        emit VaultCreated(vaultAddress, msg.sender, tenant);
    }

    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function getLandlordVaults(address landlord) external view returns (address[] memory) {
        return landlordVaults[landlord];
    }
}
