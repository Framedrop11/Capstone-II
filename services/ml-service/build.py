import sys

from pybuilder.core import init, use_plugin

use_plugin("python.core")
use_plugin("exec")

default_task = "publish"

dependencies = [
    "fastapi==0.135.3",
    "uvicorn==0.44.0",
    "pydantic==2.12.5",
    "numpy==2.4.4",
    "pandas==2.2.2",
    "scikit-learn==1.5.2",
    "joblib==1.3.2",
    "pymongo==4.15.3",
    "ucimlrepo==0.0.7",
    "redis==6.4.0",
    "scipy==1.15.2",
    "threadpoolctl==3.5.0",
]

project_name = "carelens-ml-service"
project_version = "0.1.0"
summary = "CareLens FastAPI model serving and reproducible training"
description = "A screening aid model demonstration; not for clinical use."
license = "MIT"
authors = {"CareLens Team": "carelens@example.invalid"}
url = "https://example.invalid/carelens"

@init
def set_build_properties(project):
    project.set_property("dir_source_main_python", "src/main/python")
    project.set_property("run_unit_tests_command", f'"{sys.executable}" -m pytest -q tests')
    project.set_property("run_unit_tests_propagate_stdout", "True")
    project.set_property("run_unit_tests_propagate_stderr", "True")
    for dependency in dependencies:
        project.depends_on(dependency)
    project.build_depends_on("pytest==8.4.2")
    project.build_depends_on("httpx==0.28.1")
