from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

app = FastAPI(title="WebForge3D PRO")

# Statik dosyaları dışarı açıyoruz
app.mount("/static", StaticFiles(directory="static"), name="static")

COUNTER_FILE = "counter.txt"

# Sayacı okuyan fonksiyon
def get_counter():
    if not os.path.exists(COUNTER_FILE):
        return 0
    with open(COUNTER_FILE, "r") as f:
        return int(f.read().strip())

# Sayacı artıran fonksiyon
def increment_counter():
    count = get_counter() + 1
    with open(COUNTER_FILE, "w") as f:
        f.write(str(count))
    return count

@app.get("/")
async def serve_home():
    # Siteye her girildiğinde sayacı 1 artır!
    increment_counter()
    
    file_path = os.path.join("templates", "index.html")
    if not os.path.exists(file_path):
        return {"error": "index.html bulunamadı!"}
    return FileResponse(file_path)

# JavaScript'in sayacı ekranda göstermek için soracağı adres (API)
@app.get("/api/counter")
async def get_counter_api():
    return {"visits": get_counter()}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)