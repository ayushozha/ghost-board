from pydantic import BaseModel
from typing import List, Optional

class Transaction(BaseModel):
    transaction_id: str
    amount: float
    currency: str
    timestamp: str
    payer_id: str
    payee_id: str
    location: Optional[str] = None

class FraudDetectionResponse(BaseModel):
    transaction_id: str
    is_fraud: bool
    confidence_score: float
    reasons: List[str]
