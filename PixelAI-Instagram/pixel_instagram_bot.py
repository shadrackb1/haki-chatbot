"""
Pixel AI Instagram Bot — Full-featured Instagram automation bot using instagrapi.
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
WELCOME_MESSAGE = """Hey! I'm Pixel [Bot] — your personal AI assistant.

I'm here while you're away. Ask me anything:
• Calculations, translations, definitions
• Code help, summaries, explanations  
• Weather (when online), reminders
• General knowledge, trivia

I speak English and Kiswahili. What's up?"""

HELP_MESSAGE = """Pixel AI Commands:
• Just chat naturally — I'll respond
• "help" — show this message
• "weather [city]" — weather forecast (needs internet)
• "calculate 2+2" — math
• "translate hello to swahili" — translation
• "remind me to call mom in 10 min" — reminders
• "summarize this text: ..." — summarization

Instagram Controls (Owner only):
• "feed" — see recent posts
• "story" — see recent stories
• "follow @username" — follow a user
• "unfollow @username" — unfollow a user
• "like @username's latest" — like latest post
• "comment on @username's latest: [text]" — comment on post
• "repost @username's latest to story" — share to story
• "search for #hashtag" — search hashtag
• "search @username" — search user
• "info @username" — get user info
• "dm @username [message]" — send direct message

I remember our conversation. Type away!"""

