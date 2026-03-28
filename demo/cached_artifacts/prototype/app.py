from fastapi import FastAPI
from routes import router

app = FastAPI(title="Anchrix 3.0: AI-powered Fraud Detection")

app.include_router(router)

@app.get("/")
async def root():
    return {"message": "Welcome to Anchrix 3.0 Fraud Detection API"}
