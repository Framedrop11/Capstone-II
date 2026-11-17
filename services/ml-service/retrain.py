from pathlib import Path
import sys

SERVICE_SOURCE = Path(__file__).parent / "src" / "main" / "python"
sys.path.insert(0, str(SERVICE_SOURCE))

from carelens_ml.retrain import main

if __name__ == "__main__":
    sys.exit(main())
