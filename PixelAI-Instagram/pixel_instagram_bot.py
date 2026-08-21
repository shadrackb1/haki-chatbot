"""
Pixel AI Instagram Bot â€” Full-featured Instagram automation bot using instagrapi.
Provides human-like interactions: comment, like, follow, unfollow, repost, etc.

! WARNING: This uses unofficial Instagram APIs. Risks include:
- Permanent account ban
- ToS violation
- Instability (breaks on IG updates)
- Rate limits, challenges, 2FA loops

Use at your own risk. Consider WhatsApp/Telegram instead.
"""

import os
import json
import time
import logging
import signal
import sys
import re
import ast
import operator
import requests
from pathlib import Path
from typing import Optional, Set, List, Dict, Any
from datetime import datetime, timedelta

from instagrapi import Client
from instagrapi.exceptions import (
    LoginRequired,
    ChallengeRequired,
    TwoFactorRequired,
    FeedbackRequired,
    PleaseWaitFewMinutes,
)
from instagrapi.types import (
    UserShort,
    Media,
    Comment,
    Story,
    DirectThread,
    DirectMessage,
)
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Configuration
USERNAME = os.getenv("PIXEL_INSTAGRAM_USERNAME")
PASSWORD = os.getenv("PIXEL_INSTAGRAM_PASSWORD")
OWNER_ID = os.getenv("PIXEL_OWNER_ID")  # Optional: restrict to one user
SESSION_FILE = Path(os.getenv("PIXEL_SESSION_FILE", "pixel_session.json"))
RATE_LIMIT_DELAY = int(os.getenv("PIXEL_RATE_LIMIT_DELAY", "30"))
ACTION_DELAY = int(os.getenv("PIXEL_ACTION_DELAY", "5"))  # Delay between actions

# Optional LLM backend (any OpenAI-compatible API: Groq, OpenAI, NVIDIA NIM, OpenRouter...)
# Set PIXEL_LLM_API_KEY to unlock translations, summaries and general chat.
LLM_API_KEY = os.getenv("PIXEL_LLM_API_KEY", "")
LLM_API_URL = os.getenv("PIXEL_LLM_API_URL", "https://api.groq.com/openai/v1/chat/completions")
LLM_MODEL = os.getenv("PIXEL_LLM_MODEL", "openai/gpt-oss-120b")

# Interactive setup flag
INTERACTIVE_SETUP = False

def interactive_setup() -> bool:
    """Interactive setup for first-time users - prompts for credentials and saves to .env"""
    global USERNAME, PASSWORD, OWNER_ID, INTERACTIVE_SETUP
    
    env_file = Path(".env")
    
    # Check if .env exists and has credentials
    if env_file.exists():
        # Reload to get latest values
        load_dotenv(override=True)
        USERNAME = os.getenv("PIXEL_INSTAGRAM_USERNAME")
        PASSWORD = os.getenv("PIXEL_INSTAGRAM_PASSWORD")
        OWNER_ID = os.getenv("PIXEL_OWNER_ID")
        
        if USERNAME and PASSWORD:
            log.info("[OK] Found existing credentials in .env")
            return True
    
    # No valid credentials found - run interactive setup
    print("\n" + "="*60)
    print("Pixel AI Instagram Bot - First Time Setup")
    print("="*60)
    print("No configuration found. Let's set up your bot!\n")
    
    # Get Instagram credentials
    while True:
        username = input("Instagram Username: ").strip()
        if username:
            USERNAME = username
            break
        print("Username cannot be empty")
    
    while True:
        password = input("Instagram Password: ").strip()
        if password:
            PASSWORD = password
            break
        print("Password cannot be empty")
    
    # Optional: Owner ID for command restrictions
    print("\nOwner ID (optional) - Restricts Instagram commands to your account only")
    print("   Get your numeric ID from: https://www.instagram.com/yourusername/?__a=1")
    owner_input = input("Owner User ID (press Enter to skip): ").strip()
    if owner_input:
        OWNER_ID = owner_input
    
    # Save to .env file
    env_content = f"""# Pixel AI Instagram Bot Configuration
PIXEL_INSTAGRAM_USERNAME={USERNAME}
PIXEL_INSTAGRAM_PASSWORD={PASSWORD}
"""
    if OWNER_ID:
        env_content += f"PIXEL_OWNER_ID={OWNER_ID}\n"
    env_content += """PIXEL_SESSION_FILE=pixel_session.json
PIXEL_RATE_LIMIT_DELAY=30
PIXEL_ACTION_DELAY=5
"""
    
    try:
        with open(env_file, "w") as f:
            f.write(env_content)
        log.info("Configuration saved to .env")
        print("\nSetup complete! Configuration saved to .env")
        INTERACTIVE_SETUP = True
        return True
    except Exception as e:
        log.error(f"Failed to save .env: {e}")
        print(f"\nFailed to save configuration: {e}")
        return False


