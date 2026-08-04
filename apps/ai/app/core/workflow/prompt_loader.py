from app.core.prompts import prompt_manager


class PromptLoader:
    """Load workflow prompts."""

    @staticmethod
    def load(name: str) -> str:
        return prompt_manager.get(name)


prompt_loader = PromptLoader()