import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("JeonseVault v2 feature set", function () {
  let admin, owner2, landlord, tenant, oracleNode, executor;
  let krw, oracle, vault, multisig;

  const DEPOSIT = ethers.parseEther("100000000"); // 1억 KRW
  const PROPERTY_ID = ethers.keccak256(ethers.toUtf8Bytes("Seoul-Yongsan-APT-201"));
  const ONE_YEAR = 365 * 24 * 60 * 60;

  beforeEach(async () => {
    [admin, owner2, landlord, tenant, oracleNode, executor] = await ethers.getSigners();

    const KRW = await ethers.getContractFactory("MockKRW");
    krw = await KRW.deploy();

    const Oracle = await ethers.getContractFactory("JeonseOracle");
    oracle = await Oracle.deploy(admin.address, admin.address);
    await oracle.connect(admin).addOracleNode(oracleNode.address);

    const Vault = await ethers.getContractFactory("JeonseVault");
    vault = await Vault.deploy(
      await krw.getAddress(),
      await oracle.getAddress(),
      admin.address
    );

    const ORACLE_ROLE = await vault.ORACLE_ROLE();
    await vault.connect(admin).grantRole(ORACLE_ROLE, oracleNode.address);

    const HugMultisig = await ethers.getContractFactory("HugMultisig");
    multisig = await HugMultisig.deploy(
      [admin.address, owner2.address],
      2,
      0
    );

    const HUG_ROLE = await vault.HUG_ROLE();
    await vault.connect(admin).grantRole(HUG_ROLE, await multisig.getAddress());

    await krw.mint(tenant.address, DEPOSIT);
    await krw.connect(tenant).approve(await vault.getAddress(), DEPOSIT);

    await oracle.connect(oracleNode).updatePropertyData(
      PROPERTY_ID,
      ethers.parseEther("500000000"),
      ethers.parseEther("100000000"),
      false,
      false
    );
  });

  async function registerLease() {
    const tx = await vault.connect(landlord).registerLease(
      tenant.address,
      DEPOSIT,
      365,
      PROPERTY_ID
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((decoded) => decoded && decoded.name === "LeaseRegistered");

    return event.args.leaseId;
  }

  async function activateLease() {
    const leaseId = await registerLease();
    await vault.connect(tenant).depositJeonse(leaseId);
    return leaseId;
  }

  it("pause and unpause gate user entrypoints", async () => {
    await vault.connect(admin).pause();

    await expect(
      vault.connect(landlord).registerLease(
        tenant.address,
        DEPOSIT,
        365,
        PROPERTY_ID
      )
    ).to.be.revertedWith("Vault: paused");

    await vault.connect(admin).unpause();

    await expect(
      vault.connect(landlord).registerLease(
        tenant.address,
        DEPOSIT,
        365,
        PROPERTY_ID
      )
    ).to.emit(vault, "LeaseRegistered");
  });

  it("emergencyReturn works even while paused and clears landlord shares", async () => {
    const leaseId = await activateLease();

    await vault.connect(admin).pause();

    const tenantBefore = await krw.balanceOf(tenant.address);
    expect(await vault.balanceOf(landlord.address)).to.be.gt(0n);

    await vault.connect(admin).emergencyReturn(leaseId);

    const tenantAfter = await krw.balanceOf(tenant.address);
    const lease = await vault.leases(leaseId);

    expect(tenantAfter - tenantBefore).to.equal(DEPOSIT);
    expect(await vault.balanceOf(landlord.address)).to.equal(0n);
    expect(lease.state).to.equal(4n); // RETURNED
    expect(lease.sharesIssued).to.equal(0n);
  });

  it("reports mock yield and protected assets for the active deposit", async () => {
    const leaseId = await activateLease();

    await time.increase(ONE_YEAR);

    const expectedYield = (DEPOSIT * 300n) / 10000n;
    const mockYield = await vault.getMockYield(leaseId);
    const protectedAssets = await vault.getProtectedAssets(leaseId);

    expect(protectedAssets[0]).to.equal(DEPOSIT);
    expect(mockYield).to.be.gte(expectedYield - 1n);
    expect(mockYield).to.be.lte(expectedYield + 1n);
    expect(protectedAssets[1]).to.equal(mockYield);
    expect(protectedAssets[2]).to.equal(protectedAssets[0] + protectedAssets[1]);
  });

  it("stores oracle risk score and source hash on chain", async () => {
    const riskScore = 82;
    const dataSourceHash = ethers.keccak256(
      ethers.toUtf8Bytes("data-go-kr-bundle-202603")
    );

    await expect(
      oracle.connect(oracleNode).updateRiskScore(PROPERTY_ID, riskScore, dataSourceHash)
    ).to.emit(oracle, "RiskScoreUpdated").withArgs(PROPERTY_ID, riskScore, dataSourceHash);

    const property = await oracle.properties(PROPERTY_ID);

    expect(property.riskScore).to.equal(82n);
    expect(property.dataSourceHash).to.equal(dataSourceHash);
  });

  it("executes a vault pause action through HugMultisig quorum", async () => {
    const pauseCallData = vault.interface.encodeFunctionData("pause");
    const multisigAddress = await multisig.getAddress();
    const vaultAddress = await vault.getAddress();
    const txId = await multisig.connect(admin).propose.staticCall(
      vaultAddress,
      pauseCallData,
      "Pause JeonseVault for emergency review"
    );

    await multisig.connect(admin).propose(
      vaultAddress,
      pauseCallData,
      "Pause JeonseVault for emergency review"
    );
    await multisig.connect(owner2).confirm(txId);

    expect(await multisig.canExecute(txId)).to.equal(true);

    await multisig.connect(executor).execute(txId);

    expect(await vault.paused()).to.equal(true);
    expect(multisigAddress).to.not.equal(ethers.ZeroAddress);
  });
});
