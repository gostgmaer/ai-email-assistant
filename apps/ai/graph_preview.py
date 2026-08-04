from pathlib import Path

from app.capabilities.reply.graph import reply_graph

output = Path("reply_graph.png")

png = reply_graph.get_graph().draw_mermaid_png()

output.write_bytes(png)

print(f"Saved graph to {output.resolve()}")