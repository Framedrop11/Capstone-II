FROM python:3.12.11-slim-bookworm AS dependencies
WORKDIR /app
COPY services/ml-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

FROM python:3.12.11-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src/main/python
WORKDIR /app
COPY --from=dependencies /usr/local /usr/local
COPY services/ml-service/src/main/python ./src/main/python
COPY services/ml-service/models ./models
ARG INCLUDE_DEMO_CANARY=false
RUN if [ "$INCLUDE_DEMO_CANARY" != "true" ]; then rm -f ./models/demo-canary-*; fi
COPY ml/data/uci-early-stage-diabetes.csv ./data/uci-early-stage-diabetes.csv
RUN groupadd --system --gid 10001 carelens && useradd --system --uid 10001 --gid carelens --home-dir /app carelens \
    && chown -R carelens:carelens /app
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
CMD ["uvicorn", "carelens_ml.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
