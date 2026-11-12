# ADR-0002: Enforce audit immutability in MongoDB

- Status: Accepted
- Decision: The application MongoDB user gets only `insert` and `find` on `auditLogs`; a migration creates the restricted role.
- Consequence: Integration verification must attempt update and delete using the application identity and observe authorization failures.
