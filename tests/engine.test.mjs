// Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import P from '../js/params-2026.js';
import E from '../js/engine.js';
const { lifePlan, cppEstimate, cppMonthly, oasMonthly, rrifFactor, taxPerson, taxHousehold, project, compute, validate } = E;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

// A 60-year-old in Ontario, born January 1967, maximum CPP, full OAS, $500k RRSP, needs $70,000 a year before tax.
const person = (o = {}) => ({ name: 'You', birthYear: 1967, birthMonth: 1, cpp65: 1507.65, yearsCanada: 40, rrsp: 500000, rrspRet: 0.04,
  tfsa: 0, tfsaRet: 0.04, sav: 0, savRet: 0.04, other: [], rrifAge: 71, ...o });
const base = (over = {}) => ({
  province: 'ON', firstYear: 2027, planTo: 90, inflation: 0.02, income: 70000, couple: false, split: false,
  people: [person()],
  scenarios: [{ people: [{ cpp: 65 * 12, oas: 65 * 12 }] }, { people: [{ cpp: 70 * 12, oas: 70 * 12 }] }],
  ...over,
});

test('T-01 CPP at 60 and 70 from the maximum at 65', () => {
  near(cppMonthly(P, 1507.65, 60 * 12), 965, 1, 'CPP at 60');
  near(cppMonthly(P, 1507.65, 70 * 12), 2141, 1, 'CPP at 70');
  near(cppMonthly(P, 1507.65, 75 * 12), 2141, 1, 'no increase after 70');
});

test('CPP at 65 estimated from years worked and earnings', () => {
  near(cppEstimate(P, 39, 74600), 1507.65, 0.01, 'full years at the ceiling = maximum');
  near(cppEstimate(P, 45, 120000), 1507.65, 0.01, 'capped at the maximum');
  near(cppEstimate(P, 19.5, 74600), 753.83, 0.01, 'half the years = half');
  near(cppEstimate(P, 39, 37300), 753.83, 0.01, 'half the ceiling = half');
  assert.equal(cppEstimate(P, 0, 50000), 0);
});

test('T-02 OAS at 65, 70 and 75+', () => {
  near(oasMonthly(P, 40, 65 * 12), 762.50, 0.01);
  near(oasMonthly(P, 40, 70 * 12), 1037, 1);
  near(oasMonthly(P, 40, 65 * 12, true), 838.75, 0.01);
  near(oasMonthly(P, 20, 65 * 12), 381.25, 0.01, 'T-09 partial OAS halves at 20 years');
  assert.equal(oasMonthly(P, 9, 65 * 12), 0, 'under 10 years: no OAS');
});

test('T-03 no start age of 71 for CPP or OAS', () => {
  const e1 = validate(P, base({ scenarios: [{ people: [{ cpp: 71 * 12, oas: 65 * 12 }] }] }));
  assert.ok(e1.some(e => /60 to 70/.test(e.msg)));
  const e2 = validate(P, base({ scenarios: [{ people: [{ cpp: 65 * 12, oas: 71 * 12 }] }] }));
  assert.ok(e2.some(e => /65 to 70/.test(e.msg)));
  const e3 = validate(P, base({ scenarios: [{ people: [{ cpp: 65 * 12, oas: 64 * 12 }] }] }));
  assert.ok(e3.length, 'OAS before 65 blocked');
});

test('T-04 OAS clawback: $10,000 over the threshold costs $1,500', () => {
  const t = taxPerson(P, { net: P.oas.clawbackThreshold + 10000, oas: 9150, elig: 0, age: 66 }, 1);
  near(t.claw, 1500, 0.01);
  near(taxPerson(P, { net: 300000, oas: 9150, elig: 0, age: 66 }, 1).claw, 9150, 0.01, 'capped at OAS received');
});

test('T-05 RRIF minimum at 71 on $500,000', () => {
  near(500000 * rrifFactor(P, 71), 26400, 0.01);
  near(350000 * rrifFactor(P, 71), 18480, 0.01);
  near(rrifFactor(P, 65), 0.04, 1e-9);
  assert.equal(rrifFactor(P, 97), 0.20);
});

