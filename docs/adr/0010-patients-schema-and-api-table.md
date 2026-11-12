# ADR-0010: Define Patients schema and API endpoint inventory

- Status: Accepted
- Decision: Add a Patients schema and an API endpoint table where the SDD is silent.
- Patient schema: one `patients` document per patient user; `userId` is a unique reference to `users._id`, with standard creation/update timestamps. Health responses remain in questionnaires rather than duplicating profile data.
- Consequence: Patient-owned records refer to `patients._id`; the API will resolve and verify user-to-patient ownership. MongoDB does not provide foreign-key constraints, so referential checks belong in the data/application service.
- Endpoint contracts are defined in Stage 3 and listed in the source-document update request.
