# ADR-0011: Published FINDRISC basic score

- Status: Accepted for the demonstration build.
- Decision: Use the adult Finnish Diabetes Risk Score (FINDRISC) as the Stage 4 rule-based fallback, since the supplied SRS/SDD define neither questionnaire fields nor a scoring formula. Require the instrument's inputs, compute its published 0–26 points and bands, and store `points / 26` in the existing normalized 0–1 field while disclosing that this is not a probability.
- Scope: Type 2 diabetes screening in adults without known diabetes. This is not a hypertension score and is not claimed clinically valid for CareLens populations.
- Consequences: The API questionnaire contract now matches the fixed instrument. Replacing it requires a requirements change and a new documented source, validated inputs and tests. The source documents should be revised to identify supported conditions and the questionnaire/scoring method.
- References: Lindström and Tuomilehto, *Diabetes Care* 2003, DOI 10.2337/dc03-0072; Finnish Diabetes Association risk-test instructions/source page.
