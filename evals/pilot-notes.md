# The pilot (November 2026): record

History only. Every rule a writer or an operator needs is in `evals/WRITING.md` and `evals/README.md`; nothing here is required reading for a new round.

**What.** 25 booklet questions (`evals/pilot-sources.json`), 4 candidates each, 100 in all, written by 5 writer groups; scored by the harness in `evals/`, blind-solved, and judged by four model judges plus a real-or-generated judge.

**Results per round.**

| Round | What changed | Admissible |
|---|---|---|
| 1 | First 100 candidates, written to the first brief. | not recorded as a count; notes below (14 candidates let a common slip land on the answer; about 35 had numbers odd for the business; judges told written from real easily) |
| 2 | Rewrite to the round-2 rules: traps as a gate, generic settings, surplus data, house style, wrong options from slips only, gridline parity. | 89 of 100 |
| 3 | Light polish to parity with the source: round-1 notes that pushed past the source withdrawn; `slipsOnAnswer` added; register rules (currency, years, names, prose). | 93 of 100 (`evals/rounds/pilot.md`) |

**What the pilot decided.**

- The standard is parity with the source (round 2's lesson: holding candidates cleaner than the booklets made them less faithful and harder).
- The real-or-generated judge is retired: it recognised the published cases, so a half-real batch could not be passed (197 of 200 told apart in round 2). Owner review of a sample replaces it.
- 3 to 4 variants per source, not 10; at most 2 variants of a source answered at one letter.
- Source fillers (options no slip lands on) are recorded and accepted at parity; options may mix scales of one unit as pracA-q14 does.
- One fix round per round, then drop what still fails.

**Not admitted at the end of round 3:** bk-pst2-q15-a to -d, bk-pst2-q03-a, bk-pst2-q19-a (fillers the source also has; the judge was not told) and bk-bcg-q04-a (a slip that lands on the answer, which its source does not have). See `evals/rounds/pilot.md`.

# Per-candidate notes (history)

The notes the judges and blind solvers gave on pilot candidates, kept as they were. Where round 2 disagrees with round 1, round 2 won. Their general lessons are in WRITING.md section 13.

## Round 2: parity with the source

Round 2 judged 89 of 100 candidates admissible. Its lesson: round 1's notes held candidates to a cleaner standard than the booklets themselves. Several "defects" were quirks of the booklet questions, and "fixing" them made candidates less faithful and slightly harder. From then on the standard was **parity with the source**: a candidate fails only where it is worse than the booklet question it is modelled on. A quirk of the source, reproduced, is not a defect.

### Round-1 notes withdrawn

- **Common slips that land on the correct option, where the source does the same.** `distractors.slipsOnAnswer` in `evals/report/sources/<id>.json` now lists, for each booklet question, the common slips that still give its correct option, worked out from its numbers. The distractors judge is told them and fails only a slip its source does not have. Of the round-1 notes under "A common mistake lands on the correct option", these were parity and are withdrawn: bcg-q04 (taking the whole second revenue line as profit, or the industry's margin for the client's, still picks €1.6 in the source; leaving the line out altogether lands on €1.7, so that trap stays); pst2-q03 all four (skipping the growth step gives 11.1 against 11.1 in the source); pracB-q02-a (revenue read as profit: August's 1,402 beats May's 1,223 in the source as well); pracB-q05 (365 or 360 days for the 350 open days still picks 11 kg in the source; forgetting the machine, set-up or labour costs is still a real trap). Still defects, because the source's slip lands on a wrong option: bk-pst3-q04-b (the source's unchanged bars total 299, against its 341 answer) and bk-pracA-q07-a (the source's adjacent row gives 1.19, nearest 1.3).
- **pracC-q23 a-d: go back to the source's form.** The source's premise is loose ("assuming the relationship between premium income and costs remains the same") and one option is a sub-cost (administration) that the context says is part of another option's cost (operations), dismissed by reasoning; its share is never stated (`sourceHas` lists the dominated option). Round 2's wording ("courier payments stay at 78% of order revenue and the other costs change only if cut") went past that and made a blind solver rule out the keyed option in -a, -c and -d. Restore a premise as loose as the source's, in new words, and a sub-cost option that is part of another option's cost with no stated share.
- **pracB-q02 a-d: restore the source's no-data option** (the source's "Restaurant prices for shrimp dishes were 10% higher": the data has no menu prices). The judge allows one such statement where the source has one; round 2's variants replaced it with a fourth calculated statement.
- **pst2-q03 a-d: the source's own shortcut is a feature.** Both lines grow at nearly the same rate, so base-year profits give the answer; the round-1 note that called this a defect is withdrawn. Restore something like it (growth rates a point or two apart, not identical) rather than forcing exact growth arithmetic.
- **Arithmetic and chart reading no heavier than the source's.** Several round-2 candidates use figures like 715 × 5.42 where the source has 90 × 16, results that do not come out round where the source's does, and chart values far from gridlines where the source's sit on or halfway between them. Irregular numbers (round 1) means as irregular as the source, not more: match the source's digits, its round or non-round result, and where its chart values sit.

