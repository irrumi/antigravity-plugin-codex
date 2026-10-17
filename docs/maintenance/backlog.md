# Maintenance backlog

## AGY-01 — structured result redaction

- Problem/evidence: synthetic fake-CLI regressions reproduced OAuth tool-report
  JSON corruption and escaped credential leakage in returned protocol copies.
- Scope: validate raw NDJSON, sanitize structured display data, omit invalid raw
  protocol output, and document diagnostic/name/path/patch boundaries.
- Acceptance: exported-redactor and Adapter.invoke regressions pass; malformed and
  duplicate envelopes fail closed; retained workspace/source bytes stay unchanged.
- Dependencies: none. Risk: security-sensitive output formatting and stricter
  envelope validation; requires manual review, never automatic merge.
- Status: implemented and locally verified; manual review and publication pending. See branch
  `maint/agy-01-structured-redaction`.
- Next: AGY-02, reproduce canonical/original path test portability. Windows/macOS
  CI jobs remain paused; re-enabling requires separate owner authorization.
