from .config import WorkflowConfig

workflow_registry: dict[str, WorkflowConfig] = {}


def register(config: WorkflowConfig) -> None:
    workflow_registry[config.name] = config


def get(name: str) -> WorkflowConfig:
    return workflow_registry[name]