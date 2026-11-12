# ADR-0008: Configure measurable canary health criteria

- Status: Accepted
- Decision: Define configuration thresholds for error rate, p95 latency, fallback rate and score-distribution drift, with a controller able to ramp or roll back.
- Context: The source documents do not specify thresholds.
- Consequence: Select and document numeric thresholds, windows and sample-size rules before Stage 5 canary implementation.
