# WAN 2.2 Video Animator - Batch Processor

A powerful web application for batch processing videos using WAN 2.2 animation via Replicate API. This tool automatically chunks videos into 15-second segments, processes them in parallel, and merges them back into complete animated videos.

## Features

- 🎬 **Batch Video Processing**: Upload and process multiple videos simultaneously
- ✂️ **Automatic Video Chunking**: Splits videos into 15-second segments for processing
- ⚡ **PARALLEL PROCESSING**: Processes 10 chunks at once for **10x faster results!**
- 🚀 **Smart Batch System**: Automatically manages API calls to avoid overload
- 🎨 **Character Animation**: Apply character animations using WAN 2.2 model
- 📊 **Real-time Progress Tracking**: Monitor processing status for each video
- 🔗 **Automatic Merging**: Combines processed chunks into final videos
- ⬇️ **Easy Downloads**: Download completed videos with one click

## Prerequisites

Before running this application, ensure you have:

1. **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
2. **FFmpeg** - Required for video processing
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
   - Mac: `brew install ffmpeg`
   - Linux: `sudo apt-get install ffmpeg`
3. **Replicate API Token** - Get yours at [replicate.com](https://replicate.com/account/api-tokens)

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create a `.env` file:
```bash
cp .env.example .env
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Configure your settings:
   - Enter your Replicate API token
   - Upload a character image (PNG, JPG, or WebP)
   - Adjust resolution, FPS, and other settings

4. Upload videos:
   - Drag and drop videos or click to browse
   - Multiple videos supported

5. Click "Start Processing" and wait for results

6. Download your animated videos!

## How It Works

1. **Upload**: Videos are uploaded to the server
2. **Chunking**: Each video is split into 15-second chunks using FFmpeg
3. **⚡ Parallel Processing**: 10 chunks processed simultaneously (not one by one!)
4. **Batch Management**: Chunks processed in smart batches to optimize speed
5. **API Call**: WAN 2.2 model processes each chunk with character animation
6. **Merging**: Processed chunks are merged back into complete videos
7. **Download**: Final videos are available for download

### Processing Speed Comparison:
- **Sequential**: 50 chunks × 2 min = 100 minutes ⏰
- **Parallel (10x)**: 50 chunks ÷ 10 × 2 min = **10 minutes!** ⚡

## Configuration Options

- **Resolution**: 480p, 720p, or 1080p
- **FPS**: Frames per second (12-60)
- **Refert Number**: Processing refinement level (1-10)
- **Go Fast**: Enable faster processing mode
- **Merge Audio**: Preserve original audio in animated video
- **Parallel Chunks**: Process 10 chunks simultaneously (configurable in `server.js`)

### Advanced Configuration

Edit `server.js` to customize:

```javascript
const MAX_CONCURRENT_CHUNKS = 10; // Change this to process more/fewer chunks at once
```

- **Lower (5)**: Safer for API rate limits, uses less memory
- **Higher (20)**: Faster processing, requires good internet & more memory
- **Default (10)**: Balanced for most use cases

## API Payload Example

The application sends requests to Replicate API with the following structure:

**Model:** `wan-video/wan-2.2-animate-replace`

```json
{
  "input": {
    "video": "data:video/mp4;base64,...",
    "character_image": "data:image/png;base64,...",
    "go_fast": true,
    "refert_num": 1,
    "resolution": "720",
    "merge_audio": true,
    "frames_per_second": 24
  }
}
```

**Output:** URL string to the processed video

Note: Both video and character image are converted to base64 data URLs for API submission.

## Project Structure

```
.
├── server.js           # Express server and API logic
├── package.json        # Dependencies and scripts
├── public/
│   ├── index.html     # Main UI
│   ├── styles.css     # Styling
│   └── app.js         # Client-side JavaScript
├── uploads/           # Uploaded videos (created automatically)
├── chunks/            # Video chunks (created automatically)
├── outputs/           # Processed videos (created automatically)
└── temp/              # Temporary files (created automatically)
```

## Troubleshooting

### FFmpeg not found
- Make sure FFmpeg is installed and added to your system PATH
- Test by running `ffmpeg -version` in terminal

### Large file uploads failing
- Check server limits in `server.js` (default: 500MB)
- Ensure enough disk space for temporary files

### API errors
- Verify your Replicate API token is valid
- Check character image URL is accessible
- Review Replicate API quotas and limits

### Processing stuck
- Check server logs for errors
- Ensure all chunks are being processed
- Verify internet connection for API calls

## Performance Tips

- Keep videos under 5 minutes for best results
- Use 720p resolution for balance of quality and speed
- Enable "Go Fast" mode for quicker processing
- Process videos in smaller batches (3-5 at a time)

## Technologies Used

- **Backend**: Node.js, Express.js
- **Video Processing**: FFmpeg via fluent-ffmpeg
- **API Integration**: Replicate Node.js SDK
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **File Handling**: Multer

## License

ISC

## Support

For issues and questions:
- Check FFmpeg installation
- Verify Replicate API credentials
- Review server logs for detailed errors
- Ensure all dependencies are installed

## Notes

- Videos are automatically cleaned up after processing
- Chunks are temporary and deleted after merging
- Keep your API token secure and never share it
- Processing time depends on video length and API queue

---

Made with ❤️ for video animation enthusiasts

