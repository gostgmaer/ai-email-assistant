from .graph import reply_graph


class ReplyWorkflow:
    """Reply workflow service."""

    async def execute(self, state: dict):
        return await reply_graph.ainvoke(state)

    def execute_sync(self, state: dict):
        return reply_graph.invoke(state)


reply_workflow = ReplyWorkflow()