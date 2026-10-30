# Calibration log

Real outcomes we learn about, and what they taught the model. Append one entry per site. The engine's market constants should be refit against this file, never against opinion.

| Date | Site | Model said | What actually happened | Change made |
| --- | --- | --- | --- | --- |
| 2026-10-30 | 2006–2008 Hull St, Richmond (1.68 ac, B-3, existing 25–99 unit apts + vacant rear lot) | 91-unit rental: residual land $0.37M at $300/sf exit, $4.6M at $350/sf. 33-lot townhome plat: does not pencil at $300/sf. Finished-lot exit: $0.41M profit. Approval 70%. | _pending: owner to report_ | — |
| 2026-10-29 | 714–718 J Clyde Morris Blvd, Newport News (1.38 ac, C1, 16,430 sf office) | 32-unit residential via CUP: residual land $1.05M vs $908k assessed; recommended against residential at $265/sf exit. | _pending_ | — |

## How to use an outcome

1. Record the actual program, unit count, exit price per sf, hard cost per sf and land price.
2. Diff against the scenario the engine recommended. Note which assumption moved the answer most (usually ARV/sf, then hard cost, then target ROI).
3. Adjust the market config in `packages/underwriting/src/markets/*.ts`, add a parity test with the real numbers, and link the commit here.
