from pathlib import Path


class PromptLoader:
    """Loads prompt files from disk."""

    def __init__(self, root: Path):
        self.root = root

    def load(self, name: str) -> str:
        file = self.root / f"{name}.md"

        if not file.exists():
            raise FileNotFoundError(
                f"Prompt not found: {file}"
            )

        return file.read_text(encoding="utf-8")