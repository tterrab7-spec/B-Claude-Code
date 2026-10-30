# Calibration log

Real outcomes we learn about, and what they taught the model. Append one entry per site. The engine's market constants should be refit against this file, never against opinion.

| Date | Site | Model said | What actually happened | Change made |
| --- | --- | --- | --- | --- |
| 2026-10-30 | 2006–2008 Hull St, Richmond (Swansboro Place; 1.68 ac, B-3) | 91-unit rental: residual land $0.37M at $300/sf exit, $4.6M at $350/sf. 33-lot townhome plat: does not pencil at $300/sf. Approval 70%. | Owner paid $995,000 for the land and built 90 units in 4 stories (54 1BR / 28 2BR / 8 3BR), 750 sf community room, 64 spaces, financed with tax-exempt bonds + 4% LIHTC. Density screen was right (91 vs 90). Land number was wrong because the program was affordable, not market-rate. | Added `lihtcProForma()` (4% bond stack: DSCR-sized perm loan, boosted-basis credits, deferred fee, soft gap, land supportable). Richmond 60% AMI 2026 placeholder rents. Still to fit: owner's actual sources & uses from the Swansboro Place file. |
| 2026-10-29 | 714–718 J Clyde Morris Blvd, Newport News (1.38 ac, C1, 16,430 sf office) | 32-unit residential via CUP: residual land $1.05M vs $908k assessed; recommended against residential at $265/sf exit. | _pending_ | — |

## How to use an outcome

1. Record the actual program, unit count, exit price per sf, hard cost per sf and land price.
2. Diff against the scenario the engine recommended. Note which assumption moved the answer most (usually ARV/sf, then hard cost, then target ROI).
3. Adjust the market config in `packages/underwriting/src/markets/*.ts`, add a parity test with the real numbers, and link the commit here.
