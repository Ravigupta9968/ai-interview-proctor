import edge_tts
import os
import json
from deepgram import Deepgram
from dotenv import load_dotenv

load_dotenv()

dg_client = Deepgram(os.getenv("DEEPGRAM_API_KEY"))

async def text_to_speech(text, output_file="response.mp3"):
    voice = "en-US-ChristopherNeural"  
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)
    with open(output_file, "rb") as f:
        audio_data = f.read()
    os.remove(output_file)
    return audio_data

async def speech_to_text(audio_bytes):
    try:
        
        source = {'buffer': audio_bytes, 'mimetype': 'audio/wav'}
        options = {'punctuate': True, 'model': 'nova-2', 'language': 'en-US'}
        
        response = await dg_client.transcription.prerecorded(source, options)
        
        
        transcript = response['results']['channels'][0]['alternatives'][0]['transcript']
        print(f"Deepgram heard: {transcript}")
        return transcript
    except Exception as e:
        print(f"STT Error: {e}")
        return "Error in speech recognition."