def validate_credentials() -> bool:
    """Validate that we have the required credentials"""
    global USERNAME, PASSWORD
    
    if not USERNAME or not PASSWORD:
        log.error("Missing credentials. Run interactive setup first.")
        return False
    return True

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pixel-instagram")

# Pixel AI responses - Human-like, no AI tells
WELCOME_MESSAGE = """Hey! I'm Pixel [Bot] â€” your personal AI assistant.
I'm here while you're away. Ask me anything:
â€¢ Calculations, translations, definitions
â€¢ Code help, summaries, explanations  
â€¢ Weather (when online), reminders
â€¢ General knowledge, trivia

I speak English and Kiswahili. What's up?"""

HELP_MESSAGE = """Pixel AI Commands:
â€¢ Just chat naturally â€” I'll respond
â€¢ "help" â€” show this message
â€¢ "calculate 2+2" â€” math (works offline)
â€¢ "weather [city]" â€” weather forecast (needs internet)
â€¢ "translate hello to swahili" â€” translation (needs PIXEL_LLM_API_KEY)
â€¢ "remind me to call mom in 10 min" â€” reminders
â€¢ "summarize this text: ..." â€” summarization (needs PIXEL_LLM_API_KEY)

Instagram Controls (Owner only):
â€¢ "feed" â€” see recent posts
â€¢ "story" â€” see recent stories
â€¢ "follow @username" â€” follow a user
â€¢ "unfollow @username" â€” unfollow a user
â€¢ "like @username's latest" â€” like latest post
â€¢ "comment on @username's latest: [text]" â€” comment on post
â€¢ "repost @username's latest to story" â€” share to story
â€¢ "search for #hashtag" â€” search hashtag
â€¢ "search @username" â€” search user
â€¢ "info @username" â€” get user info
â€¢ "dm @username [message]" â€” send direct message

I remember our conversation. Type away!"""

# ---- Safe offline math evaluation (no eval()) ----
_MATH_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}


