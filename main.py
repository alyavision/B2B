# FastAPI entrypoint for Vercel detection
# Exports `app` so Vercel FastAPI preset can find it

from api.webhook import app as app


