import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


RESUME_CONTEXT = ""

def set_resume_context(text):
    global RESUME_CONTEXT
    RESUME_CONTEXT = text

async def get_ai_response(user_input):
    
    system_prompt = f"""
    You are a senior technical interviewer conducting a real-world software engineering interview.
    RESUME CONTEXT: {RESUME_CONTEXT if RESUME_CONTEXT else "No resume provided, Start with core Python, data structures, and backend fundamentals."}
    
    OBJECTIVE:
    Evaluate the candidate’s technical depth, problem-solving ability, and practical experience.

    INSTRUCTIONS:
    1. Ask questions strictly aligned with the resume skills.
    2. Start with fundamentals, then gradually increase difficulty.
    3. Ask follow-up questions if the candidate gives a shallow or incorrect answer.
    4. Focus on real-world scenarios, trade-offs, and debugging.
    5. Avoid theoretical trivia unless necessary.
    6. Keep each response concise (maximum 2 sentences).
    7. Maintain a professional, encouraging, but rigorous tone.
    8. Do not provide answers unless explicitly asked.
    """
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]
    
    chat_completion = client.chat.completions.create(
        messages=messages,
        model="llama-3.3-70b-versatile",
        temperature=0.7,
    )
    
    return chat_completion.choices[0].message.content