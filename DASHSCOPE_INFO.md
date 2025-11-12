# 🎬 WAN 2.2 Video Animator - DashScope API Edition

## ✅ **Updated for Alibaba Cloud DashScope!**

This application now uses **Alibaba Cloud DashScope API** instead of Replicate.

---

## 🔑 **API Key**

Your provided API key:

```
sk-b027cd54457b40888adde4cef33a4082
```

**Region:** Singapore (International)  
**Endpoint:** `https://dashscope-intl.aliyuncs.com`

---

## 📋 **How It Works**

### **1. DashScope Async Task Flow**

```
Upload → Chunk → Create Task → Poll Status → Download → Merge
```

Unlike Replicate's streaming API, DashScope uses an **asynchronous task-based** system:

1. **Create Task:** Submit video + image URLs to DashScope
2. **Get Task ID:** Receive a `task_id` for tracking
3. **Poll for Result:** Check task status every 15 seconds
4. **Download Video:** When status is `SUCCEEDED`, download the result
5. **Merge:** Combine all processed chunks

---

## 🎯 **Key Changes from Replicate**

| Feature        | Replicate (Old)                       | DashScope (New)                     |
| -------------- | ------------------------------------- | ----------------------------------- |
| **Model**      | `wan-video/wan-2.2-animate-replace`   | `wan2.2-animate-mix`                |
| **API Type**   | Synchronous/Streaming                 | Asynchronous (task-based)           |
| **Input**      | Base64 data URLs                      | Public HTTP URLs                    |
| **Processing** | Single API call                       | Create task → Poll status           |
| **Parameters** | Complex (resolution, FPS, seed, etc.) | Simple (`mode`: wan-std or wan-pro) |
| **Auth**       | Custom auth token                     | Bearer token in header              |

---

## ⚙️ **Processing Modes**

### **Standard Mode (`wan-std`)**

- ✅ Fast generation (~9 seconds per second of video)
- ✅ Cost-effective ($0.18/second)
- ✅ Good for basic animation and demos
- 📊 **Example:** 15s video = ~135 seconds (~2.25 minutes)

### **Professional Mode (`wan-pro`)**

- ✅ Higher quality & smoother animation
- ✅ Better action/expression transitions
- ⏱️ Slower (~16 seconds per second of video)
- 💰 Higher cost ($0.26/second)
- 📊 **Example:** 15s video = ~240 seconds (~4 minutes)

---

## 🚀 **Processing Speed with Parallel Chunks**

With **10 parallel chunks**, your processing time is dramatically reduced!

### **Example: 5-minute video (20 chunks)**

#### Standard Mode (`wan-std`):

- Sequential: `20 chunks × 135s = 2,700s (45 min)` ⏰
- **Parallel (10x): `(20÷10) × 135s = 270s (4.5 min)`** ⚡

#### Professional Mode (`wan-pro`):

- Sequential: `20 chunks × 240s = 4,800s (80 min)` ⏰
- **Parallel (10x): `(20÷10) × 240s = 480s (8 min)`** ⚡

---

## 📊 **API Rate Limits**

- **RPS:** 5 requests per second (shared across account)
- **Concurrent Tasks:** 1 task at a time
- **Task Queue:** Excess tasks are queued automatically
- **Task ID Validity:** 24 hours
- **Result URL Validity:** 24 hours (download immediately!)

---

## 💰 **Billing**

**Region:** International (Singapore)

| Mode                     | Price        | Free Quota        |
| ------------------------ | ------------ | ----------------- |
| Standard (`wan-std`)     | $0.18/second | 50 seconds shared |
| Professional (`wan-pro`) | $0.26/second | 50 seconds shared |

**Note:** Only successful generations are billed. Failed tasks don't consume quota.

---

## 🎯 **Important Notes**

### **Video URLs Must Be Public!**

DashScope needs to access your videos via HTTP/HTTPS URLs. The app serves uploaded files at:

```
http://localhost:3000/files/videos/{filename}
http://localhost:3000/files/images/{filename}
```

⚠️ **For Production:**

- Set `SERVER_URL` environment variable to your public domain
- Or upload files to cloud storage (S3, OSS, Cloudinary, etc.)
- Videos must be publicly accessible for DashScope to process them

### **Video Constraints**

- **Formats:** MP4, AVI, MOV
- **Dimensions:** 200-2048px width/height
- **Aspect Ratio:** Between 1:3 and 3:1
- **Size:** Max 200MB
- **Duration:** 2-30 seconds per chunk

### **Image Constraints**

- **Formats:** JPG, JPEG, PNG, BMP, WEBP
- **Dimensions:** 200-4096px width/height
- **Aspect Ratio:** Between 1:3 and 3:1
- **Size:** Max 5MB

---

## 🌐 **Endpoints**

### **Singapore (International):**

```
API: https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis
Tasks: https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}
```

### **Beijing (Mainland China):**

```
API: https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis
Tasks: https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}
```

---

## 🧪 **Testing the Application**

### **Step 1: Start the Server**

The server is already running at **http://localhost:3000**

### **Step 2: Open the Application**

Visit: http://localhost:3000

### **Step 3: Configure**

1. **API Key:** `sk-b027cd54457b40888adde4cef33a4082`
2. **Upload Character Image:** Any face/character image
3. **Choose Mode:** Standard (faster) or Professional (better quality)

### **Step 4: Upload Videos**

- Upload one or more videos
- Each video will be chunked into 15-second segments
- All chunks process in parallel (10 at a time)

### **Step 5: Start Processing**

- Click "Start Processing"
- Watch the progress in real-time
- Each chunk creates a DashScope task
- Server polls for completion every 15 seconds
- Downloads and merges results automatically

---

## 📝 **Example API Call**

```bash
curl --location 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis' \
--header 'X-DashScope-Async: enable' \
--header "Authorization: Bearer sk-b027cd54457b40888adde4cef33a4082" \
--header 'Content-Type: application/json' \
--data '{
    "model": "wan2.2-animate-mix",
    "input": {
        "image_url": "http://localhost:3000/files/images/character.jpg",
        "video_url": "http://localhost:3000/files/videos/chunk_0.mp4"
    },
    "parameters": {
        "mode": "wan-std",
        "check_image": false
    }
}'
```

**Response:**

```json
{
  "output": {
    "task_status": "PENDING",
    "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
  },
  "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

---

## 🛠️ **Troubleshooting**

### **"Task not found" Error**

- Task IDs expire after 24 hours
- Make sure you're polling the correct task ID

### **"URL not accessible" Error**

- Ensure your server is accessible from the internet
- For local testing, use ngrok or similar tunneling service
- Check firewall settings

### **"Rate limit exceeded"**

- Wait a moment between requests
- Reduce `MAX_CONCURRENT_CHUNKS` in server.js

### **Videos stuck in "RUNNING"**

- This is normal! Video processing takes time
- Standard mode: ~9s per second of video
- Professional mode: ~16s per second of video
- Server polls every 15 seconds automatically

---

## ✅ **Application is Ready!**

Your server is now configured for **Alibaba Cloud DashScope API**!

Visit: **http://localhost:3000**

Happy video animating! 🎬✨
