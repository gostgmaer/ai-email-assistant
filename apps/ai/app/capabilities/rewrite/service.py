from .graph import rewrite_graph


class RewriteWorkflow:
    """Rewrite workflow service."""

    async def execute(self, state: dict):
        return await rewrite_graph.ainvoke(state)

    def execute_sync(self, state: dict):
        return rewrite_graph.invoke(state)


rewrite_workflow = RewriteWorkflow()