import { expect } from "chai";
import {
  buildMonthSequence,
  calculateRiskScore,
  computeBundleHash,
  deriveRiskSignals,
  derivePropertyIdFromAddress,
  pickLatestEcosPoint,
  stableStringify,
} from "../scripts/oracle-fetcher.js";

describe("oracle-fetcher helpers", function () {
  it("derives a deterministic propertyId from address text", async () => {
    const a = derivePropertyIdFromAddress("서울특별시 마포구 월드컵북로 396");
    const b = derivePropertyIdFromAddress("  서울특별시   마포구 월드컵북로 396 ");

    expect(a).to.equal(b);
    expect(a).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("builds a descending month sequence", async () => {
    expect(buildMonthSequence("202603", 2)).to.deep.equal(["202603", "202602", "202601"]);
    expect(buildMonthSequence("202601", 2)).to.deep.equal(["202601", "202512", "202511"]);
  });

  it("calculates a high risk score from combined warning signals", async () => {
    const { score, log } = calculateRiskScore({
      officialPriceKRW: 300000000,
      seniorDebtKRW: 270000000,
      auctionStarted: true,
      newMortgageSet: true,
      avgRentDeposit: 260000000,
      avgSalePrice: 300000000,
      rentSamples: 3,
      saleSamples: 3,
    });

    expect(score).to.equal(100);
    expect(log.join(" ")).to.include("LTV");
    expect(log.join(" ")).to.include("경매 개시");
    expect(log.join(" ")).to.include("신규 근저당");
  });

  it("derives explainable structured risk signals from market data", async () => {
    const signals = deriveRiskSignals({
      seniorDebtKRW: 180000000,
      auctionStarted: false,
      newMortgageSet: true,
      avgRentDeposit: 330000000,
      avgSalePrice: 360000000,
    });

    expect(signals.seniorDebtRisk).to.equal(true);
    expect(signals.auctionRisk).to.equal(false);
    expect(signals.recentRightsChange).to.equal(true);
    expect(signals.depositToPriceRatioBps).to.equal(9167);
    expect(signals.repaymentStress).to.equal(true);
    expect(signals.repaymentGapKRW).to.equal(150000000);
  });

  it("computes a stable bundle hash for the same logical payload", async () => {
    const bundleA = {
      propertyId: "0x1234",
      metrics: { avgSalePrice: 1, avgRentDeposit: 2 },
      risk: { score: 10, log: ["safe"] },
    };
    const bundleB = {
      risk: { log: ["safe"], score: 10 },
      metrics: { avgRentDeposit: 2, avgSalePrice: 1 },
      propertyId: "0x1234",
    };

    expect(stableStringify(bundleA)).to.equal(stableStringify(bundleB));
    expect(computeBundleHash(bundleA)).to.equal(computeBundleHash(bundleB));
  });

  it("picks the latest ECOS point for a target item code", async () => {
    const rows = [
      { STAT_CODE: "817Y002", ITEM_CODE1: "010200000", ITEM_NAME1: "국고채(3년)", TIME: "20260303", DATA_VALUE: "3.18", UNIT_NAME: "연%" },
      { STAT_CODE: "817Y002", ITEM_CODE1: "010200000", ITEM_NAME1: "국고채(3년)", TIME: "20260328", DATA_VALUE: "3.05", UNIT_NAME: "연%" },
      { STAT_CODE: "817Y002", ITEM_CODE1: "010190000", ITEM_NAME1: "국고채(1년)", TIME: "20260328", DATA_VALUE: "2.72", UNIT_NAME: "연%" },
    ];

    expect(pickLatestEcosPoint(rows, "010200000")).to.deep.equal({
      statCode: "817Y002",
      statName: undefined,
      itemCode1: "010200000",
      itemName1: "국고채(3년)",
      time: "20260328",
      valuePct: 3.05,
      unitName: "연%",
    });
  });
});
