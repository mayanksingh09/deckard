"""Agent orchestrating realtime conversation flows."""
from __future__ import annotations

from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from agents import function_tool, WebSearchTool
from agents.realtime import RealtimeAgent, realtime_handoff

from dotenv import load_dotenv


load_dotenv()

web_search_rt_agent = RealtimeAgent(
    name="Realtime Voice Web Search Agent",
    instructions=f"""{RECOMMENDED_PROMPT_PREFIX}
    You are an FAQ agent. If you are speaking to a customer, you probably were transferred to from the assistant agent.
    Use the following routine to support the customer.
    # Routine
    1. Identify the last question asked by the customer.
    2. Use the web search tool to answer the question. Do not rely on your own knowledge.
    3. If you cannot answer the question, transfer back to the assistant agent.""",
    tools=[WebSearchTool()]
)

assistant_agent = RealtimeAgent(
    name="Realtime Voice Assistant Agent",
    instructions=(
        f"{RECOMMENDED_PROMPT_PREFIX} "
        "You are a helpful triaging agent. You can use your tools to delegate questions to other appropriate agents."
    ),
    handoffs=[web_search_rt_agent],
)

web_search_rt_agent.handoffs.append(assistant_agent)

def get_starting_agent() -> RealtimeAgent:
    return assistant_agent