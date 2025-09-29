from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import JSONResponse
from telegram import Update
from telegram.ext import Application
import json
import hmac
import hashlib

from config import Config
from bot import SynaplinkBot

app = FastAPI()

# Инициализируем бота и приложение Telegram один раз (cold start)
_bot_instance = SynaplinkBot()
telegram_app: Application = _bot_instance.application


def _verify_secret(request: Request) -> None:
    secret = getattr(Config, 'TELEGRAM_WEBHOOK_SECRET', None)
    if not secret:
        return
    header = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
    if header != secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


@app.post("/api/webhook")
async def telegram_webhook(request: Request):
    _verify_secret(request)
    try:
        data = await request.json()
    except Exception:
        body = await request.body()
        data = json.loads(body.decode('utf-8'))

    update = Update.de_json(data, telegram_app.bot)
    await telegram_app.initialize()
    await telegram_app.process_update(update)
    return JSONResponse({"ok": True})


@app.get("/")
async def health():
    return {"status": "ok"}

@app.get("/favicon.ico")
async def favicon_ico():
    # Возвращаем 204 No Content, чтобы браузер не считал это ошибкой
    return Response(content=b"", media_type="image/x-icon", status_code=204)

@app.get("/favicon.png")
async def favicon_png():
    # Возвращаем 204 No Content
    return Response(content=b"", media_type="image/png", status_code=204)


