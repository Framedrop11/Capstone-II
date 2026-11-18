# ADR-0008: Configure measurable canary health criteria

- Status: Accepted
- Decision: Define configuration thresholds for error rate, p95 latency, fallback rate and score-distribution drift, with a controller able to ramp or roll back.
- Context: The source documents do not specify thresholds.
- Consequence: Select and document numeric thresholds, windows and sample-size rules before Stage 5 canary implementation.

## D3 demo controller thresholds (2026-11-17)

- Ramp: 5%, 25%, 50%, 75%, 100%; default minimum 5 candidate observations per step and 60 seconds minimum between steps. Local `.env.demo` shortens these to one sample and one second for a presentation.
- Roll back when candidate inference error rate exceeds 1%, fallback rate exceeds 5%, candidate p95 inference latency exceeds 500 ms, or mean absolute candidate-to-stable score drift exceeds 0.25.
- The controller observes candidate predictions. If a candidate receives no traffic/samples, it holds at the current step; it does not claim health without data.
- Demo controller is enabled only by an explicit environment variable and is refused in `prod`. Thresholds are demo guardrails, not clinically validated model-quality limits.
