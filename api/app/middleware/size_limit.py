# api/app/middleware/size_limit.py
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class ContentSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Fast reject requests that advertise a Content-Length larger than allowed.
    This avoids parsing large multipart bodies only to reject them later.
    """

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = int(max_bytes)

    async def dispatch(self, request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            # Mirror your API error shape
            return JSONResponse({"detail": "too large"}, status_code=413)
        return await call_next(request)
