import asyncio

from openai.types.shared import Reasoning

from agents import Agent, ModelSettings, Runner
from dotenv import load_dotenv

load_dotenv()

sentiment_classifying_agent = Agent(
    name="Sentiment Classifying Agent",
    instructions="Classify the sentiment of the user's message. Just respond with the sentiment - positive, negative, or neutral.",
    tools=[],
    model="gpt-5-mini",
    model_settings=ModelSettings(
        reasoning=Reasoning(effort="minimal"),
        verbosity="low"
    )
)

async def main():
    result = await Runner.run(sentiment_classifying_agent, "I am not very happy with the product.")
    print(result.final_output)

if __name__ == "__main__":
    asyncio.run(main())