const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONCURRENT_CHUNKS = 5; // Process 5 chunks at once
const CHUNK_DURATION = 60; // 1 minute chunks (instead of 15 seconds)

// Increase body size limits for large uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// DashScope API Configuration
const DASHSCOPE_API_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis';
const DASHSCOPE_TASK_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/tasks';
const POLL_INTERVAL = 15000; // Poll every 15 seconds

// Middleware
app.use(cors());
app.use(express.static('public'));

// Create necessary directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CHUNKS_DIR = path.join(__dirname, 'chunks');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const TEMP_DIR = path.join(__dirname, 'temp');

[UPLOAD_DIR, CHUNKS_DIR, OUTPUT_DIR, TEMP_DIR].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 2000 * 1024 * 1024, // 2GB limit per file
    files: 10 // Max 10 files at once
  }
});

// Configure multer for character image uploads
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `character_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Job tracking
const jobs = new Map();

// Task tracking for DashScope async tasks
const dashscopeTasks = new Map();

// Utility: Get video duration
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    console.log('   ⏱️ Getting video duration...');
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error('   ❌ Error probing video:', err.message);
        return reject(err);
      }
      const duration = metadata.format.duration;
      console.log(`   ✅ Video duration: ${duration.toFixed(2)} seconds`);
      resolve(duration);
    });
  });
}

// Utility: Split video into chunks
function splitVideoIntoChunks(videoPath, outputDir, chunkDuration = 15) {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = await getVideoDuration(videoPath);
      const numChunks = Math.ceil(duration / chunkDuration);
      const chunks = [];

      console.log(`   📊 Will create ${numChunks} chunks of ${chunkDuration}s each`);

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkDuration;
        const chunkPath = path.join(outputDir, `chunk_${i}.mp4`);
        
        console.log(`   ✂️ Creating chunk ${i + 1}/${numChunks} (start: ${startTime}s)...`);
        
        await new Promise((res, rej) => {
          ffmpeg(videoPath)
            .setStartTime(startTime)
            .setDuration(chunkDuration)
            .output(chunkPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .on('progress', (progress) => {
              if (progress.percent) {
                process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
              }
            })
            .on('end', () => {
              console.log(`\r   ✅ Chunk ${i + 1} complete: ${chunkPath}`);
              res();
            })
            .on('error', (err) => {
              console.error(`\r   ❌ Error creating chunk ${i + 1}:`, err.message);
              rej(err);
            })
            .run();
        });

        chunks.push(chunkPath);
      }

      resolve(chunks);
    } catch (error) {
      console.error('   ❌ Error in splitVideoIntoChunks:', error.message);
      reject(error);
    }
  });
}

// Utility: Merge video chunks
function mergeVideoChunks(chunkPaths, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`   🔗 Merging ${chunkPaths.length} chunks...`);
    const listFile = path.join(path.dirname(outputPath), 'filelist.txt');
    const fileList = chunkPaths.map(p => `file '${p}'`).join('\n');
    
    fsSync.writeFileSync(listFile, fileList);
    console.log('   📝 Created file list:', listFile);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   Merging progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('\r   ✅ Merge complete!');
        fsSync.unlinkSync(listFile);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('\r   ❌ Error merging chunks:', err.message);
        if (fsSync.existsSync(listFile)) {
          fsSync.unlinkSync(listFile);
        }
        reject(err);
      })
      .run();
  });
}

// Utility: Get public URL for files (serve via express)
async function getPublicUrl(filePath, type = 'video') {
  const filename = path.basename(filePath);
  const publicPath = type === 'video' ? `/files/videos/${filename}` : `/files/images/${filename}`;
  
  // In development, use localhost. In production, set SERVER_URL env variable
  const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  return `${serverUrl}${publicPath}`;
}

// Serve uploaded files publicly
app.use('/files/videos', express.static(UPLOAD_DIR));
app.use('/files/images', express.static(UPLOAD_DIR));
app.use('/files/chunks', express.static(CHUNKS_DIR));
app.use('/files/outputs', express.static(OUTPUT_DIR));

// API Endpoints

// Upload character image
app.post('/api/upload-character-image', imageUpload.single('characterImage'), async (req, res) => {
  try {
    console.log('\n📸 Character image upload request received');
    
    if (!req.file) {
      console.log('❌ No image file provided');
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    console.log('✅ Character image uploaded:', req.file.filename);
    console.log('   Size:', (req.file.size / 1024).toFixed(2), 'KB');

    // Convert image to base64 for Replicate API
    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype;
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    res.json({ 
      success: true, 
      imagePath: req.file.path,
      imageDataUrl: dataUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('❌ Error uploading character image:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload videos with error handling
app.post('/api/upload', (req, res) => {
  upload.array('videos', 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('❌ Multer error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          success: false, 
          error: 'File too large. Maximum size is 2GB per file.' 
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ 
          success: false, 
          error: 'Too many files. Maximum is 10 files at once.' 
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      console.error('❌ Upload error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No files uploaded' 
        });
      }

      console.log('\n🎬 Video upload request received');
      console.log('   Files:', req.files.length);
      
      const files = req.files.map(f => ({
        id: uuidv4(),
        filename: f.filename,
        originalName: f.originalname,
        path: f.path,
        size: f.size
      }));

      files.forEach(f => {
        console.log(`   ✅ ${f.originalName} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
      });

      res.json({ success: true, files });
    } catch (error) {
      console.error('❌ Error processing uploads:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Start batch processing
app.post('/api/process', async (req, res) => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🎥 PROCESSING REQUEST RECEIVED - DashScope API');
    console.log('='.repeat(60));
    
    const { files, apiKey, characterImagePath, mode } = req.body;

    console.log('📋 Configuration:');
    console.log('   Files to process:', files.length);
    console.log('   Mode:', mode || 'wan-std');
    console.log('   API: Alibaba Cloud DashScope');

    if (!apiKey) {
      console.log('❌ API key is missing');
      return res.status(400).json({ success: false, error: 'API key is required' });
    }

    if (!characterImagePath) {
      console.log('❌ Character image path is missing');
      return res.status(400).json({ success: false, error: 'Character image is required' });
    }

    console.log('✅ DashScope API key provided');
    console.log('✅ Character image path:', characterImagePath);

    // Get public URLs for character image
    const characterImageUrl = await getPublicUrl(characterImagePath, 'image');
    console.log('✅ Character image URL:', characterImageUrl);

    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'processing',
      files: files,
      results: [],
      progress: 0,
      totalChunks: 0,
      processedChunks: 0,
      createdAt: new Date(),
      config: { characterImageUrl, mode: mode || 'wan-std', apiKey }
    };

    jobs.set(jobId, job);

    console.log('✅ Job created:', jobId);
    console.log('🚀 Starting video processing...\n');

    // Start processing asynchronously
    processVideosDashScope(jobId, files, { characterImageUrl, mode: mode || 'wan-std', apiKey })
      .catch(err => {
        console.error('❌ Processing error:', err.message);
        job.status = 'error';
        job.error = err.message;
      });

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('❌ Error starting processing:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check job status
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, job });
});

