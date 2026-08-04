from .graph import extract_graph


class ExtractWorkflow:
    """Extraction workflow service."""

    async def execute(self, state: dict):
        return await extract_graph.ainvoke(state)

    def execute_sync(self, state: dict):
        return extract_graph.invoke(state)


extract_workflow = ExtractWorkflow()