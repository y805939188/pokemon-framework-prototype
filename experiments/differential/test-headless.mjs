// Single registered suite for the clean differential infrastructure and actual TS-only checks.
// Every synthetic reference worker is an infrastructure self-test, never original Ruby coverage.
import "./test-infrastructure.mjs";
import "./test-runner.mjs";
import "./test-numeric-carrier.mjs";
import "./test-source-gates.mjs";
// Closed pre-5.4 profile and TS/synthetic infrastructure tests; no original Ruby coverage.
import './test-pre54.mjs';
import './test-pre54-integration.mjs';
