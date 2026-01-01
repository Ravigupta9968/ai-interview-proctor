from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import base64
from pypdf import PdfReader
from interviewer import get_ai_response, set_resume_context
from audio_handler import text_to_speech, speech_to_text

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    try:
        reader = PdfReader(file.file)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        
        
        set_resume_context(text)
        return {"status": "success", "message": "Resume processed successfully!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/delete-resume")
def delete_resume():
    set_resume_context("") 
    return {"status": "success", "message": "Resume context cleared"}

@app.websocket("/ws/interview")
async def interview_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client Connected!")
    
    try:
        while True:
            try:
                data = await websocket.receive_bytes()
                print(f" Received Audio Chunk: {len(data)} bytes")
            except RuntimeError:
                print(" Connection lost while receiving data")
                break

            
            user_text = await speech_to_text(data)
            print(f"👤 User Said: {user_text}")
                   
            if not user_text or len(user_text.strip()) < 2:
                continue
            
            await websocket.send_json({"type": "transcript", "role": "user", "content": user_text})
            
            ai_text = await get_ai_response(user_text)
            print(f"🤖 AI Thinking: {ai_text}")

            await websocket.send_json({"type": "transcript", "role": "ai", "content": ai_text})
            audio_bytes = await text_to_speech(ai_text)
            await websocket.send_bytes(audio_bytes)
            print(" AI Audio Sent")
            
    except WebSocketDisconnect:
        print(" Client Disconnected (Browser Closed or Refresh)")
    except Exception as e:
        print(f" Critical Error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)