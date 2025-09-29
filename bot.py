"""
Основной файл Telegram-бота для компании Synaplink
Обрабатывает команды, сообщения и интегрируется с OpenAI ассистентом
"""

import logging
import asyncio
import re
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, 
    CommandHandler, 
    MessageHandler, 
    CallbackQueryHandler,
    filters,
    ContextTypes
)
from config import Config
from openai_client import OpenAIClient
from application_handler import ApplicationHandler
import requests
from io import BytesIO

# Настраиваем логирование
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class SynaplinkBot:
    """Основной класс Telegram-бота FriendEvent (ребрендинг)"""
    
    def __init__(self):
        """Инициализация бота"""
        try:
            logger.info("🔧 Инициализация бота...")
            logger.info(f"🔑 Создание Application с токеном: {Config.TELEGRAM_BOT_TOKEN[:10]}...")
            
            self.application = Application.builder().token(Config.TELEGRAM_BOT_TOKEN).build()
            logger.info("✅ Application создан успешно")
            
            logger.info("🤖 Создание OpenAI клиента...")
            self.openai_client = OpenAIClient()
            logger.info("✅ OpenAI клиент создан")
            
            logger.info("📋 Создание ApplicationHandler...")
            self.application_handler = ApplicationHandler()
            logger.info("✅ ApplicationHandler создан")
            
            self.user_states = {}  # Хранит состояние пользователей
            logger.info("✅ Словарь состояний пользователей инициализирован")
            
            # Регистрируем обработчики
            logger.info("🔧 Регистрация обработчиков...")
            self._setup_handlers()
            logger.info("✅ Инициализация бота завершена")
            
        except Exception as e:
            logger.error(f"❌ Ошибка при инициализации бота: {e}")
            import traceback
            logger.error(f"🔍 Stack trace: {traceback.format_exc()}")
            raise
        
    def _setup_handlers(self):
        """Настраивает все обработчики команд и сообщений"""
        
        logger.info("Настройка обработчиков...")
        
        # Обработчик команды /start
        self.application.add_handler(CommandHandler("start", self.start_command))
        logger.info("✅ Обработчик команды /start зарегистрирован")
        
        # Обработчик нажатий на inline кнопки
        self.application.add_handler(CallbackQueryHandler(self.button_callback))
        logger.info("✅ Обработчик кнопок CallbackQueryHandler зарегистрирован")
        
        # Обработчик текстовых сообщений
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
        logger.info("✅ Обработчик текстовых сообщений зарегистрирован")
        
        # Обработчик команды /reset для сброса разговора
        self.application.add_handler(CommandHandler("reset", self.reset_command))
        logger.info("✅ Обработчик команды /reset зарегистрирован")
        
        logger.info("Все обработчики настроены успешно")
        
    def _gdrive_to_direct(self, url: str) -> str:
        """Если ссылка Google Drive вида /file/d/<id>/view, конвертируем в прямую загрузку."""
        try:
            match = re.search(r"drive\.google\.com/file/d/([^/]+)/", url)
            if match:
                file_id = match.group(1)
                return f"https://drive.google.com/uc?export=download&id={file_id}"
            return url
        except Exception:
            return url

    def _strip_markdown(self, text: str) -> str:
        """Удаляет базовую Markdown-разметку у ответа ассистента."""
        if not text:
            return text
        try:
            # [текст](url) -> текст
            text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
            # **x**, *x*, __x__, _x_ -> x
            text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
            text = re.sub(r"\*(.*?)\*", r"\1", text)
            text = re.sub(r"__(.*?)__", r"\1", text)
            text = re.sub(r"_(.*?)_", r"\1", text)
            # `x` или ```x``` -> x
            text = re.sub(r"`{1,3}([\s\S]*?)`{1,3}", r"\1", text)
            return text
        except Exception:
            return text

    async def _send_checklist(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Надёжная отправка чек-листа пользователю с красивым именем файла."""
        if not getattr(Config, 'CHECKLIST_URL', None):
            logger.info("ℹ️ CHECKLIST_URL не задан — пропускаем отправку чек-листа")
            return
        chat_id = update.effective_chat.id
        url = Config.CHECKLIST_URL
        logger.info(f"📄 CHECKLIST_URL={url}")
        caption = "В знак благодарности отправляем вам наш гайд «Как игры помогают выявить лидеров в команде»."
        # Попытка A: сразу отправить как документ по прямой ссылке (пусть Telegram скачивает сам)
        try:
            await context.bot.send_document(chat_id=chat_id, document=self._gdrive_to_direct(url), caption=caption)
            logger.info("✅ Чек-лист отправлен Telegram по URL (прямая загрузка)")
            return
        except Exception as e:
            logger.warning(f"Не удалось отправить документ по URL напрямую: {e}")
        # Попытка B: скачать и отправить байтами, проверив сигнатуру PDF
        try:
            direct = self._gdrive_to_direct(url)
            resp = requests.get(direct, timeout=30)
            content_type = resp.headers.get('Content-Type', '')
            if resp.status_code == 200 and resp.content and (b'%PDF' in resp.content[:8] or 'pdf' in content_type.lower()):
                buf = BytesIO(resp.content)
                buf.name = "Как игры помогают выявить лидеров в команде.pdf"
                await context.bot.send_document(chat_id=chat_id, document=buf, caption=caption)
                logger.info("✅ Чек-лист отправлен как байты (PDF)")
                return
            logger.warning(f"Не удалось скачать валидный PDF: HTTP {resp.status_code}, Content-Type={content_type}")
        except Exception as e:
            logger.warning(f"Ошибка скачивания чек-листа: {e}")
        # Попытка C: отправляем текстом ссылку (чтобы пользователь точно получил доступ)
        try:
            await context.bot.send_message(chat_id=chat_id, text=f"{caption}\n{self._gdrive_to_direct(url)}")
            logger.info("✅ Чек-лист отправлен как текстовая ссылка (fallback)")
        except Exception as e:
            logger.error(f"❌ Не удалось отправить чек-лист ни одним способом: {e}")

    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик команды /start - показывает стартовое меню и отправляет чек-лист"""
        logger.info("🚀 Команда /start вызвана!")
        user_id = update.effective_user.id if update.effective_user else None
        self.user_states[user_id] = "start"

        # 1) Баннер
        try:
            if update.message:
                await self._send_logo(update, context)
            elif update.callback_query:
                await self._send_logo(update.callback_query, context)
        except Exception as e:
            logger.error(f"Ошибка при отправке логотипа: {e}")

        # 2) Убираем дополнительное текстовое приветствие — остаётся картинка и PDF

        # 3) Автосенд чек-листа (надёжный)
        await self._send_checklist(update, context)

        # 4) Сразу начинаем диалог — ассистент первым
        try:
            self.user_states[user_id] = "chatting"
            initial_message = (
                "Начни общение как вежливый консультант FriendEvent. Веди себя естественно как человек, "
                "опираясь на свою базу знаний. Поздоровайся, узнай контекст и потребности. Когда появится готовность, "
                "оформи финальный блок заявки по шаблону с контактами."
            )
            assistant_reply = await asyncio.to_thread(self.openai_client.send_message, user_id, initial_message)
            if update.message:
                await update.message.reply_text(self._strip_markdown(assistant_reply))
            elif update.callback_query and update.callback_query.message:
                await update.callback_query.message.reply_text(self._strip_markdown(assistant_reply))
        except Exception as e:
            logger.error(f"Ошибка старта первичного сообщения ассистента: {e}")
    
    async def _send_logo(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Отправляет логотип компании FriendEvent"""
        try:
            logger.info(f"🖼️ Попытка отправить логотип: {Config.LOGO_IMAGE_URL}")
            welcome_caption = "Спасибо, что проявили интерес к FriendEvent!"

            if Config.LOGO_IMAGE_URL.startswith('http'):
                # Если это URL, загружаем изображение
                logger.info("📥 Загрузка логотипа по URL")
                response = requests.get(self._gdrive_to_direct(Config.LOGO_IMAGE_URL))
                if response.status_code == 200:
                    photo = BytesIO(response.content)
                    await update.message.reply_photo(photo=photo, caption=welcome_caption)
                    logger.info("✅ Логотип отправлен по URL")
                else:
                    logger.warning(f"⚠️ Ошибка загрузки логотипа: {response.status_code}")
                    await update.message.reply_text("🏢 FriendEvent")
            else:
                # Если это путь к файлу
                logger.info("📁 Загрузка логотипа из файла")
                with open(Config.LOGO_IMAGE_URL, 'rb') as photo:
                    await update.message.reply_photo(photo=photo, caption=welcome_caption)
                logger.info("✅ Логотип отправлен из файла")
        except Exception as e:
            logger.error(f"❌ Ошибка при отправке логотипа: {e}")
            await update.message.reply_text("🏢 FriendEvent")
            logger.info("✅ Отправлен текстовый логотип")
    
    async def _is_user_subscribed(self, user_id: int) -> bool:
        """Проверяет, подписан ли пользователь на канал (только для публичных каналов)"""
        try:
            channel = Config.TELEGRAM_CHANNEL_LINK
            # Получаем username канала из ссылки
            if channel.startswith('https://t.me/'):
                channel_username = channel.split('https://t.me/')[-1].replace('/', '')
                if not channel_username.startswith('@'):
                    channel_username = '@' + channel_username
            else:
                channel_username = channel
            member = await self.application.bot.get_chat_member(channel_username, user_id)
            return member.status in ['member', 'administrator', 'creator']
        except Exception as e:
            logger.warning(f'Не удалось проверить подписку пользователя {user_id}: {e}')
            return False

    async def button_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик нажатий на inline кнопки"""
        logger.info("🔘 button_callback вызван!")
        query = update.callback_query
        logger.info(f"🔘 CallbackQuery получен: {query.data}")
        await query.answer()
        user_id = query.from_user.id
        logger.info(f"🔘 Обработка кнопки: {query.data} от пользователя {user_id}")
        if query.data == "start_chat":
            # Больше не проверяем подписку — сразу начинаем диалог
            logger.info(f"✅ Запуск диалога для пользователя {user_id}")
            await self._start_chat(query, context)
        elif query.data == "reset_chat":
            logger.info(f"🔄 Сброс диалога для пользователя {user_id}")
            await self._reset_chat(query, context)
        else:
            logger.warning(f"⚠️ Неизвестная кнопка: {query.data}")
    
    async def _start_chat(self, query, context: ContextTypes.DEFAULT_TYPE):
        """Начинает диалог с ассистентом"""
        user_id = query.from_user.id
        # Меняем состояние пользователя
        self.user_states[user_id] = "chatting"
        # Больше не показываем никаких кнопок
        reply_markup = None
        # Отправляем служебный стартовый сигнал ассистенту
        try:
            initial_message = "Начни диалог от имени FriendEvent: представься, попроси имя и цель."
            _ = await asyncio.to_thread(self.openai_client.send_message, user_id, initial_message)
            # Обновлённое приветственное сообщение без упоминания подписки
            welcome_message = (
                "Я готов помочь с вашим событием: подскажем формат, площадку и смету. "
                "Пожалуйста, представьтесь и кратко опишите задачу."
            )
            await query.edit_message_text(welcome_message, reply_markup=reply_markup)
        except Exception as e:
            logger.error(f"Ошибка при инициации диалога: {e}")
            welcome_message = (
                "Я готов помочь с вашим событием: подскажем формат, площадку и смету. "
                "Пожалуйста, представьтесь и кратко опишите задачу."
            )
            await query.edit_message_text(welcome_message, reply_markup=reply_markup)
    
    async def _reset_chat(self, query, context: ContextTypes.DEFAULT_TYPE):
        """Сбрасывает разговор с ассистентом"""
        user_id = query.from_user.id
        
        # Сбрасываем разговор в OpenAI
        self.openai_client.reset_conversation(user_id)
        
        # Возвращаемся к стартовому меню
        self.user_states[user_id] = "start"
        
        await query.edit_message_text(
            "🔄 Разговор сброшен!\n\n"
            "Нажмите /start для начала нового диалога."
        )
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик текстовых сообщений от пользователя"""
        logger.info("📩 handle_message вызван!")
        user_id = update.effective_user.id if update.effective_user else None
        message_text = update.message.text if update.message else None
        logger.info(f"Пользователь: {user_id}, текст: {message_text}")

        # Если состояние отсутствует или не 'chatting' (серверлесс среда может терять память),
        # автоматически переводим пользователя в режим общения
        if user_id not in self.user_states or self.user_states[user_id] != "chatting":
            self.user_states[user_id] = "chatting"

        # Отправляем сообщение ассистенту OpenAI
        try:
            if update.message:
                await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
            response = await asyncio.to_thread(self.openai_client.send_message, user_id, message_text)
            logger.info(f"Diag: thread_id={self.openai_client.get_thread_id(user_id)}")
            logger.info(f"Ответ ассистента: {response}")
            # Проверяем, содержит ли ответ ассистента финальный блок заявки
            is_final = self._contains_final_application(response)
            logger.info(f"Результат проверки финального блока: {is_final}")
            if is_final:
                logger.info("Пробую отправить заявку в рабочий чат...")
                await self._send_application_to_working_chat(context, response, user_id)
                if update.message:
                    await update.message.reply_text(self._strip_markdown(response))
            else:
                if update.message:
                    await update.message.reply_text(response)
        except Exception as e:
            logger.error(f"Ошибка при обработке сообщения: {e}")
            if update.message:
                await update.message.reply_text(
                    "Извините, произошла ошибка. Попробуйте позже или используйте /reset для сброса."
                )
    

    
    def _contains_final_application(self, text: str) -> bool:
        """Проверяет, содержит ли текст финальный блок заявки по шаблону"""
        logger.info(f"Проверка на финальный блок. Текст ассистента:\n{text}")
        if not text:
            logger.info("❌ Текст пустой — не заявка")
            return False
        if "[Заявка в рабочий чат]" not in text:
            logger.info("❌ Нет заголовка [Заявка в рабочий чат] — не заявка")
            return False
        required_fields = ["Имя:", "Телефон:", "Телеграм:", "Запрос:"]
        for field in required_fields:
            if field not in text:
                logger.info(f"❌ Нет поля {field} — не заявка")
                return False
        logger.info("✅ Найден валидный финальный блок заявки!")
        return True
    

    
    def _get_current_time(self) -> str:
        """Возвращает текущее время в читаемом формате"""
        from datetime import datetime
        return datetime.now().strftime("%d.%m.%Y %H:%M:%S")
    
    async def _send_application_to_working_chat(self, context: ContextTypes.DEFAULT_TYPE, application_text: str, user_id: int):
        """Отправляет заявку в рабочий чат"""
        try:
            # Просто пересылаем блок заявки без изменений
            working_chat_message = (
                f"🚨 НОВАЯ ЗАЯВКА ОТ ПОЛЬЗОВАТЕЛЯ {user_id}\n\n"
                f"{application_text}"
            )
            
            # Отправляем в рабочий чат
            await context.bot.send_message(
                chat_id=Config.WORKING_CHAT_ID,
                text=working_chat_message
            )
            
            logger.info(f"Заявка от пользователя {user_id} отправлена в рабочий чат {Config.WORKING_CHAT_ID}")
            
        except Exception as e:
            logger.error(f"Ошибка при отправке заявки в рабочий чат: {e}")
            # Пытаемся отправить простой текст в случае ошибки
            try:
                simple_message = f"🚨 НОВАЯ ЗАЯВКА ОТ ПОЛЬЗОВАТЕЛЯ {user_id}\n\n{application_text}"
                await context.bot.send_message(
                    chat_id=Config.WORKING_CHAT_ID,
                    text=simple_message
                )
                logger.info(f"Заявка отправлена простым текстом")
            except Exception as e2:
                logger.error(f"Критическая ошибка при отправке заявки: {e2}")
    
    async def reset_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик команды /reset - сбрасывает разговор"""
        user_id = update.effective_user.id
        
        # Сбрасываем разговор в OpenAI
        self.openai_client.reset_conversation(user_id)
        
        # Сбрасываем состояние пользователя
        self.user_states[user_id] = "start"
        
        await update.message.reply_text(
            "🔄 Разговор сброшен!\n\n"
            "Используйте /start для начала нового диалога."
        )
    
    def run(self):
        """Запускает бота"""
        try:
            # Проверяем конфигурацию
            logger.info("🔍 Проверка конфигурации...")
            Config.validate()
            logger.info("✅ Конфигурация проверена успешно")
            
            # Проверяем токен бота
            logger.info(f"🔑 Токен бота: {Config.TELEGRAM_BOT_TOKEN[:10]}...")
            
            # Запускаем бота
            logger.info("🚀 Запуск бота FriendEvent...")
            logger.info("📡 Подключение к Telegram API...")
            
            # Добавляем обработчик ошибок
            self.application.add_error_handler(self._error_handler)
            
            # Запускаем с подробным логированием
            self.application.run_polling(
                allowed_updates=Update.ALL_TYPES,
                drop_pending_updates=True
            )
            
        except Exception as e:
            logger.error(f"❌ Критическая ошибка при запуске бота: {e}")
            logger.error(f"📋 Тип ошибки: {type(e).__name__}")
            import traceback
            logger.error(f"🔍 Stack trace: {traceback.format_exc()}")
            raise
    
    async def _error_handler(self, update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Обработчик ошибок"""
        logger.error(f"❌ Ошибка в боте: {context.error}")
        logger.error(f"📋 Тип ошибки: {type(context.error).__name__}")
        import traceback
        logger.error(f"🔍 Stack trace: {traceback.format_exc()}")
        
        # Если это ошибка подключения, логируем дополнительную информацию
        if hasattr(context.error, 'status_code'):
            logger.error(f"🌐 HTTP статус: {context.error.status_code}")
        if hasattr(context.error, 'response'):
            logger.error(f"📡 Ответ сервера: {context.error.response}")

if __name__ == "__main__":
    # Создаем и запускаем бота
    bot = SynaplinkBot()
    bot.run()
