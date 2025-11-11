from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from typing import List
import logging

logger = logging.getLogger(__name__)

class ConversationMemory:
    """
    Manages conversation history and context
    Implements conversation buffer with smart summarization
    """
    
    def __init__(self, max_messages: int = 20):
        self.max_messages = max_messages
        self.conversations: dict[str, List[BaseMessage]] = {}
    
    def add_message(self, session_id: str, message: BaseMessage):
        """Add message to conversation history"""
        if session_id not in self.conversations:
            self.conversations[session_id] = []
        
        self.conversations[session_id].append(message)
        
        # Trim if too long
        if len(self.conversations[session_id]) > self.max_messages:
            # Keep first message (system) and last N messages
            self.conversations[session_id] = (
                [self.conversations[session_id][0]] +
                self.conversations[session_id][-(self.max_messages - 1):]
            )
    
    def get_history(self, session_id: str) -> List[BaseMessage]:
        """Get conversation history for session"""
        return self.conversations.get(session_id, [])
    
    def clear_history(self, session_id: str):
        """Clear conversation history"""
        if session_id in self.conversations:
            del self.conversations[session_id]
    
    def get_context_summary(self, session_id: str, max_chars: int = 1000) -> str:
        """
        Get summarized context from conversation history
        Useful for providing context to agents
        """
        history = self.get_history(session_id)
        
        if not history:
            return ""
        
        summary_parts = []
        total_chars = 0
        
        # Start from most recent
        for msg in reversed(history):
            content = msg.content if hasattr(msg, 'content') else str(msg)
            
            if total_chars + len(content) > max_chars:
                break
            
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            summary_parts.insert(0, f"{role}: {content[:200]}")
            total_chars += len(content)
        
        return "\n".join(summary_parts)

# Global instance
conversation_memory = ConversationMemory()