### Round-2 fixes that stay

- Generic settings, with every number scaled to the business.
- Traps declared, each landing on a wrong option (unless the source's own slip lands on its answer: see above).
- pst2-q19: stated in percentage points over a fixed period, so no option is the answer under another reading.

### Round-2 findings to fix

- bk-pst1-q15-d: the false statement works only if the fixed cost counts as "spent on visits". Say so as the source does (its context states the fixed cost of running the service beside the cost per attendance).
- bk-bcg-q04-d: state the period of the average spend (per visit, per week).
- bk-pracA-q03-d: the statement on the health service turns on whether "the health service" counts as public funding. Make the grouping as plain as the source's.
- bk-pst1-q11-b: the keyed statement speaks of all passengers using the airport, though the pie covers long-haul passengers only. Word it no more loosely than the source's ("9.0% of children visiting the hospital are diagnosed with ...", where diagnoses come from emergency patients only, who are the only ones a diagnosis is given for).
- bk-pst3-q04-a: a heavier-use band spends less than a lighter one (band 3 63 against band 4 59). The source has one such dip, quintile 3 below quintile 2 (47 against 53, both years); keep at most one, the size and place of the source's.
- bk-pracA-q14-d: the table is titled "Average after the first 90 days" while the text says "the first 90 days". Make title and text agree (the source: "Average after 90 days", "for the first 90 days since signing up").
- bk-pst2-q19-d: the answer moved from 1.2 to about 1.09 when the chart values were read to a quarter of a gridline step. The answer must hold under such readings (evals/WRITING.md section 6).

## Round 1

### A common mistake lands on the correct option (the question no longer tests its source's trap)

- bk-bcg-q04-b, -c, -d: leaving out the second revenue line (pastries, vending, concessions) still gives the right price. In the source that mistake gives a wrong price.
- bk-pst2-q03-a, -b, -c, -d: skipping the growth step and comparing base-year profits gives the right multiple, because both lines grow at about the same rate.
- bk-pst3-q04-b: adding the bars without applying the changes gives 233, about the $234 answer.
- bk-pracA-q07-a: reading the adjacent row gives 1.54 against the answer 1.5.
- bk-pracB-q02-a: reading revenue as profit gives the right statement without the margin.
- bk-pracB-q05-a, -b, -c, -d: forgetting a cost (machine, set-up, labour, or 365 for 360 days) still picks the answer, because the answer is the nearest option above the wrong threshold too.

### Ambiguity

- bk-pst2-q19-a, -b, -c, -d: wrong options are built from other readings of the question (relative change against percentage points; three year-steps against four years), not from slips. The blind solver chose the relative figure on -c; the judge failed -b on the period. Rewrite all four: the prompt must fix one reading, and no option may be the answer under another reasonable reading. Options are in "%" where the quantity is percentage points.
- bk-pracC-q23-a, -b, -c, -d: "costs keep the same relationship to revenue" / "costs holding the same link to contract revenue" is loose and sits awkwardly beside an option that cuts one cost. The sub-cost option (rent, insurance, drivers' pay, advertising) is stated to be part of a bigger cost in another option, so it is ruled out by wording alone.
- bk-pst1-q26-c, -d: ranking "concern" assumes probability times cost; say so as plainly as the source does.
- bk-pst1-q06-d: "nearly 200,000 bags" has to be read as 200,000.
- bk-bcg-q12-b: revenue and profit averages only roughly agree with the win-rate logic (4.9 to 5.0 against 5).

### Easier or weaker than the source

- bk-bcg-q04-b, -c, -d and bk-pst2-q19-a, -b, -c, -d: every chart value the solver must read sits on a gridline; the source makes the solver estimate between gridlines.
- bk-pst2-q19-b, -c: the company's sales are flat, so the share change comes only from market growth.
- bk-pst1-q15-b: the false statement is on the first group, so a solver checking in order never meets the cumulative-share trap.
- bk-bcg-q12-b: "matches cannot be drawn" hands over the insight the source leaves to the solver.
- bk-pracC-q22-d: 54 ÷ 0.30 divides exactly; the source needs 140 ÷ 0.17.
- bk-pst2-q03-c: both streams grow by exactly the same 29%.

### Leftover labels and slips

- bk-bcg-q12-a, -c: options say "teams" where the context says "clubs" / "rosters".
- bk-bcg-q04-b: an Irish coffee chain priced in pounds sterling.
- bk-pracC-q17-b: "GP surgeries" (UK term) in Andalusia. bk-pracC-q17-d: "limited companies" (UK term) in Ontario.

### Passed the realism judge but odd for the business

Scale the numbers to the setting, or choose a setting the numbers fit.

- bk-bcg-q04-d: the largest cinema chain in a country has 300 to 700 members; members buy 10 tickets a month; film hire $8 on a $9 ticket.
- bk-bcg-q04-c: €2.0 to 2.6 per kg at a self-service laundry; 20 kg per customer a week.
- bk-bcg-q04-b: 12 cups per commuter a week.
- bk-pracA-q03-a: licensing and consultancy larger than contract research; public grants a quarter of research income.
- bk-pracA-q03-b: farm irrigation 21% of a UK water company's supply.
- bk-pst2-q19-b: e-bike market smaller than road bikes in 2021.
- bk-pracA-q25-a, -c, -d: every non-spender or never-contacted household starts paying after one campaign; -c counts about every farm in the province.
- bk-pracA-q14-b: the lowest quintile of a free app averages 1.8 purchases in 90 days.
- bk-sample-q09-a: a negotiator keeps 1.5% of sale value, about the whole agency fee.
- bk-sample-q04-c: about €673k of fees per lawyer, yet a loss every year.
- bk-pst1-q15-c: water customers averaging 4 calls a year, the heaviest group 15.
- bk-pst1-q26-a, -d: a 60% annual chance of a serious flood or long outage.
- bk-pracC-q17-a, -c: survey counts about a third of the town; about every dairy herd in the country near one firm's stops.
- bk-pst1-q11-a, -b: 7,500 animals a month at one vet hospital; 28% long-haul at a small regional airport, 5% of them for medical treatment.
- bk-bcg-q12-a, -b, -c, -d: strained tier labels ("Feeder Clubs", "University Sides", "Academy Rosters", "Prefectural Teams"); a 30% all-time win rate.
- bk-pracC-q23-b, -c, -d: running costs or overheads far above the industry's; -d's sales about the size of the whole regional market.
- bk-pst3-q24-d: law and business faculties' research income rising £20m to £25m a year.
- bk-pst3-q04-c: a wine club's heaviest buyers spend about one case in six months.
- bk-pracB-q11-d: 60% of a day-trip attraction's visitors stayed in a hotel; also the strained pie label "Another purpose drew me to Vlietdam".
- bk-pst2-q15-c, -d: profit per spa or per convenience store far too high.
- bk-pst2-q03-a: a regional bowling group bigger than the national market leader.
- bk-pracB-q05-b: €21,000 for a florist's rose-stripping machine.

### What made candidates recognisable as written (real-or-generated judges)

- Prose more modern, descriptive and explanatory than the booklets': local colour (named real regions and towns), notes on how to read the chart, planted caveats ("Nobody is shared between teams", "parts sum to 100%").
- Exactly the data the question needs; the booklets carry unused rows and exhibits.
- Engineered numbers (a machine cost that divides exactly by its life in days; even steps; multiples of 5 or 50).
- Options always in ascending order; spurious precision ("36.0%").
- None of the booklets' house style: capitalised CLOSEST / TRUE / FALSE, stock stems, plain generic settings.
