from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from typing import List, Dict, Optional
import logging
from .tools.workspace_tools import get_workspace_tools
from ..llm.llm_manager import llm_manager

logger = logging.getLogger(__name__)

class AgenticSupervisor:
    """
    Enhanced agentic supervisor with:
    - Stronger prompts for tool usage
    - Passive response detection
    - Forced tool calling when needed
    """
    
    def __init__(self):
        self.tools = get_workspace_tools()
        logger.info(f"Initialized agentic supervisor with {len(self.tools)} tools: {[t.name for t in self.tools]}")
    
    def _get_system_prompt(self) -> str:
        """Get enhanced system prompt with strong tool usage instructions"""
        return """You are an autonomous coding assistant with access to workspace tools.

Your job is to complete tasks by:
1. Understanding what the user wants
2. Using tools to explore the codebase
3. Breaking complex tasks into steps
4. Proposing changes when appropriate
5. Explaining your reasoning clearly

Available tools:
- read_file: Read file contents to examine code
- search_files: Find files matching glob patterns
- list_directory: List directory contents to understand structure
- propose_edit: Propose code changes (requires human approval)

CRITICAL RULES - YOU MUST FOLLOW THESE:

🔥 RULE 1: ALWAYS USE TOOLS TO TAKE ACTION
When the user asks you to DO something (add, change, fix, create, etc.), you MUST use tools.
DO NOT say "I will" or "I would" or "we should" - ACTUALLY CALL THE TOOL.

🔥 RULE 2: WHEN PROPOSING CODE CHANGES, USE propose_edit
If the task requires modifying code, you MUST call the propose_edit tool.
DO NOT just explain what changes to make - USE THE TOOL.

🔥 RULE 3: BE DIRECT AND ACTIONABLE
Bad: "We should add a docstring..."
Good: [Calls propose_edit with the docstring]

Examples:
❌ BAD: "I will read the file to understand it"
✅ GOOD: [Calls read_file tool]

❌ BAD: "We should add error handling here"
✅ GOOD: [Calls propose_edit with error handling code]

If you cannot complete a task, explain why clearly."""
    
    async def execute_task(
        self,
        task: str,
        workspace_path: str = ".",
        provider: str = "gemini",
        model: Optional[str] = None,
        max_retries: int = 2
    ) -> Dict:
        """
        Execute an agentic task with verification
        """
        logger.info(f"Executing agentic task: {task[:100]}...")
        logger.info(f"Workspace path: {workspace_path}")
        
        # Change to workspace directory for tool execution
        import os
        original_cwd = os.getcwd()
        try:
            if workspace_path and workspace_path != ".":
                logger.info(f"Changing directory to: {workspace_path}")
                os.chdir(workspace_path)
                logger.info(f"Current working directory: {os.getcwd()}")
        except Exception as e:
            logger.warning(f"Could not change to workspace directory: {e}")
        
        try:
            # Get LLM
            if not model:
                if provider == "groq":
                    model = "llama-3.3-70b-versatile"
                elif provider == "gemini":
                    model = "gemini-2.5-flash"
                elif provider == "openai":
                    model = "gpt-4o-mini"
            llm = llm_manager.get_llm(
                provider=provider,
                model=model,
                temperature=0.2
            )
            # Create agent with tools
            agent = create_agent(llm, self.tools)
            # Build initial messages
            messages = [
                SystemMessage(content=self._get_system_prompt()),
                HumanMessage(content=task)
            ]
            # Track attempts
            attempt = 0
            final_result = None
            while attempt <= max_retries:
                attempt += 1
                logger.info(f"Attempt {attempt}/{max_retries + 1}")
                # Execute agent
                result = await agent.ainvoke({"messages": messages})
                
                # Extract output messages
                output_messages = result.get("messages", [])
                logger.info(f"Got {len(output_messages)} messages from agent")
                
                # Get the last AI message
                final_message = None
                for msg in reversed(output_messages):
                    if hasattr(msg, 'type') and msg.type == 'ai':
                        final_message = msg
                        break
                    elif hasattr(msg, 'content') and not hasattr(msg, 'tool_call_id'):
                        final_message = msg
                        break
                
                # Extract content and handle Gemini format
                if final_message and hasattr(final_message, 'content'):
                    content = final_message.content
                    
                    # Handle Gemini's array format: [{"type": "text", "text": "..."}]
                    if isinstance(content, list):
                        text_parts = []
                        for block in content:
                            if isinstance(block, dict):
                                if 'text' in block:
                                    text_parts.append(block['text'])
                                elif block.get('type') == 'text' and 'content' in block:
                                    text_parts.append(block['content'])
                        
                        if text_parts:
                            output = '\n\n'.join(text_parts)
                            logger.info(f"Extracted {len(text_parts)} text blocks from Gemini response")
                        else:
                            output = "Task completed (empty response)"
                            logger.warning("Gemini returned array but no text blocks found")
                    
                    # Handle string format
                    elif isinstance(content, str):
                        output = content
                        logger.info("Extracted string content from response")
                    
                    # Fallback: stringify
                    else:
                        output = str(content)
                        logger.warning(f"Unexpected content type: {type(content)}")
                    
                    logger.info(f"Final output ({len(output)} chars): {output[:200]}...")
                else:
                    output = "Task completed but no response generated"
                    logger.warning("No final message with content found in agent output")
                
                # IMPROVEMENT 2: Detect passive responses
                if self._is_passive_response(output):
                    logger.warning(f"Detected passive response on attempt {attempt}")
                    if attempt <= max_retries:
                        # Add correction message
                        messages = output_messages + [
                            SystemMessage(content="""STOP BEING PASSIVE!

You just described what you would do instead of doing it.

EXECUTE THE ACTION NOW using the appropriate tool. Do not explain - ACT.""")
                        ]
                        continue  # Retry
                    else:
                        logger.warning("Max retries reached, accepting passive response")
                # Success - agent took action
                final_result = result
                break
            if not final_result:
                final_result = result
            
            # Parse results
            output_messages = final_result.get("messages", [])
            logger.info(f"Final result has {len(output_messages)} messages")
            
            # Get the last AI message for final output
            final_message = None
            for msg in reversed(output_messages):
                if hasattr(msg, 'type') and msg.type == 'ai':
                    final_message = msg
                    break
                elif hasattr(msg, 'content') and not hasattr(msg, 'tool_call_id'):
                    final_message = msg
                    break
            
            # Extract content and handle Gemini format
            if final_message and hasattr(final_message, 'content'):
                content = final_message.content
                
                # Handle Gemini's array format: [{"type": "text", "text": "..."}]
                if isinstance(content, list):
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict):
                            if 'text' in block:
                                text_parts.append(block['text'])
                            elif block.get('type') == 'text' and 'content' in block:
                                text_parts.append(block['content'])
                    
                    if text_parts:
                        output = '\n\n'.join(text_parts)
                        logger.info(f"Final output extracted {len(text_parts)} text blocks")
                    else:
                        output = "Task completed (empty response)"
                        logger.warning("Final output: Gemini returned array but no text blocks found")
                
                # Handle string format
                elif isinstance(content, str):
                    output = content
                    logger.info("Final output extracted as string")
                
                # Fallback: stringify
                else:
                    output = str(content)
                    logger.warning(f"Final output: Unexpected content type: {type(content)}")
            else:
                output = "Task completed but no response generated"
                logger.warning("No final message with content found")
            
            # Extract steps and proposed changes
            steps = self._extract_steps(output_messages)
            proposed_changes = self._extract_proposed_changes(output_messages)
            logger.info(f"Task completed with {len(steps)} steps and {len(proposed_changes)} proposed changes")
            return {
                "success": True,
                "output": output,
                "steps": steps,
                "proposed_changes": proposed_changes,
                "attempts": attempt
            }
        except Exception as e:
            logger.error(f"Error executing agentic task: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "output": f"Failed to complete task: {str(e)}",
                "steps": [],
                "proposed_changes": [],
                "attempts": 0
            }
        finally:
            # Restore original working directory
            try:
                os.chdir(original_cwd)
                logger.info(f"Restored working directory to: {original_cwd}")
            except Exception as e:
                logger.warning(f"Could not restore working directory: {e}")
    
    def _is_passive_response(self, output: str) -> bool:
        """
        IMPROVEMENT 2: Detect if agent is being passive instead of taking action
        
        Returns True if output contains passive language
        """
        passive_indicators = [
            "i will",
            "i would",
            "we should",
            "we could",
            "i can",
            "let me",
            "first, we need to",
            "then, we can",
            "we need to read",
            "i should propose"
        ]
        
        # Handle non-string outputs (convert to string)
        if not isinstance(output, str):
            if isinstance(output, list):
                output = " ".join(str(item) for item in output)
            else:
                output = str(output)
        
        output_lower = output.lower()
        
        # Check for passive indicators
        for indicator in passive_indicators:
            if indicator in output_lower:
                logger.debug(f"Found passive indicator: '{indicator}'")
                return True
        
        return False
    
    def _extract_steps(self, messages: List) -> List[Dict]:
        """Extract tool usage steps from messages"""
        steps = []
        
        for msg in messages:
            # Check for tool calls
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    steps.append({
                        "action": tool_call.get("name", "unknown"),
                        "input": str(tool_call.get("args", {}))[:200],
                        "output": ""
                    })
            
            # Check for tool responses
            if hasattr(msg, 'tool_call_id'):
                if steps and not steps[-1]["output"]:
                    steps[-1]["output"] = str(msg.content)[:500]
        
        return steps
    
    def _extract_proposed_changes(self, messages: List) -> List[Dict]:
        """Extract proposed changes from messages"""
        proposed_changes = []
        
        for msg in messages:
            # Get content - handle both AI messages and ToolMessages
            content = ""
            if hasattr(msg, 'content'):
                content = str(msg.content)
            elif hasattr(msg, 'tool_call_id'):
                # This is a ToolMessage - the response from a tool
                content = str(msg.content) if hasattr(msg, 'content') else str(msg)
            else:
                content = str(msg)
            
            # Look for approval required marker
            if "APPROVAL_REQUIRED|" in content:
                logger.info(f"Found APPROVAL_REQUIRED in message content")
                try:
                    # Don't split by newlines - the new_code field contains newlines!
                    # Just find the marker and split the rest
                    marker_index = content.index("APPROVAL_REQUIRED|")
                    after_marker = content[marker_index + len("APPROVAL_REQUIRED|"):]
                    
                    # Split by pipe but only the first 3 pipes (file, description, old_code)
                    # Everything after that is new_code (which may contain pipes)
                    parts = after_marker.split("|", 3)  # maxsplit=3 gives us exactly 4 parts
                    logger.info(f"Split into {len(parts)} parts")
                    
                    if len(parts) >= 4:
                        change = {
                            "file": parts[0],
                            "description": parts[1],
                            "old_code": parts[2] if parts[2] else None,
                            "new_code": parts[3]
                        }
                        proposed_changes.append(change)
                        logger.info(f"✅ Extracted proposed change for file: {parts[0]}")
                        logger.debug(f"New code preview: {parts[3][:100]}")
                    else:
                        logger.warning(f"Not enough parts: {len(parts)}, expected at least 4")
                        logger.debug(f"Parts: {[p[:50] for p in parts]}")
                except Exception as e:
                    logger.error(f"Error parsing APPROVAL_REQUIRED: {e}", exc_info=True)
        
        logger.info(f"Total proposed changes extracted: {len(proposed_changes)}")
        return proposed_changes

# Global instance
agentic_supervisor = AgenticSupervisor()
