"""
Модуль для работы с OpenAI API и ассистентом
Обрабатывает диалоги и формирует заявки
"""

import openai
from openai import OpenAI
from config import Config
import logging
import asyncio
from typing import Optional
from pathlib import Path

# Настраиваем логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OpenAIClient:
    """Класс для работы с OpenAI API"""
    
    def __init__(self):
        """Инициализация клиента OpenAI с поддержкой org/project"""
        client_kwargs = {"api_key": Config.OPENAI_API_KEY}
        api_key = Config.OPENAI_API_KEY or ""
        use_project_scoped_key = isinstance(api_key, str) and api_key.startswith("sk-proj-")
        # Если ключ проектный (sk-proj-), не передаем organization: это может вызывать 401
        if not use_project_scoped_key and getattr(Config, 'OPENAI_ORG_ID', None):
            client_kwargs["organization"] = Config.OPENAI_ORG_ID
        elif use_project_scoped_key and getattr(Config, 'OPENAI_ORG_ID', None):
            logger.warning("Проектный ключ обнаружен (sk-proj-*): заголовок organization не будет установлен")
        if getattr(Config, 'OPENAI_PROJECT_ID', None):
            project_id = Config.OPENAI_PROJECT_ID
            # Валидация: реальный ID проекта начинается с "proj_". Если нет — пропускаем, иначе получим 401.
            if isinstance(project_id, str) and project_id.startswith("proj_"):
                client_kwargs["project"] = project_id
            else:
                logger.warning(
                    "OPENAI_PROJECT_ID выглядит некорректно (ожидается 'proj_*'). Параметр project не будет передан."
                )
        self.client = OpenAI(**client_kwargs)
        self.assistant_id = Config.OPENAI_ASSISTANT_ID
        self.threads = {}
        self._redis = self._init_redis()
        # Диагностика: убеждаемся, что используем именно ваш ассистент
        try:
            a = self.client.beta.assistants.retrieve(self.assistant_id)
            tools_list = getattr(a, 'tools', []) or []
            tools_names = [getattr(t, 'type', str(t)) for t in tools_list]
            has_instructions = bool(getattr(a, 'instructions', '') or '')
            logger.info(
                f"Assistant bound: id={a.id}, name={getattr(a, 'name', '')}, model={getattr(a, 'model', '')}, "
                f"tools={tools_names}, instructions={'yes' if has_instructions else 'no'}"
            )
        except Exception as e:
            logger.warning(f"Не удалось получить метаданные ассистента: {e}")
        # Не переопределяем инструкции ассистента — используем то, что задано у ассистента в OpenAI
        # self.instructions = None
        
    def create_thread(self, user_id: int):
        """Создает новый thread для пользователя"""
        try:
            thread = self.client.beta.threads.create()
            self.threads[user_id] = thread.id
            self._save_thread_id(user_id, thread.id)
            logger.info(f"Создан новый thread {thread.id} для пользователя {user_id}")
            return thread.id
        except Exception as e:
            logger.error(f"Ошибка при создании thread: {e}")
            raise
    
    def get_or_create_thread(self, user_id: int):
        """Получает существующий thread или создает новый"""
        if user_id in self.threads:
            return self.threads[user_id]
        # Пытаемся прочитать из Redis
        cached = self._load_thread_id(user_id)
        if cached:
            self.threads[user_id] = cached
            return cached
        return self.create_thread(user_id)
    
    def send_message(self, user_id: int, message: str):
        """
        Отправляет сообщение ассистенту и получает ответ
        
        Args:
            user_id: ID пользователя Telegram
            message: Текст сообщения пользователя
            
        Returns:
            str: Ответ ассистента
        """
        try:
            thread_id = self.get_or_create_thread(user_id)
            logger.info(f"OpenAI: send_message user={user_id} thread={thread_id}")
            
            # Добавляем сообщение пользователя в thread
            self.client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=message
            )
            logger.info("OpenAI: user message appended to thread")
            
            # Запускаем ассистента
            # Жёстко отключаем инструкции ассистента на время выполнения ран
            run = self.client.beta.threads.runs.create(
                thread_id=thread_id,
                assistant_id=self.assistant_id,
                # instructions=""
            )
            logger.info(f"OpenAI: run created id={run.id}")
            
            # Ждем завершения выполнения
            while True:
                run_status = self.client.beta.threads.runs.retrieve(
                    thread_id=thread_id,
                    run_id=run.id
                )
                logger.info(f"OpenAI: run status={run_status.status}")
                if run_status.status == 'completed':
                    break
                elif run_status.status == 'failed':
                    logger.error(f"Ошибка выполнения ассистента: {run_status.last_error}")
                    return "Извините, произошла ошибка. Попробуйте позже."
                
                import time
                time.sleep(1)
            
            # Получаем ответ ассистента
            messages = self.client.beta.threads.messages.list(thread_id=thread_id, order="desc", limit=10)
            logger.info(f"OpenAI: messages fetched count={len(messages.data)}")
            
            # Ищем последнее сообщение ассистента
            for msg in messages.data:
                if msg.role == "assistant":
                    # Проверяем, содержит ли сообщение заявку
                    content = msg.content[0].text.value if msg.content else ""
                    preview = (content[:200] + "…") if len(content) > 200 else content
                    logger.info(f"OpenAI: assistant reply preview=\n{preview}")
                    if self._is_application(content):
                        return self._format_application(content)
                    return content
            
            return "Извините, не удалось получить ответ от ассистента."
            
        except Exception as e:
            logger.error(f"Ошибка при отправке сообщения: {e}")
            return "Произошла ошибка. Попробуйте позже."
    
    def _load_prompt_instructions(self) -> str:
        """Читает инструкции из файла config/prompt.md (если есть)."""
        try:
            prompt_path = Path(__file__).parent / 'config' / 'prompt.md'
            if prompt_path.exists():
                text = prompt_path.read_text(encoding='utf-8').strip()
                return text
        except Exception as e:
            logger.warning(f"Не удалось загрузить config/prompt.md: {e}")
        return ""

    def _default_instructions(self) -> str:
        return ""
    
    def _is_application(self, content: str) -> bool:
        """Проверяет, содержит ли сообщение заявку"""
        application_indicators = [
            "[Заявка в рабочий чат]",
            "Имя:",
            "Телефон:",
            "Email:",
            "Запрос:"
        ]
        
        return all(indicator in content for indicator in application_indicators)
    
    def _format_application(self, content: str) -> str:
        """Форматирует заявку для отправки в рабочий чат"""
        # Убираем лишние пробелы и форматируем
        lines = content.strip().split('\n')
        formatted_lines = []
        
        for line in lines:
            line = line.strip()
            if line:
                formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    def reset_conversation(self, user_id: int):
        """Сбрасывает разговор для пользователя"""
        if user_id in self.threads:
            del self.threads[user_id]
            logger.info(f"Разговор сброшен для пользователя {user_id}")
        self._delete_thread_id(user_id)

    def get_thread_id(self, user_id: int) -> str | None:
        """Возвращает текущий thread_id пользователя, если он есть."""
        return self.threads.get(user_id)

    def get_last_assistant_message(self, user_id: int) -> str:
        """Возвращает последний ответ ассистента в thread пользователя (для диагностики)."""
        try:
            thread_id = self.get_or_create_thread(user_id)
            messages = self.client.beta.threads.messages.list(thread_id=thread_id)
            for msg in messages.data:
                if msg.role == "assistant":
                    return msg.content[0].text.value if msg.content else ""
            return ""
        except Exception as e:
            logger.error(f"debug get_last_assistant_message error: {e}")
            return ""

    # ===== Redis helpers =====
    def _init_redis(self):
        try:
            from redis import Redis
            if getattr(Config, 'REDIS_URL', None):
                return Redis.from_url(Config.REDIS_URL, decode_responses=True)
        except Exception as e:
            logger.warning(f"Redis не инициализирован: {e}")
        return None

    def _redis_key(self, user_id: int) -> Optional[str]:
        if not self._redis:
            return None
        prefix = getattr(Config, 'REDIS_PREFIX', 'b2bbot:thread:')
        return f"{prefix}{user_id}"

    def _save_thread_id(self, user_id: int, thread_id: str) -> None:
        key = self._redis_key(user_id)
        if key:
            try:
                # TTL 7 дней
                self._redis.set(key, thread_id, ex=7*24*3600)
            except Exception as e:
                logger.warning(f"Redis save thread_id error: {e}")

    def _load_thread_id(self, user_id: int) -> Optional[str]:
        key = self._redis_key(user_id)
        if key:
            try:
                return self._redis.get(key)
            except Exception as e:
                logger.warning(f"Redis load thread_id error: {e}")
        return None

    def _delete_thread_id(self, user_id: int) -> None:
        key = self._redis_key(user_id)
        if key:
            try:
                self._redis.delete(key)
            except Exception as e:
                logger.warning(f"Redis delete thread_id error: {e}")
