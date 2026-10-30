/**
 * 4% LIHTC (tax-exempt bond) pro forma.
 *
 * Market-rate underwriting asks "what is the land worth at a sale exit." A bond
 * deal asks "do sources cover uses, and how much land can the stack carry."
 * This module answers the second question at screening level: permanent debt
 * sized on restricted rents, 4% credits on eligible basis (with the 130%
 * QCT/DDA boost), deferred developer fee, and the soft-money gap that is left.
 */

export interface LihtcUnitMix {
  /** Units by bedroom count */
  studios?: number; oneBr: number; twoBr: number; threeBr: number;
}

export interface LihtcAssumptions {
  /** Max LIHTC gross rents at the target AMI tier by bedroom (monthly). Utility allowance is netted below. */
  grossRents: { studio?: number; oneBr: number; twoBr: number; threeBr: number };
  utilityAllowance: { studio?: number; oneBr: number; twoBr: number; threeBr: number };
  /** Average net living sf by bedroom */
  unitSf: { studio?: number; oneBr: number; twoBr: number; threeBr: number };
  /** Common area, circulation and amenity sf added to net rentable to get gross building sf (0.18 = +18%) */
  grossUpPct: number;
  otherIncomePerUnitYear: number;
  vacancyPct: number;
  opexPerUnitYear: number;
  replacementReservePerUnitYear: number;
  realEstateTaxPerUnitYear: number;
  /** Permanent loan */
  permRate: number; permAmortYears: number; minDscr: number;
  /** Credits */
  creditRate: number;           // 0.04 floor
  qctOrDda: boolean;            // 130% basis boost
  creditPrice: number;          // $ per $1 of 10-year credit
  applicableFraction: number;   // share of units that are LIHTC
  /** Costs */
  hardCostPerGrossSf: number;
  softCostPct: number;          // of hard, excluding developer fee and reserves
  developerFeePct: number;      // of total development cost before fee (15% cap typical)
  deferredFeeMaxPct: number;    // share of fee that can be deferred
  contingencyPct: number;
  constructionMonths: number;
  constructionRate: number;
  parkingSpaces: number; parkingCostPerSpace: number;
  operatingReservePerUnit: number;
}

export interface LihtcResult {
  units: number;
  netRentableSf: number; grossBuildingSf: number;
  grossPotentialRent: number; effectiveGrossIncome: number; operatingExpenses: number; noi: number;
  permLoan: number; annualDebtService: number; dscr: number;
  eligibleBasis: number; boostedBasis: number; annualCredits: number; tenYearCredits: number; lihtcEquity: number;
  developerFee: number; deferredFee: number;
  uses: { land: number; hard: number; parking: number; sitework: number; soft: number; contingency: number; constructionInterest: number; developerFee: number; reserves: number; total: number };
  sources: { permLoan: number; lihtcEquity: number; deferredFee: number; gap: number; total: number };
  /** Land the stack carries with zero gap, holding everything else constant */
  landSupportableAtZeroGap: number;
  gapPerUnit: number;
  totalDevelopmentCostPerUnit: number;
  notes: string[];
}

export const RICHMOND_60AMI_2026: LihtcAssumptions = {
  grossRents: { studio: 1170, oneBr: 1254, twoBr: 1504, threeBr: 1738 },
  utilityAllowance: { studio: 85, oneBr: 95, twoBr: 120, threeBr: 150 },
  unitSf: { studio: 500, oneBr: 680, twoBr: 920, threeBr: 1150 },
  grossUpPct: 0.18,
  otherIncomePerUnitYear: 420,
  vacancyPct: 0.07,
  opexPerUnitYear: 5600,
  replacementReservePerUnitYear: 300,
  realEstateTaxPerUnitYear: 1100,
  permRate: 0.0625, permAmortYears: 40, minDscr: 1.15,
  creditRate: 0.04, qctOrDda: true, creditPrice: 0.86, applicableFraction: 1,
  hardCostPerGrossSf: 215,
  softCostPct: 0.22,
  developerFeePct: 0.15,
  deferredFeeMaxPct: 0.5,
  contingencyPct: 0.05,
  constructionMonths: 18,
  constructionRate: 0.065,
  parkingSpaces: 0, parkingCostPerSpace: 6500,
  operatingReservePerUnit: 2500,
};

const r0 = (n: number) => Math.round(n);

