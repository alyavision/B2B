# 🚀 Инструкции по развертыванию бота Synaplink

## 📋 Предварительные требования

### Системные требования
- **ОС**: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- **Python**: 3.8 или выше
- **RAM**: Минимум 512 MB
- **Диск**: Минимум 1 GB свободного места
- **Сеть**: Доступ к интернету для Telegram и OpenAI API

### Необходимые аккаунты и токены
1. **Telegram Bot Token** - от @BotFather
2. **OpenAI API Key** - с OpenAI Platform
3. **OpenAI Assistant ID** - ID обученного ассистента Сани
4. **Telegram Channel Link** - ссылка на ваш канал
5. **Working Chat ID** - ID рабочего чата для заявок

## 🛠 Пошаговое развертывание

### Шаг 1: Подготовка сервера

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Python и pip
sudo apt install python3 python3-pip python3-venv -y

# Устанавливаем git
sudo apt install git -y

# Создаем пользователя для бота (рекомендуется)
sudo adduser synaplinkbot
sudo usermod -aG sudo synaplinkbot
sudo su - synaplinkbot
```

### Шаг 2: Клонирование и настройка проекта

```bash
# Клонируем репозиторий
git clone <your-repository-url>
cd SynapLinkbot

# Создаем виртуальное окружение
python3 -m venv venv
source venv/bin/activate

# Устанавливаем зависимости
pip install -r requirements.txt

# Создаем файл конфигурации
cp env_example.txt .env
nano .env
```

### Шаг 3: Настройка конфигурации

Отредактируйте файл `.env`:

```env
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# OpenAI API Key
OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz

# OpenAI Assistant ID
OPENAI_ASSISTANT_ID=asst_1234567890abcdef

# Telegram Channel Link
TELEGRAM_CHANNEL_LINK=https://t.me/your_channel

# Telegram Working Chat ID (для отправки заявок)
WORKING_CHAT_ID=-1001234567890

# Logo Image URL или путь к файлу
LOGO_IMAGE_URL=https://example.com/logo.png
```

### Шаг 4: Тестирование

```bash
# Активируем виртуальное окружение
source venv/bin/activate

# Запускаем тесты
python test_bot.py

# Если тесты пройдены, тестируем бота
python bot.py
```

## 🔧 Настройка systemd сервиса

### Создание файла сервиса

```bash
sudo nano /etc/systemd/system/synaplink-bot.service
```

Содержимое файла:

```ini
[Unit]
Description=Synaplink Telegram Bot
After=network.target

[Service]
Type=simple
User=synaplinkbot
WorkingDirectory=/home/synaplinkbot/SynapLinkbot
Environment=PATH=/home/synaplinkbot/SynapLinkbot/venv/bin
ExecStart=/home/synaplinkbot/SynapLinkbot/venv/bin/python run_bot.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Активация сервиса

```bash
# Перезагружаем systemd
sudo systemctl daemon-reload

# Включаем автозапуск
sudo systemctl enable synaplink-bot

# Запускаем сервис
sudo systemctl start synaplink-bot

# Проверяем статус
sudo systemctl status synaplink-bot
```

## 📊 Мониторинг и логи

### Просмотр логов

```bash
# Логи systemd
sudo journalctl -u synaplink-bot -f

# Логи бота
tail -f logs/bot.log

# Статус сервиса
sudo systemctl status synaplink-bot
```

### Мониторинг ресурсов

```bash
# Использование памяти
htop

# Дисковое пространство
df -h

# Сетевые соединения
netstat -tulpn | grep python
```

## 🔒 Безопасность

### Настройка файрвола

```bash
# Устанавливаем ufw
sudo apt install ufw -y

# Настраиваем правила
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включаем файрвол
sudo ufw enable
```

### Защита файлов

```bash
# Устанавливаем права на файлы
chmod 600 .env
chmod 755 *.py
chmod 644 requirements.txt

# Создаем резервную копию конфигурации
cp .env .env.backup
```

## 🚨 Устранение неполадок

### Частые проблемы

#### 1. Бот не отвечает
```bash
# Проверяем статус
sudo systemctl status synaplink-bot

# Проверяем логи
sudo journalctl -u synaplink-bot -n 50

# Перезапускаем сервис
sudo systemctl restart synaplink-bot
```

#### 2. Ошибки OpenAI API
```bash
# Проверяем API ключ
grep OPENAI_API_KEY .env

# Проверяем лимиты API
# Зайдите на OpenAI Platform -> Usage
```

#### 3. Проблемы с Telegram
```bash
# Проверяем токен бота
grep TELEGRAM_BOT_TOKEN .env

# Проверяем права бота в канале
# Бот должен быть администратором канала
```

### Команды диагностики

```bash
# Проверка конфигурации
python -c "from config import Config; print('Config OK')"

# Проверка OpenAI клиента
python -c "from openai_client import OpenAIClient; print('OpenAI OK')"

# Проверка обработчика заявок
python -c "from application_handler import ApplicationHandler; print('Handler OK')"
```

## 📈 Масштабирование

### Для высоких нагрузок

1. **Используйте Redis** для кэширования
2. **Настройте балансировщик нагрузки** для нескольких экземпляров
3. **Используйте базу данных** для хранения состояния пользователей
4. **Настройте мониторинг** через Prometheus + Grafana

### Пример с Redis

```bash
# Установка Redis
sudo apt install redis-server -y

# Настройка Redis
sudo nano /etc/redis/redis.conf

# Перезапуск Redis
sudo systemctl restart redis-server
```

## 🔄 Обновления

### Автоматические обновления

```bash
# Создаем скрипт обновления
nano update_bot.sh
```

Содержимое скрипта:

```bash
#!/bin/bash
cd /home/synaplinkbot/SynapLinkbot
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart synaplink-bot
echo "Bot updated successfully!"
```

```bash
# Делаем скрипт исполняемым
chmod +x update_bot.sh

# Добавляем в cron для автоматических обновлений
crontab -e
# Добавьте строку: 0 2 * * * /home/synaplinkbot/SynapLinkbot/update_bot.sh
```

## 📞 Поддержка

### Контакты для поддержки
- **Техническая поддержка**: [ваш-email@synaplink.com]
- **Telegram**: [@ваш-username]
- **Документация**: [ссылка на документацию]

### Полезные ссылки
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [python-telegram-bot Documentation](https://python-telegram-bot.readthedocs.io/)

## ✅ Чек-лист развертывания

- [ ] Сервер подготовлен и обновлен
- [ ] Python 3.8+ установлен
- [ ] Проект склонирован
- [ ] Виртуальное окружение создано
- [ ] Зависимости установлены
- [ ] Файл .env настроен
- [ ] Тесты пройдены
- [ ] systemd сервис создан
- [ ] Сервис запущен и работает
- [ ] Логирование настроено
- [ ] Файрвол настроен
- [ ] Безопасность проверена
- [ ] Мониторинг настроен
- [ ] Резервные копии созданы

---

**🎉 Поздравляем! Ваш бот Synaplink успешно развернут и готов к работе!**
