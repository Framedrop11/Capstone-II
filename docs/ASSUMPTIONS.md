# Assumptions

- The supplied `docs/CareLens_SRS.docx` and `docs/CareLens_SDD.docx` are the governing baseline; they are kept unchanged during implementation.
- Stage gates are sequential. No stage after Stage 0 begins until the user confirms continuation after seeing Stage 0 evidence.
- The master prompt's explicit ten decisions settle conflicts for implementation; conflicting source prose remains documented for a later SRS/SDD update.
- Node.js 22 is the initial CI target because it is an active LTS line at project setup; the runtime line will be checked again when implementation is finalized.
- Local/test identity will use a mock OIDC adapter; production Google credentials are external deployment configuration, not repository content.
- Non-production fixtures and seeds will contain synthetic data only.
- No clinical efficacy or fitness-for-use claim is made.