test('tax matches the published 2026 Ontario table (federal + Ontario incl. surtax, no health premium, no tax reduction)', () => {
  // Raymond Chabot Grant Thornton, Individual taxation Ontario 2026, Table I1
  const table = { 20000: [497, 354], 50000: [4697, 1869], 60000: [6193, 2625], 100000: [14393, 6378], 120000: [18655, 9198],
    150000: [26455, 14420], 200000: [40067, 23905], 250000: [54714, 33858], 300000: [70900, 44123] };
  for (const [inc, [fed, ont]] of Object.entries(table)) {
    const t = taxPerson(P, { net: +inc, oas: 0, elig: 0, age: 50, otr: false }, 1);
    near(t.fed, fed, 1, `federal at ${inc}`);
    near(t.ont, ont, 1, `Ontario at ${inc}`);
  }
});

test('Ontario health premium, tax reduction and senior credits', () => {
  assert.equal(taxPerson(P, { net: 19000, age: 50 }, 1).ohp, 0);
  near(taxPerson(P, { net: 30000, age: 50 }, 1).ohp, 300, 0.01);
  near(taxPerson(P, { net: 60000, age: 50 }, 1).ohp, 600, 0.01);
  near(taxPerson(P, { net: 100000, age: 50 }, 1).ohp, 750, 0.01);
  assert.equal(taxPerson(P, { net: 16000, age: 50, otr: true }, 1).ont, 0);
  const young = taxPerson(P, { net: 40000, age: 50, elig: 0 }, 1), old = taxPerson(P, { net: 40000, age: 66, elig: 2000 }, 1);
  near(young.fed - old.fed, 0.14 * (9208 + 2000), 1, 'federal age + pension credits');
});

test('repayment of OAS is deducted before tax (line 23500)', () => {
  const t = taxPerson(P, { net: 120000, oas: 9150, elig: 0, age: 66 }, 1);
  near(t.taxable, 120000 - t.claw, 0.01);
});

test('income needed is paid every year: CPP and OAS first, then the RRSP/RRIF tops it up', () => {
  const r = project(P, base({ people: [person({ rrsp: 900000 })] }), base().scenarios[1]);
  assert.equal(r.rows.filter(x => x.ages[0] <= 78).reduce((t, x) => t + x.unfunded, 0), 0, 'fully paid with $900k');
  for (const row of r.rows.filter(x => x.ages[0] <= 78)) {
    near(row.cpp + row.oas + row.w + row.fromSav + row.fromTfsa + row.unfunded, row.need, 1, `gross income + shortfall at ${row.ages[0]}`);
    near(row.need, 70000 * row.idx, 0.01);
  }
  const at62 = r.rows.find(x => x.ages[0] === 62);
  near(at62.w, 70000 * at62.idx, 1, 'before pensions start, all from the RRSP');
  const at72 = r.rows.find(x => x.ages[0] === 72);
  assert.ok(at72.cpp > 0 && at72.oas > 0 && at72.w < at62.w, 'once pensions start, the RRSP covers less');
});

test('withdrawal order: RRSP/RRIF first, then other savings, then TFSA', () => {
  const inp = base({ people: [person({ rrsp: 100000, sav: 100000, tfsa: 100000 })], scenarios: [{ people: [{ cpp: 840, oas: 840 }] }] });
  const r = project(P, inp, inp.scenarios[0]);
  const y1 = r.rows[0];
  assert.ok(y1.extra > 0 && y1.fromSav === 0 && y1.fromTfsa === 0, 'year 1 from the RRSP only');
  const firstSav = r.rows.find(x => x.fromSav > 0), firstTfsa = r.rows.find(x => x.fromTfsa > 0);
  assert.ok(firstSav && firstTfsa && firstSav.year <= firstTfsa.year, 'savings before TFSA');
  assert.ok(r.rows.find(x => x.year === firstSav.year - 1).per[0].bal < 1 || firstSav.extra > 0, 'RRSP used up before savings');
});

