FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["sh", "-c", "PYTHONPATH=/app alembic upgrade head && PYTHONPATH=/app python scripts/backfill_skill_embeddings.py && PYTHONPATH=/app uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
