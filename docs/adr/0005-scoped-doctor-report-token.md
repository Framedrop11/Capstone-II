# ADR-0005: Scope doctor access tokens to a report

- Status: Accepted
- Decision: Issue a separate JWT valid for at most five minutes, one patient and one purpose, only after checking live consent.
- Consequence: Consent must be checked before token issuance and before report cache access.
