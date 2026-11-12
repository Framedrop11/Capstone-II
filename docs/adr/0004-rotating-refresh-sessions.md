# ADR-0004: Rotate refresh tokens and detect reuse

- Status: Accepted
- Decision: Access JWTs last 15 minutes. Refresh tokens are rotated, persisted in an httpOnly, SameSite, Secure cookie, and reuse revokes the complete token family.
- Context: This extends the SRS stateless-session description.
- Consequence: Add refresh-token storage and family-revocation coverage to the data/session design.
