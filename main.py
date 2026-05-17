from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

app = FastAPI(title="WebForge3D PRO")

# Statik dosyaları dışarı açıyoruz (Senin JS dosyan burada)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def serve_home():
    file_path = os.path.join("templates", "index.html")
    if not os.path.exists(file_path):
        return {"error": "index.html bulunamadı!"}
    return FileResponse(file_path)

if __name__ == "__main__":
    print("🚀 WebForge3D Sunucusu Başlatılıyor...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
