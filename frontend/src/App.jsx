import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Upload, FileText, User, Cpu, Trash2, Clock, Video, ShieldAlert, Loader2, RotateCcw, XCircle } from 'lucide-react';
import axios from 'axios';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

function App() {
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [status, setStatus] = useState("idle"); 
  const [activeSpeaker, setActiveSpeaker] = useState("none"); 
  const [currentText, setCurrentText] = useState(""); 
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [violationCount, setViolationCount] = useState(0); 
  const [warningMsg, setWarningMsg] = useState(""); 
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const animationFrameRef = useRef(null);
  const violationFrameCount = useRef(0);

  useEffect(() => {
    const loadModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 2,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        setIsModelLoading(false);
        console.log("✅ AI Model Loaded");
      } catch (error) {
        console.error("AI Load Failed:", error);
      }
    };
    loadModel();
  }, []);

  
  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:8000/ws/interview");
    socketRef.current.onmessage = (event) => {
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data);
        if (data.type === "transcript") setCurrentText(data.content);
      } else {
        playBotAudio(event.data);
      }
    };
    return () => socketRef.current?.close();
  }, []);

  
  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) endInterview();
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  
  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !faceLandmarkerRef.current) return;

    
    if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        
        let startTimeMs = performance.now();
        if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = videoRef.current.currentTime;
            const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

            if (results.faceLandmarks) {
                let currentViolation = "";

               
                if (results.faceLandmarks.length === 0) {
                    currentViolation = "NO FACE DETECTED";
                } else if (results.faceLandmarks.length > 1) {
                    currentViolation = "MULTIPLE PEOPLE DETECTED";
                } else {
                    
                    const faceBlendshapes = results.faceBlendshapes[0].categories;
                    const lookLeft = faceBlendshapes.find(s => s.categoryName === 'eyeLookInLeft')?.score || 0;
                    const lookRight = faceBlendshapes.find(s => s.categoryName === 'eyeLookInRight')?.score || 0;
                    const lookDown = faceBlendshapes.find(s => s.categoryName === 'eyeLookDownLeft')?.score || 0;
                    
                    

                   
                    if (lookLeft > 0.6 || lookRight > 0.6) currentViolation = "LOOKING AWAY";
                    if (lookDown > 0.45) currentViolation = "SUSPICIOUS: USING DEVICE"; 
                }

                
                if (currentViolation) {
                    violationFrameCount.current += 1;
                } else {
                    violationFrameCount.current = Math.max(0, violationFrameCount.current - 1);
                }

               
                if (violationFrameCount.current > 5) {
                    setWarningMsg(currentViolation);
                    
                    if (violationFrameCount.current === 6) {
                        setViolationCount(prev => prev + 1);
                    }
                } else if (violationFrameCount.current === 0) {
                    setWarningMsg("");
                }
            }
        }
    }
    
    if (streamRef.current) {
        animationFrameRef.current = requestAnimationFrame(predictWebcam);
    }
  }, []);

 
  const startInterviewProcess = async () => {
    if (isModelLoading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      streamRef.current = stream;
      setIsInterviewActive(true);
      setInterviewEnded(false);
      setViolationCount(0);
      
     
      setTimeout(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
        }
      }, 100);

      setTimeLeft(selectedDuration * 60);
      setIsTimerRunning(true);
      
    } catch (err) {
      alert("Permission Error: " + err.message);
    }
  };

  const endInterview = () => {
    setIsTimerRunning(false);
    setIsInterviewActive(false);
    setInterviewEnded(true);
    setStatus("idle");
    setWarningMsg("");
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

 
  const playBotAudio = (audioBlob) => {
    setStatus("speaking");
    setActiveSpeaker("bot");
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
    audio.onended = () => { setStatus("idle"); setActiveSpeaker("none"); };
  };

  const toggleRecording = async () => {
    if (status === "idle") {
        const audioStream = streamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(audioStream);
        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mediaRecorderRef.current.start();
        setStatus("recording"); setActiveSpeaker("user"); setCurrentText("Listening...");
    } else if (status === "recording") {
        mediaRecorderRef.current.stop(); setStatus("processing");
        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
            if (socketRef.current.readyState === WebSocket.OPEN) socketRef.current.send(audioBlob);
        };
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append("file", file);
    try { await axios.post("http://localhost:8000/upload-resume", formData); setResumeUploaded(true); } catch(e) { console.error(e); }
  };
  const handleDeleteResume = async () => { try { await axios.post("http://localhost:8000/delete-resume"); setResumeUploaded(false); alert("Resume deleted."); } catch(e) { console.error(e); } };
  const formatTime = (s) => `${Math.floor(s/60)}:${s%60<10?'0':''}${s%60}`;

  return (
    <div className="flex flex-col h-screen bg-black text-white font-sans overflow-hidden relative">
      
      {/* HEADER */}
      <div className="absolute top-6 left-0 right-0 z-20 flex flex-col items-center pointer-events-none">
        <h1 className="text-3xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 uppercase drop-shadow-md">
          AI Interviewer
        </h1>
        
        {/* WARNING ALERT */}
        {warningMsg && (
            <div className="mt-2 bg-red-600 border-4 border-red-800 text-white px-6 py-2 rounded-lg font-bold text-xl animate-pulse flex items-center shadow-[0_0_50px_rgba(220,38,38,1)] pointer-events-auto">
                <ShieldAlert className="w-8 h-8 mr-3" />
                {warningMsg}
            </div>
        )}

        {isInterviewActive && (
             <div className="pointer-events-auto mt-2 flex flex-col items-center gap-1">
                <div className={`text-2xl font-mono font-bold ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    {formatTime(timeLeft)}
                </div>
                <div className="bg-gray-800 px-3 py-1 rounded text-xs font-mono text-red-400 border border-red-900/50">
                   VIOLATIONS: {violationCount}
                </div>
            </div>
        )}
      </div>

      {/* REPORT CARD */}
      {interviewEnded && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in zoom-in">
              <div className="bg-gray-900 border border-gray-700 p-10 rounded-3xl shadow-2xl text-center max-w-md w-full">
                  <h2 className="text-4xl font-bold text-white mb-2">Interview Ended</h2>
                  <div className="bg-black/50 p-6 rounded-xl border border-gray-800 mb-8 mt-6">
                      <div className="text-sm text-gray-500 uppercase tracking-widest mb-1">Total Violations</div>
                      <div className={`text-5xl font-bold ${violationCount > 3 ? 'text-red-500' : 'text-green-500'}`}>
                          {violationCount}
                      </div>
                  </div>
                  <button onClick={() => setInterviewEnded(false)} className="flex items-center justify-center w-full px-8 py-4 bg-white text-black rounded-xl font-bold hover:scale-105 transition-transform">
                      <RotateCcw className="w-5 h-5 mr-2" /> Start New Interview
                  </button>
              </div>
          </div>
      )}

      {/* MAIN STAGE */}
      <div className="flex-1 grid grid-cols-2 gap-0 mt-0 h-full relative z-10">
        
        {/* LEFT: USER */}
        <div className={`relative flex flex-col items-center justify-center border-r border-gray-800 bg-gray-900/30`}>
            {isInterviewActive ? (
                <div className={`relative w-[85%] aspect-video rounded-2xl overflow-hidden border-4 shadow-2xl bg-black ${warningMsg ? 'border-red-600 shadow-red-500/50' : 'border-gray-800'}`}>
                  
                  {/* THE MAGIC FIX: onLoadedData */}
                  <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline
                      muted 
                      onLoadedData={() => {
                          console.log("Video Loaded -> AI Starting");
                          requestAnimationFrame(predictWebcam);
                      }}
                      className="w-full h-full object-cover transform scale-x-[-1]" 
                  />
                  
                  {warningMsg && <div className="absolute inset-0 bg-red-500/30 z-10 pointer-events-none"></div>}
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                      <span className="text-xs font-mono text-white bg-red-600 px-2 py-1 rounded animate-pulse">● LIVE PROCTOR</span>
                  </div>
                </div>
            ) : (
                <div className="w-64 h-64 rounded-full border-4 border-gray-700 flex items-center justify-center bg-black grayscale opacity-50">
                    <User className="w-20 h-20 text-gray-500" />
                </div>
            )}
            <p className="mt-6 text-xl font-mono text-emerald-400">YOU</p>
        </div>

        {/* RIGHT: BOT */}
        <div className={`flex flex-col items-center justify-center ${activeSpeaker === 'bot' ? 'bg-blue-900/10' : ''}`}>
             {!interviewEnded && (
                <div className="mt-[-50px] mb-8 w-full px-12 text-center min-h-[80px]">
                    <p className="text-xl text-gray-200 bg-gray-900/70 px-8 py-4 rounded-2xl border border-gray-600 backdrop-blur-md shadow-lg">
                    {currentText || "Ready to start..."}
                    </p>
                </div>
             )}
            <div className={`w-48 h-48 rounded-full border-4 flex items-center justify-center ${activeSpeaker === 'bot' ? 'border-blue-500 shadow-[0_0_80px_rgba(59,130,246,0.6)] animate-pulse bg-black' : 'border-gray-700 bg-black'}`}>
                <Cpu className={`w-24 h-24 ${activeSpeaker === 'bot' ? 'text-blue-400' : 'text-gray-600'}`} />
            </div>
            <p className="mt-6 text-xl font-mono text-blue-400">AI PROCTOR</p>
        </div>
      </div>

      {/* CONTROLS */}
      {!interviewEnded && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 z-30">
            {/* Uploads */}
            <div className="flex items-center gap-2">
                {!resumeUploaded ? (
                    <div className="relative group">
                        <input type="file" onChange={handleFileUpload} accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20" />
                        <button className="flex items-center px-4 py-3 rounded-lg border border-gray-600 bg-gray-900/80 text-gray-300"> <Upload className="w-5 h-5 mr-2" /> Upload Resume </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center px-4 py-3 rounded-lg border border-green-500 text-green-400"> <FileText className="w-5 h-5 mr-2"/> Active </div>
                        <button onClick={handleDeleteResume} className="p-3 rounded-lg border border-red-500 text-red-400"> <Trash2 className="w-5 h-5" /> </button>
                    </div>
                )}
            </div>

            {/* Start/Stop Buttons */}
            {!isInterviewActive ? (
                <button 
                    onClick={startInterviewProcess} 
                    disabled={isModelLoading}
                    className={`flex items-center px-10 py-4 rounded-full font-bold text-lg transition-transform hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.3)] ${isModelLoading ? 'bg-gray-600 cursor-not-allowed' : 'bg-white text-black'}`}
                >
                    {isModelLoading ? <><Loader2 className="w-6 h-6 mr-2 animate-spin"/> Loading AI...</> : <><Video className="w-6 h-6 mr-2" /> START CAMERA</>}
                </button>
            ) : (
                <div className="flex gap-4">
                    <button onClick={toggleRecording} className={`flex items-center px-8 py-4 rounded-full font-bold text-lg shadow-lg ${status === "recording" ? "bg-red-600 text-white" : "bg-white text-black"}`}>
                        {status === "recording" ? <> <Square className="w-6 h-6 mr-2" /> STOP </> : <> <Mic className="w-6 h-6 mr-2" /> SPEAK </>}
                    </button>
                    <button onClick={endInterview} className="px-6 py-4 rounded-full font-bold text-lg bg-red-900/20 text-red-400 border border-red-900 hover:bg-red-600 hover:text-white transition-all">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>
            )}
          </div>
      )}
    </div>
  );
}

export default App;