def _eval_math(node):
    if isinstance(node, ast.Expression):
        return _eval_math(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _MATH_BINOPS:
        return _MATH_BINOPS[type(node.op)](_eval_math(node.left), _eval_math(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        value = _eval_math(node.operand)
        return -value if isinstance(node.op, ast.USub) else value
    raise ValueError("unsupported expression")


class PixelInstagramBot:
    def __init__(self):
        self.cl = Client()
        # Human-like delays to avoid detection
        self.cl.delay_range = [2, 5]
        self.processed_message_ids: Set[str] = set()
        self.running = True
        self.owner_pk: Optional[int] = None
        self.last_action_time: Dict[str, float] = {}
        self.llm_enabled = bool(LLM_API_KEY)

        if self.llm_enabled:
            log.info(f"[OK] LLM brain enabled: {LLM_MODEL}")
        else:
            log.info("No PIXEL_LLM_API_KEY set - smart replies off, commands still work")
        
        # Load session if exists
        if SESSION_FILE.exists():
            try:
                self.cl.load_settings(SESSION_FILE)
                log.info("Loaded existing session")
            except Exception as e:
                log.warning(f"Failed to load session: {e}")

        # Set owner PK if provided
        if OWNER_ID:
            try:
                self.owner_pk = int(OWNER_ID)
            except ValueError:
                # Try to resolve username to PK
                try:
                    self.owner_pk = self.cl.user_id_from_username(OWNER_ID)
                except Exception:
                    log.warning(f"Could not resolve owner ID: {OWNER_ID}")

    def _rate_limit_action(self, action_key: str) -> bool:
        """Check if we can perform an action based on rate limiting."""
        now = time.time()
        if action_key in self.last_action_time:
            elapsed = now - self.last_action_time[action_key]
            if elapsed < ACTION_DELAY:
                return False
        self.last_action_time[action_key] = now
        return True

    def save_session(self):
        """Persist session to disk."""
        try:
            self.cl.dump_settings(SESSION_FILE)
            log.debug("Session saved")
        except Exception as e:
            log.error(f"Failed to save session: {e}")

    def login(self) -> bool:
        """Login with session reuse, 2FA, and challenge handling."""
        try:
            if SESSION_FILE.exists():
                log.info("Attempting login with saved session...")
                self.cl.login(USERNAME, PASSWORD)
                log.info("[OK] Logged in via session")
                return True
        except (LoginRequired, ChallengeRequired, TwoFactorRequired, FeedbackRequired) as e:
            log.info(f"Session invalid, fresh login needed: {type(e).__name__}")

        try:
            log.info("Logging in fresh...")
            self.cl.login(USERNAME, PASSWORD)
            self.save_session()
            log.info("[OK] Fresh login successful")
            return True
        except TwoFactorRequired:
            code = input("Enter 2FA code: ").strip()
            self.cl.login(USERNAME, PASSWORD, verification_code=code)
            self.save_session()
            log.info("[OK] 2FA login successful")
            return True
        except ChallengeRequired as e:
            log.error(f"Challenge required: {e}")
            log.error("Manual intervention needed â€” check Instagram app")
            return False
        except FeedbackRequired as e:
            log.error(f"Feedback required (likely rate limited): {e}")
            return False
        except Exception as e:
            log.error(f"Login failed: {e}")
            return False

    # ============================================
    # SMART FEATURES
    # Calculator works offline. Chat/translate/summarize need PIXEL_LLM_API_KEY.
    # ============================================

    def _calculate(self, text: str) -> str:
        """Evaluate arithmetic safely. Handles 'calculate 12*3' or bare math like 45*(2+3)."""
        expr = text.lower()
        for word in ("calculate", "calc", "what is", "what's", "how much is"):
            expr = expr.replace(word, "")
        expr = expr.replace("=", "").replace("^", "**").strip()
        try:
            result = _eval_math(ast.parse(expr, mode="eval"))
            if isinstance(result, float) and result.is_integer():
                result = int(result)
            return f"{expr} = {result}"
        except Exception:
            return "I couldn't read that as math. Try something like: calculate 45*12+300"

    def _ask_llm(self, text: str) -> Optional[str]:
        """Ask the LLM backend (Groq or any OpenAI-compatible API). None on failure."""
        try:
            resp = requests.post(
                LLM_API_URL,
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are Pixel, a casual personal assistant texting on Instagram. "
                                "Reply short and human, like a friend - no corporate tone, no bullet-point essays. "
                                "Match the sender's language (English or Kiswahili)."
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    "max_tokens": 400,
                    "temperature": 0.7,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return content.strip() or None
            log.warning(f"LLM HTTP {resp.status_code}")
            return None
        except Exception as e:
            log.warning(f"LLM call failed: {e}")
            return None

    def get_response(self, text: str, sender_name: str) -> str:
        """Generate human-like response â€” replace with actual LLM integration."""
        text_lower = text.lower().strip()
        
        # Handle Instagram control commands (owner only)
        if self.owner_pk and self.cl.user_id == self.owner_pk:
            instagram_response = self._handle_instagram_commands(text_lower, sender_name)
            if instagram_response is not None:
                return instagram_response

        # Simple keyword responses (replace with LLM integration)
        if any(w in text_lower for w in ["hi", "hello", "hey", "habari", "hujambo", "mambo"]):
            return f"Hey {sender_name}! :-) What's up?"
        
        if "help" in text_lower:
            return HELP_MESSAGE
        
        if "weather" in text_lower:
            return "Weather feature needs internet â€” ask me when I'm online! ðŸŒ¤ï¸"
        
        if "calculate" in text_lower or re.search(r"\d\s*[-+*/]", text):
            return self._calculate(text)

        if "weather" in text_lower:
            return "Weather needs an API key that isn't set up yet â€” ask me anything else!"

        if "remind" in text_lower:
            return "Reminders coming soon! â°"

        if "bye" in text_lower or "kwaheri" in text_lower:
            return f"Bye {sender_name}! Talk later. ðŸ‘‹"

        # LLM handles translate, summarize and general chat when configured
        if self.llm_enabled:
            reply = self._ask_llm(text)
            if reply:
                return reply

        if "translate" in text_lower:
            return "Translation isn't configured yet - set PIXEL_LLM_API_KEY in .env to unlock it."

        if "summarize" in text_lower:
            return "Summarizing isn't configured yet - set PIXEL_LLM_API_KEY in .env to unlock it."

        # Default: acknowledge with variation
        responses = [
            f"Got it, {sender_name}. I'm still learning â€” ask me anything!",
            f"Interesting point, {sender_name}. Tell me more about that!",
            f"I hear you, {sender_name}. What else is on your mind?",
            f"That's cool, {sender_name}. What would you like to discuss?",
            f"Thanks for sharing, {sender_name}. What's next?"
        ]
        import random
        return random.choice(responses)

    def _handle_instagram_commands(self, text_lower: str, sender_name: str) -> Optional[str]:
        """Handle Instagram-specific commands (owner only)."""
        # Check if sender is owner
        try:
            sender_info = self.cl.user_info(self.cl.user_id_from_username(sender_name))
            if sender_info.pk != self.owner_pk:
                return None  # Not owner, ignore command
        except Exception:
            return None  # Can't verify, ignore for safety

        # Parse commands
        if text_lower.startswith("feed"):
            return self._get_feed_summary()
        
        elif text_lower.startswith("story"):
            return self._get_stories_summary()
        
        elif match := re.match(r"follow\s+@?(\w+)", text_lower):
            username = match.group(1)
            return self._follow_user(username)
        
        elif match := re.match(r"unfollow\s+@?(\w+)", text_lower):
            username = match.group(1)
            return self._unfollow_user(username)
        
        elif match := re.match(r"like\s+@?(\w+)'?s?\s*latest", text_lower):
            username = match.group(1) if match.group(1) else None
            if not username and "latest" in text_lower:
                # Try to extract username from context
                parts = text_lower.split()
                for i, part in enumerate(parts):
                    if part == "latest" and i > 0:
                        username = parts[i-1].lstrip("@")
                        break
            if username:
                return self._like_latest_post(username)
            else:
                return "Please specify a username: like @username's latest"
        
        elif match := re.match(r"comment\s+on\s+@?(\w+)'?s?\s*latest:\s*(.+)", text_lower):
            username = match.group(1)
            comment_text = match.group(2)
            return self._comment_on_latest_post(username, comment_text)
        
        elif match := re.match(r"repost\s+@?(\w+)'?s?\s*latest\s+to\s+story", text_lower):
            username = match.group(1)
            return self._repost_to_story(username)
        
        elif match := re.match(r"search\s+for\s+#?(\w+)", text_lower):
            hashtag = match.group(1)
            return self._search_hashtag(hashtag)
        
        elif match := re.match(r"search\s+@?(\w+)", text_lower):
            username = match.group(1)
            return self._search_user(username)
        
        elif match := re.match(r"info\s+@?(\w+)", text_lower):
            username = match.group(1)
            return self._get_user_info(username)
        
        elif match := re.match(r"dm\s+@?(\w+)\s+(.+)", text_lower):
            username = match.group(1)
            message = match.group(2)
            return self._send_dm(username, message)
        
        return None  # Not an Instagram command

    def _get_feed_summary(self) -> str:
        """Get summary of recent feed posts."""
        if not self._rate_limit_action("feed"):
            return "â³ Please wait a moment before checking feed again."
        
        try:
            feed = self.cl.get_timeline_feed(amount=5)
            if not feed:
                return "ðŸ“­ No posts in feed right now."
            
            response = f"ðŸ“° Recent feed ({len(feed)} posts):\n\n"
            for i, media in enumerate(feed[:3], 1):  # Show first 3
                try:
                    user = self.cl.user_info(media.user.pk)
                    caption = media.caption_text if media.caption else "No caption"
                    # Truncate caption
                    if len(caption) > 50:
                        caption = caption[:47] + "..."
                    response += f"{i}. @{user.username}: {caption}\n"
                    response += f"   â¤ï¸ {media.like_count} | ðŸ’¬ {media.comment_count}\n\n"
                except Exception:
                    continue
            
            if len(feed) > 3:
                response += f"... and {len(feed) - 3} more posts"
            
            return response
        except Exception as e:
            log.error(f"Error getting feed: {e}")
            return f"[Error] Could not get feed: {str(e)}"

    def _get_stories_summary(self) -> str:
        """Get summary of recent stories from followed users."""
        if not self._rate_limit_action("stories"):
            return "â³ Please wait a moment before checking stories again."
        
        try:
            stories = self.cl.get_stories(amount=10)
            if not stories:
                return "ðŸ“­ No stories available right now."
            
            response = f"ðŸ“± Recent stories ({len(stories)}):\n\n"
            for i, story in enumerate(stories[:3], 1):  # Show first 3
                try:
                    user = self.cl.user_info(story.user.pk)
                    response += f"{i}. @{user.username}"
                    if story.media_type == 1:  # Photo
                        response += " (ðŸ“¸ Photo)"
                    elif story.media_type == 2:  # Video
                        response += " (ðŸŽ¥ Video)"
                    response += "\n"
                except Exception:
                    continue
            
            if len(stories) > 3:
                response += f"... and {len(stories) - 3} more stories"
            
            return response
        except Exception as e:
            log.error(f"Error getting stories: {e}")
            return f"[Error] Could not get stories: {str(e)}"

    def _follow_user(self, username: str) -> str:
        """Follow a user."""
        if not self._rate_limit_action(f"follow_{username}"):
            return f"â³ Please wait before following another user."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.user_follow(user_id)
            log.info(f"Followed @{username}")
            return f"[OK] Now following @{username}"
        except Exception as e:
            log.error(f"Error following @{username}: {e}")
            return f"âŒ Could not follow @{username}: {str(e)}"

    def _unfollow_user(self, username: str) -> str:
        """Unfollow a user."""
        if not self._rate_limit_action(f"unfollow_{username}"):
            return f"â³ Please wait before unfollowing another user."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.user_unfollow(user_id)
            log.info(f"Unfollowed @{username}")
            return f"[OK] No longer following @{username}"
        except Exception as e:
            log.error(f"Error unfollowing @{username}: {e}")
            return f"âŒ Could not unfollow @{username}: {str(e)}"

    def _like_latest_post(self, username: str) -> str:
        """Like the latest post from a user."""
        if not self._rate_limit_action(f"like_{username}"):
            return f"â³ Please wait before liking another post."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"ðŸ“­ @{username} has no posts to like."
            
            media = medias[0]
            self.cl.media_like(media.id)
            log.info(f"Liked latest post from @{username}")
            return f"[Like] Liked @{username}'s latest post"
        except Exception as e:
            log.error(f"Error liking post from @{username}: {e}")
            return f"âŒ Could not like post from @{username}: {str(e)}"

    def _comment_on_latest_post(self, username: str, comment_text: str) -> str:
        """Comment on the latest post from a user."""
        if not self._rate_limit_action(f"comment_{username}"):
            return f"â³ Please wait before commenting again."
        
        # Validate comment length
        if len(comment_text) > 300:
            return "âŒ Comment too long (max 300 characters)"
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"ðŸ“­ @{username} has no posts to comment on."
            
            media = medias[0]
            self.cl.media_comment(media.id, comment_text)
            log.info(f"Commented on @{username}'s latest post: {comment_text[:50]}...")
            return f"[Comment] Commented on @{username}'s latest post"
        except Exception as e:
            log.error(f"Error commenting on post from @{username}: {e}")
            return f"âŒ Could not comment on post from @{username}: {str(e)}"

    def _repost_to_story(self, username: str) -> str:
        """Repost user's latest post to your story."""
        if not self._rate_limit_action(f"repost_{username}"):
            return f"â³ Please wait before reposting again."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"ðŸ“­ @{username} has no posts to repost."
            
            media = medias[0]
            # Share to story
            self.cl.media_share_to_story(media.id, [])
            log.info(f"Reposted @{username}'s latest post to story")
            return f"[Repost] Reposted @{username}'s latest post to your story"
        except Exception as e:
            log.error(f"Error reposting from @{username}: {e}")
            return f"âŒ Could not repost from @{username}: {str(e)}"

    def _search_hashtag(self, hashtag: str) -> str:
        """Search for posts by hashtag."""
        if not self._rate_limit_action(f"hashtag_{hashtag}"):
            return f"â³ Please wait before searching another hashtag."
        
        try:
            # Clean hashtag
            hashtag = hashtag.lstrip('#')
            results = self.cl.hashtag_medias_recent(hashtag, amount=5)
            if not results:
                return f"ðŸ” No recent posts for #{hashtag}"
            
            response = f"ðŸ” Recent posts for #{hashtag} ({len(results)}):\n\n"
            for i, media in enumerate(results[:3], 1):
                try:
                    user = self.cl.user_info(media.user.pk)
                    caption = media.caption_text if media.caption else "No caption"
                    if len(caption) > 40:
                        caption = caption[:37] + "..."
                    response += f"{i}. @{user.username}: {caption}\n"
                    response += f"   â¤ï¸ {media.like_count} | ðŸ’¬ {media.comment_count}\n\n"
                except Exception:
                    continue
            
            if len(results) > 3:
                response += f"... and {len(results) - 3} more posts"
            
            return response
        except Exception as e:
            log.error(f"Error searching hashtag #{hashtag}: {e}")
            return f"[Error] Could not search hashtag #{hashtag}: {str(e)}"

    def _search_user(self, username: str) -> str:
        """Search for a user."""
        if not self._rate_limit_action(f"search_user_{username}"):
            return f"â³ Please wait before searching another user."
        
        try:
            results = self.cl.search_users(username, count=5)
            if not results:
                return f"ðŸ” No users found matching '{username}'"
            
            response = f"ðŸ” Users matching '{username}' ({len(results)}):\n\n"
            for i, user in enumerate(results[:3], 1):
                response += f"{i}. @{user.username}"
                if user.full_name:
                    response += f" ({user.full_name})"
                response += f" - {user.follower_count} followers\n"
            
            if len(results) > 3:
                response += f"... and {len(results) - 3} more users"
            
            return response
        except Exception as e:
            log.error(f"Error searching user {username}: {e}")
            return f"[Error] Could not search user {username}: {str(e)}"

    def _get_user_info(self, username: str) -> str:
        """Get detailed info about a user."""
        if not self._rate_limit_action(f"info_{username}"):
            return f"â³ Please wait before getting info for another user."
        
        try:
            user = self.cl.user_info_by_username(username)
            response = f"ðŸ‘¤ Info for @{user.username}:\n\n"
            response += f"â€¢ Full name: {user.full_name or 'N/A'}\n"
            response += f"â€¢ Followers: {user.follower_count:,}\n"
            response += f"â€¢ Following: {user.following_count:,}\n"
            response += f"â€¢ Posts: {user.media_count:,}\n"
            response += f"â€¢ Bio: {user.biography or 'No bio'}\n"
            response += f"â€¢ External URL: {user.external_url or 'None'}\n"
            response += f"â€¢ Verified: {'Yes' if user.is_verified else 'No'}\n"
            response += f"â€¢ Private: {'Yes' if user.is_private else 'No'}"
            
            return response
        except Exception as e:
            log.error(f"Error getting info for @{username}: {e}")
            return f"[Error] Could not get info for @{username}: {str(e)}"

    def _send_dm(self, username: str, message: str) -> str:
        """Send a direct message to a user."""
        if not self._rate_limit_action(f"dm_{username}"):
            return f"â³ Please wait before sending another DM."
        
        # Validate message length
        if len(message) > 1000:
            return "âŒ Message too long (max 1000 characters)"
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.direct_send(message, [user_id])
            log.info(f"Sent DM to @{username}: {message[:50]}...")
            return f"ðŸ“© Sent DM to @{username}"
        except Exception as e:
            log.error(f"Error sending DM to @{username}: {e}")
            return f"[Error] Could not send DM to @{username}: {str(e)}"

    def process_thread(self, thread) -> None:
        """Process a single DM thread."""
        try:
            messages = self.cl.direct_messages(thread.id, amount=10)
        except Exception as e:
            log.error(f"Failed to fetch messages for thread {thread.id}: {e}")
            return

        for msg in reversed(messages):  # Process oldest first
            msg_id = str(msg.id)
            
            # Skip if already processed
            if msg_id in self.processed_message_ids:
                continue
            
            # Skip own messages
            if msg.user_id == self.cl.user_id:
                self.processed_message_ids.add(msg_id)
                continue
            
            # Owner restriction for commands
            if self.owner_pk and msg.user_id != self.owner_pk:
                log.info(f"Ignoring message from non-owner: {msg.user_id}")
                self.processed_message_ids.add(msg_id)
                continue
            
            # Get sender info
            try:
                sender = self.cl.user_info(msg.user_id)
                sender_name = sender.username or sender.full_name or "there"
            except Exception:
                sender_name = "there"
            
            # Get message text
            text = msg.text or ""
            if not text:
                self.processed_message_ids.add(msg_id)
                continue
            
            log.info(f"ðŸ“¨ @{sender_name}: {text[:50]}...")
            
            # Generate response
            response = self.get_response(text, sender_name)
            
            # Send reply
            try:
                self.cl.direct_send(response, [msg.user_id])
                log.info(f"[Bot] Replied to @{sender_name}")
            except Exception as e:
                log.error(f"Failed to send reply: {e}")
            
            # Mark processed
            self.processed_message_ids.add(msg_id)
            
            # Small delay between replies
            time.sleep(2)

    def run(self) -> None:
        """Main loop."""
        log.info("[Bot] Pixel AI Instagram Bot starting...")
        
        if not self.login():
            log.error("Login failed, exiting")
            return
        
        log.info(f"[OK] Connected as @{USERNAME}")
        log.info(f"ðŸ‘€ Monitoring DMs (rate limit: {RATE_LIMIT_DELAY}s)")
        if self.owner_pk:
            log.info(f"[Secure] Owner-only mode: {self.owner_pk}")
        
        # Handle graceful shutdown
        def signal_handler(sig, frame):
            log.info("[Bot] Shutdown signal received")
            self.running = False
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        while self.running:
            try:
                # Get recent threads
                threads = self.cl.direct_threads(amount=20)
                
                for thread in threads:
                    if not self.running:
                        break
                    self.process_thread(thread)
                
                # Save session periodically
                self.save_session()
                
            except PleaseWaitFewMinutes:
                log.warning("[Timer] Rate limited â€” waiting 5 minutes")
                time.sleep(300)
                continue
            except FeedbackRequired as e:
                log.error(f"[Error] Feedback required: {e}")
                time.sleep(60)
                continue
            except ChallengeRequired as e:
                log.error(f"[Error] Challenge required: {e}")
                log.error("[Error] Session may be invalid - restart needed")
                break
            except Exception as e:
                log.error(f"[Error] Unexpected error: {e}")
                time.sleep(10)
                continue
            
            # Rate limit
            time.sleep(RATE_LIMIT_DELAY)
        
        self.save_session()
        log.info("[Bot] Bot stopped")


def main():
    # Run interactive setup if needed
    print("\n" + "="*60)
    print("[Pixel AI] Instagram Bot")
    print("="*60)
    
    if not interactive_setup():
        log.error("Setup failed. Exiting.")
        sys.exit(1)
    
    if not validate_credentials():
        sys.exit(1)
    
    # Show configuration summary
    print(f"\nConfiguration:")
    print(f"   Username: @{USERNAME}")
    print(f"   Owner ID: {OWNER_ID if OWNER_ID else 'Not set (commands unrestricted)'}")
    print(f"   Session file: {SESSION_FILE}")
    print(f"   Rate limit delay: {RATE_LIMIT_DELAY}s")
    print(f"   Action delay: {ACTION_DELAY}s")
    print("-"*60)
    
    # Confirm before starting
    if INTERACTIVE_SETUP:
        confirm = input("\nStart the bot now? (Y/n): ").strip().lower()
        if confirm and confirm != 'y' and confirm != 'yes':
            print("Exiting. Run again when ready.")
            sys.exit(0)
    
    bot = PixelInstagramBot()
    bot.run()


if __name__ == "__main__":
    main()