test('T-08 deferring both to 70 with nothing to draw on: shortfall flagged', () => {
  const inp = base({ people: [person({ rrsp: 0 })], scenarios: [{ people: [{ cpp: 70 * 12, oas: 70 * 12 }] }] });
  const res = compute(P, inp);
  const s = res.scen[0];
  assert.ok(s.gap.length >= 5, 'waiting years listed');
  assert.ok(s.unfundedGap > 50000, 'shortfall reported');
  assert.ok(res.warn.some(w => /Money runs out/.test(w)));
  const ok = compute(P, { ...inp, people: [person({ rrsp: 0, tfsa: 1e7 })] });
  near(ok.scen[0].unfundedGap, 0, 0.01, 'TFSA covers it');
});

test('no income entered: only CPP, OAS, other income and the RRIF minimum; nothing is drawn', () => {
  const r = project(P, base({ income: 0, people: [person({ tfsa: 50000, sav: 50000 })] }), base().scenarios[0]);
  for (const row of r.rows) { assert.equal(row.fromSav + row.fromTfsa, 0); near(row.w, row.per[0].minReq, 0.01); }
});

test('surplus (e.g. a large RRIF minimum) is saved to other savings', () => {
  const r = project(P, base({ income: 30000, people: [person({ rrsp: 2000000 })] }), base().scenarios[0]);
  const at80 = r.rows.find(x => x.ages[0] === 80);
  assert.ok(at80.surplus > 0 && at80.nonreg > 0);
});

test('each account grows at its own return', () => {
  const inp = base({ income: 0, people: [person({ rrspRet: 0.07, tfsa: 10000, tfsaRet: 0.05, sav: 0 })] });
  const r = project(P, inp, inp.scenarios[1]);
  near(r.rows[0].per[0].bal, 500000 * 1.07, 0.01, 'RRSP 7%');
  near(r.rows[0].per[0].tfsaBal, 10000 * 1.05, 0.01, 'TFSA 5%');
});

test('T-07 breakeven before and after tax for CPP 65 vs 70', () => {
  const inp = base({ people: [person({ rrsp: 600000 })],
    scenarios: [{ people: [{ cpp: 65 * 12, oas: 65 * 12 }] }, { people: [{ cpp: 70 * 12, oas: 65 * 12 }] }] });
  const pr = compute(P, inp).pairs[0];
  assert.ok(pr.gross && pr.after, 'both crossovers found');
  assert.ok(pr.gross.age > 75 && pr.gross.age < 100);
  const late = compute(P, base({ scenarios: [{ people: [{ cpp: 60 * 12, oas: 65 * 12 }] }, { people: [{ cpp: 60 * 12 + 1, oas: 65 * 12 }] }] }));
  assert.ok(late.pairs[0].gross === null || late.pairs[0].gross.age <= 100);
});

test('last year-by-year row of money left matches the card', () => {
  for (const income of [0, 60000, 95000]) for (const couple of [false, true]) {
    const inp = base({ income, couple, split: couple,
      people: [person({ tfsa: 80000, sav: 50000 }), person({ name: 'Partner', birthYear: 1969, birthMonth: 6, cpp65: 900, rrsp: 200000, tfsa: 40000 })],
      scenarios: [{ people: [{ cpp: 780, oas: 780 }, { cpp: 780, oas: 780 }] }, { people: [{ cpp: 840, oas: 840 }, { cpp: 840, oas: 840 }] }] });
    for (const s of compute(P, inp).scen) near(s.shown.rows.at(-1).left, s.t.leftover, 0.5, `income=${income} couple=${couple}`);
  }
});

test('couple: after the first death the survivor needs less and gets a CPP survivor pension (capped at the maximum)', () => {
  const inp = base({ couple: true, income: 100000, survivorPct: 0.7, planTo: 85,
    people: [person({ birthYear: 1962, cpp65: 1200, rrsp: 3000000 }), person({ name: 'Partner', birthYear: 1967, cpp65: 700, rrsp: 0 })],
    scenarios: [{ people: [{ cpp: 780, oas: 780 }, { cpp: 780, oas: 780 }] }] });
  const r = project(P, inp, inp.scenarios[0]);
  const both = r.rows.find(x => x.ages[0] === 80), after = r.rows.find(x => x.ages[0] === 86);   // you: plan ends at 85
  near(both.need, 100000 * both.idx, 0.01, 'full income while both alive');
  near(after.need, 70000 * after.idx, 0.01, '70% for the survivor');
  const q = after.per[1];
  assert.ok(q.surv > 0, 'survivor pension paid');
  near(q.surv / 12, Math.min(0.6 * 1200, P.cpp.max65 - 700) * after.idx, 0.5, '60% of the spouse’s CPP');
  // cap: own CPP + survivor pension can't exceed the maximum retirement pension
  const capped = project(P, { ...inp, people: [person({ birthYear: 1962, cpp65: 1500, rrsp: 3000000 }), person({ name: 'Partner', birthYear: 1967, cpp65: 1400, rrsp: 0 })] }, inp.scenarios[0]);
  const qc = capped.rows.find(x => x.ages[0] === 86).per[1];
  near((qc.cpp - qc.surv) / 12 + qc.surv / 12, P.cpp.max65 * capped.rows.find(x => x.ages[0] === 86).idx, 0.5, 'capped at the maximum');
});

