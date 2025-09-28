import asyncio
import base64
import os
from pathlib import Path
from typing import Literal, Union

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from agents.exceptions import MaxTurnsExceeded

from agents import (
    Agent,
    AsyncComputer,
    Button,
    ComputerTool,
    Environment,
    ModelSettings,
    Runner,
    trace,
)

# Uncomment to see very verbose logs
# import logging
# logging.getLogger("openai.agents").setLevel(logging.DEBUG)
# logging.getLogger("openai.agents").addHandler(logging.StreamHandler())


POST_TO_X_AGENT_INSTRUCTIONS = """
You control a Chromium browser via Playwright. The browser is already logged into https://x.com/.
When you are asked to share a post, follow these rules:

1. Navigate to https://x.com/compose/post (or open the post dialog from the home feed).
2. Use exactly the text provided by the user unless they request edits. Keep URLs intact.
3. Submit the post and wait for confirmation that it was published.
4. Do not change account settings or interact with unrelated content.
5. After posting, describe exactly what you published so the user has a record.
"""


async def main():
    async with LocalPlaywrightComputer(start_url="https://x.com/home") as computer:
        with trace("Computer use example"):
            agent = Agent(
                name="Browser user",
                instructions=POST_TO_X_AGENT_INSTRUCTIONS,
                tools=[ComputerTool(computer)],
                # Use the computer using model, and set truncation to auto because its required
                model="computer-use-preview",
                model_settings=ModelSettings(truncation="auto"),
            )
            result = await Runner.run(
                agent,
                "Post 'Testing automated post from Deckard demo.'",
                max_turns=_env_int("COMPUTER_USE_MAX_TURNS", default=25),
            )
            print(result.final_output)


CUA_KEY_TO_PLAYWRIGHT_KEY = {
    "/": "Divide",
    "\\": "Backslash",
    "alt": "Alt",
    "arrowdown": "ArrowDown",
    "arrowleft": "ArrowLeft",
    "arrowright": "ArrowRight",
    "arrowup": "ArrowUp",
    "backspace": "Backspace",
    "capslock": "CapsLock",
    "cmd": "Meta",
    "ctrl": "Control",
    "delete": "Delete",
    "end": "End",
    "enter": "Enter",
    "esc": "Escape",
    "home": "Home",
    "insert": "Insert",
    "option": "Alt",
    "pagedown": "PageDown",
    "pageup": "PageUp",
    "shift": "Shift",
    "space": " ",
    "super": "Meta",
    "tab": "Tab",
    "win": "Meta",
}


def _env_flag(name: str, *, default: bool) -> bool:
    """Return True if the environment flag is set to a truthy value."""

    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _env_int(name: str, *, default: int) -> int:
    """Return the integer value stored in an environment variable or fallback."""

    raw = os.getenv(name)
    if raw is None:
        return default

    try:
        return int(raw.strip())
    except (TypeError, ValueError):
        return default


