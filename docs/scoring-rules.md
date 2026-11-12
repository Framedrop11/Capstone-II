# Basic scoring rules

CareLens Stage 4 implements the published Finnish Diabetes Risk Score (FINDRISC), which estimates an adult's 10-year risk of developing type 2 diabetes. It is a screening instrument; it does not diagnose diabetes, and the official Finnish Diabetes Association guidance excludes people with known diabetes from using it for this estimate.

The worker sums the standard FINDRISC points for age, BMI, waist circumference (sex-specific thresholds), daily physical activity, daily fruit/vegetable consumption, antihypertensive treatment, history of high blood glucose, and family history of diabetes. The point total is 0–26. Bands are 0–6 low, 7–11 slightly elevated, 12–14 moderate, 15–20 high, and 21–26 very high. The API stores `basicScore = points / 26` to satisfy the existing normalized 0–1 score field and includes the unnormalized point total and band in report factors; this normalized value is not a calibrated probability.

The accepted questionnaire fields are `ageYears`, `bmi`, `waistCm`, `sex` (`female` or `male`), `activity30MinDaily`, `fruitVegetablesDaily`, `antihypertensiveTreatment`, `historyHighGlucose`, and `familyHistoryDiabetes` (`none`, `second_degree`, or `first_degree`). The input schema is intentionally limited to the variables needed by this published instrument. Missing or out-of-range inputs fail as unrecoverable validation errors and go to the dead-letter queue after the worker records the final failure.

## Source and limits

- Lindström J, Tuomilehto J. “The Diabetes Risk Score: A practical tool to predict type 2 diabetes risk.” *Diabetes Care*. 2003;26(3):725–731. [Original study](https://diabetesjournals.org/care/article-pdf/26/3/725/665299/dc0303000725.pdf).
- Finnish Diabetes Association, [risk-test instructions, score bands and instrument source](https://diabetes.fi/lahteet-ja-kayttoohjeet-kansansairauksien-riskitesti/).

FINDRISC was derived in Finnish population samples. It is implemented here as a deterministic demonstration fallback, not as a clinically validated estimate for CareLens users or populations outside its validation context. The synthetic/integration tests verify score arithmetic and persistence only.
