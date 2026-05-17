import os
import re

# Senin orijinal devasa dosyanın adı
html_file = "WebForgeFORCE-3D_Studio_PRO_v16b.html"

print("🚀 Otomatik Ameliyat ve Parçalama Robotu Başlıyor...")

# 1. Klasörleri oluştur
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# 2. HTML dosyasını oku
try:
    with open(html_file, "r", encoding="utf-8") as f:
        content = f.read()
except FileNotFoundError:
    print(f"❌ HATA: '{html_file}' bulunamadı! Lütfen adının tam olarak bu olduğundan emin ol.")
    exit()

# 3. En büyük <script> bloğunu bul (Bu bizim 24 bin satırlık dev motorumuz)
print("✂️ Devasa HTML dosyası ameliyat ediliyor. Bu birkaç saniye sürebilir...")
script_pattern = re.compile(r"<script[^>]*>(.*?)</script>", re.DOTALL | re.IGNORECASE)
scripts = script_pattern.finditer(content)

max_len = 0
main_script_content = ""
main_script_match = None

for match in scripts:
    if len(match.group(1)) > max_len:
        max_len = len(match.group(1))
        main_script_content = match.group(1)
        main_script_match = match

if main_script_match:
    # 4. JavaScript kodlarını ayrı bir app.js dosyasına kaydet
    with open("static/js/app.js", "w", encoding="utf-8") as f:
        f.write(main_script_content.strip())
    print("✅ JavaScript motoru HTML'den sökülüp 'static/js/app.js' dosyasına taşındı.")

    # 5. HTML'i hafiflet, içine yeni dosyanın linkini koy ve index.html olarak kaydet
    new_html = content[:main_script_match.start()] + '\n<script src="/static/js/app.js"></script>\n' + content[main_script_match.end():]
    with open("templates/index.html", "w", encoding="utf-8") as f:
        f.write(new_html)
    print("✅ HTML dosyası başarıyla hafifletildi ve 'templates/index.html' olarak kaydedildi.")
else:
    print("❌ HATA: Dosya içinde JavaScript kodları bulunamadı.")
    exit()

# 6. Güvenli Python Sunucumuzu (main.py) Oluştur
main_py_code = """from fastapi import FastAPI
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
"""
with open("main.py", "w", encoding="utf-8") as f:
    f.write(main_py_code)
print("✅ Python sunucu dosyası (main.py) oluşturuldu.")

print("\n🎉 BÜTÜN İŞLEMLER KUSURSUZ TAMAMLANDI!")
print("👉 Şimdi terminale 'python3 main.py' yazıp stüdyoyu başlatabilirsin.")