// Download processed video
app.get('/api/download/:jobId/:fileId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const result = job.results.find(r => r.fileId === req.params.fileId);
  if (!result || !result.outputPath) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  res.download(result.outputPath);
});

// Process videos function
async function processVideos(jobId, files, config) {
  const job = jobs.get(jobId);
  console.log('\n📹 processVideos() started for job:', jobId);
  console.log('   Total files to process:', files.length);

  for (const file of files) {
    try {
      console.log('\n' + '-'.repeat(60));
      console.log(`📹 Processing file: ${file.originalName}`);
      console.log('-'.repeat(60));
      
      job.currentFile = file.originalName;
      
      // Create chunk directory for this file
      const fileChunkDir = path.join(CHUNKS_DIR, file.id);
      await fs.mkdir(fileChunkDir, { recursive: true });
      console.log('📁 Created chunk directory:', fileChunkDir);

      // Split video into 15s chunks
      job.status = `Splitting ${file.originalName}...`;
      const videoPath = path.join(UPLOAD_DIR, file.filename);
      console.log('📂 Video path:', videoPath);
      console.log('✂️ Splitting video into 15-second chunks...');
      
      const chunks = await splitVideoIntoChunks(videoPath, fileChunkDir, 15);
      
      job.totalChunks += chunks.length;
      console.log(`✅ Video split into ${chunks.length} chunks`);
      console.log(`📊 Total chunks in job: ${job.totalChunks}`);

      // Process chunks in parallel with concurrency limit!
      console.log(`\n🚀 PARALLEL PROCESSING: Processing ${chunks.length} chunks in batches of ${MAX_CONCURRENT_CHUNKS}!`);
      job.status = `Processing ${chunks.length} chunks in parallel for ${file.originalName}...`;
      
      // Helper function to process a single chunk
      const processChunk = async (chunkPath, i) => {
          try {
            console.log(`\n🎬 [Chunk ${i + 1}/${chunks.length}] Starting...`);
            
            // Read chunk as base64 for Replicate API
            const chunkBuffer = await fs.readFile(chunkPath);
            const chunkSizeMB = (chunkBuffer.length / 1024 / 1024).toFixed(2);
            console.log(`   [Chunk ${i + 1}] Size: ${chunkSizeMB} MB`);
            
            const base64Video = chunkBuffer.toString('base64');
            const videoDataUrl = `data:video/mp4;base64,${base64Video}`;
            console.log(`   [Chunk ${i + 1}] Converted to base64 (${base64Video.length} chars)`);

            console.log(`   [Chunk ${i + 1}] 🚀 Calling Replicate API...`);
            
            // Call Replicate API
            const apiInput = {
              video: videoDataUrl,
              character_image: config.characterImageDataUrl,
              go_fast: config.goFast !== false,
              refert_num: config.refertNum || 1,
              resolution: config.resolution || "720",
              merge_audio: config.mergeAudio !== false,
              frames_per_second: config.framesPerSecond || 24
            };
            
            // Add seed if provided
            if (config.seed) {
              apiInput.seed = config.seed;
            }
            
            const output = await replicate.run(
              "wan-video/wan-2.2-animate-replace",
              { input: apiInput }
            );

            console.log(`   [Chunk ${i + 1}] ✅ API responded`);
            console.log(`   [Chunk ${i + 1}] Output type: ${typeof output}`);

            // Download the output video
            const chunkOutputPath = path.join(fileChunkDir, `output_${i}.mp4`);
            
            if (typeof output === 'string' && output.startsWith('http')) {
              console.log(`   [Chunk ${i + 1}] 📥 Downloading from URL...`);
              const response = await fetch(output);
              const buffer = await response.arrayBuffer();
              await fs.writeFile(chunkOutputPath, Buffer.from(buffer));
              console.log(`   [Chunk ${i + 1}] ✅ Saved: ${chunkOutputPath}`);
            } else if (output && output.output) {
              console.log(`   [Chunk ${i + 1}] 📥 Downloading from output.output...`);
              const response = await fetch(output.output);
              const buffer = await response.arrayBuffer();
              await fs.writeFile(chunkOutputPath, Buffer.from(buffer));
              console.log(`   [Chunk ${i + 1}] ✅ Saved: ${chunkOutputPath}`);
            }

            // Update progress
            job.processedChunks++;
            job.progress = (job.processedChunks / job.totalChunks) * 100;
            console.log(`   [Chunk ${i + 1}] 📊 Overall Progress: ${job.progress.toFixed(1)}% (${job.processedChunks}/${job.totalChunks})`);
            
            return chunkOutputPath;
            
          } catch (error) {
            console.error(`   [Chunk ${i + 1}] ❌ Error: ${error.message}`);
            throw error;
          }
      };
      
      // Process chunks in batches with concurrency control
      const processedChunks = [];
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
        const batchNumber = Math.floor(i / MAX_CONCURRENT_CHUNKS) + 1;
        const totalBatches = Math.ceil(chunks.length / MAX_CONCURRENT_CHUNKS);
        
        console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`);
        
        const batchResults = await Promise.all(
          batch.map((chunkPath, batchIndex) => processChunk(chunkPath, i + batchIndex))
        );
        
        processedChunks.push(...batchResults);
        console.log(`✅ Batch ${batchNumber}/${totalBatches} complete!`);
      }
      
      console.log(`\n✅ All ${chunks.length} chunks processed!`);

      // Merge all chunks for this video
      console.log(`\n🔗 Merging ${processedChunks.length} chunks...`);
      job.status = `Merging chunks for ${file.originalName}...`;
      const finalOutputPath = path.join(OUTPUT_DIR, `${file.id}_animated.mp4`);
      await mergeVideoChunks(processedChunks, finalOutputPath);
      console.log('✅ Chunks merged successfully');
      console.log('📁 Final output:', finalOutputPath);

      // Store result
      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        outputPath: finalOutputPath,
        status: 'completed'
      });

      // Cleanup chunks
      console.log('🧹 Cleaning up temporary chunks...');
      await fs.rm(fileChunkDir, { recursive: true, force: true });
      console.log('✅ Cleanup complete');

    } catch (error) {
      console.error(`❌ Error processing ${file.originalName}:`, error.message);
      console.error('Stack trace:', error.stack);
      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        status: 'error',
        error: error.message
      });
    }
  }

  job.status = 'completed';
  job.progress = 100;
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL PROCESSING COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// Process videos using DashScope API
async function processVideosDashScope(jobId, files, config) {
  const job = jobs.get(jobId);
  console.log('\n📹 processVideosDashScope() started for job:', jobId);
  console.log('   Total files to process:', files.length);
  console.log('   API: Alibaba Cloud DashScope');

  for (const file of files) {
    try {
      console.log('\n' + '-'.repeat(60));
      console.log(`📹 Processing file: ${file.originalName}`);
      console.log('-'.repeat(60));
      
      job.currentFile = file.originalName;
      
      // Create chunk directory for this file
      const fileChunkDir = path.join(CHUNKS_DIR, file.id);
      await fs.mkdir(fileChunkDir, { recursive: true });
      console.log('📁 Created chunk directory:', fileChunkDir);

      // Split video into 15s chunks
      job.status = `Splitting ${file.originalName}...`;
      const videoPath = path.join(UPLOAD_DIR, file.filename);
      console.log('📂 Video path:', videoPath);
      console.log('✂️ Splitting video into 15-second chunks...');
      
      const chunks = await splitVideoIntoChunks(videoPath, fileChunkDir, 15);
      
      job.totalChunks += chunks.length;
      console.log(`✅ Video split into ${chunks.length} chunks`);
      console.log(`📊 Total chunks in job: ${job.totalChunks}`);

      // Process chunks in parallel with DashScope API
      console.log(`\n🚀 PARALLEL PROCESSING: Processing ${chunks.length} chunks in batches of ${MAX_CONCURRENT_CHUNKS}!`);
      job.status = `Processing ${chunks.length} chunks in parallel for ${file.originalName}...`;
      
      // Helper function to process a single chunk with DashScope (with retry logic)
      const processChunk = async (chunkPath, i, retryCount = 0) => {
        const maxRetries = 3;
        const retryDelay = 5000; // 5 seconds between retries
        
        try {
          console.log(`\n🎬 [Chunk ${i + 1}/${chunks.length}] Starting...${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}`);
          
          // Add delay between requests to respect rate limits (stagger requests)
          await new Promise(resolve => setTimeout(resolve, i * 200)); // Stagger by 200ms each
          
          // Get public URL for chunk
          const chunkFilename = path.basename(chunkPath);
          const chunkUrl = await getPublicUrl(chunkPath, 'video');
          console.log(`   [Chunk ${i + 1}] Video URL: ${chunkUrl}`);

          console.log(`   [Chunk ${i + 1}] 🚀 Creating DashScope task...`);
          
          // Create DashScope task
          const taskResponse = await axios.post(
            DASHSCOPE_API_ENDPOINT,
            {
              model: 'wan2.2-animate-mix',
              input: {
                image_url: config.characterImageUrl,
                video_url: chunkUrl
              },
              parameters: {
                mode: config.mode,
                check_image: false
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                'X-DashScope-Async': 'enable'
              },
              timeout: 30000 // 30 second timeout
            }
          );

          const taskId = taskResponse.data.output.task_id;
          console.log(`   [Chunk ${i + 1}] ✅ Task created: ${taskId}`);
          
          // Poll for result
          console.log(`   [Chunk ${i + 1}] ⏳ Polling for result...`);
          const videoUrl = await pollDashScopeTask(taskId, config.apiKey, i + 1, chunks.length);
          
          // Download the output video
          const chunkOutputPath = path.join(fileChunkDir, `output_${i}.mp4`);
          console.log(`   [Chunk ${i + 1}] 📥 Downloading result...`);
          
          const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
          await fs.writeFile(chunkOutputPath, Buffer.from(videoResponse.data));
          console.log(`   [Chunk ${i + 1}] ✅ Saved: ${chunkOutputPath}`);

          // Update progress
          job.processedChunks++;
          job.progress = (job.processedChunks / job.totalChunks) * 100;
          console.log(`   [Chunk ${i + 1}] 📊 Overall Progress: ${job.progress.toFixed(1)}% (${job.processedChunks}/${job.totalChunks})`);
          
          return chunkOutputPath;
          
        } catch (error) {
          console.error(`   [Chunk ${i + 1}] ❌ Error: ${error.message}`);
          if (error.response) {
            console.error(`   [Chunk ${i + 1}] Response:`, error.response.data);
            
            // Retry on rate limit (429) or timeout errors (400)
            if ((error.response.status === 429 || error.response.status === 400) && retryCount < maxRetries) {
              console.log(`   [Chunk ${i + 1}] ⏳ Waiting ${retryDelay/1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              return processChunk(chunkPath, i, retryCount + 1);
            }
          }
          throw error;
        }
      };
      
      // Process chunks in batches with concurrency control
      const processedChunks = [];
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
        const batchNumber = Math.floor(i / MAX_CONCURRENT_CHUNKS) + 1;
        const totalBatches = Math.ceil(chunks.length / MAX_CONCURRENT_CHUNKS);
        
        console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`);
        
        const batchResults = await Promise.all(
          batch.map((chunkPath, batchIndex) => processChunk(chunkPath, i + batchIndex))
        );
        
        processedChunks.push(...batchResults);
        console.log(`✅ Batch ${batchNumber}/${totalBatches} complete!`);
      }
      
      console.log(`\n✅ All ${chunks.length} chunks processed!`);

      // Merge all chunks for this video
      console.log(`\n🔗 Merging ${processedChunks.length} chunks...`);
      job.status = `Merging chunks for ${file.originalName}...`;
      const finalOutputPath = path.join(OUTPUT_DIR, `${file.id}_animated.mp4`);
      await mergeVideoChunks(processedChunks, finalOutputPath);
      console.log('✅ Chunks merged successfully');
      console.log('📁 Final output:', finalOutputPath);

      // Store result
      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        outputPath: finalOutputPath,
        status: 'completed'
      });

      // Cleanup chunks
      console.log('🧹 Cleaning up temporary chunks...');
      await fs.rm(fileChunkDir, { recursive: true, force: true });
      console.log('✅ Cleanup complete');

    } catch (error) {
      console.error(`❌ Error processing ${file.originalName}:`, error.message);
      console.error('Stack trace:', error.stack);
      job.results.push({
        fileId: file.id,
        originalName: file.originalName,
        status: 'error',
        error: error.message
      });
    }
  }

  job.status = 'completed';
  job.progress = 100;
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL PROCESSING COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// Poll DashScope task until complete
async function pollDashScopeTask(taskId, apiKey, chunkNum, totalChunks) {
  let attempts = 0;
  const maxAttempts = 120; // 30 minutes max (120 * 15s)
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(
        `${DASHSCOPE_TASK_ENDPOINT}/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      const { task_status, results } = response.data.output;
      console.log(`   [Chunk ${chunkNum}] Status: ${task_status}`);

      if (task_status === 'SUCCEEDED') {
        return results.video_url;
      } else if (task_status === 'FAILED') {
        throw new Error(`Task failed: ${response.data.output.message || 'Unknown error'}`);
      } else if (task_status === 'CANCELED') {
        throw new Error('Task was canceled');
      }

      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error(`Task not found: ${taskId}`);
      }
      throw error;
    }
  }

  throw new Error(`Task ${taskId} timed out after ${maxAttempts * POLL_INTERVAL / 1000} seconds`);
}

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Make sure FFmpeg is installed on your system!');
  console.log(`⚡ Parallel processing: ${MAX_CONCURRENT_CHUNKS} chunks at a time`);
  console.log(`✂️ Chunk duration: ${CHUNK_DURATION} seconds (1 minute)`);
  console.log('🌐 API: Alibaba Cloud DashScope (Singapore)');
  console.log('📁 Upload directory:', UPLOAD_DIR);
  console.log('📁 Chunks directory:', CHUNKS_DIR);
  console.log('📁 Output directory:', OUTPUT_DIR);
  console.log('='.repeat(60));
});

