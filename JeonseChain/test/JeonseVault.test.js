import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("JeonseVault settlement flow", function () {
  let krw, oracle, vault;
  let hugAdmin, landlord, tenant, oracleNode, attacker;
  let leaseId;

  const DEPOSIT = ethers.parseEther("300000000"); // 3억 KRW
  const PROPERTY_ID = ethers.keccak256(ethers.toUtf8Bytes("Seoul-Mapo-APT-101"));
  const ONE_YEAR = 365 * 24 * 60 * 60;

  const ContractState = {
    REGISTERED: 0n,
    ACTIVE: 1n,
    DANGER: 2n,
    EXPIRED: 3n,
    RETURNED: 4n,
    DISPUTED: 5n,
  };

  const SettlementStatus = {
    NONE: 0n,
    MOVE_OUT_REQUESTED: 1n,
    CLAIM_SUBMITTED: 2n,
    TENANT_DISPUTED: 3n,
    RESOLVED: 4n,
  };

  const SettlementCategory = {
    CLEANING: 0,
    CONSUMABLE_REPAIR: 1,
    FACILITY_DAMAGE: 2,
    UTILITIES: 3,
  };

  const TenantResponse = {
    ACCEPT_FULL: 0,
    ACCEPT_PARTIAL: 1,
    DISPUTE: 2,
  };

  const LeaseChangeType = {
    NONE: 0n,
    EARLY_TERMINATION: 1n,
    EXTENSION: 2n,
  };

  beforeEach(async () => {
    [hugAdmin, landlord, tenant, oracleNode, attacker] = await ethers.getSigners();

    const KRW = await ethers.getContractFactory("MockKRW");
    krw = await KRW.deploy();

    const Oracle = await ethers.getContractFactory("JeonseOracle");
    oracle = await Oracle.deploy(hugAdmin.address, hugAdmin.address);
    await oracle.addOracleNode(oracleNode.address);

    const Vault = await ethers.getContractFactory("JeonseVault");
    vault = await Vault.deploy(
      await krw.getAddress(),
      await oracle.getAddress(),
      hugAdmin.address
    );

    const ORACLE_ROLE = await vault.ORACLE_ROLE();
    await vault.connect(hugAdmin).grantRole(ORACLE_ROLE, oracleNode.address);

    await krw.mint(tenant.address, DEPOSIT);
    await krw.connect(tenant).approve(await vault.getAddress(), DEPOSIT);

    await oracle.connect(oracleNode).updatePropertyData(
      PROPERTY_ID,
      ethers.parseEther("500000000"),
      ethers.parseEther("200000000"),
      false,
      false
    );

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

    leaseId = event.args.leaseId;
  });

  async function activateLease() {
    await vault.connect(tenant).depositJeonse(leaseId);
  }

  async function expireLease() {
    await time.increase(ONE_YEAR + 1);
  }

  it("register -> deposit -> executeReturn keeps the original trustless flow", async () => {
    await activateLease();
    await expireLease();

    const tenantBefore = await krw.balanceOf(tenant.address);

    await vault.connect(attacker).executeReturn(leaseId);

    const tenantAfter = await krw.balanceOf(tenant.address);
    const lease = await vault.leases(leaseId);

    expect(tenantAfter - tenantBefore).to.equal(DEPOSIT);
    expect(lease.state).to.equal(ContractState.RETURNED);
    expect(lease.sharesIssued).to.equal(0n);
  });

  it("move-out claim releases only the undisputed amount and holds the disputed slice", async () => {
    await activateLease();
    await expireLease();

    await vault.connect(tenant).requestMoveOut(leaseId);

    const claimAmount = ethers.parseEther("1500000"); // 150만
    await vault.connect(landlord).submitSettlementClaim(
      leaseId,
      SettlementCategory.FACILITY_DAMAGE,
      claimAmount,
      ethers.keccak256(ethers.toUtf8Bytes("damage-photo-bundle"))
    );

    const tenantBalance = await krw.balanceOf(tenant.address);
    const vaultBalance = await krw.balanceOf(await vault.getAddress());
    const lease = await vault.leases(leaseId);
    const settlement = await vault.getSettlementInfo(leaseId);

    expect(tenantBalance).to.equal(DEPOSIT - claimAmount);
    expect(vaultBalance).to.equal(claimAmount);
    expect(lease.state).to.equal(ContractState.DISPUTED);
    expect(lease.sharesIssued).to.equal(0n);
    expect(settlement[0]).to.equal(SettlementStatus.CLAIM_SUBMITTED);
    expect(settlement[5]).to.equal(claimAmount);
  });

  it("tenant can partially accept and only the accepted slice goes to the landlord", async () => {
    await activateLease();
    await expireLease();
    await vault.connect(tenant).requestMoveOut(leaseId);

    const claimAmount = ethers.parseEther("1500000");
    const acceptedAmount = ethers.parseEther("500000");

    await vault.connect(landlord).submitSettlementClaim(
      leaseId,
      SettlementCategory.FACILITY_DAMAGE,
      claimAmount,
      ethers.keccak256(ethers.toUtf8Bytes("repair-estimate"))
    );

    const landlordBefore = await krw.balanceOf(landlord.address);
    const tenantBefore = await krw.balanceOf(tenant.address);

    await vault.connect(tenant).respondToSettlementClaim(
      leaseId,
      TenantResponse.ACCEPT_PARTIAL,
      acceptedAmount,
      ethers.keccak256(ethers.toUtf8Bytes("tenant-partial-accept"))
    );

    const landlordAfter = await krw.balanceOf(landlord.address);
    const tenantAfter = await krw.balanceOf(tenant.address);
    const lease = await vault.leases(leaseId);
    const settlement = await vault.getSettlementInfo(leaseId);

    expect(landlordAfter - landlordBefore).to.equal(acceptedAmount);
    expect(tenantAfter - tenantBefore).to.equal(claimAmount - acceptedAmount);
    expect(lease.state).to.equal(ContractState.RETURNED);
    expect(settlement[0]).to.equal(SettlementStatus.RESOLVED);
    expect(settlement[7]).to.equal(acceptedAmount);
  });

  it("if the tenant does not respond in time, only the held amount is released to the landlord", async () => {
    await activateLease();
    await expireLease();
    await vault.connect(tenant).requestMoveOut(leaseId);

    const claimAmount = ethers.parseEther("300000");
    await vault.connect(landlord).submitSettlementClaim(
      leaseId,
      SettlementCategory.CLEANING,
      claimAmount,
      ethers.keccak256(ethers.toUtf8Bytes("cleaning-invoice"))
    );

    await time.increase(72 * 60 * 60 + 1);

    const landlordBefore = await krw.balanceOf(landlord.address);
    await vault.connect(attacker).finalizeSettlementAfterDeadline(leaseId);
    const landlordAfter = await krw.balanceOf(landlord.address);

    const settlement = await vault.getSettlementInfo(leaseId);
    expect(landlordAfter - landlordBefore).to.equal(claimAmount);
    expect(settlement[0]).to.equal(SettlementStatus.RESOLVED);
    expect(settlement[5]).to.equal(0n);
  });

  it("a disputed settlement can be resolved by HUG with a custom split", async () => {
    await activateLease();
    await expireLease();
    await vault.connect(tenant).requestMoveOut(leaseId);

    const claimAmount = ethers.parseEther("2000000");
    const landlordAward = ethers.parseEther("700000");

    await vault.connect(landlord).submitSettlementClaim(
      leaseId,
      SettlementCategory.FACILITY_DAMAGE,
      claimAmount,
      ethers.keccak256(ethers.toUtf8Bytes("move-out-damage-evidence"))
    );

    await vault.connect(tenant).respondToSettlementClaim(
      leaseId,
      TenantResponse.DISPUTE,
      0,
      ethers.keccak256(ethers.toUtf8Bytes("tenant-dispute-response"))
    );

    const landlordBefore = await krw.balanceOf(landlord.address);
    const tenantBefore = await krw.balanceOf(tenant.address);

    await vault.connect(hugAdmin).resolveSettlementByHug(
      leaseId,
      landlordAward,
      ethers.keccak256(ethers.toUtf8Bytes("hug-resolution-document"))
    );

    const landlordAfter = await krw.balanceOf(landlord.address);
    const tenantAfter = await krw.balanceOf(tenant.address);
    const settlement = await vault.getSettlementInfo(leaseId);

    expect(landlordAfter - landlordBefore).to.equal(landlordAward);
    expect(tenantAfter - tenantBefore).to.equal(claimAmount - landlordAward);
    expect(settlement[0]).to.equal(SettlementStatus.RESOLVED);
    expect(settlement[7]).to.equal(landlordAward);
  });

  it("claims above the category cap are rejected even before the overall hold cap", async () => {
    await activateLease();
    await expireLease();
    await vault.connect(tenant).requestMoveOut(leaseId);

    await expect(
      vault.connect(landlord).submitSettlementClaim(
        leaseId,
        SettlementCategory.CLEANING,
        ethers.parseEther("400000"),
        ethers.keccak256(ethers.toUtf8Bytes("too-much-cleaning"))
      )
    ).to.be.revertedWith("Vault: claim exceeds category cap");
  });

  it("an agreed extension increases endTime and keeps the lease active", async () => {
    await activateLease();

    const leaseBefore = await vault.leases(leaseId);
    await vault.connect(tenant).requestLeaseExtension(
      leaseId,
      90,
      ethers.keccak256(ethers.toUtf8Bytes("extension-terms-hash"))
    );

    const request = await vault.getLeaseChangeRequest(leaseId);
    expect(request[0]).to.equal(LeaseChangeType.EXTENSION);
    expect(request[4]).to.equal(90n);

    await vault.connect(landlord).respondToLeaseChange(leaseId, true);

    const leaseAfter = await vault.leases(leaseId);
    const requestAfter = await vault.getLeaseChangeRequest(leaseId);

    expect(leaseAfter.state).to.equal(ContractState.ACTIVE);
    expect(leaseAfter.endTime).to.equal(leaseBefore.endTime + 90n * 24n * 60n * 60n);
    expect(requestAfter[0]).to.equal(LeaseChangeType.NONE);
  });

  it("an agreed early termination starts the move-out settlement window immediately", async () => {
    await activateLease();

    await vault.connect(tenant).requestEarlyTermination(
      leaseId,
      ethers.keccak256(ethers.toUtf8Bytes("mutual-termination-request"))
    );

    const request = await vault.getLeaseChangeRequest(leaseId);
    expect(request[0]).to.equal(LeaseChangeType.EARLY_TERMINATION);

    await vault.connect(landlord).respondToLeaseChange(leaseId, true);

    const lease = await vault.leases(leaseId);
    const settlement = await vault.getSettlementInfo(leaseId);
    const requestAfter = await vault.getLeaseChangeRequest(leaseId);

    expect(lease.state).to.equal(ContractState.EXPIRED);
    expect(settlement[0]).to.equal(SettlementStatus.MOVE_OUT_REQUESTED);
    expect(settlement[2]).to.be.greaterThan(0n);
    expect(requestAfter[0]).to.equal(LeaseChangeType.NONE);
  });
});
