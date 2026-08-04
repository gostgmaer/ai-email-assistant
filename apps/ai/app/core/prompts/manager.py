from pathlib import Path

from app.config.settings import settings

from .loader import PromptLoader


class PromptManager:
    """Caches prompt templates."""

    def __init__(self):
        self.loader = PromptLoader(
            Path(settings.prompts_directory)
        )

        self._cache: dict[str, str] = {}

    def get(self, name: str) -> str:
        if name not in self._cache:
            self._cache[name] = self.loader.load(name)

        return self._cache[name]

    def reload(self):
        self._cache.clear()


prompt_manager = PromptManager()