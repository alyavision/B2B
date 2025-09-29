# Synaplink AI Bot

Telegram-бот-прокси для OpenAI-ассистента.

## Быстрый старт

1. Скопируйте `env_example.txt` в `.env` и заполните переменные.
2. Установите зависимости:
   ```
   pip install -r requirements.txt
   ```
3. Запустите бота:
   ```
   python run_bot.py
   ```

## Переменные окружения

См. `env_example.txt` для примера.

## Деплой на Railway

1. Залейте проект на GitHub.
2. В Railway создайте проект, подключите репозиторий.
3. В настройках Railway добавьте переменные окружения из `.env`.
4. Укажите команду запуска:
   ```
   python run_bot.py
   ```
