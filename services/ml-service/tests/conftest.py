import sys
from pathlib import Path

SOURCE = Path(__file__).parents[1] / "src" / "main" / "python"
sys.path.insert(0, str(SOURCE))