test('even out taxes: steady taxable income while the RRSP lasts, RRSP used up by the end, less lifetime tax', () => {
  const inp = base({ income: 120000, people: [person({ rrsp: 1500000, tfsa: 600000 })], scenarios: [{ people: [{ cpp: 840, oas: 840 }] }] });
  const smooth = compute(P, inp).scen[0], first = compute(P, { ...inp, order: 'rrsp' }).scen[0];
  assert.ok(smooth.level > 0 && smooth.level < 120000, `level ${smooth.level}`);
  const taxable = smooth.shown.rows.filter(r => r.ages[0] >= 61 && r.ages[0] <= 85).map(r => r.income / r.idx);
  const spread = Math.max(...taxable) - Math.min(...taxable);
  assert.ok(spread < 0.1 * smooth.level, `taxable income spread ${spread.toFixed(0)} vs level ${smooth.level.toFixed(0)}`);
  assert.ok((smooth.shown.estate?.balance || 0) < 0.02 * 1500000, 'RRSP mostly used by the end');
  assert.ok(smooth.t.taxReal + smooth.t.clawReal < first.t.taxReal + first.t.clawReal, 'less lifetime tax than RRSP first');
  const r = smooth.shown.rows;
  for (const row of r) near(row.cpp + row.oas + row.w + row.fromSav + row.fromTfsa + row.unfunded + row.per.reduce((t, q) => t + (q ? q.emp + q.pen + q.oth : 0), 0) - row.surplus, row.need, 1, `need paid at ${row.ages[0]}`);
});

test('plan length from the FP Canada 2026 table (25% chance of being reached)', () => {
  assert.deepEqual(lifePlan(P, [{ age: 65, sex: 'M' }]).ages, [94]);
  assert.deepEqual(lifePlan(P, [{ age: 70, sex: 'F' }]).ages, [96]);
  const c = lifePlan(P, [{ age: 60, sex: 'M' }, { age: 60, sex: 'F' }]);
  assert.equal(c.joint, 98); assert.deepEqual(c.ages, [94, 98], 'man plans to 94, the woman (longest) to the couple age 98');
  const d = lifePlan(P, [{ age: 61, sex: 'M' }, { age: 58, sex: 'F' }]);
  assert.ok(d.ages[0] === 94 && d.ages[1] >= 96, `different ages: ${d.ages}`);
});

test('TFSA room: extra money goes to the TFSA within room, the rest to other savings; withdrawals restore room', () => {
  const inp = base({ income: 30000, people: [person({ rrsp: 2000000, tfsaRoom: 20000 })] });
  const r = project(P, inp, inp.scenarios[0]);
  const y1 = r.rows.find(x => x.surplus > 0);
  assert.ok(y1, 'a year with extra money');
  const inTfsa = r.rows.reduce((t, x) => t + (x.tfsa > 0 ? 1 : 0), 0);
  assert.ok(inTfsa > 0 && r.rows.at(-1).nonreg > 0, 'TFSA filled first, then other savings');
  const none = project(P, { ...inp, people: [person({ rrsp: 2000000, tfsaRoom: 0 })] }, inp.scenarios[0]);
  assert.ok(none.rows.some(x => x.tfsa > 0), 'new room each year still lets some in');
});

