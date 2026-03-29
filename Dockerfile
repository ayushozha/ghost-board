# Stage 1: Build the React dashboard
FROM node:22-alpine AS frontend
WORKDIR /app/dashboard-app
COPY dashboard-app/package.json dashboard-app/package-lock.json ./
RUN npm ci
COPY dashboard-app/ ./
RUN npm run build

# Stage 2: Python API server
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy built frontend into dashboard-app/dist
COPY --from=frontend /app/dashboard-app/dist ./dashboard-app/dist
EXPOSE 8000
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000"]
