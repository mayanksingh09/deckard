"""Agent orchestrating realtime conversation flows."""
from __future__ import annotations
from re import M

from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from agents import Runner, function_tool
from agents.realtime import RealtimeAgent

from dotenv import load_dotenv


load_dotenv()

from .web_search_agent import search_agent
from .sentiment_classifying import sentiment_classifying_agent
from app.services.computer_use import search_advicehub


@function_tool(name_override="web_search")
async def execute_web_search(query: str) -> str:
    """Run the async search agent to answer the query with fresh web context."""
    run_result = await Runner.run(search_agent, input=query)
    if run_result.final_output:
        return str(run_result.final_output)
    return "I could not find any relevant results."


@function_tool(name_override="sentiment_classifying")
async def execute_sentiment_classifying(message: str) -> str:
    """Classify the sentiment of the user's message."""
    run_result = await Runner.run(sentiment_classifying_agent, input=message)
    if run_result.final_output:
        return str(run_result.final_output)
    return "I could not classify the sentiment of the message."


@function_tool(name_override="search_advicehub")
async def search_advicehub_tool(search_query: str | None = None) -> str:
    """Run the computer-use automation agent to search advicehub.ai for an expert."""

    normalized_query = (search_query or "").strip()
    if not normalized_query:
        return "I need the expert's name to search on advicehub.ai."
    return await search_advicehub(normalized_query)

web_search_rt_agent = RealtimeAgent(
    name="Realtime Voice Web Search Agent",
    instructions=f"""{RECOMMENDED_PROMPT_PREFIX}
    You are an FAQ agent. If you are speaking to a customer, you probably were transferred to from the assistant agent.
    Use the following routine to support the customer.
    # Routine
    1. Identify the last question asked by the customer.
    2. Use the web search tool to answer the question. Do not rely on your own knowledge.
    3. If you cannot answer the question, transfer back to the assistant agent.""",
    tools=[execute_web_search]
)

assistant_agent = RealtimeAgent(
    name="Realtime Voice Assistant Agent",
    instructions=(
        f"{RECOMMENDED_PROMPT_PREFIX} "
        "You are a helpful voice assistant agent. You provide to the point and succinct answers. You can use your tools to delegate questions to other appropriate agents."
    ),
    tools=[search_advicehub_tool, execute_sentiment_classifying],
    handoffs=[web_search_rt_agent]
)

web_search_rt_agent.handoffs.append(assistant_agent)

def get_starting_agent() -> RealtimeAgent:
    return assistant_agent
