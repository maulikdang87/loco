#!/usr/bin/env python3
"""
Install recommended coding models for Loco agent mode
These models are optimized for coding tasks and work well with agent workflows
"""

import subprocess
import sys
from typing import Dict, List

# Best models for structured instruction following (simulated tool calling)
RECOMMENDED_MODELS = {
    "llama3.1:8b": {
        "size": "~4.7GB",
        "description": "🥇 Best at following structured instructions (simulated tools)",
        "specialties": ["Instruction following", "Structured responses", "Reasoning"],
        "recommended": True,
        "reality": "No native tool calling - uses enhanced prompt simulation"
    },
    "qwen2.5-coder:7b": {
        "size": "~4.9GB", 
        "description": "🔍 Good coding specialist with decent structure",
        "specialties": ["Code analysis", "Programming help", "Technical writing"],
        "recommended": False,
        "reality": "No native tool calling - coding focused responses"
    },
    "llama3.2:3b": {
        "size": "~2.0GB",
        "description": "⚡ Surprisingly good lightweight model",
        "specialties": ["Fast responses", "Basic structure", "General help"],
        "recommended": False,
        "reality": "No native tool calling - but follows formats well"
    },
    "gemma2:9b": {
        "size": "~5.4GB",
        "description": "🧠 Google's reasoning model, excellent instruction adherence",
        "specialties": ["Complex reasoning", "Structured thinking", "Format following"],
        "recommended": False,
        "reality": "No native tool calling - but very good at structured responses"
    }
}

def run_command(cmd: List[str]) -> bool:
    """Run a command and return success status"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error running command: {e}")
        return False

def check_ollama() -> bool:
    """Check if Ollama is installed and running"""
    print("🔍 Checking Ollama installation...")
    
    # Check if ollama command exists
    if not run_command(["which", "ollama"]):
        print("❌ Ollama not found. Please install from: https://ollama.ai")
        return False
    
    # Check if Ollama server is running
    if not run_command(["ollama", "list"]):
        print("⚠️  Ollama is installed but server may not be running.")
        print("   Start with: ollama serve")
        return False
    
    print("✅ Ollama is ready!")
    return True

def list_installed_models() -> List[str]:
    """Get list of currently installed models"""
    try:
        result = subprocess.run(["ollama", "list"], capture_output=True, text=True)
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')[1:]  # Skip header
            models = []
            for line in lines:
                if line.strip():
                    model_name = line.split()[0]
                    models.append(model_name)
            return models
    except Exception:
        pass
    return []

def install_model(model_name: str) -> bool:
    """Install a specific model"""
    print(f"📥 Installing {model_name}...")
    print(f"   Size: {RECOMMENDED_MODELS[model_name]['size']}")
    
    # Run ollama pull command
    result = subprocess.run(["ollama", "pull", model_name], 
                           capture_output=False, text=True)
    
    if result.returncode == 0:
        print(f"✅ Successfully installed {model_name}")
        return True
    else:
        print(f"❌ Failed to install {model_name}")
        return False

def main():
    print("🚀 Loco Coding Models Installer")
    print("=" * 50)
    
    # Check Ollama
    if not check_ollama():
        sys.exit(1)
    
    # List current models
    installed = list_installed_models()
    print(f"\n📦 Currently installed models: {len(installed)}")
    for model in installed:
        if model in RECOMMENDED_MODELS:
            print(f"   ✅ {model} (recommended)")
        else:
            print(f"   📄 {model}")
    
    print(f"\n🎯 Models optimized for agent mode (simulated tool calling):")
    for model, info in RECOMMENDED_MODELS.items():
        status = "✅ INSTALLED" if model in installed else "❌ Not installed"
        recommended = "⭐ RECOMMENDED" if info['recommended'] else ""
        print(f"\n{model} ({info['size']}) {status} {recommended}")
        print(f"   {info['description']}")
        print(f"   Specialties: {', '.join(info['specialties'])}")
        print(f"   Reality: {info['reality']}")
    
    # Interactive installation
    print(f"\n🔧 Installation options:")
    print("1. Install recommended model only (llama3.1:8b)")
    print("2. Install all models")  
    print("3. Custom selection")
    print("4. Exit")
    print("\n⚠️  IMPORTANT: None of these models support REAL tool calling!")
    print("   They use enhanced prompt simulation instead.")
    
    choice = input("\nChoose option (1-4): ").strip()
    
    if choice == "1":
        if "llama3.1:8b" not in installed:
            install_model("llama3.1:8b")
        else:
            print("✅ Recommended model already installed!")
    
    elif choice == "2":
        for model in RECOMMENDED_MODELS:
            if model not in installed:
                install_model(model)
    
    elif choice == "3":
        print("\nAvailable models:")
        models_list = list(RECOMMENDED_MODELS.keys())
        for i, model in enumerate(models_list, 1):
            status = "(installed)" if model in installed else ""
            print(f"{i}. {model} {status}")
        
        selections = input("Enter model numbers (comma-separated): ").strip()
        try:
            for num in selections.split(','):
                idx = int(num.strip()) - 1
                if 0 <= idx < len(models_list):
                    model = models_list[idx]
                    if model not in installed:
                        install_model(model)
        except ValueError:
            print("Invalid selection")
    
    elif choice == "4":
        print("👋 Goodbye!")
        
    else:
        print("Invalid option")
        
    print(f"\n🎉 Setup complete!")
    print(f"💡 Use these models in Loco by selecting 'Ollama' as provider")
    print(f"   Default model: llama3.1:8b (best instruction following)")
    print(f"\n🔥 For REAL tool calling, use:")
    print(f"   • Groq (fastest): llama-3.1-8b-instant")
    print(f"   • Gemini (balanced): gemini-2.5-flash") 
    print(f"   • OpenAI (premium): gpt-4o-mini")

if __name__ == "__main__":
    main()