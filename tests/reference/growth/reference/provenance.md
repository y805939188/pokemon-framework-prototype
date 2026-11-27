# Growth reference vectors

These 3,504 recorded observations describe the six growth curves at the configured maximum levels. They contain inputs and externally observable results, including error categories, not implementation code. The reference was an isolated export of Pokémon Essentials commit `8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b` with Ruby 3.1.3. The v21.1 tag is not that commit: the growth source matched and the two exports returned the same results for these cases. Each configuration was checked twice. These are not observations of any later upstream version.

The `READY` digest applies to the unmodified bytes of `growth-cases.json`. The schema defines the permitted fields, and `classification.json` enumerates known differences. Never regenerate or “correct” the expected results with the TypeScript implementation. The optional validator checks the data and metadata without loading original game code.

The differential replay is excluded from ordinary regressions. It is not run or claimed as part of regular verification. The source exports, observation tooling and raw process output are not framework inputs.
