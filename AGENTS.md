# Contributing to the framework

Read the [developer guide](docs/PROJECT-GUIDE.md) for architecture, builds and test commands. Implement from the public clean-room specification, not the original Ruby source. Keep user data, locally licensed assets, test output and machine-specific settings out of commits.

Work on a short-lived branch. Preserve unrelated local changes. Protect local changes and player saves; do not commit credentials or alter global MZ settings as a side effect. Run checks through the affected public entry point and report what was not tested.
