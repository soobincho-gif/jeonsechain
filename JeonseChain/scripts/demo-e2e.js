import hre from "hardhat";
import * as fs from "fs";
import path from "path";

const { ethers, network } = hre;
const ONE_DAY = 24 * 60 * 60;
const LEASE_DAYS = 365;
const DEPOSIT_KRW = ethers.parseEther("120000000");

function derivePropertyId(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

async function deployLocalFixture() {
  const [landlord, tenant] = await ethers.getSigners();

  const MockKRW = await ethers.getContractFactory("MockKRW");
  const JeonseOracle = await ethers.getContractFactory("JeonseOracle");
  const JeonseVault = await ethers.getContractFactory("JeonseVault");

  const krw = await MockKRW.deploy();
  await krw.waitForDeployment();

  const oracle = await JeonseOracle.deploy(landlord.address, landlord.address);
  await oracle.waitForDeployment();

  const vault = await JeonseVault.deploy(
    await krw.getAddress(),
    await oracle.getAddress(),
    landlord.address,
  );
  await vault.waitForDeployment();

  const ORACLE_ROLE = await vault.ORACLE_ROLE();
  await (await vault.grantRole(ORACLE_ROLE, landlord.address)).wait();
  await (await oracle.addOracleNode(landlord.address)).wait();
  await (await krw.mint(tenant.address, ethers.parseEther("300000000"))).wait();

  return { landlord, tenant, krw, oracle, vault, mode: "local-hardhat" };
}

async function loadSepoliaFixture() {
  const [landlord] = await ethers.getSigners();
  const tenantKey = process.env.DEMO_TENANT_PRIVATE_KEY;
  if (!tenantKey) {
    throw new Error("Sepolia 실행에는 DEMO_TENANT_PRIVATE_KEY가 필요합니다.");
  }

  const deploymentPath = path.resolve(process.cwd(), "deployments/sepolia.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments/sepolia.json을 찾을 수 없습니다.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const provider = landlord.provider;
  const tenant = new ethers.Wallet(tenantKey, provider);

  const krw = await ethers.getContractAt("MockKRW", deployment.contracts.MockKRW, landlord);
  const oracle = await ethers.getContractAt("JeonseOracle", deployment.contracts.JeonseOracle, landlord);
  const vault = await ethers.getContractAt("JeonseVault", deployment.contracts.JeonseVault, landlord);

  const tenantBalance = await provider.getBalance(tenant.address);
  if (tenantBalance < ethers.parseEther("0.003")) {
    console.log("⚠ tenant ETH 잔액이 낮아 landlord가 0.01 ETH를 보냅니다.");
    const topUpTx = await landlord.sendTransaction({
      to: tenant.address,
      value: ethers.parseEther("0.01"),
    });
    await topUpTx.wait();
  }

  await (await krw.mint(tenant.address, ethers.parseEther("300000000"))).wait();
  return { landlord, tenant, krw, oracle, vault, mode: "sepolia-seed" };
}

async function extractLeaseId(receipt, vault) {
  for (const log of receipt.logs) {
    try {
      const parsed = vault.interface.parseLog(log);
      if (parsed?.name === "LeaseRegistered") {
        return parsed.args.leaseId;
      }
    } catch {
      continue;
    }
  }
  throw new Error("LeaseRegistered 이벤트에서 leaseId를 찾지 못했습니다.");
}

async function runScenario() {
  const fixture =
    network.name === "hardhat" || network.name === "localhost"
      ? await deployLocalFixture()
      : await loadSepoliaFixture();

  const { landlord, tenant, krw, vault, mode } = fixture;

  console.log(`\n🎬 Demo E2E 시작 (${mode})`);
  console.log(`landlord: ${landlord.address}`);
  console.log(`tenant  : ${tenant.address}`);
  console.log(`vault   : ${await vault.getAddress()}`);

  const propertyLabel =
    mode === "local-hardhat"
      ? `demo-${Date.now()}-mapo`
      : `sepolia-demo-${Date.now()}-mapo`;
  const propertyId = derivePropertyId(propertyLabel);

  console.log("\n1) 계약 등록");
  const registerTx = await vault
    .connect(landlord)
    .registerLease(tenant.address, DEPOSIT_KRW, LEASE_DAYS, propertyId);
  const registerReceipt = await registerTx.wait();
  const leaseId = await extractLeaseId(registerReceipt, vault);
  console.log(`   ✓ leaseId: ${leaseId}`);

  console.log("\n2) 임차인 승인 + 예치");
  await (await krw.connect(tenant).approve(await vault.getAddress(), DEPOSIT_KRW)).wait();
  await (await vault.connect(tenant).depositJeonse(leaseId)).wait();
  const depositInfo = await vault.getDepositInfo(leaseId);
  console.log(`   ✓ state after deposit: ${depositInfo[4].toString()}`);

  if (mode === "local-hardhat") {
    console.log("\n3) 만기까지 시간 이동");
    await network.provider.send("evm_increaseTime", [(LEASE_DAYS + 1) * ONE_DAY]);
    await network.provider.send("evm_mine");

    const remainingDays = await vault.getRemainingDays(leaseId);
    console.log(`   ✓ remainingDays: ${remainingDays.toString()}`);

    console.log("\n4) 반환 실행");
    await (await vault.connect(landlord).executeReturn(leaseId)).wait();
    const finalInfo = await vault.getDepositInfo(leaseId);
    console.log(`   ✓ final state: ${finalInfo[4].toString()} (RETURNED 기대값 4)`);
    console.log("\n✅ 로컬 전체 시나리오 완료: 등록 → 예치 → 만기 → 반환");
    return;
  }

  const remainingDays = await vault.getRemainingDays(leaseId);
  console.log(`\n3) Sepolia는 시간 이동이 불가해 ACTIVE 상태까지 seed했습니다.`);
  console.log(`   ✓ remainingDays: ${remainingDays.toString()}`);
  console.log("   ℹ 발표 직전 fresh lease를 만들고 viewer/정산 데모를 이어갈 때 사용하세요.");
}

runScenario().catch((error) => {
  console.error("❌ demo E2E 실패:", error);
  process.exit(1);
});
