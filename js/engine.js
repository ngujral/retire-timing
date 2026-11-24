// CPP and OAS calculator — calculation engine (no DOM).
// Projects every year for each person: income → tax → OAS clawback → after-tax income → balances.
// All amounts are nominal (future) dollars; each row carries `idx` so the page can show today's dollars.
// Figures come only from the parameter file passed in.

(function (g) {
'use strict';
const r2 = x => Math.round(x * 100) / 100;

// ---------- pension amounts ----------
function cppFactor(P, startMonths) {
  const d = startMonths - 65 * 12;
  return d < 0 ? 1 + d * P.cpp.earlyPerMonth : 1 + Math.min(d, 60) * P.cpp.latePerMonth;
}
function oasFactor(P, startMonths) {
  return 1 + Math.min(Math.max(startMonths - 65 * 12, 0), 60) * P.oas.latePerMonth;
}
const cppMonthly = (P, at65, startMonths) => at65 * cppFactor(P, startMonths);
/** Rough CPP at 65 (monthly, today's dollars) from years of contributions and typical earnings.
 *  max at 65 × (years ÷ 39, up to 1) × (earnings ÷ YMPE, up to 1). Service Canada's statement is more accurate. */
function cppEstimate(P, years, earnings) {
  const y = Math.min(Math.max(years || 0, 0), P.cpp.bestYears) / P.cpp.bestYears;
  const e = Math.min(Math.max(earnings || 0, 0), P.cpp.ympe) / P.cpp.ympe;
  return P.cpp.max65 * y * e;
}
function oasMonthly(P, years, startMonths, over75 = false) {
  if (years < P.oas.minYears) return 0;
  return P.oas.max65 * Math.min(years, P.oas.fullYears) / P.oas.fullYears * oasFactor(P, startMonths) * (over75 ? 1 + P.oas.at75 : 1);
}
function rrifFactor(P, ageJan1) {
  if (ageJan1 < 71) return 1 / (90 - ageJan1);
  return ageJan1 >= 95 ? P.rrif.factor95plus : P.rrif.factors[ageJan1];
}

// ---------- tax ----------
function bracketTax(x, brackets, idx, fixed = []) {
  let tax = 0, lo = 0;
  for (const [top, rate] of brackets) {
    const hi = top === Infinity ? Infinity : (fixed.includes(top) ? top : top * idx);
    if (x > lo) tax += (Math.min(x, hi) - lo) * rate;
    lo = hi;
  }
  return tax;
}
function marginalBracket(x, brackets, idx, fixed = []) {
  for (const [top, rate] of brackets) {
    const hi = top === Infinity ? Infinity : (fixed.includes(top) ? top : top * idx);
    if (x < hi) return rate;
  }
}
function healthPremium(ti, tiers) {
  for (const [from, base, rate, cap] of tiers) if (ti > from) return Math.min(cap, base + rate * (ti - from));
  return 0;
}

/** One person's tax for one year.
 *  p = { net: total income (line 15000), oas, elig: eligible pension income, emp: employment income, age, otr: claims Ontario Tax Reduction }
 */
function taxPerson(P, p, idx) {
  const F = P.federal, O = P.ontario;
  const claw = Math.min(p.oas || 0, P.oas.clawbackRate * Math.max(0, p.net - P.oas.clawbackThreshold * idx));
  const ni = p.net - claw;                // net income after the line 23500 deduction = taxable income here
  const ti = Math.max(0, ni);
  // federal
  let bpa = F.bpaMax * idx;
  if (ni > F.bpaPhaseFrom * idx) bpa = Math.max(F.bpaMin * idx, F.bpaMax * idx - (F.bpaMax - F.bpaMin) * idx * Math.min(1, (ni - F.bpaPhaseFrom * idx) / ((F.bpaPhaseTo - F.bpaPhaseFrom) * idx)));
  const fAge = p.age >= 65 ? Math.max(0, F.ageAmount * idx - F.ageReduceRate * Math.max(0, ni - F.ageThreshold * idx)) : 0;
  const fPen = Math.min(F.pensionAmount, p.elig || 0);
  const fEmp = Math.min(1501 * idx, p.emp || 0);
  const fed = Math.max(0, bracketTax(ti, F.brackets, idx) - F.creditRate * (bpa + fAge + fPen + fEmp));
  // Ontario
  const oAge = p.age >= 65 ? Math.max(0, O.ageAmount * idx - O.ageReduceRate * Math.max(0, ni - O.ageThreshold * idx)) : 0;
  const oPen = Math.min(O.pensionAmount * idx, p.elig || 0);
  const basic = Math.max(0, bracketTax(ti, O.brackets, idx, O.unindexedBrackets) - O.creditRate * (O.bpa * idx + oAge + oPen));
  let ont = basic;
  for (const [thr, rate] of O.surtax) ont += rate * Math.max(0, basic - thr * idx);
  if (p.otr) ont -= Math.min(ont, Math.max(0, 2 * O.taxReductionBasic * idx - ont));
  const ohp = healthPremium(ti, O.healthPremium);
  return { claw, taxable: ti, fed, ont, ohp, tax: fed + ont + ohp, total: fed + ont + ohp + claw };
}

/** Household tax with optional pension income splitting (search for the split that minimises tax + clawback). */
function taxHousehold(P, persons, idx, split) {
  const alive = persons.map((p, i) => p ? i : -1).filter(i => i >= 0);
  const evalWith = ps => {
    const live = ps.filter(Boolean);
    const top = live.length ? live.reduce((a, b) => (b.net > a.net ? b : a)) : null; // only the higher-income spouse claims the Ontario Tax Reduction
    const res = ps.map(p => p ? taxPerson(P, { ...p, otr: p === top }, idx) : null);
    return { res, total: res.reduce((s, r) => s + (r ? r.total : 0), 0), moved: 0 };
  };
  if (!split || alive.length < 2) return evalWith(persons);
  const [a, b] = persons;
  let best = evalWith(persons);
  for (let k = -20; k <= 20; k++) {
    if (!k) continue;
    const f = k / 40;                         // −50% … +50%
    const from = f > 0 ? a : b, amt = Math.abs(f) * (from.elig || 0);
    if (!amt) continue;
    const s = f > 0 ? 1 : -1;
    const na = { ...a, net: a.net - s * amt, elig: a.elig - s * amt }, nb = { ...b, net: b.net + s * amt, elig: b.elig + s * amt };
    const t = evalWith([na, nb]);
    if (t.total < best.total - 0.005) { best = t; best.moved = s * amt; }
  }
  return best;
}

// ---------- defaults ----------
const CEILINGS = P => ({ fed1: P.federal.brackets[0][0], on1: P.ontario.brackets[0][0], oas: P.oas.clawbackThreshold });

// split `amount` across pools in proportion to what each holds (never more than a pool has)
function drawFrom(pools, amount) {
  const total = pools.reduce((s, v) => s + Math.max(0, v), 0);
  if (amount <= 0 || total <= 0) return pools.map(() => 0);
  if (amount >= total) return pools.map(v => Math.max(0, v));
  return pools.map(v => Math.max(0, v) / total * amount);
}

// ---------- projection ----------
/** Run one scenario. Each year: pay the income needed (before tax) from CPP, OAS and other income first,
 *  then RRSP/RRIF withdrawals, then other savings, then the TFSA. opts: { planTo } */
function project(P, input, sc, opts = {}) {
  const people = input.people.slice(0, input.couple ? 2 : 1);
  const ptOf = p => opts.planTo ?? p.planTo ?? input.planTo;     // each person's own plan-to age
  const infl = input.inflation, ret = input.ret ?? 0.04;
  const y0 = input.firstYear;
  const lastYear = Math.max(...people.map(p => p.birthYear + ptOf(p)));
  const st = people.map((p, i) => {
    const s = sc.people[i];
    const b = p.birthYear * 12 + (p.birthMonth - 1);
    return {
      b, bal: Math.max(0, p.rrsp || 0), tfsa: Math.max(0, p.tfsa || 0), sav: Math.max(0, p.sav || 0),
      rR: p.rrspRet ?? ret, tR: p.tfsaRet ?? ret, sR: p.savRet ?? ret, conv: p.rrifAge ?? 71,
      cppStart: p.cppStarted ? -Infinity : b + s.cpp + 1, oasStart: p.oasStarted ? -Infinity : b + s.oas + 1,
      cppMo: p.cppStarted ? p.cppStartedAmt : cppMonthly(P, p.cpp65, s.cpp),
      cpp65: p.cppStarted ? p.cppStartedAmt : (p.cpp65 || 0),
      // an OAS already in pay after 75 already includes the 10% increase
      oasMo: p.oasStarted ? p.oasStartedAmt / ((y0 - p.birthYear) > 75 ? 1 + P.oas.at75 : 1) : oasMonthly(P, p.yearsCanada, s.oas),
      at75: b + 75 * 12 + 1, death: (p.birthYear + ptOf(p)) * 12 + 11,
      room: Math.max(0, p.tfsaRoom || 0), roomBack: 0,
      rrif72: null, min72: null, rrspOut: null,
    };
  });
  const rows = [];
  let estate = null, shortAge = null, shortWithRrsp = false;

  for (let y = y0; y <= lastYear; y++) {
    const idx = Math.pow(1 + infl, y - 2026);
    const alive = people.map((p, i) => y * 12 <= st[i].death);
    const lim = Math.round(P.tfsa.annualLimit * idx / P.tfsa.roundTo) * P.tfsa.roundTo;
    st.forEach((s, i) => { if (alive[i]) { s.room += lim + s.roomBack; } s.roomBack = 0; });

    // 1. income that arrives anyway: CPP, OAS, work, pension, other; plus the forced RRIF minimum
    const pp = people.map((p, i) => {
      const s = st[i];
      if (!alive[i]) return null;
      const age = y - p.birthYear;
      const months = (from, to = s.death) => Math.max(0, Math.min(y * 12 + 11, to) - Math.max(y * 12, from) + 1);
      let cpp = s.cppMo * idx * months(s.cppStart);
      // CPP survivor's pension once the spouse's plan has ended (spouse's own pension, or their at-65 amount if not yet started)
      let surv = 0;
      const j = people.findIndex((q, k) => k !== i);
      if (j >= 0 && !alive[j]) {
        const sp = st[j], base = (sp.cppStart <= sp.death ? sp.cppMo : sp.cpp65) * idx;
        const ownMo = s.cppMo * idx * (months(s.cppStart) > 0 ? 1 : 0);
        const mo = age >= 65 ? Math.min(0.6 * base, Math.max(0, P.cpp.max65 * idx - ownMo)) : 0.375 * base;
        surv = mo * months(-Infinity);
        cpp += surv;
      }
      const oas = s.oasMo * idx * (months(s.oasStart, Math.min(s.at75 - 1, s.death)) + months(Math.max(s.oasStart, s.at75)) * (1 + P.oas.at75));
      let emp = 0, pen = 0, oth = 0;
      for (const o of p.other || []) if (age >= o.from && age <= o.to) {
        const v = (o.amount || 0) * (o.indexed === false ? 1 : idx);
        if (o.type === 'employment') emp += v; else if (o.type === 'pension') pen += v; else oth += v;
      }
      const ageJan1 = age - 1;
      const minReq = ageJan1 >= s.conv ? s.bal * rrifFactor(P, ageJan1) : 0;
      if (ageJan1 === 71 && s.rrif72 === null) { s.rrif72 = s.bal; s.min72 = minReq; }
      const inv = s.sav * s.sR;            // growth on other savings: taxed as income each year, stays invested
      return { age, ageJan1, cpp, surv, oas, emp, pen, oth, inv, minReq };
    });
    const live = pp.filter(Boolean);
    const baseCash = live.reduce((t, q) => t + q.cpp + q.oas + q.emp + q.pen + q.oth + q.minReq, 0);

    // 2. top up to the income needed: RRSP/RRIF, then other savings, then TFSA
    // no amount entered: spend what comes in. After one spouse's plan ends, the survivor needs a share of the couple's income.
    const survivor = input.couple && people.length > 1 && alive.filter(Boolean).length === 1;
    // before anyone retires, pay covers spending: nothing is drawn from savings, and CPP/OAS/pension already in pay is saved
    const working = input.retireYear != null && y < input.retireYear;
    const need = working ? live.reduce((t, q) => t + q.emp, 0)
      : input.income > 0 ? input.income * idx * (survivor ? (input.survivorPct ?? 1) : 1) : baseCash;
    let gap = Math.max(0, need - baseCash);
    // withdrawals are spread through the year (monthly), modelled as taken at mid-year: money keeps growing until it's spent
    const half = r => Math.sqrt(1 + r);
    const total = a => a.reduce((x, y) => x + y, 0);
    // "Even out taxes": take from the RRSP/RRIF only up to a steady taxable income (opts.level, today's dollars), the rest from savings and TFSA
    const smooth = opts.level != null;
    let rrspWant = gap;
    if (smooth) {
      const otherTaxable = live.reduce((t, q) => t + q.cpp + q.oas + q.emp + q.pen + q.oth + q.inv + q.minReq, 0);
      rrspWant = Math.min(gap, Math.max(0, opts.level * idx - otherTaxable));
    }
    const availR = pp.map((q, i) => q ? Math.max(0, st[i].bal * half(st[i].rR) - q.minReq) : 0);
    let extra;
    if (smooth && live.length > 1 && rrspWant > 0) {
      // split the RRSP withdrawals so each spouse ends up with about the same taxable income
      const base = pp.map(q => q ? q.cpp + q.oas + q.emp + q.pen + q.oth + q.inv + q.minReq : 0);
      const take = L => pp.map((q, i) => q ? Math.min(availR[i], Math.max(0, L - base[i])) : 0);
      let lo = 0, up = Math.max(...base) + rrspWant;
      for (let k = 0; k < 50; k++) { const m = (lo + up) / 2; if (total(take(m)) < rrspWant) lo = m; else up = m; }
      extra = take(up); const over = total(extra) - rrspWant;
      if (over > 0) { const t = total(extra); extra = extra.map(x => x - over * x / t); }
    } else extra = drawFrom(availR, rrspWant);
    gap -= total(extra);
    const fromSav = drawFrom(pp.map((q, i) => q ? st[i].sav * half(st[i].sR) : 0), gap); gap -= total(fromSav);
    const fromTfsa = drawFrom(pp.map((q, i) => q ? st[i].tfsa * half(st[i].tR) : 0), gap); gap -= total(fromTfsa);
    if (smooth && !opts.noFallback && gap > 0.5) {          // savings and TFSA used up: the rest comes from the RRSP/RRIF after all
      const more = drawFrom(availR.map((a, i) => a - extra[i]), gap);
      more.forEach((m, i) => { extra[i] += m; }); gap -= total(more);
    }
    const unfunded = gap > 0.5 ? gap : 0;
    if (unfunded && total(availR) - total(extra) > 1) shortWithRrsp = true;   // savings ran out while the RRSP still had money
    if (unfunded && shortAge === null) shortAge = y - people[0].birthYear;

    pp.forEach((q, i) => {
      if (!q) return;
      q.w = q.minReq + extra[i]; q.extra = extra[i]; q.fromSav = fromSav[i]; q.fromTfsa = fromTfsa[i];
      const isRrif = q.age >= st[i].conv;
      q.elig = q.pen + (isRrif && q.age >= 65 ? q.w : 0);
      q.net = q.cpp + q.oas + q.emp + q.pen + q.oth + q.inv + q.w;      // taxable income
      if (st[i].bal > 0 && q.w >= st[i].bal * Math.sqrt(1 + st[i].rR) - 0.5 && st[i].rrspOut === null) st[i].rrspOut = q.age;
    });

    // 3. tax (with optional pension splitting) and the share caused by CPP + OAS (for breakevens)
    const noTax = { res: pp.map(() => ({ fed: 0, ont: 0, ohp: 0, tax: 0, claw: 0, total: 0 })), total: 0, moved: 0 };
    const hh = opts.fast ? noTax : taxHousehold(P, pp.map(q => q && { net: q.net, oas: q.oas, elig: q.elig, emp: q.emp, age: q.age }), idx, input.split);
    const hhNoPen = opts.fast ? noTax : taxHousehold(P, pp.map(q => q && { net: q.net - q.cpp - q.oas, oas: 0, elig: q.elig, emp: q.emp, age: q.age }), idx, input.split);

    // 4. cash: what's spent (after tax) and any surplus (e.g. a large RRIF minimum) saved to other savings
    const cashIn = baseCash + extra.reduce((a, b) => a + b, 0) + fromSav.reduce((a, b) => a + b, 0) + fromTfsa.reduce((a, b) => a + b, 0);
    const taxAll = hh.total;
    // tax is shared in proportion: income above the need is saved after its share of the tax, not before
    const taxShare = cashIn > 0 ? Math.min(1, taxAll / cashIn) : 0;
    const surplus = Math.max(0, cashIn - need) * (1 - taxShare);
    const consumed = Math.min(cashIn, need) * (1 - taxShare);
    const nAlive = alive.filter(Boolean).length;

    const per = pp.map((q, i) => {
      if (!q) return null;
      const t = hh.res[i], s = st[i];
      const one = x => taxPerson(P, { net: q.net + x, oas: q.oas, elig: q.elig, emp: q.emp, age: q.age, otr: false }, idx).total;
      const marg = opts.fast ? 0 : (one(100) - one(0)) / 100;
      // grow to mid-year, take the year's withdrawal, grow the rest to year-end
      const hR = Math.sqrt(1 + s.rR), hS = Math.sqrt(1 + s.sR), hT = Math.sqrt(1 + s.tR);
      s.bal = Math.max(0, s.bal * hR - q.w) * hR;
      const share = surplus / nAlive, toT = Math.min(share, s.room);   // extra money: TFSA first (within room), then other savings
      s.room -= toT; s.roomBack += q.fromTfsa;
      s.sav = Math.max(0, s.sav * hS - q.fromSav) * hS + share - toT;
      s.tfsa = Math.max(0, s.tfsa * hT - q.fromTfsa) * hT + toT;
      return { ...q, fed: t.fed, ont: t.ont, ohp: t.ohp, tax: t.tax, claw: t.claw, total: t.total,
        after: q.net - q.inv - t.total + q.fromSav + q.fromTfsa, marg, avg: q.net > 0 ? t.total / q.net : 0,
        bal: s.bal, savBal: s.sav, tfsaBal: s.tfsa };
    });

    // 5. at each person's plan-to age: RRSP/RRIF, TFSA and savings pass to the spouse; at the last, the RRIF is taxed
    let estateNow = 0, estateBal = 0;
    people.forEach((p, i) => {
      if (!per[i] || y !== p.birthYear + ptOf(p)) return;
      const other = people.findIndex((q, j) => j !== i && per[j] && y < q.birthYear + ptOf(q));
      if (other >= 0) {
        st[other].bal += st[i].bal; st[other].tfsa += st[i].tfsa; st[other].sav += st[i].sav;
        st[i].bal = st[i].tfsa = st[i].sav = 0;
      } else {
        const q = per[i];
        const base = opts.fast ? 0 : taxPerson(P, { net: q.net, oas: 0, elig: q.elig, emp: q.emp, age: q.age, otr: true }, idx).tax;
        const withB = opts.fast ? 0 : taxPerson(P, { net: q.net + st[i].bal, oas: 0, elig: q.elig, emp: q.emp, age: q.age, otr: true }, idx).tax;
        estate = estate || { balance: 0, tax: 0 };
        estate.balance += st[i].bal; estate.tax += withB - base; estateNow += st[i].bal - (withB - base); estateBal += st[i].bal; st[i].bal = 0;
      }
    });

    // money left after tax if everything were cashed in this year
    let rrifNet = 0;
    per.forEach((q, i) => {
      const b = st[i].bal; if (!q || b <= 0 || opts.fast) return;
      const t0 = taxPerson(P, { net: q.net, oas: 0, elig: q.elig, emp: q.emp, age: q.age, otr: true }, idx).tax;
      const t1 = taxPerson(P, { net: q.net + b, oas: 0, elig: q.elig, emp: q.emp, age: q.age, otr: true }, idx).tax;
      rrifNet += b - (t1 - t0);
    });
    const nonreg = st.reduce((t, s) => t + s.sav, 0), tfsa = st.reduce((t, s) => t + s.tfsa, 0);
    const left = nonreg + tfsa + rrifNet + estateNow;

    const sum = f => per.reduce((t, q) => t + (q ? f(q) : 0), 0);
    const cppT = sum(q => q.cpp), oasT = sum(q => q.oas);
    rows.push({
      year: y, idx, ages: people.map(p => y - p.birthYear), ageEnd: y - people[0].birthYear + (12 - people[0].birthMonth) / 12, per,
      need, working, cpp: cppT, oas: oasT, claw: sum(q => q.claw), tax: sum(q => q.tax), income: sum(q => q.net), after: sum(q => q.after),
      pensionAfter: cppT + oasT - (hh.total - hhNoPen.total),
      w: sum(q => q.w), extra: sum(q => q.extra), fromSav: sum(q => q.fromSav), fromTfsa: sum(q => q.fromTfsa),
      consumed, surplus, unfunded, bal: st.reduce((t, s) => t + s.bal, 0) + estateBal, estateBal, nonreg, tfsa, left, split: hh.moved,
    });
  }
  return { rows, estate, shortAge, shortWithRrsp, st: st.map(s => ({ rrif72: s.rrif72, min72: s.min72, rrspOut: s.rrspOut })) };
}

// ---------- summaries ----------
function totals(run, P, input, people) {
  const R = run.rows;
  const sum = (f, rows = R) => rows.reduce((s, r) => s + f(r), 0);
  const clawYears = people.map((p, i) => R.filter(r => r.per[i] && r.per[i].claw > 0.5).map(r => r.ages[i]));
  const last = R[R.length - 1];
  const estateNet = run.estate ? run.estate.balance - run.estate.tax : 0;
  return {
    cpp: sum(r => r.cpp), oas: sum(r => r.oas), claw: sum(r => r.claw), tax: sum(r => r.tax),
    pension: sum(r => r.cpp + r.oas), pensionAfter: sum(r => r.pensionAfter),
    pensionAfterReal: sum(r => r.pensionAfter / r.idx), pensionReal: sum(r => (r.cpp + r.oas) / r.idx),
    clawYears, unfunded: sum(r => r.unfunded), unfundedReal: sum(r => r.unfunded / r.idx),
    savingsLeft: last.bal + last.nonreg + last.tfsa, savingsLeftReal: (last.bal + last.nonreg + last.tfsa) / last.idx,   // before tax: the last row of the table
    leftover: last.nonreg + last.tfsa + estateNet, leftoverReal: (last.nonreg + last.tfsa + estateNet) / last.idx,
    // one comparable number: after-tax income used over the plan + money left at the end
    lifetimeReal: sum(r => r.consumed / r.idx) + (last.nonreg + last.tfsa + estateNet) / last.idx,
    lifetime: sum(r => r.consumed) + last.nonreg + last.tfsa + estateNet,
    taxReal: sum(r => r.tax / r.idx), clawReal: sum(r => r.claw / r.idx),
    estate: run.estate, lastIdx: last.idx, shortAge: run.shortAge,
  };
}

/** Breakeven: age of person 1 at which scenario B's cumulative pension catches A's. key: 'gross' | 'after'. */
function breakeven(runA, runB, key) {
  const f = key === 'after' ? r => r.pensionAfter / r.idx : r => (r.cpp + r.oas) / r.idx;
  let ca = 0, cb = 0, prev = null, sign0 = 0;
  for (let i = 0; i < runA.rows.length; i++) {
    const a = runA.rows[i], b = runB.rows[i];
    ca += f(a); cb += f(b);
    const d = cb - ca, age = a.ageEnd;            // person 1's age at the end of the year
    if (!sign0 && Math.abs(d) > 1) sign0 = Math.sign(d);
    else if (sign0 && Math.sign(d) === -sign0 && Math.abs(d) > 0.01) {
      const t = prev ? prev.d / (prev.d - d) : 1;
      const x = (prev ? prev.age : age - 1) + t;
      return x > 100 ? null : { age: x, years: Math.floor(x), months: Math.round((x - Math.floor(x)) * 12), leader: sign0 > 0 ? 'B' : 'A' };
    }
    prev = { d, age };
  }
  return null;
}

function validate(P, input) {
  const errs = [];
  const people = input.people.slice(0, input.couple ? 2 : 1);
  if (input.province === 'QC') errs.push({ field: 'province', msg: 'QPP is not covered yet — these results use CPP rules and do not apply in Quebec.' });
  for (const p of people) { const pt = p.planTo ?? input.planTo; if (!(pt >= 75 && pt <= 110)) errs.push({ field: 'planTo', msg: 'Plan-to age must be between 75 and 110.' }); }
  if (!(input.income >= 0)) errs.push({ field: 'income', msg: 'Income needed can’t be negative.' });
  people.forEach((p, i) => {
    const age = input.firstYear - p.birthYear;
    if (!(age >= 40 && age <= 99)) errs.push({ field: `p${i}.birthYear`, msg: 'Enter a year of birth for someone aged 40 to 99.' });
    if ((p.planTo ?? input.planTo) <= age) errs.push({ field: 'planTo', msg: 'Plan-to age must be older than your age now.' });
    if (!(p.cpp65 >= 0) || p.cpp65 > P.cpp.max65 * 1.05) errs.push({ field: `p${i}.cpp65`, msg: `CPP at 65 is at most $${P.cpp.max65.toLocaleString('en-CA')} a month in 2026.` });
    if (!(p.yearsCanada >= 0 && p.yearsCanada <= 82)) errs.push({ field: `p${i}.yearsCanada`, msg: 'Years in Canada after 18 can’t be negative.' });
    for (const k of ['rrsp', 'tfsa', 'sav']) if (!((p[k] || 0) >= 0)) errs.push({ field: `p${i}.${k}`, msg: 'Balances can’t be negative.' });
    input.scenarios.forEach((sc, k) => {
      const s = sc.people[i];
      if (!p.cppStarted && (s.cpp < 720 || s.cpp > 840)) errs.push({ field: `s${k}.p${i}.cpp`, msg: 'CPP can start from 60 to 70. Waiting past 70 adds nothing.' });
      if (!p.oasStarted && (s.oas < 780 || s.oas > 840)) errs.push({ field: `s${k}.p${i}.oas`, msg: 'OAS can start from 65 to 70. Waiting past 70 adds nothing.' });
      const nowM = (input.firstYear - p.birthYear) * 12 - p.birthMonth;
      if (!p.cppStarted && s.cpp < nowM) errs.push({ field: `s${k}.p${i}.cpp`, msg: 'That CPP start date has passed. If CPP is already being paid, tick “Already receiving CPP”.' });
      if (!p.oasStarted && s.oas < nowM) errs.push({ field: `s${k}.p${i}.oas`, msg: 'That OAS start date has passed. If OAS is already being paid, tick “Already receiving OAS”.' });
    });
  });
  return errs;
}

/** Plan-to ages from the FP Canada 25%-survival table. people: [{ age, sex: 'M'|'F' }].
 *  Each person plans to their own age; the one expected to live longest is extended so the plan lasts
 *  as long as there's a 25% chance at least one of you is alive. */
function lifePlan(P, people) {
  const L = P.life;
  const look = (key, age) => {
    const a = Math.min(Math.max(age, L.ages[0]), L.ages.at(-1));
    let k = L.ages.findIndex(x => x >= a); if (L.ages[k] === a || k === 0) return L[key][k];
    const t = (a - L.ages[k - 1]) / (L.ages[k] - L.ages[k - 1]);
    return L[key][k - 1] + t * (L[key][k] - L[key][k - 1]);
  };
  const own = people.map(p => Math.max(p.age + 1, Math.round(look(p.sex === 'F' ? 'F' : 'M', p.age))));
  if (people.length < 2) return { ages: own, joint: null };
  const sexes = people.map(p => p.sex === 'F' ? 'F' : 'M').sort().join('');
  const key = sexes === 'FM' ? 'MF' : sexes;
  const avg = (people[0].age + people[1].age) / 2;
  const years = look(key, avg) - avg;                   // years until a 25% chance that neither is alive
  const ends = people.map((p, i) => own[i] - p.age);    // years each plans for on their own
  const last = ends[0] >= ends[1] ? 0 : 1;
  const ages = own.slice();
  ages[last] = Math.max(own[last], Math.round(people[last].age + years));
  return { ages, joint: Math.round(look(key, avg)) };
}

/** "Even out taxes": the steady taxable income (today's dollars) at which the RRSP/RRIF lasts to the end of the plan.
 *  Taxes don't change account balances (the income needed is before tax), so the search runs without them. */
function levelFor(P, input, sc) {
  if (input.order === 'rrsp' || !(input.income > 0)) return null;
  // too low: the TFSA/savings run out while the RRSP still has money, or RRSP money is left at the end (taxed at death)
  const tooLow = T => { const r = project(P, input, sc, { level: T, fast: true, noFallback: true });
    return r.shortWithRrsp || r.rows.at(-1).bal > 1; };   // last row's balance includes any RRIF left at death
  const hi = input.income * 1.5;
  if (tooLow(hi)) return null;              // the RRSP can't be used up even taking it all from there: same as RRSP first
  if (!tooLow(0)) return 0;
  let lo = 0, up = hi;
  for (let k = 0; k < 40 && up - lo > 1; k++) { const m = (lo + up) / 2; if (tooLow(m)) lo = m; else up = m; }
  return up;
}

/** Full comparison: every scenario, breakevens, waiting years and warnings. */
function compute(P, input) {
  const errors = validate(P, input);
  if (errors.length) return { errors };
  const people = input.people.slice(0, input.couple ? 2 : 1);
  const scen = input.scenarios.map((sc, k) => {
    const level = levelFor(P, input, sc);
    const shown = project(P, input, sc, { level });
    const to100 = project(P, input, sc, { planTo: 100, level });
    return { sc, k, level, shown, to100, t: totals(shown, P, input, people) };
  });

  const pairs = [];
  for (let i = 0; i < scen.length; i++) for (let j = i + 1; j < scen.length; j++) {
    const A = scen[i], B = scen[j];
    pairs.push({ a: i, b: j, gross: breakeven(A.to100, B.to100, 'gross'), after: breakeven(A.to100, B.to100, 'after') });
  }

  // waiting years: compare with starting each pension at 65, or earlier if a compared scenario starts earlier
  const refSc = { people: people.map((p, i) => {
    const nowM = (input.firstYear - p.birthYear) * 12 - p.birthMonth;
    const lo = key => Math.min(65 * 12, ...input.scenarios.map(sc => sc.people[i][key]));
    return { cpp: Math.max(lo('cpp'), nowM, 60 * 12), oas: Math.max(lo('oas'), nowM, 65 * 12) };
  }) };
  const ref = project(P, input, refSc, { level: levelFor(P, input, refSc) });
  for (const s of scen) {
    const gap = [];
    s.shown.rows.forEach((r, i) => {
      if (r.ages[0] >= 71) return;
      const e = ref.rows[i];
      const forgone = (e.cpp + e.oas) - (r.cpp + r.oas);
      if (forgone <= 1) return;
      gap.push({ year: r.year, age: r.ages[0], idx: r.idx, forgone, forgoneAfter: e.pensionAfter - r.pensionAfter,
        fromRrsp: r.extra, fromSav: r.fromSav + r.fromTfsa, unfunded: r.unfunded });
    });
    s.gap = gap; s.unfundedGap = gap.reduce((t, g) => t + g.unfunded / g.idx, 0);
  }

  // warnings
  const warn = [];
  people.forEach((p, i) => {
    const who = input.couple ? `${p.name || 'Person ' + (i + 1)}: ` : '';
    if (p.yearsCanada < P.oas.minYears) warn.push(`${who}OAS needs at least 10 years in Canada after 18, so no OAS is included.`);
    else if (p.yearsCanada < P.oas.fullYears) warn.push(`${who}Partial OAS: ${p.yearsCanada} of 40 years, so OAS is ${Math.round(p.yearsCanada / 40 * 100)}% of the full amount. Partial OAS rules have details — check with Service Canada.`);
    if ((p.other || []).some(o => o.type === 'employment' && o.amount > 0)) {
      const early = !p.cppStarted && p.retireAge != null && input.scenarios.some(sc => sc.people[i] && sc.people[i].cpp < p.retireAge * 12);
      warn.push(`${who}${early ? 'Working while collecting CPP can earn post-retirement benefits, which this estimate doesn’t include. ' : ''}Pay before retirement is shown before CPP and EI contributions, and any new RRSP or TFSA contributions from it aren’t included.`);
    }
    if (!p.cppStarted && p.cppEstimated) warn.push(`${who}CPP at 65 is a rough estimate from your years worked and earnings. Your Service Canada statement (My Service Canada Account) is more accurate — tick “Use my Service Canada estimate” to enter it.`);
    else if (!p.cppStarted && p.cpp65 > 0 && (input.firstYear - p.birthYear) < 65) warn.push(`${who}Your Service Canada estimate assumes you keep contributing to CPP until 65. If you stop working earlier${p.retireAge != null && p.retireAge < 65 ? ` (you plan to retire at ${p.retireAge})` : ''}, your real CPP at 65 may be lower.`);
  });
  const short = scen.filter(s => s.t.shortAge !== null);
  if (input.income > 0 && short.length) warn.push(`Money runs out: from age ${short.map(s => s.t.shortAge).join('/')} (Scenario${short.length > 1 ? 's' : ''} ${short.map(s => 'ABC'[s.k]).join(', ')}) your RRSP, TFSA and savings are used up and income falls short of the $${Math.round(input.income).toLocaleString('en-CA')} a year you need. See “Short” in the year-by-year table.`);
  for (const s of scen) {
    // GIS is income-tested on the previous year's income, excluding OAS
    const low = s.shown.rows.some((r, i) => i > 0 && r.per.some((q, j) => { const pv = s.shown.rows[i - 1].per[j]; return q && pv && q.oas > 0 && pv.net - pv.oas < P.oas.gisSingleThreshold * r.idx; }));
    if (low) { warn.push('Some years’ income is close to the Guaranteed Income Supplement (GIS) range. RRSP withdrawals count as income and can reduce or eliminate GIS, and deferring OAS also defers GIS — this estimate does not model GIS.'); break; }
  }
  return { scen, pairs, warn: [...new Set(warn)], ref: refSc.people };
}

const API = { lifePlan, cppEstimate, cppFactor, oasFactor, cppMonthly, oasMonthly, rrifFactor, taxPerson, taxHousehold, CEILINGS, project, breakeven, validate, compute };
g.RT_ENGINE = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