export function lihtcProForma(mix: LihtcUnitMix, land: number, sitework: number, a: LihtcAssumptions): LihtcResult {
  const notes: string[] = [];
  const studios = mix.studios ?? 0;
  const units = studios + mix.oneBr + mix.twoBr + mix.threeBr;
  const netRentableSf = studios * (a.unitSf.studio ?? 500) + mix.oneBr * a.unitSf.oneBr + mix.twoBr * a.unitSf.twoBr + mix.threeBr * a.unitSf.threeBr;
  const grossBuildingSf = r0(netRentableSf * (1 + a.grossUpPct));

  const netRent = (g: number | undefined, ua: number | undefined) => Math.max(0, (g ?? 0) - (ua ?? 0));
  const gpr = 12 * (studios * netRent(a.grossRents.studio, a.utilityAllowance.studio) + mix.oneBr * netRent(a.grossRents.oneBr, a.utilityAllowance.oneBr) + mix.twoBr * netRent(a.grossRents.twoBr, a.utilityAllowance.twoBr) + mix.threeBr * netRent(a.grossRents.threeBr, a.utilityAllowance.threeBr));
  const egi = (gpr + units * a.otherIncomePerUnitYear) * (1 - a.vacancyPct);
  const opex = units * (a.opexPerUnitYear + a.replacementReservePerUnitYear + a.realEstateTaxPerUnitYear);
  const noi = egi - opex;

  // Perm loan sized to DSCR on a fully amortizing payment
  const i = a.permRate / 12, n = a.permAmortYears * 12;
  const paymentPerDollar = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) * 12;
  const permLoan = Math.max(0, (noi / a.minDscr) / paymentPerDollar);
  const ads = permLoan * paymentPerDollar;

  // Uses
  const hard = grossBuildingSf * a.hardCostPerGrossSf;
  const parking = a.parkingSpaces * a.parkingCostPerSpace;
  const soft = (hard + parking + sitework) * a.softCostPct;
  const contingency = (hard + parking + sitework) * a.contingencyPct;
  const constructionBasis = hard + parking + sitework + soft + contingency;
  const constructionInterest = constructionBasis * 0.6 * a.constructionRate * (a.constructionMonths / 12) * 0.55;
  const preFee = land + constructionBasis + constructionInterest;
  const developerFee = (preFee - land) * a.developerFeePct;
  const reserves = units * a.operatingReservePerUnit;
  const totalUses = preFee + developerFee + reserves;

  // Credits: eligible basis excludes land, reserves, perm financing costs; most soft costs and the fee are in.
  const eligibleBasis = constructionBasis + constructionInterest + developerFee;
  const boostedBasis = eligibleBasis * (a.qctOrDda ? 1.3 : 1);
  const annualCredits = boostedBasis * a.applicableFraction * a.creditRate;
  const tenYear = annualCredits * 10;
  const lihtcEquity = tenYear * a.creditPrice;
  if (a.qctOrDda) notes.push('130% basis boost applied (QCT/DDA); confirm census tract designation for the placed-in-service year.');

  const deferredFee = Math.min(developerFee * a.deferredFeeMaxPct, Math.max(0, totalUses - permLoan - lihtcEquity));
  const gap = Math.max(0, totalUses - permLoan - lihtcEquity - deferredFee);
  const totalSources = permLoan + lihtcEquity + deferredFee + gap;
  const landSupportable = Math.max(0, land + (permLoan + lihtcEquity + developerFee * a.deferredFeeMaxPct) - totalUses);
  if (gap > 0) notes.push(`Soft gap of $${r0(gap).toLocaleString()} (${r0(gap / units).toLocaleString()}/unit) to be filled by HOME, housing trust fund, locality soft loan or sponsor loan.`);
  if (deferredFee > 0) notes.push(`Deferred developer fee $${r0(deferredFee).toLocaleString()} must be repayable from cash flow within 15 years to count as a source.`);

  return {
    units, netRentableSf, grossBuildingSf,
    grossPotentialRent: r0(gpr), effectiveGrossIncome: r0(egi), operatingExpenses: r0(opex), noi: r0(noi),
    permLoan: r0(permLoan), annualDebtService: r0(ads), dscr: ads > 0 ? Number((noi / ads).toFixed(2)) : 0,
    eligibleBasis: r0(eligibleBasis), boostedBasis: r0(boostedBasis), annualCredits: r0(annualCredits), tenYearCredits: r0(tenYear), lihtcEquity: r0(lihtcEquity),
    developerFee: r0(developerFee), deferredFee: r0(deferredFee),
    uses: { land: r0(land), hard: r0(hard), parking: r0(parking), sitework: r0(sitework), soft: r0(soft), contingency: r0(contingency), constructionInterest: r0(constructionInterest), developerFee: r0(developerFee), reserves: r0(reserves), total: r0(totalUses) },
    sources: { permLoan: r0(permLoan), lihtcEquity: r0(lihtcEquity), deferredFee: r0(deferredFee), gap: r0(gap), total: r0(totalSources) },
    landSupportableAtZeroGap: r0(landSupportable),
    gapPerUnit: r0(gap / units),
    totalDevelopmentCostPerUnit: r0(totalUses / units),
    notes,
  };
}
