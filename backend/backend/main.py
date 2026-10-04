"""FastAPI app. Thin on purpose: all logic lives in ml/inference.py.

Run from the project root:
    uvicorn backend.main:app --reload --port 8000
Interactive docs (try the endpoints in the browser): http://localhost:8000/docs
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.inference import RiskService


class PatientInput(BaseModel):
    """Shape of the request body. Pydantic checks it and rejects malformed requests automatically.
    Example: {"features": {"age": 63, "sex": 1, "bp": 140}}. Any field may be left out (it is then imputed)."""
    features: dict[str, float | str | bool | None] = Field(default_factory=dict)


def create_app(service: RiskService | None = None) -> FastAPI:
    """App factory: tests pass in a prepared service; normal runs create the real one at startup."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Runs once when the server starts: load models and build the SHAP explainers here,
        # not on every request, so each request stays fast.
        app.state.service = service or RiskService()
        yield

    app = FastAPI(title="CAD Risk 3D API", lifespan=lifespan)

    # CORS: browsers block a page on one port (the frontend) from calling an API on another port
    # unless the API explicitly allows it. These are the usual dev-server addresses.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                       "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["*"], allow_headers=["*"],
    )

    def svc(request: Request) -> RiskService:
        return request.app.state.service

    @app.get("/health")
    def health():
        return {"status": "ok"}              # lets you (or a deployment platform) check the server is alive

    @app.get("/features")
    def features(request: Request):
        return svc(request).feature_info()   # the frontend builds its input form from this

    @app.post("/predict")
    def predict(body: PatientInput, request: Request):
        try:
            return svc(request).predict(body.features)
        except ValueError as e:              # bad input -> HTTP 422 with a readable message
            raise HTTPException(status_code=422, detail=str(e))

    @app.post("/explain")
    def explain(body: PatientInput, request: Request, top_k: int = 10):
        # top_k = how many features to list per target, e.g. POST /explain?top_k=5
        try:
            return svc(request).explain(body.features, top_k=top_k)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    @app.get("/metrics")
    def metrics(request: Request):
        result = svc(request).metrics()
        if result is None:
            raise HTTPException(status_code=404, detail="No reports found. Run scripts/train_final.py first.")
        return result

    return app


app = create_app()    # `uvicorn backend.main:app` looks for this variable