class PixelInstagramBot:
    def __init__(self):
        self.cl = Client()
        # Human-like delays to avoid detection
        self.cl.delay_range = [2, 5]
        self.processed_message_ids: Set[str] = set()
        self.running = True
        self.owner_pk: Optional[int] = None
        self.last_action_time: Dict[str, float] = {}
        
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
            log.error("Manual intervention needed — check Instagram app")
            return False
        except FeedbackRequired as e:
            log.error(f"Feedback required (likely rate limited): {e}")
            return False
        except Exception as e:
            log.error(f"Login failed: {e}")
            return False

    def get_response(self, text: str, sender_name: str) -> str:
        """Generate human-like response — replace with actual LLM integration."""
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
            return "Weather feature needs internet — ask me when I'm online! 🌤️"
        
        if "calculate" in text_lower or any(op in text for op in ["+", "-", "*", "/", "="]):
            return "Math coming soon! For now, try Google. 🧮"
        
        if "translate" in text_lower:
            return "Translation coming soon! 🌍"
        
        if "remind" in text_lower:
            return "Reminders coming soon! ⏰"
        
        if "summarize" in text_lower:
            return "Summarization coming soon! 📝"
        
        if "bye" in text_lower or "kwaheri" in text_lower:
            return f"Bye {sender_name}! Talk later. 👋"
        
        # Default: acknowledge with variation
        responses = [
            f"Got it, {sender_name}. I'm still learning — ask me anything!",
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
            return "⏳ Please wait a moment before checking feed again."
        
        try:
            feed = self.cl.get_timeline_feed(amount=5)
            if not feed:
                return "📭 No posts in feed right now."
            
            response = f"📰 Recent feed ({len(feed)} posts):\n\n"
            for i, media in enumerate(feed[:3], 1):  # Show first 3
                try:
                    user = self.cl.user_info(media.user.pk)
                    caption = media.caption_text if media.caption else "No caption"
                    # Truncate caption
                    if len(caption) > 50:
                        caption = caption[:47] + "..."
                    response += f"{i}. @{user.username}: {caption}\n"
                    response += f"   ❤️ {media.like_count} | 💬 {media.comment_count}\n\n"
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
            return "⏳ Please wait a moment before checking stories again."
        
        try:
            stories = self.cl.get_stories(amount=10)
            if not stories:
                return "📭 No stories available right now."
            
            response = f"📱 Recent stories ({len(stories)}):\n\n"
            for i, story in enumerate(stories[:3], 1):  # Show first 3
                try:
                    user = self.cl.user_info(story.user.pk)
                    response += f"{i}. @{user.username}"
                    if story.media_type == 1:  # Photo
                        response += " (📸 Photo)"
                    elif story.media_type == 2:  # Video
                        response += " (🎥 Video)"
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
            return f"⏳ Please wait before following another user."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.user_follow(user_id)
            log.info(f"Followed @{username}")
            return f"[OK] Now following @{username}"
        except Exception as e:
            log.error(f"Error following @{username}: {e}")
            return f"❌ Could not follow @{username}: {str(e)}"

    def _unfollow_user(self, username: str) -> str:
        """Unfollow a user."""
        if not self._rate_limit_action(f"unfollow_{username}"):
            return f"⏳ Please wait before unfollowing another user."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.user_unfollow(user_id)
            log.info(f"Unfollowed @{username}")
            return f"[OK] No longer following @{username}"
        except Exception as e:
            log.error(f"Error unfollowing @{username}: {e}")
            return f"❌ Could not unfollow @{username}: {str(e)}"

    def _like_latest_post(self, username: str) -> str:
        """Like the latest post from a user."""
        if not self._rate_limit_action(f"like_{username}"):
            return f"⏳ Please wait before liking another post."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"📭 @{username} has no posts to like."
            
            media = medias[0]
            self.cl.media_like(media.id)
            log.info(f"Liked latest post from @{username}")
            return f"[Like] Liked @{username}'s latest post"
        except Exception as e:
            log.error(f"Error liking post from @{username}: {e}")
            return f"❌ Could not like post from @{username}: {str(e)}"

    def _comment_on_latest_post(self, username: str, comment_text: str) -> str:
        """Comment on the latest post from a user."""
        if not self._rate_limit_action(f"comment_{username}"):
            return f"⏳ Please wait before commenting again."
        
        # Validate comment length
        if len(comment_text) > 300:
            return "❌ Comment too long (max 300 characters)"
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"📭 @{username} has no posts to comment on."
            
            media = medias[0]
            self.cl.media_comment(media.id, comment_text)
            log.info(f"Commented on @{username}'s latest post: {comment_text[:50]}...")
            return f"[Comment] Commented on @{username}'s latest post"
        except Exception as e:
            log.error(f"Error commenting on post from @{username}: {e}")
            return f"❌ Could not comment on post from @{username}: {str(e)}"

    def _repost_to_story(self, username: str) -> str:
        """Repost user's latest post to your story."""
        if not self._rate_limit_action(f"repost_{username}"):
            return f"⏳ Please wait before reposting again."
        
        try:
            user_id = self.cl.user_id_from_username(username)
            medias = self.cl.user_medias(user_id, amount=1)
            if not medias:
                return f"📭 @{username} has no posts to repost."
            
            media = medias[0]
            # Share to story
            self.cl.media_share_to_story(media.id, [])
            log.info(f"Reposted @{username}'s latest post to story")
            return f"[Repost] Reposted @{username}'s latest post to your story"
        except Exception as e:
            log.error(f"Error reposting from @{username}: {e}")
            return f"❌ Could not repost from @{username}: {str(e)}"

    def _search_hashtag(self, hashtag: str) -> str:
        """Search for posts by hashtag."""
        if not self._rate_limit_action(f"hashtag_{hashtag}"):
            return f"⏳ Please wait before searching another hashtag."
        
        try:
            # Clean hashtag
            hashtag = hashtag.lstrip('#')
            results = self.cl.hashtag_medias_recent(hashtag, amount=5)
            if not results:
                return f"🔍 No recent posts for #{hashtag}"
            
            response = f"🔍 Recent posts for #{hashtag} ({len(results)}):\n\n"
            for i, media in enumerate(results[:3], 1):
                try:
                    user = self.cl.user_info(media.user.pk)
                    caption = media.caption_text if media.caption else "No caption"
                    if len(caption) > 40:
                        caption = caption[:37] + "..."
                    response += f"{i}. @{user.username}: {caption}\n"
                    response += f"   ❤️ {media.like_count} | 💬 {media.comment_count}\n\n"
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
            return f"⏳ Please wait before searching another user."
        
        try:
            results = self.cl.search_users(username, count=5)
            if not results:
                return f"🔍 No users found matching '{username}'"
            
            response = f"🔍 Users matching '{username}' ({len(results)}):\n\n"
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
            return f"⏳ Please wait before getting info for another user."
        
        try:
            user = self.cl.user_info_by_username(username)
            response = f"👤 Info for @{user.username}:\n\n"
            response += f"• Full name: {user.full_name or 'N/A'}\n"
            response += f"• Followers: {user.follower_count:,}\n"
            response += f"• Following: {user.following_count:,}\n"
            response += f"• Posts: {user.media_count:,}\n"
            response += f"• Bio: {user.biography or 'No bio'}\n"
            response += f"• External URL: {user.external_url or 'None'}\n"
            response += f"• Verified: {'Yes' if user.is_verified else 'No'}\n"
            response += f"• Private: {'Yes' if user.is_private else 'No'}"
            
            return response
        except Exception as e:
            log.error(f"Error getting info for @{username}: {e}")
            return f"[Error] Could not get info for @{username}: {str(e)}"

    def _send_dm(self, username: str, message: str) -> str:
        """Send a direct message to a user."""
        if not self._rate_limit_action(f"dm_{username}"):
            return f"⏳ Please wait before sending another DM."
        
        # Validate message length
        if len(message) > 1000:
            return "❌ Message too long (max 1000 characters)"
        
        try:
            user_id = self.cl.user_id_from_username(username)
            self.cl.direct_send(message, [user_id])
            log.info(f"Sent DM to @{username}: {message[:50]}...")
            return f"📩 Sent DM to @{username}"
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
            
            log.info(f"📨 @{sender_name}: {text[:50]}...")
            
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
        log.info(f"👀 Monitoring DMs (rate limit: {RATE_LIMIT_DELAY}s)")
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
                log.warning("[Timer] Rate limited — waiting 5 minutes")
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