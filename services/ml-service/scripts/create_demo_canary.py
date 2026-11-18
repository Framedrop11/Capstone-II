from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

import joblib


def main() -> int:
    if os.environ.get("CARELENS_ENV", "local") == "prod":
        raise SystemExit("Demo canary fixtures are forbidden in prod")
    if os.environ.get("ML_DEMO_CANARY_FIXTURES", "false").lower() != "true":
        raise SystemExit("Set ML_DEMO_CANARY_FIXTURES=true in local/dev/staging to generate this fixture")
    parser = argparse.ArgumentParser(description="Create a demo-only candidate identical to the stable artifact")
    parser.add_argument("--model-dir", type=Path, default=Path("services/ml-service/models"))
    parser.add_argument("--version", default="carelens-demo-canary-v1")
    args = parser.parse_args()

    stable_path = args.model_dir / "stable.joblib"
    output = args.model_dir / "demo-canary-good.joblib"
    payload = joblib.load(stable_path)
    payload["version"] = args.version
    joblib.dump(payload, output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".json").write_text(
        json.dumps({"version": args.version, "artifactSha256": digest, "demoFixture": True, "metrics": payload.get("metrics", {})}, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"created": str(output), "version": args.version, "sha256": digest}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