class LocalPlaywrightComputer(AsyncComputer):
    """A computer, implemented using a local Playwright browser."""

    def __init__(
        self,
        *,
        start_url: str = "https://www.bing.com",
        headless: bool | None = None,
        user_data_dir: str | None = None,
    ):
        self._playwright: Union[Playwright, None] = None
        self._browser: Union[Browser, None] = None
        self._context: Union[BrowserContext, None] = None
        self._page: Union[Page, None] = None
        self._start_url = start_url

        headless_default = _env_flag("PLAYWRIGHT_HEADLESS", default=True)
        self._headless = headless if headless is not None else headless_default

        user_data_dir = user_data_dir or os.getenv("PLAYWRIGHT_USER_DATA_DIR")
        self._user_data_dir: Union[Path, None]
        if user_data_dir:
            resolved_dir = Path(user_data_dir).expanduser().resolve()
            resolved_dir.mkdir(parents=True, exist_ok=True)
            self._user_data_dir = resolved_dir
        else:
            self._user_data_dir = None

    async def _get_browser_context_and_page(self) -> tuple[Browser, BrowserContext, Page]:
        width, height = self.dimensions
        launch_args = [f"--window-size={width},{height}"]

        if self._user_data_dir is not None:
            context = await self.playwright.chromium.launch_persistent_context(
                str(self._user_data_dir),
                headless=self._headless,
                args=launch_args,
            )
            browser = context.browser
        else:
            browser = await self.playwright.chromium.launch(
                headless=self._headless,
                args=launch_args,
            )
            context = await browser.new_context()

        page = next((p for p in context.pages if not p.is_closed()), None)
        if page is None:
            page = await context.new_page()

        await page.set_viewport_size({"width": width, "height": height})
        await page.goto(self._start_url)
        return browser, context, page

    async def __aenter__(self):
        # Start Playwright and call the subclass hook for getting browser/page
        self._playwright = await async_playwright().start()
        self._browser, self._context, self._page = await self._get_browser_context_and_page()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
        if self._playwright:
            await self._playwright.stop()

    @property
    def playwright(self) -> Playwright:
        assert self._playwright is not None
        return self._playwright

    @property
    def browser(self) -> Browser:
        assert self._browser is not None
        return self._browser

    @property
    def context(self) -> BrowserContext:
        assert self._context is not None
        return self._context

    @property
    def page(self) -> Page:
        assert self._page is not None
        return self._page

    @property
    def environment(self) -> Environment:
        return "browser"

    @property
    def dimensions(self) -> tuple[int, int]:
        return (1024, 768)

    async def screenshot(self) -> str:
        """Capture only the viewport (not full_page)."""
        png_bytes = await self.page.screenshot(full_page=False)
        return base64.b64encode(png_bytes).decode("utf-8")

    async def click(self, x: int, y: int, button: Button = "left") -> None:
        playwright_button: Literal["left", "middle", "right"] = "left"

        # Playwright only supports left, middle, right buttons
        if button in ("left", "right", "middle"):
            playwright_button = button  # type: ignore

        await self.page.mouse.click(x, y, button=playwright_button)

    async def double_click(self, x: int, y: int) -> None:
        await self.page.mouse.dblclick(x, y)

    async def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        await self.page.mouse.move(x, y)
        await self.page.evaluate(f"window.scrollBy({scroll_x}, {scroll_y})")

    async def type(self, text: str) -> None:
        await self.page.keyboard.type(text)

    async def wait(self) -> None:
        await asyncio.sleep(1)

    async def move(self, x: int, y: int) -> None:
        await self.page.mouse.move(x, y)

    async def keypress(self, keys: list[str]) -> None:
        mapped_keys = [CUA_KEY_TO_PLAYWRIGHT_KEY.get(key.lower(), key) for key in keys]
        for key in mapped_keys:
            await self.page.keyboard.down(key)
        for key in reversed(mapped_keys):
            await self.page.keyboard.up(key)

    async def drag(self, path: list[tuple[int, int]]) -> None:
        if not path:
            return
        await self.page.mouse.move(path[0][0], path[0][1])
        await self.page.mouse.down()
        for px, py in path[1:]:
            await self.page.mouse.move(px, py)
        await self.page.mouse.up()


async def post_to_x(content: str) -> str:
    """Run the computer-use agent to publish a post on x.com."""

    turns_budget = _env_int("COMPUTER_USE_MAX_TURNS", default=25)

    async with LocalPlaywrightComputer(start_url="https://x.com/home") as computer:
        with trace("Post to X.com"):
            agent = Agent(
                name="X Poster",
                instructions=POST_TO_X_AGENT_INSTRUCTIONS,
                tools=[ComputerTool(computer)],
                model="computer-use-preview",
                model_settings=ModelSettings(truncation="auto"),
            )
            try:
                result = await Runner.run(agent, content, max_turns=turns_budget)
            except MaxTurnsExceeded as exc:
                error_hint = (
                    "Computer-use automation exceeded its turn limit before posting. "
                    "Verify the X.com session is already logged in (set PLAYWRIGHT_USER_DATA_DIR) "
                    "and raise COMPUTER_USE_MAX_TURNS if more steps are required."
                )
                raise RuntimeError(error_hint) from exc

    if result.final_output:
        return str(result.final_output)
    return "Posted to X.com, but the agent did not provide a summary."


if __name__ == "__main__":
    asyncio.run(main())
