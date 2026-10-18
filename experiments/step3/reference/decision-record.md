# Decision record: growth curve reference observation (WP30-A)

This record was first written before any original logic was run. Afterwards the facts that were still open (section 7) were filled in, and the check details in section 5 and the evidence details in section 6 were completed once the preflight, the runs and the review were done. The role, allowed outputs and plan did not change.

## 1. Fixed reference

- Product: Pokemon Essentials, version label v21.1.
- Commit: 8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b (pinned by the project baseline, work package WP01).
- Source used for the runs: the local git checkout of the Essentials repository on this Mac. Its working copy sits on the v21.1 tag, which is a different commit from the pinned one, but the pinned commit object exists in the same repository. The pinned commit was exported read-only into the private workspace and only that export was used for the delivered results. The repository itself was never modified.
- Version verification (results in section 7): object id comparison of the commit and of the growth-curve source file against the checkout and the tag, plus a byte comparison against the release package "Pokemon Essentials v21.1 2023-07-30" under the Downloads folder.

## 2. Role

- This session is the isolated reference observer for exactly one module: the growth curves.
- It is the only place where the original Ruby may be read and run.
- The implementation repository is not read or written at all.
- Nothing is committed or pushed anywhere. The folder is not a git repository.

## 3. Environment

- Operating system: macOS, Darwin 25.6.0, arm64 (Apple silicon).
- System Ruby 2.6.10 at the standard system location is too old for the original. It is not deleted, not modified, and not used for any run.
- Required Ruby line: the player bundled in the release package carries a Ruby 3.1.3 runtime (patch level 185, read from that runtime library). The same version, 3.1.3p185, was used for all runs.
- Installation: user-authorized newer Ruby, installed in user space only, using the ruby-build tool (version 20261013, installed with Homebrew) into a private directory under the home folder (.rubies/ruby-3.1.3). The Homebrew formula for the 3.1 series is disabled upstream, so it was not used. The build log is in the private workspace.

## 4. Allowed outputs (behaviour data only)

- Handed over: inputs, configuration values, outcome kinds (value, error-object, raised), integer values, exception class names, case identifiers, counts.
- Never handed over: source code, translations of source code, formulas copied or paraphrased from it, descriptions of its internal structure, file or line references into the source, error messages, progress prose that explains how the original works.
- Free text in the package is limited to the short fields allowed by the delivery schema.

## 5. Check method

- Mechanical: the validator from the inbox folder is run on the case file together with this record and must print ok.
- Own review: a second pass over the whole package. Every distinct text value in the case data was listed and found to be one of the schema enumerations, an identifier, or an exception class name. The header text and this record were read by hand, and searched for code-like text, file names, line numbers and formula-like text.
- Cross-check: every configuration was run twice in separate processes, once on the pinned export and once on an export of the v21.1 tag. The two result sets are identical for all cases.
- Hash: READY contains only the SHA-256 of the case file, written after validation and review.
- The comparison with the static expectations of spec section 12.2 is information only. Results were never adjusted toward the spec.

## 6. Evidence location

- Handover folder (the only thing the implementation side reads): handoff, with the case file, this record and READY.
- Private workspace (never copied except validated data): read-only exports of the pinned commit and the tag, the case generator and adapter scripts, per-configuration raw results for both exports, run logs, notes.
- Evidence type of every case is original-run: the original logic ran with no stand-ins at all.

## 7. Confirmations

- Pinned commit versus tag: the pinned commit is a descendant of the v21.1 tag and is 83 files ahead of it, so it is a later snapshot than the tagged release despite the version label.
- Version match: the growth-curve source file is byte-identical in the pinned commit and in the tag (same object id), and identical in the release package apart from line endings. The other original files that were loaded differ between the pinned commit and the tag, but the tag-based cross-check gave identical results for all cases.
- Ruby: 3.1.3p185, arm64-darwin25, private install as described in section 3.
- Stand-in boundary: none. All original files needed were loaded unmodified. The only difference between processes is the maximum level setting, applied through the original configuration before the first call. Each distinct maximum level (50, 100, 101, 105, 120, 200) ran in its own process.
- Totals: 3504 distinct cases, all original-run; outcome kinds are value, error-object and raised.
