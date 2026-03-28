from fastapi import APIRouter
from models import Transaction, FraudDetectionResponse

router = APIRouter()

@router.post("/detect-fraud", response_model=FraudDetectionResponse)
async def detect_fraud(transaction: Transaction) -> FraudDetectionResponse:
    # Placeholder for AI-driven fraud detection logic
    is_fraud = False  # Example logic
    confidence_score = 0.95  # Example confidence score
    reasons = ["Example reason"]  # Example reasons

    return FraudDetectionResponse(
        transaction_id=transaction.transaction_id,
        is_fraud=is_fraud,
        confidence_score=confidence_score,
        reasons=reasons
    )
