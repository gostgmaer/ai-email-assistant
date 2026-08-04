from .graph import classify_graph


class ClassifyWorkflow:
    """Classification workflow service."""

    async def execute(self, state: dict):
        return await classify_graph.ainvoke(state)

    def execute_sync(self, state: dict):
        return classify_graph.invoke(state)


classify_workflow = ClassifyWorkflow()