test('defined benefit pension: counts from its start age, indexed or not', () => {
  const inp = base({ income: 0, people: [person({ rrsp: 0, other: [{ type: 'pension', amount: 30000, from: 65, to: 200, indexed: false }] })] });
  const r = project(P, inp, inp.scenarios[0]);
  assert.equal(r.rows.find(x => x.ages[0] === 64).per[0].pen, 0);
  near(r.rows.find(x => x.ages[0] === 70).per[0].pen, 30000, 0.01, 'not indexed');
  const ix = project(P, { ...inp, people: [person({ rrsp: 0, other: [{ type: 'pension', amount: 30000, from: 65, to: 200 }] })] }, inp.scenarios[0]);
  const r70 = ix.rows.find(x => x.ages[0] === 70);
  near(r70.per[0].pen, 30000 * r70.idx, 0.01, 'indexed');
});

test('T-09 Quebec is not calculated; low income shows the GIS warning', () => {
  assert.ok(compute(P, base({ province: 'QC' })).errors.some(e => /QPP/.test(e.msg)));
  const low = compute(P, base({ income: 0, people: [person({ cpp65: 300, rrsp: 0 })] }));
  assert.ok(low.warn.some(w => /GIS/.test(w)));
});

test('couple: clawback per person, pension splitting never raises tax', () => {
  const a = { net: 130000, oas: 9150, elig: 40000, emp: 0, age: 72 }, b = { net: 20000, oas: 9150, elig: 0, emp: 0, age: 70 };
  const no = taxHousehold(P, [a, b], 1, false), yes = taxHousehold(P, [a, b], 1, true);
  assert.ok(yes.total < no.total - 1000, 'splitting saves tax here');
  assert.ok(no.res[1].claw === 0 && no.res[0].claw > 0, 'clawback per person');
  const r = compute(P, base({ couple: true, split: true, people: [person(), person({ name: 'Partner', birthYear: 1969, birthMonth: 6, cpp65: 900, rrsp: 100000 })],
    scenarios: [{ people: [{ cpp: 780, oas: 780 }, { cpp: 780, oas: 780 }] }, { people: [{ cpp: 840, oas: 840 }, { cpp: 840, oas: 840 }] }] }));
  assert.ok(!r.errors && r.scen.length === 2);
});

test('performance: 3 scenarios, couple, splitting under 100 ms', () => {
  const inp = base({ couple: true, split: true, people: [person({ tfsa: 50000 }), person({ name: 'Partner', birthYear: 1968, birthMonth: 3, cpp65: 1000, rrsp: 300000 })],
    scenarios: [{ people: [{ cpp: 720, oas: 780 }, { cpp: 720, oas: 780 }] }, { people: [{ cpp: 780, oas: 780 }, { cpp: 780, oas: 780 }] }, { people: [{ cpp: 840, oas: 840 }, { cpp: 840, oas: 840 }] }] });
  compute(P, inp);
  const t0 = performance.now(); compute(P, inp); const ms = performance.now() - t0;
  assert.ok(ms < 100, `took ${ms.toFixed(1)} ms`);
});

test('retirement age: no withdrawals and nothing spent from savings before retiring; pay is taxed', () => {
  const base = { province: 'ON', firstYear: 2026, planTo: 90, inflation: 0.02, income: 80000, order: 'rrsp', couple: false, split: false,
    people: [{ name: 'A', birthYear: 1966, birthMonth: 1, cpp65: 1000, yearsCanada: 40, rrsp: 500000, rrspRet: 0.05, tfsa: 100000, tfsaRet: 0.05, sav: 0, rrifAge: 71, retireAge: 65,
      other: [{ type: 'employment', amount: 100000, from: 0, to: 64 }] }] };

  const r = E.project(P, { ...base, retireYear: 1966 + 65 }, { people: [{ cpp: 65 * 12, oas: 65 * 12 }] });
  const pre = r.rows.filter(x => x.year < 2031), post = r.rows.filter(x => x.year >= 2031);
  assert.ok(pre.every(x => x.w === 0 && x.fromSav === 0 && x.fromTfsa === 0), 'no draws while working');
  assert.ok(pre.every(x => x.tax > 20000), 'pay is taxed');
  assert.ok(post[0].w > 0, 'draws start at retirement');
  // RRSP grows untouched for 5 years at 5%
  assert.ok(Math.abs(pre.at(-1).bal - 500000 * 1.05 ** 5) < 1);
});
