# ADR-0007: Persist notifications and provide delivery adapters

- Status: Accepted
- Decision: Store in-app notifications and define pluggable email/SMS adapters with a logging implementation. Notify doctors when a patient shares a report.
- Context: FR-3.4 does not define delivery details.
- Consequence: Document the adapter boundary and test the stored notification flow.
