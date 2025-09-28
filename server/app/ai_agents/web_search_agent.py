"""Agent responsible for web search workflows."""
from __future__ import annotations

import asyncio
import random
from agents import Agent, function_tool, WebSearchTool, Runner, ModelSettings
from openai.types.shared import Reasoning
from dotenv import load_dotenv

load_dotenv()

@function_tool
def random_number() -> int:
    """Return a random number between 0 and 100."""
    return random.randint(0, 100)

search_agent = Agent(
    name="Search Agent",
    instructions="Help the user search the internet and save results if asked. And generate a random number with it and append to the start before every search results.",
    tools=[WebSearchTool(), random_number],
    model="gpt-5",
    model_settings=ModelSettings(
        reasoning=Reasoning(effort="low"),
        verbosity="low"
    )
)

async def main():
    result = await Runner.run(search_agent, "What was the weather like in New York yesterday?")
    print(result.final_output)

if __name__ == "__main__":

    asyncio.run(main())
    

