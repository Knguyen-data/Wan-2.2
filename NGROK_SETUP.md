# 🌐 ngrok Configuration - ACTIVE

## ✅ **ngrok is Running!**

Your local server is now publicly accessible via ngrok.

---

## 🔗 **Public URL**

```
https://1b3ac312976e.ngrok-free.app
```

This URL is now being used for all file access by DashScope API.

---

## 📊 **What This Enables**

### **Before (Localhost Only):**
```
❌ http://localhost:3000/files/videos/chunk_0.mp4
   (Not accessible from DashScope API)
```

### **After (Public via ngrok):**
```
✅ https://1b3ac312976e.ngrok-free.app/files/videos/chunk_0.mp4
   (Publicly accessible from anywhere!)
```

---

## 🎯 **How It Works**

1. **Your App:** Runs on `localhost:3000`
2. **ngrok Tunnel:** Creates public URL `https://1b3ac312976e.ngrok-free.app`
3. **DashScope API:** Accesses files via the ngrok URL
4. **Processing:** Videos and images are now reachable!

```
DashScope API → ngrok Public URL → Your Local Server → Files
```

---

## 📋 **URLs You Can Use**

### **Main Application:**
- Local: http://localhost:3000
- Public: https://1b3ac312976e.ngrok-free.app

### **File Access (for DashScope):**
- Videos: `https://1b3ac312976e.ngrok-free.app/files/videos/{filename}`
- Images: `https://1b3ac312976e.ngrok-free.app/files/images/{filename}`
- Chunks: `https://1b3ac312976e.ngrok-free.app/files/chunks/{filename}`
- Outputs: `https://1b3ac312976e.ngrok-free.app/files/outputs/{filename}`

---

## 🔍 **Monitor ngrok Traffic**

**ngrok Dashboard:** http://localhost:4040

Features:
- See all HTTP requests in real-time
- Inspect request/response details
- Replay requests
- View DashScope API accessing your files

---

## ⚙️ **Server Configuration**

The server is now configured with:

```javascript
SERVER_URL = "https://1b3ac312976e.ngrok-free.app"
```

All file URLs will automatically use this public URL instead of localhost.

---

## 🚀 **Ready to Process Videos!**

### **Test It Out:**

1. **Go to:** https://1b3ac312976e.ngrok-free.app
2. **Enter API Key:** `sk-b027cd54457b40888adde4cef33a4082`
3. **Upload Character Image**
4. **Upload Video(s)**
5. **Click "Start Processing"**

### **What Will Happen:**

1. ✅ Files uploaded to local server
2. ✅ Server serves files via ngrok public URL
3. ✅ DashScope API can access the files!
4. ✅ Tasks created and processed
5. ✅ Results downloaded and merged
6. ✅ Final video ready!

---

## 📊 **Example Flow**

### **1. Upload**
```
You → Upload video.mp4 → Saved to uploads/abc123.mp4
```

### **2. Public URL Generated**
```
Server → https://1b3ac312976e.ngrok-free.app/files/videos/abc123.mp4
```

### **3. DashScope Task**
```json
{
  "model": "wan2.2-animate-mix",
  "input": {
    "image_url": "https://1b3ac312976e.ngrok-free.app/files/images/character.jpg",
    "video_url": "https://1b3ac312976e.ngrok-free.app/files/videos/abc123.mp4"
  }
}
```

### **4. DashScope Access**
```
DashScope API → GET https://1b3ac312976e.ngrok-free.app/files/videos/abc123.mp4
             → ✅ Success! File downloaded and processed
```

---

## ⚠️ **Important Notes**

### **ngrok Free Tier Limitations:**
- ✅ Random subdomain (changes on restart)
- ✅ 40 connections/minute
- ✅ No authentication required (our setup)
- ⚠️ URL changes when ngrok restarts

### **URL Changes:**
If you restart ngrok, the URL will change. You'll need to:
1. Stop the server
2. Get new ngrok URL
3. Restart server with new URL

### **Keep ngrok Running:**
- Don't close the ngrok window
- ngrok must stay active for DashScope to access files
- If processing fails, check if ngrok is still running

---

## 🔄 **Restart Instructions**

If ngrok stops or you need to restart:

### **Windows PowerShell:**

```powershell
# 1. Start ngrok in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000"

# 2. Wait 3 seconds, then get URL
Start-Sleep -Seconds 3
$url = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels").tunnels[0].public_url
Write-Host "ngrok URL: $url"

# 3. Set environment and start server
Set-Location "path/to/Wan 2.2"
$env:SERVER_URL = $url
node server.js
```

---

## 📺 **View Logs**

### **Server Logs:**
Check the PowerShell window running `node server.js`

### **ngrok Logs:**
Check the window running `ngrok http 3000`

### **ngrok Web Interface:**
http://localhost:4040 - See all requests

---

## ✅ **Status Check**

### **Is ngrok running?**
```powershell
Get-Process | Where-Object {$_.ProcessName -eq "ngrok"}
```

### **Is server running?**
```powershell
Get-Process | Where-Object {$_.ProcessName -eq "node"}
```

### **Test public access:**
```powershell
Invoke-WebRequest -Uri "https://1b3ac312976e.ngrok-free.app" -UseBasicParsing
```

---

## 🎬 **You're All Set!**

**Application URL:** https://1b3ac312976e.ngrok-free.app  
**ngrok Dashboard:** http://localhost:4040  
**API Key:** `sk-b027cd54457b40888adde4cef33a4082`

Your files are now publicly accessible, and DashScope can process your videos! 🚀

Start uploading and animating! ✨

