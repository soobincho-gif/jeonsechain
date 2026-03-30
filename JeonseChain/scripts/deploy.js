import hre from "hardhat";
const { ethers } = hre;
import * as fs from "fs";

/**
 * JeonseChain Sepolia 배포 스크립트
 *
 * 실행 전 .env 파일에 아래 값을 설정:
 *   PRIVATE_KEY=0x...          (MetaMask 개인키, 앞에 0x 포함)
 *   SEPOLIA_RPC_URL=https://...  (Alchemy 또는 Infura Sepolia URL)
 *   ETHERSCAN_API_KEY=...      (선택: 컨트랙트 검증용)
 *
 * 실행:
 *   npx hardhat run scripts/deploy.js --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🚀 JeonseChain 배포 시작");
  console.log("배포 지갑:", deployer.address);
  console.log("잔액:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ── 1. MockKRW (테스트용 원화 스테이블코인) ────────────────────────
  console.log("1/3 MockKRW 배포 중...");
  const MockKRW = await ethers.getContractFactory("MockKRW");
  const krw = await MockKRW.deploy();
  const krwTx = krw.deploymentTransaction();
  if (krwTx) {
    console.log("  ↳ tx:", krwTx.hash);
    await krwTx.wait();
  }
  const krwAddr = await krw.getAddress();
  console.log("  ✓ MockKRW:", krwAddr);

  // ── 2. JeonseOracle ────────────────────────────────────────────────
  console.log("2/3 JeonseOracle 배포 중...");
  const JeonseOracle = await ethers.getContractFactory("JeonseOracle");
  // deployer가 admin + HUG 역할 겸임 (테스트용)
  const oracle = await JeonseOracle.deploy(deployer.address, deployer.address, {
    gasLimit: 4_000_000n,
  });
  const oracleTx = oracle.deploymentTransaction();
  if (oracleTx) {
    console.log("  ↳ tx:", oracleTx.hash);
    await oracleTx.wait();
  }
  const oracleAddr = await oracle.getAddress();
  console.log("  ✓ JeonseOracle:", oracleAddr);

  // ── 3. JeonseVault ─────────────────────────────────────────────────
  console.log("3/3 JeonseVault 배포 중...");
  const JeonseVault = await ethers.getContractFactory("JeonseVault");
  const vault = await JeonseVault.deploy(
    krwAddr,       // underlying asset
    oracleAddr,    // oracle
    deployer.address,  // HUG admin
    {
      gasLimit: 8_000_000n,
    }
  );
  const vaultTx = vault.deploymentTransaction();
  if (vaultTx) {
    console.log("  ↳ tx:", vaultTx.hash);
    await vaultTx.wait();
  }
  const vaultAddr = await vault.getAddress();
  console.log("  ✓ JeonseVault:", vaultAddr);

  // ── 4. HugMultisig ────────────────────────────────────────────────
  // 데모: deployer 단독 1-of-1. 프로덕션에서는 addOwner()로 실제 서명자 추가 후
  // changeRequired(2) 또는 changeRequired(3)으로 quorum을 높여야 한다.
  console.log("4/4 HugMultisig 배포 중...");
  const HugMultisig = await ethers.getContractFactory("HugMultisig");
  const multisig = await HugMultisig.deploy(
    [deployer.address],   // 서명자 목록 (데모: deployer만)
    1,                    // required (데모: 1-of-1; 프로덕션: 2-of-3)
    0,                    // timelockDelay (데모: 즉시; 프로덕션: 172800 = 48h)
    { gasLimit: 2_000_000n }
  );
  const multisigTx = multisig.deploymentTransaction();
  if (multisigTx) { await multisigTx.wait(); }
  const multisigAddr = await multisig.getAddress();
  console.log("  ✓ HugMultisig:", multisigAddr);
  console.log("  ⚠ 데모 모드: 1-of-1, timelock 0초");
  console.log("  → 프로덕션 전 addOwner() + changeRequired(2) + changeTimelockDelay(172800) 실행 필요");

  // ── 역할 설정 ──────────────────────────────────────────────────────
  console.log("\n역할 설정 중...");

  // ORACLE_ROLE: deployer가 oracle-fetcher 실행 가능
  const ORACLE_ROLE = await vault.ORACLE_ROLE();
  await (await vault.grantRole(ORACLE_ROLE, deployer.address)).wait();
  await (await oracle.addOracleNode(deployer.address)).wait();
  console.log("  ✓ ORACLE_ROLE → deployer");

  // HUG_ROLE: multisig에게 부여 (민감 함수 보호)
  const HUG_ROLE = await vault.HUG_ROLE();
  await (await vault.grantRole(HUG_ROLE, multisigAddr)).wait();
  console.log("  ✓ HUG_ROLE → HugMultisig");

  // DEFAULT_ADMIN_ROLE도 multisig에게 부여하고 deployer는 추후 제거 권장
  console.log("  ℹ  deployer도 HUG_ROLE 보유 중 (데모 편의용)");
  console.log("     프로덕션 전 vault.revokeRole(HUG_ROLE, deployer) 실행 권장");

  // ── 테스트 토큰 민팅 (임차인 테스트용) ────────────────────────────
  const testMintAmount = ethers.parseEther("1000000000"); // 10억 KRW
  await (await krw.mint(deployer.address, testMintAmount)).wait();
  console.log("  ✓ 테스트 KRW 민팅:", ethers.formatEther(testMintAmount), "KRW");

  // ── 배포 결과 저장 ────────────────────────────────────────────────
  const deploymentInfo = {
    network: "sepolia",
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockKRW:      krwAddr,
      JeonseOracle: oracleAddr,
      JeonseVault:  vaultAddr,
      HugMultisig:  multisigAddr,
    }
  };

  // JSON 저장 (프론트엔드에서 사용)
  fs.writeFileSync(
    "./deployments/sepolia.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  // ABI 저장
  const vaultArtifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/JeonseVault.sol/JeonseVault.json", "utf8")
  );
  const oracleArtifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/JeonseOracle.sol/JeonseOracle.json", "utf8")
  );
  const krwArtifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/JeonseFactory.sol/MockKRW.json", "utf8")
  );

  const multisigArtifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/HugMultisig.sol/HugMultisig.json", "utf8")
  );

  fs.writeFileSync("./deployments/JeonseVault.abi.json",  JSON.stringify(vaultArtifact.abi,    null, 2));
  fs.writeFileSync("./deployments/JeonseOracle.abi.json", JSON.stringify(oracleArtifact.abi,   null, 2));
  fs.writeFileSync("./deployments/MockKRW.abi.json",      JSON.stringify(krwArtifact.abi,      null, 2));
  fs.writeFileSync("./deployments/HugMultisig.abi.json",  JSON.stringify(multisigArtifact.abi, null, 2));

  console.log("\n✅ 배포 완료!");
  console.log("─────────────────────────────────────────");
  console.log("MockKRW:     ", krwAddr);
  console.log("JeonseOracle:", oracleAddr);
  console.log("JeonseVault: ", vaultAddr);
  console.log("HugMultisig: ", multisigAddr);
  console.log("─────────────────────────────────────────");
  console.log("배포 정보 저장:", "./deployments/sepolia.json");
  console.log("\nSepolia Etherscan:");
  console.log(`  https://sepolia.etherscan.io/address/${vaultAddr}`);
  console.log("\n컨트랙트 검증 (Etherscan API 키 있으면):");
  console.log(`  npx hardhat verify --network sepolia ${vaultAddr} ${krwAddr} ${oracleAddr} ${deployer.address}`);
}

main().catch((error) => {
  console.error("❌ 배포 실패:", error);
  process.exit(1);
});
