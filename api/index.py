# Entry point для Vercel FastAPI
# Экспортируем app из webhook.py, чтобы Vercel обнаружил FastAPI-приложение

from webhook import app as app


