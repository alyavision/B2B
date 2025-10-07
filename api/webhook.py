from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import JSONResponse
from telegram import Update
from telegram.ext import Application
import json
import hmac
import hashlib
import asyncio

from config import Config
from bot import SynaplinkBot

app = FastAPI()


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

    # Создаём приложение на каждый запрос, чтобы оно было привязано к актуальному event loop
    bot_instance = SynaplinkBot()
    telegram_app: Application = bot_instance.application

    update = Update.de_json(data, telegram_app.bot)
    try:
        await telegram_app.initialize()
        await telegram_app.process_update(update)
        return JSONResponse({"ok": True})
    except Exception as e:
        import logging, traceback
        logging.getLogger(__name__).error(f"process_update error: {e}\n{traceback.format_exc()}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=200)
    finally:
        try:
            await telegram_app.shutdown()
        except Exception:
            pass


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


@app.post("/api/broadcast")
async def broadcast(request: Request):
    # Защита по секрету в заголовке X-Broadcast-Secret
    secret = request.headers.get("X-Broadcast-Secret")
    if not getattr(Config, 'BROADCAST_SECRET', None) or secret != Config.BROADCAST_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    payload = await request.json()
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Создаём приложение на этот запрос
    bot_instance = SynaplinkBot()
    telegram_app: Application = bot_instance.application

    # Получаем список подписчиков
    subs = bot_instance.openai_client.get_all_subscribers()
    sent = 0
    failed = 0
    try:
        await telegram_app.initialize()
        for chat_id in subs:
            try:
                await telegram_app.bot.send_message(chat_id=int(chat_id), text=text)
                sent += 1
            except Exception as e:
                # Если Telegram просит подождать (429), пробуем один раз с паузой
                retry_after = getattr(e, 'retry_after', None)
                if isinstance(retry_after, (int, float)) and retry_after > 0:
                    await asyncio.sleep(float(retry_after) + 0.5)
                    try:
                        await telegram_app.bot.send_message(chat_id=int(chat_id), text=text)
                        sent += 1
                        continue
                    except Exception:
                        failed += 1
                else:
                    failed += 1
            # Плавная задержка между отправками, чтобы не упереться в лимиты
            await asyncio.sleep(0.06)
        return {"ok": True, "sent": sent, "failed": failed}
    finally:
        try:
            await telegram_app.shutdown()
        except Exception:
            pass


# Debug endpoint to verify env-config actually used in PROD
@app.get("/api/debug-config")
async def debug_config():
    return {
        "build": "2025-10-07-logging-caption-filename",
        "CHECKLIST_URL": getattr(Config, 'CHECKLIST_URL', None),
        "CHECKLIST_CAPTION": getattr(Config, 'CHECKLIST_CAPTION', None),
        "CHECKLIST_FILENAME": getattr(Config, 'CHECKLIST_FILENAME', None),
    }


