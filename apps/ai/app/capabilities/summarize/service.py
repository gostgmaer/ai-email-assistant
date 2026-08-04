from .graph import summarize_graph


class SummarizeWorkflow:
    """Summarize workflow service."""

    async def execute(self, state: dict):
        return await summarize_graph.ainvoke(state)

    def execute_sync(self, state: dict):
        return summarize_graph.invoke(state)


summarize_workflow = SummarizeWorkflow()