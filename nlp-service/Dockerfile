# PackSure NLP service image (FastAPI + Tesseract OCR).
# Optional model artifacts should be volume-mounted at /app/model/legal_metrology_ner
# rather than baked into the image (models are large; see docs/ML_TRAINING.md).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_PATH=/app/model/legal_metrology_ner

# Tesseract + English language data. Add more *-tessdata packages for other languages.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-model.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY model ./model

# Bind all interfaces so the Node backend can reach the container.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
