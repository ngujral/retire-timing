// CPP and OAS calculator — launch parameter file.
// Every rate, maximum, bracket, threshold, credit and RRIF factor the engine uses lives here.
// Yearly update: copy this file, change the figures, bump AS_OF, run `node --test tests/`.
// Dollar amounts are for 2026 unless noted. "indexed: true" items grow with the inflation assumption.

(function (g) {
const P = {
  YEAR: 2026,
  AS_OF: 'November 23, 2026',

  cpp: {
    max65: 1507.65,          // maximum monthly CPP at 65, pension starting in 2026
    avg65: 858.34,           // average new pension at 65 (July 2026) — hint text only
    ympe: 74600,             // 2026 Year's Maximum Pensionable Earnings (first earnings ceiling)
    bestYears: 39,           // 47 years from 18 to 65, less the 17% general drop-out ≈ 39 years counted
    earlyPerMonth: 0.006,    // −0.6% per month before 65 (max −36% at 60)
    latePerMonth: 0.007,     // +0.7% per month after 65 (max +42% at 70)
    minAge: 60, maxAge: 70,
  },

  oas: {
    max65: 762.50,           // October–December 2026 quarter, ages 65–74
    latePerMonth: 0.006,     // +0.6% per month after 65 (max +36% at 70)
    at75: 0.10,              // permanent +10% from age 75
    minAge: 65, maxAge: 70,
    fullYears: 40, minYears: 10,
    clawbackThreshold: 95323, // 2026 income year
    clawbackRate: 0.15,
    gisSingleThreshold: 23112, // Oct–Dec 2026, income excluding OAS and GIS — warning only
  },

  rrif: {
    convertBy: 71,           // convert by Dec 31 of the year you turn 71
    // Prescribed minimum factors by age on January 1. Under 71: 1 / (90 − age).
    factors: {71:.0528,72:.0540,73:.0553,74:.0567,75:.0582,76:.0598,77:.0617,78:.0636,79:.0658,80:.0682,
              81:.0708,82:.0738,83:.0771,84:.0808,85:.0851,86:.0899,87:.0955,88:.1021,89:.1099,90:.1192,
              91:.1306,92:.1449,93:.1634,94:.1879},
    factor95plus: 0.20,
  },

  tfsa: { annualLimit: 7000, roundTo: 500 },   // 2027 limit not announced yet: indexed $7,000 rounded to the nearest $500

  // FP Canada / Institute of Financial Planning, 2026 Projection Assumption Guidelines (CPM2014 table):
  // age with a 25% probability of being reached, by current age. Couples: age one member of the couple reaches.
  life: {
    ages: [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
    M:  [95, 95, 95, 95, 95, 94, 94, 94, 94, 94, 94, 94, 94, 95, 97, 99, 103],
    F:  [98, 97, 97, 97, 97, 97, 97, 96, 96, 96, 96, 96, 96, 97, 98, 100, 103],
    MF: [99, 99, 99, 99, 99, 98, 98, 98, 98, 98, 98, 98, 98, 98, 99, 101, 104],
    MM: [98, 98, 98, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 98, 101, 104],
    FF: [100, 100, 100, 100, 100, 99, 99, 99, 99, 99, 99, 99, 99, 99, 100, 102, 105],
  },

  federal: {
    brackets: [[58523,.14],[117045,.205],[181440,.26],[258482,.29],[Infinity,.33]],
    creditRate: 0.14,
    bpaMax: 16452, bpaMin: 14829,     // reduced between the 4th and 5th bracket thresholds
    bpaPhaseFrom: 181440, bpaPhaseTo: 258482,
    ageAmount: 9208, ageThreshold: 46432, ageReduceRate: 0.15,
    pensionAmount: 2000,             // NOT indexed
  },

  ontario: {
    brackets: [[53891,.0505],[107785,.0915],[150000,.1116],[220000,.1216],[Infinity,.1316]],
    unindexedBrackets: [150000, 220000], // Ontario does not index the $150k and $220k thresholds
    creditRate: 0.0505,
    bpa: 12989,
    ageAmount: 6342, ageThreshold: 47210, ageReduceRate: 0.15,
    pensionAmount: 1796,
    surtax: [[5818,.20],[7446,.36]],  // % of basic Ontario tax above each threshold
    taxReductionBasic: 300,           // Ontario Tax Reduction: reduce tax by (2 × 300 − tax), if positive
    // Ontario Health Premium — NOT indexed. [taxable income from, base, rate, cap]
    healthPremium: [[200000,750,.25,900],[72000,600,.25,750],[48000,450,.25,600],[36000,300,.06,450],[20000,0,.06,300]],
  },

  sources: 'Canada.ca CPP and OAS payment amounts (Oct–Dec 2026) and OAS recovery tax; CRA prescribed RRIF factors; 2026 federal and Ontario brackets and credits (CRA, Ontario Ministry of Finance, KPMG 2026 tax tables).',
};
g.RT_PARAMS = P;
if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
