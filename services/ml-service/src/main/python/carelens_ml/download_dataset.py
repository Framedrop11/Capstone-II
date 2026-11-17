from __future__ import annotations

import argparse
from pathlib import Path

from ucimlrepo import fetch_ucirepo


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the UCI Early Stage Diabetes Risk Prediction dataset")
    parser.add_argument("--output", type=Path, default=Path("ml/data/uci-early-stage-diabetes.csv"))
    args = parser.parse_args()
    dataset = fetch_ucirepo(id=529)
    frame = dataset.data.features.copy()
    frame["class"] = dataset.data.targets.iloc[:, 0]
    columns = {str(column).strip().lower(): column for column in frame.columns}
    selected = [columns[name] for name in ["age", "gender", "obesity", "class"]]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame[selected].to_csv(args.output, index=False)
    print(f"Saved {len(frame)} selected rows to {args.output}")


if __name__ == "__main__":
    main()
