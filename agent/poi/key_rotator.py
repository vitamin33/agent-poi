"""API key rotator for Groq (and other providers) to handle rate limits.

Maintains a pool of API keys and rotates to the next key when a 429 is hit.
Thread-safe via simple locking.
"""
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)


class GroqKeyRotator:
    """
    Round-robin API key rotation for Groq.

    Loads keys from GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, etc.
    On 429, call rotate() to switch to the next key.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        """Singleton - all agents share one rotator."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._keys: list[str] = []
        self._current_index = 0
        self._rotate_lock = threading.Lock()
        self._last_rotate_ts = 0.0

        # Load all GROQ_API_KEY* env vars
        primary = os.environ.get("GROQ_API_KEY", "")
        if primary:
            self._keys.append(primary)

        # Look for GROQ_API_KEY_2, GROQ_API_KEY_3, ...
        for i in range(2, 10):
            key = os.environ.get(f"GROQ_API_KEY_{i}", "")
            if key:
                self._keys.append(key)

        logger.info(f"GroqKeyRotator initialized with {len(self._keys)} key(s)")

    @property
    def current_key(self) -> str:
        """Get the current active API key."""
        if not self._keys:
            return ""
        return self._keys[self._current_index % len(self._keys)]

    @property
    def key_count(self) -> int:
        return len(self._keys)

    def rotate(self) -> str:
        """Rotate to the next key. Returns the new key."""
        if len(self._keys) <= 1:
            return self.current_key

        with self._rotate_lock:
            # Debounce: don't rotate more than once per 5 seconds
            now = time.monotonic()
            if now - self._last_rotate_ts < 5.0:
                return self.current_key

            old_idx = self._current_index
            self._current_index = (self._current_index + 1) % len(self._keys)
            self._last_rotate_ts = now
            logger.warning(
                f"Groq key rotated: key#{old_idx + 1} -> key#{self._current_index + 1} "
                f"(of {len(self._keys)} total)"
            )
        return self.current_key
