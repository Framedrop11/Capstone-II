# ADR-0001: Worker owns basic scoring

- Status: Accepted
- Decision: Core API validates, persists and enqueues; the worker computes the basic score.
- Context: SRS operational descriptions imply API scoring, while SDD assigns scoring to workers. The master prompt resolves this conflict.
- Consequence: Scoring remains asynchronous and independent of the request path. Correct the SRS wording (see `DOC_UPDATES_NEEDED.md`).
